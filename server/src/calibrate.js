/**
 * Question difficulty that learns from students (Rasch model with a guessing floor).
 *
 *   P(correct | θ, b) = c + (1 − c) / (1 + e^(−(θ − b)))      c = 0.25 (four choices)
 *
 * θ = a student's ability, b = a question's difficulty, both on one scale (0 ≈ an average SAT question).
 * Every question starts from the teacher's label (easy −1.1, medium 0, hard +1.2) as a prior; each answer moves
 * it, so after ~30 first-try answers the data decides. Students and questions are estimated together
 * (joint maximum a posteriori), so a question that only strong students answer is not mistaken for an easy one.
 *
 * Data: every student's FIRST try on a Question Bank question — practice, Take a quiz and full mocks.
 * Runs after full mocks (at most every 10 minutes), from the daily cron and from the teacher's button.
 * Results live in qbank_calib; full mocks pick, route and score with them.
 */
import { db } from './db.js';

export const GUESS = 0.25;
export const PRIOR_B = { easy: -1.1, medium: 0, hard: 1.2 };
const PRIOR_SD = 0.9; // how strongly the teacher's label holds the question in place
export const levelOf = (b) => (b < -0.5 ? 'easy' : b > 0.6 ? 'hard' : 'medium');
const sig = (x) => 1 / (1 + Math.exp(-x));
export const pCorrect = (theta, b) => GUESS + (1 - GUESS) * sig(theta - b);

export async function migrateCalib() {
  await db.exec(`
ALTER TABLE qbank_answers ADD COLUMN IF NOT EXISTS first_choice INTEGER;
ALTER TABLE qbank_questions ADD COLUMN IF NOT EXISTS diff_locked BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS qbank_calib (
  question_id TEXT PRIMARY KEY REFERENCES qbank_questions(id) ON DELETE CASCADE,
  n INTEGER NOT NULL DEFAULT 0, right_n INTEGER NOT NULL DEFAULT 0, b REAL NOT NULL DEFAULT 0, se REAL NOT NULL DEFAULT 1,
  level TEXT NOT NULL DEFAULT 'medium', upper_p REAL, lower_p REAL, choices TEXT NOT NULL DEFAULT '[0,0,0,0]',
  flags TEXT NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE qbank_calib ENABLE ROW LEVEL SECURITY;
INSERT INTO settings (key, value) VALUES ('_calib_at', '0') ON CONFLICT (key) DO NOTHING;`);
}

/** Save first tries (the first answer to a question is what calibration uses; later tries only update `choice`). */
export async function recordAnswers(t, userId, list) {
  for (const { id, choice, correct } of list) {
    await t.run(`INSERT INTO qbank_answers (user_id, question_id, choice, correct, first_correct, first_choice, tries, answered_at) VALUES (?,?,?,?,?,?,1,now())
      ON CONFLICT (user_id, question_id) DO UPDATE SET choice = EXCLUDED.choice, correct = EXCLUDED.correct, tries = qbank_answers.tries + 1, answered_at = now()`,
    [userId, id, choice, correct, correct, choice]);
  }
}

