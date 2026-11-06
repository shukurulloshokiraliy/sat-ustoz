/**
 * Teacher finance: money in (wallet top-ups and direct plan payments), what students spent it on,
 * prizes paid, the teacher's own expenses, profit, and every student's wallet.
 *
 * Money in   = wallet top-ups (Telegram receipts, teacher adds) + plan payments made directly (not from the wallet)
 * Revenue    = what students spent from wallets (plans, extra mocks, extra quizzes) + direct plan payments
 * Profit     = revenue − prizes − expenses
 * Wallets    = money already received but not spent yet (students can still spend it)
 */
import { db } from './db.js';

const MONEY_TABLES = ['tg_requests', 'balance_ledger', 'payments'];

export async function migrateFinance() {
  await db.exec(`CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, amount INTEGER NOT NULL, spent_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
  -- a copy of every receipt photo the bot received (Telegram links stop working if the bot is ever changed)
  CREATE TABLE IF NOT EXISTS tg_receipt_files (request_id INTEGER PRIMARY KEY, type TEXT NOT NULL DEFAULT 'image/jpeg', data BYTEA NOT NULL, saved_at TIMESTAMPTZ NOT NULL DEFAULT now());
  ALTER TABLE tg_receipt_files ENABLE ROW LEVEL SECURITY;`);
}

