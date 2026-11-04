/**
 * Plans (tiers), limits, balance and consultations.
 *
 *  free  – no subscription
 *  t1    – questions, mocks, explanations and score tracking (limited)
 *  t2    – t1 + roadmap lessons (no video) + more limits + a consultation every 2 weeks
 *  t3    – t2 + video lessons + more limits + direct questions to the teacher + 30 min consultation every week
 *  t4    – everything + live online lessons
 *
 * The teacher edits names, prices and limits in Settings (stored as JSON in settings.tiers).
 * 0 in a daily/weekly limit = unlimited. Full mocks beyond the weekly limit cost settings.fm_extra_price from
 * the balance. The balance changes only on the server: teacher top-ups and purchases, each a ledger row,
 * with a CHECK (balance >= 0) and a conditional UPDATE so it can never be inflated or go negative.
 */
import { db, getSettings } from './db.js';
import { subActive } from './auth.js';

export const DEFAULT_TIERS = [
  { id: 't1', name: 'Practice', price: 99000, q_day: 80, quiz_day: 2, fm_week: 2, roadmap: false, video: false, ask: false, consult_days: 0, consult_min: 0, live: false },
  { id: 't2', name: 'Roadmap', price: 149000, q_day: 200, quiz_day: 4, fm_week: 3, roadmap: true, video: false, ask: false, consult_days: 14, consult_min: 30, live: false },
  { id: 't3', name: 'Video', price: 249000, q_day: 0, quiz_day: 0, fm_week: 5, roadmap: true, video: true, ask: true, consult_days: 7, consult_min: 30, live: false },
  { id: 't4', name: 'Live', price: 399000, q_day: 0, quiz_day: 0, fm_week: 7, roadmap: true, video: true, ask: true, consult_days: 7, consult_min: 30, live: true },
];
export const FREE_TIER = { id: 'free', name: 'Free', price: 0, q_day: 20, quiz_day: 1, fm_week: 1, roadmap: false, video: false, ask: false, consult_days: 0, consult_min: 0, live: false };
const ALL = { id: 'master', name: 'Teacher', price: 0, q_day: 0, quiz_day: 0, fm_week: 0, roadmap: true, video: true, ask: true, consult_days: 0, consult_min: 0, live: true };
const LEGACY = { month: 't3', quarter: 't3' }; // plans sold before tiers existed keep full course access

const int = (v, d) => (Number.isFinite(+v) ? Math.max(0, Math.min(1e7, Math.round(+v))) : d);
export function readTiers(settings) {
  let list = [];
  try { list = JSON.parse(settings.tiers || '[]'); } catch { list = []; }
  return DEFAULT_TIERS.map((d) => {
    const t = list.find((x) => x.id === d.id) || {};
    return {
      ...d, name: String(t.name || d.name).slice(0, 30), price: int(t.price, d.price),
      q_day: int(t.q_day, d.q_day), quiz_day: int(t.quiz_day, d.quiz_day), fm_week: int(t.fm_week, d.fm_week),
      consult_days: int(t.consult_days, d.consult_days), consult_min: int(t.consult_min, d.consult_min),
    };
  });
}
export function cleanTiers(input) {
  const list = Array.isArray(input) ? input : [];
  return JSON.stringify(DEFAULT_TIERS.map((d) => {
    const t = list.find((x) => x?.id === d.id) || {};
    return { id: d.id, name: String(t.name || d.name).trim().slice(0, 30) || d.name, price: int(t.price, d.price), q_day: int(t.q_day, d.q_day), quiz_day: int(t.quiz_day, d.quiz_day),
      fm_week: int(t.fm_week, d.fm_week), consult_days: int(t.consult_days, d.consult_days), consult_min: int(t.consult_min, d.consult_min) };
  }));
}

/** The tier a user has right now (features + limits). */
export function tierOf(user, settings) {
  if (user?.role === 'master') return ALL;
  const tiers = readTiers(settings);
  if (subActive(user)) {
    const id = tiers.some((t) => t.id === user.sub_plan) ? user.sub_plan : LEGACY[user.sub_plan] || 't3';
    return tiers.find((t) => t.id === id);
  }
  return { ...FREE_TIER, fm_week: int(settings.fm_free, 1), q_day: int(settings.free_q_day, FREE_TIER.q_day) };
}