/** Run the whole calibration. Returns a short summary. */
export async function calibrate() {
  const qs = await db.all('SELECT id, difficulty, answer FROM qbank_questions');
  const rows = await db.all(`SELECT a.user_id, a.question_id, COALESCE(a.first_choice, a.choice) AS ch, a.first_correct, a.first_choice IS NOT NULL AS has_first
    FROM qbank_answers a JOIN users u ON u.id = a.user_id AND u.role = 'student'`);
  const Q = new Map(qs.map((q, i) => [q.id, { i, id: q.id, key: q.answer, b: PRIOR_B[q.difficulty] ?? 0, prior: PRIOR_B[q.difficulty] ?? 0, label: q.difficulty, n: 0, right: 0, choices: [0, 0, 0, 0], resp: [] }]));
  const P = new Map();
  for (const r of rows) {
    const q = Q.get(r.question_id); if (!q) continue;
    // a fixed answer key re-grades old answers: use the chosen letter when we have it
    const ok = r.has_first && r.ch != null ? r.ch === q.key : !!r.first_correct;
    let p = P.get(r.user_id); if (!p) { p = { theta: 0, resp: [], choice: new Map() }; P.set(r.user_id, p); }
    if (r.ch != null) p.choice.set(q.id, r.ch);
    p.resp.push([q, ok ? 1 : 0]); q.resp.push([p, ok ? 1 : 0]);
    q.n++; if (ok) q.right++;
    if (r.ch != null && r.ch >= 0 && r.ch < 4) q.choices[r.ch]++;
  }
  // only students with a few answers say something about a question
  const people = [...P.values()].filter((p) => p.resp.length >= 5);
  const keep = new Set(people);
  for (const q of Q.values()) q.resp = q.resp.filter(([p]) => keep.has(p));

  const step = (x, g, info, lo, hi) => Math.max(lo, Math.min(hi, x + Math.max(-1, Math.min(1, g / info))));
  for (let it = 0; it < 25; it++) {
    for (const p of people) { // ability, prior N(0, 1)
      let g = -p.theta; let info = 1;
      for (const [q, y] of p.resp) {
        const s = sig(p.theta - q.b); const P1 = GUESS + (1 - GUESS) * s; const d = (1 - GUESS) * s * (1 - s);
        g += ((y - P1) * d) / (P1 * (1 - P1)); info += (d * d) / (P1 * (1 - P1));
      }
      p.theta = step(p.theta, g, info, -4, 4);
    }
    for (const q of Q.values()) { // difficulty, prior N(label, 0.6²)
      let g = -(q.b - q.prior) / PRIOR_SD ** 2; let info = 1 / PRIOR_SD ** 2;
      for (const [p, y] of q.resp) {
        const s = sig(p.theta - q.b); const P1 = GUESS + (1 - GUESS) * s; const d = (1 - GUESS) * s * (1 - s);
        g -= ((y - P1) * d) / (P1 * (1 - P1)); info += (d * d) / (P1 * (1 - P1));
      }
      q.b = step(q.b, g, info, -3.5, 3.5); q.se = 1 / Math.sqrt(info);
    }
  }

  // quality signals: strong vs weak students on each question, and where answers go
  const sorted = [...people].sort((a, b) => a.theta - b.theta);
  const cut = Math.max(1, Math.floor(sorted.length * 0.27));
  const low = new Set(sorted.slice(0, cut)); const high = new Set(sorted.slice(-cut));
  let flagged = 0;
  const out = [];
  for (const q of Q.values()) {
    const hi = q.resp.filter(([p]) => high.has(p)); const lo = q.resp.filter(([p]) => low.has(p));
    const up = hi.length ? hi.reduce((s, [, y]) => s + y, 0) / hi.length : null;
    const dn = lo.length ? lo.reduce((s, [, y]) => s + y, 0) / lo.length : null;
    const flags = [];
    const level = levelOf(q.b);
    if (q.n >= 15) {
      const pct = q.right / q.n;
      if (up != null && dn != null && hi.length >= 8 && lo.length >= 8) {
        if (up < dn - 0.1) flags.push('strong_miss'); // strong students miss it more than weak ones → check the key
        else if (up - dn < 0.05 && q.right / q.n > 0.25 && q.right / q.n < 0.9) flags.push('weak');
      }
      const top = q.choices.indexOf(Math.max(...q.choices));
      // a wrong option is picked clearly more than the key, also by the strongest students
      const hiPick = (c) => hi.filter(([p]) => p.choice?.get(q.id) === c).length;
      if (top !== q.key && q.choices[top] >= q.choices[q.key] * 1.5 && q.choices[top] >= 6 && hiPick(top) >= hiPick(q.key)) flags.push('distractor');
      if (pct < 0.2) flags.push('very_hard');
      if (pct > 0.95) flags.push('very_easy');
      if (q.n >= 30 && level !== q.label) flags.push('label');
    }
    if (flags.some((f) => f !== 'label' && f !== 'very_easy')) flagged++;
    out.push([q.id, q.n, q.right, Math.round(q.b * 1000) / 1000, Math.round(q.se * 1000) / 1000, level, up, dn, JSON.stringify(q.choices), JSON.stringify(flags)]);
  }
  // many rows per statement: a few round trips even for thousands of questions
  await db.tx(async (t) => {
    for (let i = 0; i < out.length; i += 200) {
      const part = out.slice(i, i + 200);
      await t.run(`INSERT INTO qbank_calib (question_id, n, right_n, b, se, level, upper_p, lower_p, choices, flags) VALUES ${part.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',')}
        ON CONFLICT (question_id) DO UPDATE SET n = EXCLUDED.n, right_n = EXCLUDED.right_n, b = EXCLUDED.b, se = EXCLUDED.se, level = EXCLUDED.level,
          upper_p = EXCLUDED.upper_p, lower_p = EXCLUDED.lower_p, choices = EXCLUDED.choices, flags = EXCLUDED.flags, updated_at = now()`, part.flat());
    }
    await t.run("UPDATE settings SET value = ? WHERE key = '_calib_at'", [String(Date.now())]);
  });
  return { questions: Q.size, students: people.length, answers: rows.length, flagged };
}

/** Recalibrate if the last run is older than `minutes` (claims the slot so two servers don't run it at once). */
export async function calibrateIfStale(minutes = 10) {
  const claimed = await db.one("UPDATE settings SET value = ? WHERE key = '_calib_at' AND value::bigint < ?::bigint RETURNING key", [String(Date.now()), String(Date.now() - minutes * 60e3)]);
  if (claimed) return calibrate();
  return null;
}

/** Calibrated difficulty for these questions: id → { b, level, n, pct } (teacher label when no data yet). */
export async function difficultyOf(ids) {
  if (!ids.length) return new Map();
  const rows = await db.all(`SELECT q.id, q.difficulty, c.b, c.n, c.right_n, c.level FROM qbank_questions q LEFT JOIN qbank_calib c ON c.question_id = q.id
    WHERE q.id = ANY(?::text[])`, [ids]);
  return new Map(rows.map((r) => [r.id, {
    b: r.b != null ? Number(r.b) : PRIOR_B[r.difficulty] ?? 0,
    level: r.level || r.difficulty, n: Number(r.n || 0), pct: r.n ? Math.round((100 * r.right_n) / r.n) : null,
  }]));
}

/** EAP ability from answers to questions with known b (prior N(0,1)). */
export function thetaOf(items) {
  let sw = 0; let st = 0; let st2 = 0;
  for (let t = -4; t <= 4.0001; t += 0.05) {
    let ll = -0.5 * t * t;
    for (const it of items) { const p = pCorrect(t, it.b); ll += Math.log(it.correct ? p : 1 - p); }
    const w = Math.exp(ll); sw += w; st += w * t; st2 += w * t * t;
  }
  const theta = st / sw;
  return { theta, se: Math.sqrt(Math.max(0, st2 / sw - theta * theta)) };
}
