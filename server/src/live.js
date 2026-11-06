/**
 * Ultra: individual live lessons with the teacher at a fixed time.
 *
 * Six slots: Mon/Wed/Fri or Tue/Thu/Sat × 09:00–10:00, 10:30–11:30, 21:00–22:00 (Tashkent), one student each.
 * A booking is one period of 12 lessons (4 weeks, 3 a week) at that time and costs the Ultra price (Settings → plans).
 * While it runs the student has the Ultra plan.
 *
 *  - Free slot → book and pay from the wallet; the period starts with the next lesson.
 *  - Taken slot → pre-book the next period (paid now, starts when the current one ends), or join the waitlist.
 *  - The current student keeps the time if they renew at least 3 days before their period ends; a pre-booking then
 *    moves one period later (it can be cancelled with a full refund until it starts).
 *  - After that point, or when a slot frees, the first student on the waitlist gets a Telegram message and 24 hours
 *    to pay; then the offer passes to the next one.
 * State is checked on every slots view and by the background sweep (drip.js tick + daily cron).
 */
import { db, getSettings } from './db.js';
import { moveBalance, readTiers } from './tiers.js';
import { notifyUser, notifyAdmins } from './tgbot.js';

const SITE = process.env.SITE_URL || 'https://www.ustozsat.uz';
export const GROUPS = [
  { id: 'mwf', label: 'Mon · Wed · Fri', uz: 'Dush · Chor · Juma', dows: [1, 3, 5] },
  { id: 'tts', label: 'Tue · Thu · Sat', uz: 'Sesh · Pay · Shan', dows: [2, 4, 6] },
];
export const TIMES = [['0900', '09:00', '10:00'], ['1030', '10:30', '11:30'], ['2100', '21:00', '22:00']];
export const SLOTS = GROUPS.flatMap((g) => TIMES.map(([k, from, to]) => ({ id: `${g.id}-${k}`, group: g.id, days: g.label, uz: g.uz, dows: g.dows, from, to })));
const SLOT = new Map(SLOTS.map((s) => [s.id, s]));
export const LESSONS = 12;
const PRIORITY_DAYS = 3; // the current student keeps the time if they renew this many days before the end
const OFFER_HOURS = 24;

const esc = (s) => String(s || '').replace(/[<>&]/g, '');
const money = (n) => `${Number(n || 0).toLocaleString('en-US').replace(/,/g, ' ')} so'm`;
/** Today's date and the time in Tashkent: { day: 'YYYY-MM-DD', hm: 'HH:MM' }. */
const nowTk = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
};
const addDays = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const ds = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10));
/** End of a day in Tashkent as a timestamp (for sub_until). */
const tkMidnight = (d) => new Date(`${d}T00:00:00+05:00`).toISOString();

/** The 12 lesson dates of a period starting on `from` (today's lesson counts only if it has not started yet). */
export function lessonDates(slot, from, n = LESSONS) {
  const out = []; let d = from; const now = nowTk();
  for (let i = 0; out.length < n && i < 60; i++, d = addDays(d, 1)) {
    if (!slot.dows.includes(dow(d))) continue;
    if (d === now.day && now.hm >= slot.from) continue;
    out.push(d);
  }
  return out;
}
/** A period from `from`: { starts_on, ends_on (the day after the last lesson), lessons }. */
const period = (slot, from) => { const lessons = lessonDates(slot, from); return { starts_on: lessons[0], ends_on: addDays(lessons[lessons.length - 1], 1), lessons }; };

export async function migrateLive() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS live_bookings (
  id SERIAL PRIMARY KEY, slot_id TEXT NOT NULL, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, who TEXT NOT NULL DEFAULT '',
  starts_on DATE NOT NULL, ends_on DATE NOT NULL, price INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'booked',
  granted BOOLEAN NOT NULL DEFAULT false, reminded BOOLEAN NOT NULL DEFAULT false, ref TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), cancelled_at TIMESTAMPTZ, cancelled_by TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_live_slot ON live_bookings(slot_id, starts_on) WHERE status = 'booked';