const TODAY = "date_trunc('day', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent'";
/** Question Bank answers and Take a quiz starts used today. */
export async function usedToday(userId) {
  const q = await db.one(`SELECT COUNT(*) AS n FROM qbank_answers WHERE user_id = ? AND answered_at >= ${TODAY}`, [userId]);
  const m = await db.one(`SELECT COUNT(*) AS n FROM qbank_mocks WHERE user_id = ? AND started_at >= ${TODAY} AND NOT paid AND item_id IS NULL`, [userId]).catch(() => ({ n: 0 }));
  return { questions: Number(q.n), quizzes: Number(m.n) };
}

export async function migrateTiers() {
  await db.exec(`
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS balance_ledger (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, reason TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  ref TEXT, created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_ref ON balance_ledger(ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_user ON balance_ledger(user_id, id DESC);
CREATE TABLE IF NOT EXISTS consultations (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferred TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'requested', scheduled_at TIMESTAMPTZ, link TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consult_user ON consultations(user_id, created_at DESC);
ALTER TABLE balance_ledger ENABLE ROW LEVEL SECURITY; ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS auth_fails (key TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, first_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE auth_fails ENABLE ROW LEVEL SECURITY;
`);
  // the balance can never be negative, whatever happens in the code
  await db.exec(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_balance_nonneg') THEN
      ALTER TABLE users ADD CONSTRAINT users_balance_nonneg CHECK (balance >= 0);
    END IF; END $$;`).catch(() => {});
}

/**
 * Change a balance atomically. amount < 0 spends: it fails (returns null) when the balance is too small.
 * `ref` makes a charge idempotent (the same ref is never applied twice).
 */
export async function moveBalance(t, userId, amount, reason, { note = '', ref = null, by = null } = {}) {
  amount = Math.round(amount);
  if (!amount) return null;
  if (ref && (await t.one('SELECT id FROM balance_ledger WHERE ref = ?', [ref]))) return null;
  const row = await t.one('UPDATE users SET balance = balance + ? WHERE id = ? AND balance + ? >= 0 RETURNING balance', [amount, userId, amount]);
  if (!row) return null;
  await t.run('INSERT INTO balance_ledger (user_id, amount, balance_after, reason, note, ref, created_by) VALUES (?,?,?,?,?,?,?)',
    [userId, amount, row.balance, reason, String(note).slice(0, 300), ref, by]);
  return Number(row.balance);
}

export function registerTiers(app, { h, bad, requireMaster, requireStudent }) {
  app.get('/api/plans', h(async (req, res) => {
    const s = await getSettings();
    res.json({ tiers: readTiers(s), free: tierOf({ role: 'student' }, s), currency: s.currency, fm_extra_price: int(s.fm_extra_price, 20000),
      card: s.pay_card ? { number: s.pay_card, holder: s.pay_holder } : null, live: s.live_note || '' });
  }));

  app.post('/api/plans/buy', requireStudent, h(async (req, res) => {
    res.json(await buyPlan(req.user.id, req.body?.plan, req.body?.months, req.body?.key));
  }));

  app.get('/api/me/balance', h(async (req, res) => {
    const u = await db.one('SELECT balance FROM users WHERE id = ?', [req.user.id]);
    const rows = await db.all('SELECT amount, balance_after, reason, note, created_at FROM balance_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 30', [req.user.id]);
    res.json({ balance: Number(u?.balance || 0), wallet_no: walletNo(req.user.id), history: rows });
  }));
  // teacher: top up (or correct) a student's balance — the only way money is added
  app.post('/api/students/:id/balance', requireMaster, h(async (req, res) => {
    const u = await db.one("SELECT id, balance FROM users WHERE id = ? AND role = 'student'", [req.params.id]);
    if (!u) return bad(res, 'Not found', 404);
    // { amount: +/-N } adds or subtracts; { set: N } sets the wallet to exactly N (the difference is logged)
    const target = req.body?.set != null ? Math.round(Number(req.body.set)) : null;
    if (target != null && (!Number.isFinite(target) || target < 0 || target > 100_000_000)) return bad(res, 'Enter the new balance');
    const amount = target != null ? target - Number(u.balance || 0) : Math.round(Number(req.body?.amount));
    if (target != null && !amount) return res.json({ balance: target });
    if (!Number.isFinite(amount) || !amount || Math.abs(amount) > 100_000_000) return bad(res, 'Enter an amount');
    const after = await db.tx((t) => moveBalance(t, u.id, amount, amount > 0 ? 'top_up' : 'correction', { note: req.body?.note || '', by: req.user.id }));
    if (after == null) return bad(res, 'The balance cannot go below zero');
    const { audit } = await import('./security.js');
    await audit(req, 'balance_changed', `student ${u.id}`, `${amount > 0 ? '+' : ''}${amount} → ${after}${req.body?.note ? ` · ${req.body.note}` : ''}`);
    res.json({ balance: after });
  }));
  app.get('/api/students/:id/balance', requireMaster, h(async (req, res) => {
    const u = await db.one('SELECT balance FROM users WHERE id = ?', [req.params.id]);
    const rows = await db.all('SELECT amount, balance_after, reason, note, created_at FROM balance_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 50', [req.params.id]);
    res.json({ balance: Number(u?.balance || 0), history: rows });
  }));

  // live online lessons (plan 4): the link is only given to students who have it
  app.get('/api/live', h(async (req, res) => {
    const s = await getSettings();
    const t = tierOf(req.user, s);
    if (!t.live) return bad(res, 'Live lessons come with the Live plan', 402, { code: 'subscription_required' });
    res.json({ link: s.live_link, note: s.live_note });
  }));

  // consultations
  app.get('/api/consultations', h(async (req, res) => {
    if (req.user.role === 'master') {
      return res.json(await db.all(`SELECT c.*, u.name, u.email, u.login, u.sub_plan FROM consultations c JOIN users u ON u.id = c.user_id
        ORDER BY (c.status = 'requested') DESC, (c.status = 'scheduled') DESC, COALESCE(c.scheduled_at, c.created_at) DESC LIMIT 200`));
    }
    const tier = tierOf(req.user, await getSettings());
    const list = await db.all('SELECT * FROM consultations WHERE user_id = ? ORDER BY id DESC LIMIT 10', [req.user.id]);
    const last = list.find((c) => c.status !== 'cancelled');
    const nextAt = tier.consult_days && last ? new Date(new Date(last.created_at).getTime() + tier.consult_days * 86400e3) : null;
    res.json({ every_days: tier.consult_days, minutes: tier.consult_min, list, next_at: nextAt && nextAt > new Date() ? nextAt : null });
  }));
  app.post('/api/consultations', requireStudent, h(async (req, res) => {
    const tier = tierOf(req.user, await getSettings());
    if (!tier.consult_days) return bad(res, 'Consultations with the teacher come with the Roadmap plan and higher', 402, { code: 'subscription_required' });
    const last = await db.one("SELECT created_at FROM consultations WHERE user_id = ? AND status <> 'cancelled' ORDER BY id DESC LIMIT 1", [req.user.id]);
    if (last && Date.now() - new Date(last.created_at).getTime() < tier.consult_days * 86400e3) {
      const next = new Date(new Date(last.created_at).getTime() + tier.consult_days * 86400e3);
      return bad(res, `Your next consultation can be booked from ${next.toISOString().slice(0, 10)}`, 429);
    }
    const preferred = String(req.body?.preferred || '').trim().slice(0, 200);
    if (!preferred) return bad(res, 'Write when it suits you (day and time)');
    await db.run('INSERT INTO consultations (user_id, preferred, note, minutes) VALUES (?,?,?,?)', [req.user.id, preferred, String(req.body?.note || '').slice(0, 1000), tier.consult_min || 30]);
    import('./tgbot.js').then((m) => m.notifyAdmins(`📅 Consultation request: <b>${String(req.user.name).replace(/[<>&]/g, '')}</b> (${tier.name}, ${tier.consult_min || 30} min)\nWhen: ${preferred.replace(/[<>&]/g, '')}${req.body?.note ? `\nTopic: ${String(req.body.note).slice(0, 200).replace(/[<>&]/g, '')}` : ''}\nConfirm the time on the website → Consultations.`)).catch(() => {});
    res.json({ ok: true });
  }));
  app.post('/api/consultations/:id/cancel', requireStudent, h(async (req, res) => {
    await db.run("UPDATE consultations SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status IN ('requested', 'scheduled')", [Number(req.params.id), req.user.id]);
    res.json({ ok: true });
  }));
  app.put('/api/consultations/:id', requireMaster, h(async (req, res) => {
    const st = ['requested', 'scheduled', 'done', 'cancelled'].includes(req.body?.status) ? req.body.status : 'scheduled';
    const at = req.body?.scheduled_at ? new Date(req.body.scheduled_at) : null;
    await db.run('UPDATE consultations SET status = ?, scheduled_at = COALESCE(?, scheduled_at), link = COALESCE(?, link) WHERE id = ?',
      [st, at && !Number.isNaN(at.getTime()) ? at.toISOString() : null, req.body?.link != null ? String(req.body.link).slice(0, 300) : null, Number(req.params.id)]);
    res.json({ ok: true });
  }));
}

/* ---------- sign-in brute-force protection ---------- */
const FAIL_WINDOW_MIN = 15;
const FAIL_MAX = 8;
export async function tooManyFails(key) {
  const r = await db.one(`SELECT n FROM auth_fails WHERE key = ? AND first_at > now() - interval '${FAIL_WINDOW_MIN} minutes'`, [key]);
  return Number(r?.n || 0) >= FAIL_MAX;
}
export async function noteFail(key) {
  await db.run(`INSERT INTO auth_fails (key, n, first_at) VALUES (?, 1, now())
    ON CONFLICT (key) DO UPDATE SET n = CASE WHEN auth_fails.first_at > now() - interval '${FAIL_WINDOW_MIN} minutes' THEN auth_fails.n + 1 ELSE 1 END,
    first_at = CASE WHEN auth_fails.first_at > now() - interval '${FAIL_WINDOW_MIN} minutes' THEN auth_fails.first_at ELSE now() END`, [key]);
}
export const clearFails = (key) => db.run('DELETE FROM auth_fails WHERE key = ?', [key]);

/* ---------- wallet ---------- */
/** The student's wallet number on the platform (not a bank card): SU 0000 0000 0012. */
export const walletNo = (id) => `SU ${String(id).padStart(12, '0').replace(/(\d{4})(?=\d)/g, '$1 ')}`;
export const MIN_TOPUP = 5000;
export const MAX_TOPUP = 10_000_000;

/**
 * Buy a plan from the wallet: one transaction takes the money and extends the subscription.
 * `key` (a random id from the client) makes a double click charge only once.
 */
export async function buyPlan(userId, tierId, months, key) {
  const s = await getSettings();
  const tier = readTiers(s).find((t) => t.id === tierId);
  if (!tier || !tier.price) throw Object.assign(new Error('Choose a plan'), { status: 400 });
  months = [1, 3, 6, 12].includes(Number(months)) ? Number(months) : 1;
  const price = tier.price * months;
  if (key && (await db.one('SELECT id FROM balance_ledger WHERE ref = ?', [`buy:${userId}:${String(key).slice(0, 40)}`]))) {
    const u = await db.one('SELECT sub_until, balance FROM users WHERE id = ?', [userId]);
    return { until: u.sub_until, balance: Number(u.balance), plan: tier.id, already: true };
  }
  return db.tx(async (t) => {
    const u = await t.one('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    const after = await moveBalance(t, userId, -price, 'subscription', { note: `${tier.name} · ${months} mo`, ref: key ? `buy:${userId}:${String(key).slice(0, 40)}` : null });
    if (after == null) throw Object.assign(new Error('Not enough money in your wallet. Top it up first.'), { status: 402 });
    const active = subActive(u) && u.sub_plan === tier.id;
    const from = active ? new Date(u.sub_until) : new Date();
    const until = new Date(from.getTime() + months * 30 * 86400e3).toISOString();
    await t.run('UPDATE users SET sub_until = ?, sub_plan = ? WHERE id = ?', [until, tier.id, userId]);
    await t.run("INSERT INTO payments (user_id, provider, plan, days, amount, currency, note) VALUES (?, 'wallet', ?, ?, ?, ?, ?)", [userId, tier.id, months * 30, price, s.currency || 'UZS', `From wallet · ${tier.name}`]);
    return { until, balance: after, plan: tier.id };
  });
}
