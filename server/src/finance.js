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

export async function migrateFinance() {
  await db.exec(`CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, amount INTEGER NOT NULL, spent_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;`);
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
const SPEND = ['subscription', 'full_mock', 'quiz'];
const n = (x) => Number(x || 0);

async function summary(from, to) {
  const led = await db.all(`SELECT reason, SUM(amount) AS s, COUNT(*) AS c FROM balance_ledger WHERE created_at >= ${from} AND created_at < ${to} GROUP BY reason`);
  const by = Object.fromEntries(led.map((r) => [r.reason, { s: n(r.s), c: n(r.c) }]));
  const direct = await db.one(`SELECT COALESCE(SUM(amount), 0) AS s, COUNT(*) AS c FROM payments WHERE provider <> 'wallet' AND amount > 0 AND created_at >= ${from} AND created_at < ${to}`);
  const exp = await db.one(`SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE spent_on >= (${from})::date AND spent_on < (${to})::date + 1`);
  const spent = Object.fromEntries(SPEND.map((k) => [k, -(by[k]?.s || 0)]));
  const revenue = SPEND.reduce((s, k) => s + spent[k], 0) + n(direct.s);
  const prizes = by.prize?.s || 0;
  return {
    cash_in: (by.top_up?.s || 0) + n(direct.s), top_ups: by.top_up?.s || 0, top_up_count: by.top_up?.c || 0,
    direct: n(direct.s), direct_count: n(direct.c),
    revenue, plans: spent.subscription + n(direct.s), extra_mocks: spent.full_mock, extra_quizzes: spent.quiz,
    prizes, corrections: by.correction?.s || 0, expenses: n(exp.s), profit: revenue - prizes - n(exp.s),
  };
}

export function registerFinance(app, { h, bad, requireMaster }) {
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
        COALESCE((SELECT -SUM(amount) FROM balance_ledger l WHERE l.user_id = u.id AND l.reason IN ('subscription','full_mock','quiz')), 0)
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