CREATE INDEX IF NOT EXISTS idx_live_user ON live_bookings(user_id);
CREATE TABLE IF NOT EXISTS live_queue (
  id SERIAL PRIMARY KEY, slot_id TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting', offer_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_queue_one ON live_queue(slot_id, user_id) WHERE status IN ('waiting', 'offered');
ALTER TABLE live_bookings ENABLE ROW LEVEL SECURITY; ALTER TABLE live_queue ENABLE ROW LEVEL SECURITY;
INSERT INTO settings (key, value) VALUES ('live_closed', '[]') ON CONFLICT (key) DO NOTHING;`);
}

const closedSet = (s) => { try { const a = JSON.parse(s.live_closed || '[]'); return new Set(Array.isArray(a) ? a : []); } catch { return new Set(); } };
const ultraOf = (s) => readTiers(s).find((t) => t.live) || readTiers(s)[3];

/** Bookings that still matter (not finished) and the waitlist, for every slot. */
async function load() {
  const today = nowTk().day;
  const bookings = await db.all(`SELECT b.*, u.name FROM live_bookings b LEFT JOIN users u ON u.id = b.user_id
    WHERE b.status = 'booked' AND b.ends_on > ?::date ORDER BY b.starts_on, b.id`, [today]);
  const queue = await db.all(`SELECT q.*, u.name, u.tg_chat_id IS NOT NULL AS tg FROM live_queue q JOIN users u ON u.id = q.user_id
    WHERE q.status IN ('waiting', 'offered') ORDER BY (q.status = 'offered') DESC, q.created_at, q.id`);
  return { today, bookings: bookings.map((b) => ({ ...b, starts_on: ds(b.starts_on), ends_on: ds(b.ends_on) })), queue };
}
function stateOf(slotId, { today, bookings, queue }) {
  const rows = bookings.filter((b) => b.slot_id === slotId);
  const cur = rows.find((b) => b.starts_on <= today) || null;
  const future = rows.filter((b) => b !== cur);
  const q = queue.filter((x) => x.slot_id === slotId);
  const offer = q.find((x) => x.status === 'offered' && new Date(x.offer_until) > new Date()) || null;
  const tail = rows.length ? rows[rows.length - 1].ends_on : null;
  const priorityUntil = cur ? addDays(cur.ends_on, -PRIORITY_DAYS) : null; // the holder may renew until (inclusive)
  // the next period is open to others: nobody has it yet and the holder's priority has passed (or no holder)
  const open = !future.length && (!cur || today > priorityUntil);
  return { cur, future, queue: q.filter((x) => x.status === 'waiting'), offer, tail, priorityUntil, open };
}

/** Give the Ultra plan for a booking (from its start until its end). */
async function grant(t, b) {
  const u = await t.one('SELECT sub_plan, sub_until FROM users WHERE id = ?', [b.user_id]);
  if (!u) return;
  const until = tkMidnight(b.ends_on);
  const keep = u.sub_until && new Date(u.sub_until) > new Date(until) ? u.sub_until : until;
  await t.run("UPDATE users SET sub_plan = 't4', sub_until = ? WHERE id = ?", [keep, b.user_id]);
  await t.run('UPDATE live_bookings SET granted = true WHERE id = ?', [b.id]);
}

/** Background work: start periods, expire offers, offer freed slots to the waitlist, remind about renewing. */
export async function sweepLive() {
  const { day: today } = nowTk();
  let done = 0;
  // periods that start today (pre-bookings and renewals)
  for (const b of await db.all("SELECT * FROM live_bookings WHERE status = 'booked' AND NOT granted AND starts_on <= ?::date AND ends_on > ?::date AND user_id IS NOT NULL", [today, today])) {
    const claimed = await db.one('UPDATE live_bookings SET granted = true WHERE id = ? AND NOT granted RETURNING id', [b.id]);
    if (!claimed) continue;
    await db.tx((t) => grant(t, { ...b, ends_on: ds(b.ends_on) }));
    const s = SLOT.get(b.slot_id);
    await notifyUser(b.user_id, `🎓 Live darslaringiz boshlandi: <b>${esc(s?.uz)} ${s?.from}–${s?.to}</b>\nUltra tarif ${ds(b.ends_on)} gacha faol.\n${SITE}/live`);
    done++;
  }
  // offers that ran out
  for (const q of await db.all("UPDATE live_queue SET status = 'expired', updated_at = now() WHERE status = 'offered' AND offer_until <= now() RETURNING *")) {
    const s = SLOT.get(q.slot_id);
    await notifyUser(q.user_id, `⌛ ${esc(s?.uz)} ${s?.from}–${s?.to} uchun 24 soatlik muddat tugadi, joy navbatdagi o'quvchiga o'tdi. Yana navbatga yozilishingiz mumkin: ${SITE}/live`);
    done++;
  }
  const st = await load();
  for (const slot of SLOTS) {
    const x = stateOf(slot.id, st);
    // renewal reminder: 5 days before the end, once
    if (x.cur && !x.cur.reminded && !x.future.some((b) => b.user_id === x.cur.user_id) && today >= addDays(x.cur.ends_on, -5)) {
      const r = await db.one('UPDATE live_bookings SET reminded = true WHERE id = ? AND NOT reminded RETURNING id', [x.cur.id]);
      if (r) await notifyUser(x.cur.user_id, `⏰ Live darslaringiz ${x.cur.ends_on} da tugaydi.\nVaqtingiz (${esc(slot.uz)} ${slot.from}) sizda qolishi uchun <b>${x.priorityUntil}</b> gacha uzaytiring: ${SITE}/live\nKeyin joy navbatdagilarga ochiladi.`);
    }
    if (!x.open || x.offer || !x.queue.length) continue;
    const head = x.queue[0];
    const until = new Date(Date.now() + OFFER_HOURS * 3600e3).toISOString();
    const r = await db.one(`UPDATE live_queue SET status = 'offered', offer_until = ?, updated_at = now() WHERE id = ? AND status = 'waiting'
      AND NOT EXISTS (SELECT 1 FROM live_queue o WHERE o.slot_id = ? AND o.status = 'offered' AND o.offer_until > now()) RETURNING id`, [until, head.id, slot.id]);
    if (r) {
      const from = x.cur ? x.cur.ends_on : 'darhol';
      await notifyUser(head.user_id, `🔔 <b>Navbatingiz keldi!</b>\n${esc(slot.uz)} ${slot.from}–${slot.to} vaqti bo'shayapti (boshlanishi: ${from}).\n24 soat ichida to'lang, aks holda joy keyingi o'quvchiga o'tadi.\n${SITE}/live`);
      done++;
    }
  }
  return done;
}

/** One slot as the page shows it, from the point of view of `user`. */
function view(slot, x, user, closed, today) {
  const me = user.id;
  const mineNow = x.cur?.user_id === me;
  const mineNext = x.future.find((b) => b.user_id === me) || null;
  const waitingPos = x.queue.findIndex((q) => q.user_id === me);
  const offeredMe = x.offer?.user_id === me;
  const holder = x.cur && { name: x.cur.name || x.cur.who, until: x.cur.ends_on, renew_by: x.priorityUntil };
  let action = 'none'; let from = null; let note = '';
  if (mineNow) {
    if (mineNext) { action = 'none'; note = `Renewed: next period from ${mineNext.starts_on}`; }
    else if (today <= x.priorityUntil || (!x.future.length && !x.offer && !x.queue.length)) { action = 'renew'; from = x.cur.ends_on; }
    else note = 'The renewal time has passed: the slot went to the waitlist';
  } else if (mineNext) { note = `Booked from ${mineNext.starts_on}`; }
  else if (offeredMe) { action = 'offer'; from = x.cur ? x.cur.ends_on : today; }
  else if (closed) { note = 'Closed by the teacher'; }
  else if (x.offer || x.queue.length || x.future.length) { action = waitingPos >= 0 ? 'waiting' : 'join'; }
  else if (!x.cur) { action = 'book'; from = today; }
  else { action = 'prebook'; from = x.cur.ends_on; }
  const p = from ? period(slot, from) : null;
  return {
    id: slot.id, group: slot.group, days: slot.days, from: slot.from, to: slot.to,
    state: mineNow ? 'mine' : mineNext ? 'mine_next' : closed && !x.cur ? 'closed' : x.cur || x.future.length || x.offer ? 'taken' : 'free',
    taken_until: x.cur ? x.cur.ends_on : null,
    next_taken_from: x.future.find((b) => b.user_id !== me)?.starts_on || null,
    holder: user.role === 'master' ? holder : null,
    action, note,
    period: p && { starts_on: p.starts_on, ends_on: p.ends_on, last: p.lessons[p.lessons.length - 1] },
    renew_by: mineNow ? x.priorityUntil : null,
    queue_len: x.queue.length, my_pos: waitingPos >= 0 ? waitingPos + 1 : null,
    offer_until: offeredMe ? x.offer.offer_until : null,
    offered: !!x.offer,
  };
}

export function registerLive(app, { h, bad, requireMaster, requireStudent }) {
  app.get('/api/live/slots', h(async (req, res) => {
    await sweepLive().catch((e) => console.error('[live]', e.message));
    const s = await getSettings();
    const st = await load();
    const closed = closedSet(s);
    const ultra = ultraOf(s);
    const slots = SLOTS.map((slot) => view(slot, stateOf(slot.id, st), req.user, closed.has(slot.id), st.today));
    const out = { price: ultra.price, plan: ultra.name, currency: s.currency || 'UZS', lessons: LESSONS, today: st.today, priority_days: PRIORITY_DAYS, offer_hours: OFFER_HOURS, slots, groups: GROUPS.map(({ id, label }) => ({ id, label })), times: TIMES.map(([, a, b]) => `${a}–${b}`) };
    if (req.user.role === 'master') {
      out.closed = [...closed];
      out.board = SLOTS.map((slot) => {
        const x = stateOf(slot.id, st);
        return { id: slot.id, cur: x.cur && { id: x.cur.id, name: x.cur.name || x.cur.who, user_id: x.cur.user_id, starts_on: x.cur.starts_on, ends_on: x.cur.ends_on, renew_by: x.priorityUntil },
          future: x.future.map((b) => ({ id: b.id, name: b.name || b.who, user_id: b.user_id, starts_on: b.starts_on, ends_on: b.ends_on })),
          queue: [...(x.offer ? [x.offer] : []), ...x.queue].map((q) => ({ id: q.id, name: q.name, user_id: q.user_id, status: q.status, offer_until: q.offer_until, since: q.created_at, tg: q.tg })) };
      });
    } else {
      const mine = st.bookings.filter((b) => b.user_id === req.user.id);
      const bal = await db.one('SELECT balance FROM users WHERE id = ?', [req.user.id]);
      out.balance = Number(bal?.balance || 0);
      out.mine = mine.map((b) => { const slot = SLOT.get(b.slot_id); const lessons = lessonDates(slot, b.starts_on <= st.today ? st.today : b.starts_on).filter((d) => d < b.ends_on);
        return { id: b.id, slot: b.slot_id, days: slot.days, from: slot.from, to: slot.to, starts_on: b.starts_on, ends_on: b.ends_on, started: b.starts_on <= st.today, last: addDays(b.ends_on, -1), price: b.price, next_lessons: lessons.slice(0, 6), left: lessons.length }; });
    }
    res.json(out);
  }));

  // book a free slot, pre-book the next period of a taken one, renew your own, or take a waitlist offer
  app.post('/api/live/book', requireStudent, h(async (req, res) => {
    const slot = SLOT.get(String(req.body?.slot || ''));
    if (!slot) return bad(res, 'Choose a time');
    const key = String(req.body?.key || '').replace(/[^\w-]/g, '').slice(0, 40);
    if (key && (await db.one('SELECT id FROM live_bookings WHERE ref = ?', [`live:${req.user.id}:${key}`]))) return res.json({ ok: true, already: true });
    await sweepLive().catch(() => {});
    const s = await getSettings();
    const st = await load();
    const x = stateOf(slot.id, st);
    const v = view(slot, x, req.user, closedSet(s).has(slot.id), st.today);
    if (!['book', 'prebook', 'renew', 'offer'].includes(v.action)) {
      return bad(res, v.action === 'join' || v.action === 'waiting' ? 'This time is taken: join the waitlist and we will message you when it frees up' : v.note || 'This time cannot be booked now', 409);
    }
    const other = st.bookings.find((b) => b.user_id === req.user.id && b.slot_id !== slot.id);
    if (other) return bad(res, 'You already have a live lesson time. Cancel it first to choose another one.', 409);
    const ultra = ultraOf(s);
    const p = period(slot, v.period.starts_on);
    const shift = v.action === 'renew' ? x.future.filter((b) => b.user_id !== req.user.id) : [];
    const out = await db.tx(async (t) => {
      const ins = await t.one(`INSERT INTO live_bookings (slot_id, user_id, who, starts_on, ends_on, price, ref) VALUES (?,?,?,?,?,?,?) RETURNING *`,
        [slot.id, req.user.id, req.user.name || '', p.starts_on, p.ends_on, ultra.price, key ? `live:${req.user.id}:${key}` : null]);
      const after = await moveBalance(t, req.user.id, -ultra.price, 'subscription', { note: `${ultra.name} · live ${slot.days} ${slot.from} · from ${p.starts_on}`, ref: `live:${ins.id}` });
      if (after == null) throw Object.assign(new Error(`Not enough money on your card: ${money(ultra.price)} is needed. Top it up first.`), { status: 402, code: 'balance_low' });
      await t.run("INSERT INTO payments (user_id, provider, plan, days, amount, currency, note) VALUES (?, 'wallet', 't4', 28, ?, ?, ?)", [req.user.id, ultra.price, s.currency || 'UZS', `From wallet · ${ultra.name} live ${slot.days} ${slot.from}`]);
      // the plan starts now when the period starts now or follows the student's own running period
      if (p.starts_on <= st.today || v.action === 'renew') await grant(t, { id: ins.id, user_id: req.user.id, ends_on: p.ends_on });
      if (v.action === 'offer') await t.run("UPDATE live_queue SET status = 'booked', updated_at = now() WHERE slot_id = ? AND user_id = ? AND status IN ('waiting', 'offered')", [slot.id, req.user.id]);
      await t.run("UPDATE live_queue SET status = 'left', updated_at = now() WHERE user_id = ? AND status IN ('waiting', 'offered') AND slot_id <> ?", [req.user.id, slot.id]);
      // the current student renewed in time: a pre-booking moves one period later
      let tail = p.ends_on;
      for (const b of shift) {
        const np = period(slot, tail);
        await t.run('UPDATE live_bookings SET starts_on = ?, ends_on = ?, reminded = false WHERE id = ?', [np.starts_on, np.ends_on, b.id]);
        tail = np.ends_on;
        b.moved = np;
      }
      return { booking: ins, balance: after };
    }).catch((e) => { if (e.status === 402) return { err: e.message }; throw e; });
    if (out.err) return bad(res, out.err, 402, { code: 'balance_low' });
    for (const b of shift) if (b.user_id) await notifyUser(b.user_id, `ℹ️ ${esc(slot.uz)} ${slot.from} vaqtidagi o'quvchi darslarini uzaytirdi, shuning uchun sizning oldindan bandingiz <b>${b.moved.starts_on}</b> dan boshlanadi.\nXohlasangiz bekor qilib pulni hamyonga qaytarishingiz mumkin: ${SITE}/live`);
    await notifyAdmins(`🎓 Live: <b>${esc(req.user.name)}</b> — ${slot.days} ${slot.from}–${slot.to}, ${p.starts_on} → ${p.ends_on} (${v.action}), ${money(ultra.price)}`).catch(() => {});
    res.json({ ok: true, starts_on: p.starts_on, ends_on: p.ends_on, balance: out.balance, action: v.action });
  }));

  // waitlist
  app.post('/api/live/queue', requireStudent, h(async (req, res) => {
    const slot = SLOT.get(String(req.body?.slot || ''));
    if (!slot) return bad(res, 'Choose a time');
    await db.run("INSERT INTO live_queue (slot_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", [slot.id, req.user.id]);
    await sweepLive().catch(() => {});
    res.json({ ok: true });
  }));
  app.delete('/api/live/queue/:slot', requireStudent, h(async (req, res) => {
    await db.run("UPDATE live_queue SET status = 'left', updated_at = now() WHERE slot_id = ? AND user_id = ? AND status IN ('waiting', 'offered')", [String(req.params.slot), req.user.id]);
    await sweepLive().catch(() => {});
    res.json({ ok: true });
  }));

  // cancel a booking that has not started: the full price goes back to the wallet.
  // The teacher can also end a running one early (no money moves; the plan stays until its date).
  app.post('/api/live/bookings/:id/cancel', h(async (req, res) => {
    const b = await db.one("SELECT * FROM live_bookings WHERE id = ? AND status = 'booked'", [Number(req.params.id)]);
    const master = req.user.role === 'master';
    if (!b || (!master && b.user_id !== req.user.id)) return bad(res, 'Booking not found', 404);
    const today = nowTk().day;
    const started = ds(b.starts_on) <= today;
    if (started && !master) return bad(res, 'This period has already started. Write to the teacher if you need to stop.', 409);
    await db.tx(async (t) => {
      const r = await t.one("UPDATE live_bookings SET status = 'cancelled', cancelled_at = now(), cancelled_by = ? WHERE id = ? AND status = 'booked' RETURNING id",
        [master ? `teacher:${req.user.name || ''}` : 'student', b.id]);
      if (!r) return;
      if (!started && b.user_id && b.price) await moveBalance(t, b.user_id, b.price, 'refund', { note: `Live booking cancelled · ${b.slot_id} from ${ds(b.starts_on)}`, ref: `live-refund:${b.id}`, by: master ? req.user.id : null });
    });
    if (master && b.user_id) await notifyUser(b.user_id, started ? `ℹ️ O'qituvchi live darslaringizni yakunladi (${b.slot_id}).` : `ℹ️ O'qituvchi live bandingizni bekor qildi, ${money(b.price)} hamyoningizga qaytarildi.`);
    await sweepLive().catch(() => {});
    res.json({ ok: true, refunded: started ? 0 : b.price });
  }));

  // teacher: close a time for new students (the current one keeps it)
  app.put('/api/live/closed', requireMaster, h(async (req, res) => {
    const s = await getSettings();
    const set = closedSet(s);
    const id = String(req.body?.slot || '');
    if (!SLOT.has(id)) return bad(res, 'Unknown time');
    if (req.body?.closed) set.add(id); else set.delete(id);
    await db.run("INSERT INTO settings (key, value) VALUES ('live_closed', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify([...set])]);
    res.json({ ok: true, closed: [...set] });
  }));
  app.delete('/api/live/queue-entry/:id', requireMaster, h(async (req, res) => {
    await db.run("UPDATE live_queue SET status = 'left', updated_at = now() WHERE id = ? AND status IN ('waiting', 'offered')", [Number(req.params.id)]);
    await sweepLive().catch(() => {});
    res.json({ ok: true });
  }));
}