/** Runs after every other migration (needs tg_requests, balance_ledger and payments to exist). */
export async function keepPaymentRecords() {
  // Payment records are kept forever: each row remembers the student's name, and deleting a student
  // no longer deletes their payments (user_id becomes empty, the row and the name stay).
  for (const t of MONEY_TABLES) await db.exec(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS who TEXT NOT NULL DEFAULT ''`);
  await db.exec(`CREATE OR REPLACE FUNCTION fin_who() RETURNS trigger AS $$
    BEGIN
      IF NEW.who = '' AND NEW.user_id IS NOT NULL THEN
        SELECT CONCAT(name, ' · ', COALESCE(NULLIF(email, ''), login)) INTO NEW.who FROM users WHERE id = NEW.user_id;
        NEW.who := COALESCE(NEW.who, '');
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql;`);
  for (const t of MONEY_TABLES) {
    await db.exec(`DROP TRIGGER IF EXISTS ${t}_who ON ${t}; CREATE TRIGGER ${t}_who BEFORE INSERT ON ${t} FOR EACH ROW EXECUTE FUNCTION fin_who();`);
    await db.exec(`UPDATE ${t} x SET who = CONCAT(u.name, ' · ', COALESCE(NULLIF(u.email, ''), u.login)) FROM users u WHERE u.id = x.user_id AND x.who = ''`);
    await db.exec(`DO $$ DECLARE c TEXT; BEGIN
      SELECT con.conname INTO c FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
        WHERE con.conrelid = '${t}'::regclass AND con.contype = 'f' AND con.confrelid = 'users'::regclass AND a.attname = 'user_id' AND con.confdeltype = 'c';
      IF c IS NOT NULL THEN
        EXECUTE format('ALTER TABLE ${t} DROP CONSTRAINT %I', c);
        ALTER TABLE ${t} ALTER COLUMN user_id DROP NOT NULL;
        ALTER TABLE ${t} ADD CONSTRAINT ${t}_user_keep FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
      END IF; END $$;`);
  }
}

const TZ = "AT TIME ZONE 'Asia/Tashkent'";
const MONTH0 = `(date_trunc('month', now() ${TZ}) ${TZ})`;
const FROM = {
  month: MONTH0,
  last: `(${MONTH0} - interval '1 month')`,
  year: `(date_trunc('year', now() ${TZ}) ${TZ})`,
  all: "'1970-01-01'::timestamptz",
};
const TO = { month: 'now() + interval \'1 minute\'', last: MONTH0, year: 'now() + interval \'1 minute\'', all: 'now() + interval \'1 minute\'' };
const SPEND = ['subscription', 'full_mock', 'quiz', 'lesson'];
const n = (x) => Number(x || 0);
const KIND = { top_up: 'Top-up', plan: 'Plan', subscription: 'Plan (from wallet)', full_mock: 'Extra full mock', quiz: 'Extra quiz', lesson: 'Lesson opened early', prize: 'Leaderboard prize', correction: 'Correction', refund: 'Refund' };
const VIA = { receipt: 'Telegram bot receipt', wallet: 'Wallet', teacher: 'Teacher', prize: 'Leaderboard', telegram: 'Telegram Pay', card: 'Card', click: 'Click', payme: 'Payme' };
const STATUS = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected', done: 'Done' };

async function summary(from, to) {
  const led = await db.all(`SELECT reason, SUM(amount) AS s, COUNT(*) AS c FROM balance_ledger WHERE created_at >= ${from} AND created_at < ${to} GROUP BY reason`);
  const by = Object.fromEntries(led.map((r) => [r.reason, { s: n(r.s), c: n(r.c) }]));
  const direct = await db.one(`SELECT COALESCE(SUM(amount), 0) AS s, COUNT(*) AS c FROM payments WHERE provider <> 'wallet' AND amount > 0 AND created_at >= ${from} AND created_at < ${to}`);
  const exp = await db.one(`SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE spent_on >= (${from})::date AND spent_on < (${to})::date + 1`);
  const spent = Object.fromEntries(SPEND.map((k) => [k, -(by[k]?.s || 0)]));
  const refunds = by.refund?.s || 0; // money given back to the wallet (e.g. a cancelled live booking)
  const revenue = SPEND.reduce((s, k) => s + spent[k], 0) + n(direct.s) - refunds;
  const prizes = by.prize?.s || 0;
  return {
    cash_in: (by.top_up?.s || 0) + n(direct.s), top_ups: by.top_up?.s || 0, top_up_count: by.top_up?.c || 0,
    direct: n(direct.s), direct_count: n(direct.c),
    revenue, plans: spent.subscription + n(direct.s) - refunds, refunds, extra_mocks: spent.full_mock, extra_quizzes: spent.quiz, early_lessons: spent.lesson,
    prizes, corrections: by.correction?.s || 0, expenses: n(exp.s), profit: revenue - prizes - n(exp.s),
  };
}

/* ---------- Payments journal: every payment, one row each ---------- */
/**
 * One row per money event, newest first:
 *  receipt  — a payment receipt sent to the Telegram bot (top-up or plan): pending, approved or rejected
 *  wallet   — wallet changes that did not come from a receipt: teacher top-ups / corrections, prizes,
 *             spending on plans, extra full mocks and extra quizzes
 *  direct   — plans paid directly (teacher by hand, Telegram Pay, Click / Payme), not from the wallet
 * Approved receipts are shown once (as the receipt), not again as the wallet top-up / plan they created.
 */
const JOURNAL = `
  SELECT 'r' || r.id AS key, r.created_at AS at, r.user_id, r.who, CASE WHEN r.plan = 'topup' THEN 'top_up' ELSE 'plan' END AS kind,
    'receipt' AS via, r.amount, r.status, CASE WHEN r.plan = 'topup' THEN '' ELSE r.plan END AS plan, CONCAT('Receipt #', r.id) AS note,
    r.decided_by, r.decided_at, r.id AS receipt_id
  FROM tg_requests r
  UNION ALL
  SELECT 'l' || l.id, l.created_at, l.user_id, l.who, l.reason,
    CASE WHEN l.reason IN ('subscription', 'full_mock', 'quiz', 'lesson', 'refund') THEN 'wallet' WHEN l.reason = 'prize' THEN 'prize' ELSE 'teacher' END,
    l.amount, 'done', '', l.note, COALESCE(cb.name, ''), NULL, NULL
  FROM balance_ledger l LEFT JOIN users cb ON cb.id = l.created_by
  WHERE l.ref IS NULL OR l.ref NOT LIKE 'tg:%'
  UNION ALL
  SELECT 'p' || p.id, p.created_at, p.user_id, p.who, 'plan', CASE WHEN p.provider = 'manual' THEN 'teacher' ELSE p.provider END,
    p.amount, 'done', p.plan, p.note, COALESCE(cb.name, ''), NULL, NULL
  FROM payments p LEFT JOIN users cb ON cb.id = p.created_by
  WHERE p.provider <> 'wallet' AND p.amount > 0 AND p.note NOT LIKE 'Telegram chek №%'`;

function journalWhere(q) {
  const where = []; const args = [];
  const d = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || '') ? x : null);
  if (FROM[q.period] && q.period !== 'all' && !d(q.from)) { where.push(`j.at >= ${FROM[q.period]} AND j.at < ${TO[q.period]}`); }
  if (d(q.from)) { where.push(`j.at >= (?::date ${TZ})`); args.push(d(q.from)); }
  if (d(q.to)) { where.push(`j.at < ((?::date + 1) ${TZ})`); args.push(d(q.to)); }
  const kinds = { top_up: ['top_up'], plan: ['plan', 'subscription'], mock: ['full_mock'], quiz: ['quiz'], lesson: ['lesson'], prize: ['prize'], correction: ['correction'] };
  if (kinds[q.kind]) { where.push(`j.kind = ANY(?::text[])`); args.push(kinds[q.kind]); }
  if (['pending', 'approved', 'rejected', 'done'].includes(q.status)) { where.push('j.status = ?'); args.push(q.status); }
  if (['receipt', 'wallet', 'teacher', 'prize'].includes(q.via)) { where.push('j.via = ?'); args.push(q.via); }
  const k = String(q.q || '').trim().toLowerCase().slice(0, 60);
  if (k) {
    where.push(`(LOWER(j.who) LIKE ? OR LOWER(j.note) LIKE ? OR j.user_id IN (SELECT id FROM users WHERE REPLACE(COALESCE(wallet_no, ''), ' ', '') LIKE ?))`);
    args.push(`%${k}%`, `%${k}%`, `%${k.replace(/\s/g, '')}%`);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

const csvCell = (v) => { const x = v == null ? '' : String(v); return /[",\n;]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };

export function registerFinance(app, { h, bad, requireMaster }) {
  app.get('/api/finance/payments', requireMaster, h(async (req, res) => {
    const w = journalWhere(req.query);
    const base = `FROM (${JOURNAL}) j ${w.sql}`;
    if (req.query.format === 'csv') {
      const rows = await db.all(`SELECT j.* ${base} ORDER BY j.at DESC LIMIT 50000`, w.args);
      const head = ['Date', 'Time', 'Student', 'Type', 'Via', 'Plan', 'Amount (UZS)', 'Status', 'Note', 'Decided by', 'Decided at'];
      const fmt = (t) => new Date(t).toLocaleString('sv-SE', { timeZone: 'Asia/Tashkent' });
      const lines = rows.map((r) => { const [dd, tt] = fmt(r.at).split(' '); return [dd, tt, r.who, KIND[r.kind] || r.kind, VIA[r.via] || r.via, r.plan, n(r.amount), STATUS[r.status] || r.status, r.note, r.decided_by, r.decided_at ? fmt(r.decided_at) : ''].map(csvCell).join(','); });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sat-ustoz-payments-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send('\uFEFF' + [head.join(','), ...lines].join('\r\n'));
    }
    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const rows = await db.all(`SELECT j.* ${base} ORDER BY j.at DESC LIMIT ${limit} OFFSET ${offset}`, w.args);
    const t = await db.one(`SELECT COUNT(*) AS c,
        COALESCE(SUM(j.amount) FILTER (WHERE j.amount > 0 AND j.status IN ('approved', 'done') AND j.kind IN ('top_up', 'plan')), 0) AS money_in,
        COALESCE(-SUM(j.amount) FILTER (WHERE j.amount < 0 AND j.via = 'wallet'), 0) AS spent,
        COUNT(*) FILTER (WHERE j.status = 'pending') AS pending, COALESCE(SUM(j.amount) FILTER (WHERE j.status = 'pending'), 0) AS pending_sum,
        COUNT(*) FILTER (WHERE j.status = 'rejected') AS rejected ${base}`, w.args);
    res.json({
      rows: rows.map((r) => ({ ...r, amount: n(r.amount) })), total: n(t.c), offset, limit,
      totals: { money_in: n(t.money_in), spent: n(t.spent), pending: n(t.pending), pending_sum: n(t.pending_sum), rejected: n(t.rejected) },
    });
  }));

  app.get('/api/finance', requireMaster, h(async (req, res) => {
    const p = FROM[req.query.period] ? req.query.period : 'month';
    const sum = await summary(FROM[p], TO[p]);
    const held = await db.one("SELECT COALESCE(SUM(balance), 0) AS s, COUNT(*) FILTER (WHERE balance > 0) AS c FROM users WHERE role = 'student'");
    // last 6 months, for the chart
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const f = `(${MONTH0} - interval '${i} month')`;
      const t = `(${MONTH0} - interval '${i - 1} month')`;
      const s = await summary(f, t);
      const label = (await db.one(`SELECT to_char((${f}) ${TZ}, 'Mon') AS m`)).m;
      months.push({ month: label, revenue: s.revenue, cash_in: s.cash_in, profit: s.profit });
    }
    const students = await db.all(`SELECT u.id, u.name, u.email, u.login, u.balance, u.sub_plan, u.sub_until,
        COALESCE((SELECT SUM(amount) FROM balance_ledger l WHERE l.user_id = u.id AND l.reason = 'top_up'), 0) AS topped,
        COALESCE((SELECT -SUM(amount) FROM balance_ledger l WHERE l.user_id = u.id AND l.reason IN ('subscription','full_mock','quiz','lesson')), 0)
          + COALESCE((SELECT SUM(amount) FROM payments p WHERE p.user_id = u.id AND p.provider <> 'wallet'), 0) AS spent
      FROM users u WHERE u.role = 'student' ORDER BY u.balance DESC, spent DESC, u.id DESC LIMIT 500`);
    const recent = await db.all(`SELECT x.* FROM (
        SELECT l.id, 'w' AS src, l.user_id, l.amount, l.reason, l.note, l.balance_after, l.created_at FROM balance_ledger l
        UNION ALL SELECT p.id, 'p', p.user_id, p.amount, 'direct', CONCAT(p.plan, ' · ', p.provider, CASE WHEN p.note <> '' THEN ' · ' || p.note ELSE '' END), NULL, p.created_at FROM payments p WHERE p.provider <> 'wallet' AND p.amount > 0
      ) x ORDER BY x.created_at DESC LIMIT 60`);
    const names = new Map(students.map((s) => [s.id, s.name]));
    const expenses = await db.all('SELECT id, title, amount, spent_on FROM expenses ORDER BY spent_on DESC, id DESC LIMIT 100');
    res.json({
      period: p, summary: sum, held: n(held.s), held_students: n(held.c), months,
      students: students.map((s) => ({ ...s, balance: n(s.balance), topped: n(s.topped), spent: n(s.spent) })),
      recent: recent.map((r) => ({ ...r, amount: n(r.amount), name: names.get(r.user_id) || `#${r.user_id}` })),
      expenses: expenses.map((e) => ({ ...e, amount: n(e.amount) })),
    });
  }));

  app.post('/api/finance/expenses', requireMaster, h(async (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const amount = Math.round(Number(String(req.body?.amount || '').replace(/\s/g, '')));
    if (!title) return bad(res, 'What was it for?');
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return bad(res, 'Enter an amount');
    const d = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.spent_on || '') ? req.body.spent_on : null;
    const r = await db.one('INSERT INTO expenses (title, amount, spent_on, created_by) VALUES (?, ?, COALESCE(?::date, CURRENT_DATE), ?) RETURNING id', [title, amount, d, req.user.id]);
    res.json({ id: r.id });
  }));
  app.delete('/api/finance/expenses/:id', requireMaster, h(async (req, res) => {
    await db.run('DELETE FROM expenses WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
  }));
}
