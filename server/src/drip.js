/**
 * Weekly lessons for the free audience.
 *
 * Students without a roadmap plan get the module's free lessons right away (Writing Part 1: lessons 1–2).
 * After that, every lesson in the roadmap opens a set number of days (Settings → drip_days, default 7) after the
 * student PASSED the level check of the previous one. Subscribers are not affected (next lesson opens on passing).
 * Vocabulary and session checks follow the normal order without a wait, so free students can finish a part.
 *
 * A waiting lesson can be opened early: with a plan, by paying a small price from the wallet
 * (Settings → lesson_unlock_price), or by the teacher for one student. When a lesson opens the Telegram bot tells
 * the student (checked on API traffic every 15 minutes and by a daily Vercel cron).
 */
import { db, getSettings } from './db.js';
import { moveBalance } from './tiers.js';
import { notifyUser } from './tgbot.js';
import { calibrateIfStale } from './calibrate.js';
import { sweepLive } from './live.js';

const SITE = process.env.SITE_URL || 'https://www.ustozsat.uz';
const esc = (s) => String(s || '').replace(/[<>&]/g, '');
export const dripDays = (s) => Math.max(0, Math.min(60, Number(s.drip_days ?? 7) || 0));
export const unlockPrice = (s) => Math.max(0, Number(s.lesson_unlock_price ?? 10000) || 0);

export async function migrateDrip() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS roadmap_unlocks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, item_id INTEGER NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  how TEXT NOT NULL DEFAULT 'teacher', by_name TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id));
CREATE TABLE IF NOT EXISTS drip_notices (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, item_id INTEGER NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  opens_at TIMESTAMPTZ NOT NULL, notified_at TIMESTAMPTZ, PRIMARY KEY (user_id, item_id));
CREATE INDEX IF NOT EXISTS idx_drip_due ON drip_notices(opens_at) WHERE notified_at IS NULL;
ALTER TABLE roadmap_unlocks ENABLE ROW LEVEL SECURITY; ALTER TABLE drip_notices ENABLE ROW LEVEL SECURITY;
INSERT INTO settings (key, value) VALUES ('_drip_tick', '0') ON CONFLICT (key) DO NOTHING;`);
}

export const unlocksFor = async (userId) => new Set((await db.all('SELECT item_id FROM roadmap_unlocks WHERE user_id = ?', [userId])).map((r) => r.item_id));

/** Send "your lesson is open" messages that are due (at most `limit` per run). */
export async function sweepDrip(limit = 40) {
  const due = await db.all(`SELECT n.user_id, n.item_id, i.title FROM drip_notices n JOIN roadmap_items i ON i.id = n.item_id
    WHERE n.notified_at IS NULL AND n.opens_at <= now() ORDER BY n.opens_at LIMIT ${Number(limit) || 40}`);
  for (const d of due) {
    const claimed = await db.one('UPDATE drip_notices SET notified_at = now() WHERE user_id = ? AND item_id = ? AND notified_at IS NULL RETURNING user_id', [d.user_id, d.item_id]);
    if (claimed) await notifyUser(d.user_id, `🔓 <b>Yangi dars ochildi!</b>\n${esc(d.title)}\n\nDavom eting: ${SITE}/lesson/${d.item_id}`);
  }
  return due.length;
}

export function registerDrip(app, { h, bad, requireMaster, requireStudent, roadmapFor, accessFor }) {
  // light background job: at most once every 15 minutes, on any API request
  let lastTry = 0; // per server instance: skip the database check between tries
  app.use('/api', async (req, res, next) => {
    if (Date.now() - lastTry < 60e3) return next();
    lastTry = Date.now();
    try {
      const cut = String(Date.now() - 15 * 60e3);
      const claimed = await db.one("UPDATE settings SET value = ? WHERE key = '_drip_tick' AND (CASE WHEN value ~ '^[0-9]+$' THEN value::bigint ELSE 0 END) < ?::bigint RETURNING key", [String(Date.now()), cut]);
      if (claimed) { await sweepDrip(25); await sweepLive().catch((e) => console.error('[live]', e.message)); }
    } catch (e) { console.error('[drip]', e.message); }
    next();
  });
  // daily safety net (vercel.json → crons)
  app.get('/api/cron/drip', h(async (req, res) => {
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
    res.json({ sent: await sweepDrip(200), live: await sweepLive().catch((e) => ({ error: e.message })), calibration: await calibrateIfStale(60).catch((e) => ({ error: e.message })) });
  }));

  // student: open a waiting lesson now, paid from the wallet
  app.post('/api/lessons/:id/unlock-now', requireStudent, h(async (req, res) => {
    const id = Number(req.params.id);
    const { steps } = await roadmapFor(req.user);
    const it = steps.flatMap((s) => s.items).find((x) => x.id === id);
    if (!it?.wait_until) return bad(res, 'This lesson is not waiting');
    const s = await getSettings();
    const price = unlockPrice(s);
    if (!price) return bad(res, 'Opening lessons early is turned off');
    await db.tx(async (t) => {
      const after = await moveBalance(t, req.user.id, -price, 'lesson', { note: it.title, ref: `lesson:${req.user.id}:${id}` });
      if (after == null) throw Object.assign(new Error('Not enough money on your card. Top it up first.'), { status: 402 });
      await t.run("INSERT INTO roadmap_unlocks (user_id, item_id, how, price) VALUES (?, ?, 'wallet', ?) ON CONFLICT DO NOTHING", [req.user.id, id, price]);
      await t.run('UPDATE drip_notices SET notified_at = now() WHERE user_id = ? AND item_id = ?', [req.user.id, id]);
    });
    res.json({ ok: true, price });
  }));

  // teacher: lessons a student is waiting for, and opening one for them
  app.get('/api/students/:id/waits', requireMaster, h(async (req, res) => {
    const u = await db.one("SELECT * FROM users WHERE id = ? AND role = 'student'", [Number(req.params.id)]);
    if (!u) return bad(res, 'Student not found', 404);
    const { steps } = await roadmapFor(u);
    const access = await accessFor(u);
    const unlocked = await db.all('SELECT u.item_id, u.how, u.by_name, u.price, u.created_at, i.title FROM roadmap_unlocks u JOIN roadmap_items i ON i.id = u.item_id WHERE u.user_id = ? ORDER BY u.created_at DESC', [u.id]);
    res.json({
      weekly: !access.roadmap,
      waiting: steps.flatMap((s) => s.items.filter((x) => x.wait_until).map((x) => ({ id: x.id, title: x.title, step: s.title, opens_at: x.wait_until }))),
      unlocked,
    });
  }));
  app.post('/api/students/:id/unlock/:item', requireMaster, h(async (req, res) => {
    const uid = Number(req.params.id); const item = Number(req.params.item);
    await db.run("INSERT INTO roadmap_unlocks (user_id, item_id, how, by_name) VALUES (?, ?, 'teacher', ?) ON CONFLICT (user_id, item_id) DO NOTHING", [uid, item, req.user.name || 'Teacher']);
    await db.run('UPDATE drip_notices SET notified_at = now() WHERE user_id = ? AND item_id = ? AND notified_at IS NULL', [uid, item]);
    const it = await db.one('SELECT title FROM roadmap_items WHERE id = ?', [item]);
    await notifyUser(uid, `🔓 O'qituvchingiz siz uchun darsni ochdi: <b>${esc(it?.title)}</b>\n${SITE}/lesson/${item}`);
    res.json({ ok: true });
  }));
}

/**
 * After a free student passes a level check: schedule the "lesson opened" message for the next waiting lesson
 * and tell them when it opens.
 */
export async function afterPass(user, roadmapFor) {
  try {
    const { steps } = await roadmapFor(user);
    const next = steps.flatMap((s) => s.items).find((x) => x.wait_until);
    if (!next) return;
    const r = await db.one('INSERT INTO drip_notices (user_id, item_id, opens_at) VALUES (?, ?, ?) ON CONFLICT (user_id, item_id) DO NOTHING RETURNING item_id', [user.id, next.id, next.wait_until]);
    if (r) {
      const s = await getSettings();
      const when = new Date(next.wait_until).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      await notifyUser(user.id, `✅ Ajoyib, level checkdan o'tdingiz!\nKeyingi dars — <b>${esc(next.title)}</b> — ${when} da ochiladi. Ochilganda shu yerga xabar beraman.\n\nKutmasdan davom etish: obuna yoki hamyondan ${unlockPrice(s).toLocaleString('en-US').replace(/,/g, ' ')} so'm.\n${SITE}/lesson/${next.id}`);
    }
  } catch (e) { console.error('[drip] afterPass', e.message); }
}
