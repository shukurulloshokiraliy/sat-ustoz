/**
 * Mistakes notebook (prompt 10).
 *
 * Every question a student gets wrong — Question Bank practice, "Take a quiz", teacher quizzes, level checks and
 * full mocks — lands in "My mistakes", grouped by skill. The notebook keeps a snapshot of the question, so it can be
 * reviewed even if it came from a timed test.
 *
 * Rules
 *  - A new mistake is due for review 2 days after it was made.
 *  - A correct review counts as a "hit". The question leaves the notebook after 2 hits at least 2 days apart.
 *  - A wrong review resets the hits and brings the question back in 2 days.
 *
 * Sources are scanned lazily (on the notebook page, the review set and the dashboard goal), so no grading code
 * elsewhere had to change. Each scan only looks at answers newer than the previous scan.
 */
import { db } from './db.js';
import { moduleSets } from './fullmock.js';
import { notifyAdmins } from './tgbot.js';

const L = ['A', 'B', 'C', 'D'];
const GAP_DAYS = 2;
const parse = (s, d) => { try { return typeof s === 'string' ? JSON.parse(s || '') : s ?? d; } catch { return d; } };
const TODAY = "(now() AT TIME ZONE 'Asia/Tashkent')::date";

export async function migrateMistakes() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS mistakes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  src TEXT NOT NULL, ref TEXT NOT NULL,
  skill TEXT NOT NULL DEFAULT 'General', origin TEXT NOT NULL DEFAULT '', q TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(), wrong_at TIMESTAMPTZ NOT NULL DEFAULT now(), due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits INTEGER NOT NULL DEFAULT 0, last_hit_at TIMESTAMPTZ, reviews INTEGER NOT NULL DEFAULT 0, cleared_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, src, ref)
);
CREATE INDEX IF NOT EXISTS idx_mistakes_due ON mistakes(user_id, cleared_at, due_at);
CREATE TABLE IF NOT EXISTS mistake_reviews (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  src TEXT NOT NULL, ref TEXT NOT NULL, correct BOOLEAN NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mistake_reviews ON mistake_reviews(user_id, at);
CREATE TABLE IF NOT EXISTS mistake_scans (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS question_reports (
  id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'other', ref TEXT NOT NULL DEFAULT '', about TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_qreports ON question_reports(status, created_at DESC);
ALTER TABLE mistakes ENABLE ROW LEVEL SECURITY; ALTER TABLE mistake_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE mistake_scans ENABLE ROW LEVEL SECURITY; ALTER TABLE question_reports ENABLE ROW LEVEL SECURITY;
`);
}

/** Add (or re-open) one mistake. A question missed again after it was cleared comes back with its hits reset. */
async function add(userId, m) {
  await db.run(`INSERT INTO mistakes (user_id, src, ref, skill, origin, q, added_at, wrong_at, due_at)
      VALUES (?,?,?,?,?,?,?,?, ?::timestamptz + interval '${GAP_DAYS} days')
    ON CONFLICT (user_id, src, ref) DO UPDATE SET wrong_at = EXCLUDED.wrong_at, due_at = EXCLUDED.due_at, hits = 0, cleared_at = NULL,
      q = EXCLUDED.q, skill = EXCLUDED.skill, origin = EXCLUDED.origin
    WHERE EXCLUDED.wrong_at > mistakes.wrong_at + interval '1 minute'`,
  [userId, m.src, String(m.ref), m.skill || 'General', m.origin || '', JSON.stringify(m.q), m.at, m.at, m.at]);
}
/** Only record a mistake that is not known yet (used for questions that were wrong once and later fixed in practice). */
async function addOnce(userId, m) {
  await db.run(`INSERT INTO mistakes (user_id, src, ref, skill, origin, q, added_at, wrong_at, due_at)
      VALUES (?,?,?,?,?,?,?,?, ?::timestamptz + interval '${GAP_DAYS} days') ON CONFLICT (user_id, src, ref) DO NOTHING`,
  [userId, m.src, String(m.ref), m.skill || 'General', m.origin || '', JSON.stringify(m.q), m.at, m.at, m.at]);
}

const qbSnap = (q) => ({ passage: q.passage || '', table: parse(q.data_table, null), prompt: q.prompt, options: parse(q.options, []), answer: q.answer, explanation: q.explanation || '', tip: q.tip || '' });

/** Pull every new wrong answer since the last scan into the notebook. */
export async function scanMistakes(userId) {
  const last = await db.one('SELECT at FROM mistake_scans WHERE user_id = ?', [userId]);
  const since = last?.at || '1970-01-01T00:00:00Z';
  const now = (await db.one('SELECT now() AS t')).t;

  // 1) Question Bank (practice sets and "Take a quiz" write here): wrong now, or wrong at the first try
  const qb = await db.all(`SELECT a.correct, a.first_correct, a.answered_at, q.* FROM qbank_answers a JOIN qbank_questions q ON q.id = a.question_id
    WHERE a.user_id = ? AND a.answered_at > ? AND (NOT a.correct OR NOT a.first_correct)`, [userId, since]);
  for (const r of qb) {
    const m = { src: 'qbank', ref: r.id, skill: r.skill, origin: 'Question Bank', q: qbSnap(r), at: r.answered_at };
    if (!r.correct) await add(userId, m); else await addOnce(userId, m);
  }

  // 2) teacher quizzes and mocks
  const qz = await db.all(`SELECT an.question_id, an.choice, a.finished_at, z.title, q.* FROM answers an
      JOIN attempts a ON a.id = an.attempt_id JOIN quizzes z ON z.id = a.quiz_id JOIN questions q ON q.id = an.question_id
    WHERE a.user_id = ? AND a.finished_at IS NOT NULL AND a.finished_at > ? AND an.is_correct = 0 AND an.choice IS NOT NULL AND an.choice <> ''`, [userId, since]);
  for (const r of qz) {
    const options = [r.opt_a, r.opt_b, r.opt_c, r.opt_d].filter((o) => o != null && o !== '');
    const answer = L.indexOf(String(r.correct || '').trim().toUpperCase());
    if (options.length < 2 || answer < 0) continue; // written-answer questions are not reviewable as multiple choice
    await add(userId, { src: 'quiz', ref: r.question_id, skill: r.topic || 'General', origin: r.title,
      q: { passage: r.passage, prompt: r.prompt, options, answer, explanation: r.explanation || '' }, at: r.finished_at });
  }

  // 3) level checks and session checks (questions live in the roadmap item's content)
  const lc = await db.all(`SELECT c.item_id, c.version, c.answers, c.finished_at, i.title, i.content FROM lesson_checks c JOIN roadmap_items i ON i.id = c.item_id
    WHERE c.user_id = ? AND c.finished_at IS NOT NULL AND c.finished_at > ?`, [userId, since]);
  for (const c of lc) {
    const content = parse(c.content, {});
    const ans = parse(c.answers, {});
    for (const q of content.checks?.[c.version] || []) {
      if (!Array.isArray(q.options) || ans[q.id] == null || ans[q.id] === q.answer) continue;
      await add(userId, { src: 'lesson', ref: `${c.item_id}:${q.id}`, skill: q.skill || q.topic || c.title, origin: `Level check · ${c.title}`,
        q: { passage: q.passage || '', prompt: q.prompt, options: q.options, answer: q.answer, explanation: q.explanation || '' }, at: c.finished_at });
    }
  }

  // 4) full mocks (both modules)
  const fm = await db.all(`SELECT a.*, m.title, m.mode, m.keys FROM full_mock_attempts a JOIN full_mocks m ON m.id = a.mock_id
    WHERE a.user_id = ? AND a.stage = 'done' AND a.finished_at > ? AND m.mode <> 'pdf'`, [userId, since]).catch(() => []);
  for (const a of fm) {
    const sets = await moduleSets({ id: a.mock_id, mode: a.mode, keys: a.keys }, a).catch(() => ({}));
    const ans = parse(a.answers, {});
    for (const m of ['1', a.m2]) {
      for (const q of sets[m] || []) {
        const given = ans[q.id];
        if (given == null || L[given] === q.correct || !q.prompt) continue;
        const options = [q.opt_a, q.opt_b, q.opt_c, q.opt_d];
        const snap = { passage: q.passage || '', table: q.table || null, prompt: q.prompt, options, answer: L.indexOf(q.correct), explanation: q.explanation || '' };
        // generated mocks use Question Bank questions: one notebook entry per question
        await add(userId, { src: a.mode === 'qbank' ? 'qbank' : 'fullmock', ref: q.id, skill: q.skill || q.topic || 'General', origin: `Full mock · ${a.title}`, q: snap, at: a.finished_at });
      }
    }
  }

  await db.run('INSERT INTO mistake_scans (user_id, at) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET at = EXCLUDED.at', [userId, now]);
}

const pub = (r, withKey = false) => {
  const q = parse(r.q, {});
  return {
    key: `${r.src}|${r.ref}`, src: r.src, ref: r.ref, skill: r.skill, origin: r.origin, added_at: r.added_at, due_at: r.due_at, hits: r.hits,
    due: new Date(r.due_at) <= new Date(), passage: q.passage || '', table: q.table || null, prompt: q.prompt, options: q.options || [],
    ...(withKey ? { answer: q.answer, explanation: q.explanation || '', tip: q.tip || '' } : {}),
  };
};

/** Today's goal: 5 mistakes + 10 due words (fewer when less is due). Counted in the streak through mistake_reviews / vocab_progress. */
export async function dailyGoal(userId) {
  const m = await db.one(`SELECT
      (SELECT COUNT(*) FROM mistakes WHERE user_id = ? AND cleared_at IS NULL AND due_at <= now()) AS due,
      (SELECT COUNT(*) FROM mistake_reviews WHERE user_id = ? AND (at AT TIME ZONE 'Asia/Tashkent')::date = ${TODAY}) AS done`, [userId, userId]);
  const w = await db.one(`SELECT
      (SELECT COUNT(*) FROM vocab_progress WHERE user_id = ? AND due_at <= now()) AS due,
      (SELECT COUNT(*) FROM vocab_progress WHERE user_id = ? AND reps > 0 AND (last_at AT TIME ZONE 'Asia/Tashkent')::date = ${TODAY}) AS done`, [userId, userId]);
  const md = Number(m.done), wd = Number(w.done);
  const mistakes = { done: md, target: Math.min(5, md + Number(m.due)), due: Number(m.due) };
  const words = { done: wd, target: Math.min(10, wd + Number(w.due)), due: Number(w.due) };
  const met = (x) => x.done >= x.target;
  return { mistakes, words, complete: met(mistakes) && met(words), empty: mistakes.target === 0 && words.target === 0 };
}

export function registerMistakes(app, { h, bad, requireStudent, requireMaster }) {
  // the notebook: open mistakes grouped by skill
  app.get('/api/mistakes', requireStudent, h(async (req, res) => {
    await scanMistakes(req.user.id);
    const rows = await db.all('SELECT * FROM mistakes WHERE user_id = ? AND cleared_at IS NULL ORDER BY added_at', [req.user.id]);
    const cleared = await db.one('SELECT COUNT(*) AS n FROM mistakes WHERE user_id = ? AND cleared_at IS NOT NULL', [req.user.id]);
    const next = await db.one('SELECT MIN(due_at) AS t FROM mistakes WHERE user_id = ? AND cleared_at IS NULL AND due_at > now()', [req.user.id]);
    const skills = {};
    for (const r of rows) (skills[r.skill] ||= []).push(pub(r));
    res.json({
      total: rows.length, due: rows.filter((r) => new Date(r.due_at) <= new Date()).length, cleared: Number(cleared.n), next_due: next?.t || null,
      skills: Object.entries(skills).map(([skill, items]) => ({ skill, n: items.length, due: items.filter((i) => i.due).length, items })).sort((a, b) => b.n - a.n),
      goal: await dailyGoal(req.user.id),
    });
  }));

  // a review set: 10 questions, due ones oldest first; ?early=1 tops it up with ones not due yet; ?skill= narrows it
  app.get('/api/mistakes/review', requireStudent, h(async (req, res) => {
    await scanMistakes(req.user.id);
    const skill = req.query.skill ? String(req.query.skill) : null;
    const where = `user_id = ? AND cleared_at IS NULL${skill ? ' AND skill = ?' : ''}`;
    const p = skill ? [req.user.id, skill] : [req.user.id];
    let rows = await db.all(`SELECT * FROM mistakes WHERE ${where} AND due_at <= now() ORDER BY added_at LIMIT 10`, p);
    if (rows.length < 10 && req.query.early) rows = rows.concat(await db.all(`SELECT * FROM mistakes WHERE ${where} AND due_at > now() ORDER BY added_at LIMIT ?`, [...p, 10 - rows.length]));
    res.json({ questions: rows.map((r) => pub(r)) });
  }));

  // check one review answer
  app.post('/api/mistakes/check', requireStudent, h(async (req, res) => {
    const { src, ref } = req.body || {};
    const r = await db.one('SELECT * FROM mistakes WHERE user_id = ? AND src = ? AND ref = ?', [req.user.id, String(src), String(ref)]);
    if (!r) return bad(res, 'This question is not in your notebook', 404);
    const choice = Number(req.body?.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 4) return bad(res, 'Choose an answer first');
    const q = parse(r.q, {});
    const correct = choice === q.answer;
    let status = 'again';
    if (correct) {
      const spaced = r.hits >= 1 && r.last_hit_at && Date.now() - new Date(r.last_hit_at).getTime() >= GAP_DAYS * 86400e3 - 3600e3;
      if (spaced) {
        await db.run('UPDATE mistakes SET hits = hits + 1, last_hit_at = now(), reviews = reviews + 1, cleared_at = now() WHERE user_id = ? AND src = ? AND ref = ?', [req.user.id, r.src, r.ref]);
        status = 'cleared';
      } else if (r.hits >= 1) {
        // right again, but too soon: it still needs a correct answer 2 days after the first one
        await db.run('UPDATE mistakes SET reviews = reviews + 1, due_at = GREATEST(due_at, last_hit_at + interval \'2 days\') WHERE user_id = ? AND src = ? AND ref = ?', [req.user.id, r.src, r.ref]);
        status = 'wait';
      } else {
        await db.run(`UPDATE mistakes SET hits = 1, last_hit_at = now(), reviews = reviews + 1, due_at = now() + interval '${GAP_DAYS} days' WHERE user_id = ? AND src = ? AND ref = ?`, [req.user.id, r.src, r.ref]);
        status = 'once';
      }
    } else {
      await db.run(`UPDATE mistakes SET hits = 0, last_hit_at = NULL, reviews = reviews + 1, due_at = now() + interval '${GAP_DAYS} days' WHERE user_id = ? AND src = ? AND ref = ?`, [req.user.id, r.src, r.ref]);
    }
    await db.run('INSERT INTO mistake_reviews (user_id, src, ref, correct) VALUES (?,?,?,?)', [req.user.id, r.src, r.ref, correct]);
    res.json({ choice, answer: q.answer, correct, status, explanation: q.explanation || '', tip: q.tip || '' });
  }));

  // the student removes a question they are sure about
  app.delete('/api/mistakes', requireStudent, h(async (req, res) => {
    await db.run('UPDATE mistakes SET cleared_at = now() WHERE user_id = ? AND src = ? AND ref = ?', [req.user.id, String(req.query.src), String(req.query.ref)]);
    res.json({ ok: true });
  }));

  app.get('/api/goal', requireStudent, h(async (req, res) => {
    await scanMistakes(req.user.id);
    res.json(await dailyGoal(req.user.id));
  }));

  // ---------- "Report a problem" on any question ----------
  const KINDS = { key: 'Wrong answer key', typo: 'Typo', unclear: 'Unclear question', other: 'Other' };
  app.post('/api/question-reports', requireStudent, h(async (req, res) => {
    const kind = KINDS[req.body?.kind] ? req.body.kind : 'other';
    const ref = String(req.body?.ref || '').slice(0, 120);
    const about = String(req.body?.about || '').slice(0, 300);
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    if (!ref && !about) return bad(res, 'Which question is this about?');
    const recent = await db.one("SELECT COUNT(*) AS n FROM question_reports WHERE user_id = ? AND created_at > now() - interval '1 hour'", [req.user.id]);
    if (Number(recent.n) >= 20) return bad(res, 'Too many reports in an hour. Try again later.', 429);
    const r = await db.one('INSERT INTO question_reports (user_id, kind, ref, about, note) VALUES (?,?,?,?,?) RETURNING id', [req.user.id, kind, ref, about, note]);
    notifyAdmins(`⚠️ Question report #${r.id} — ${KINDS[kind]}\n${req.user.name}: ${about || ref}${note ? `\n“${note}”` : ''}`);
    res.json({ id: r.id });
  }));
  app.get('/api/question-reports', requireMaster, h(async (req, res) => {
    const status = req.query.status === 'resolved' ? 'resolved' : req.query.status === 'all' ? null : 'open';
    const rows = await db.all(`SELECT r.*, u.name AS student FROM question_reports r LEFT JOIN users u ON u.id = r.user_id
      ${status ? 'WHERE r.status = ?' : ''} ORDER BY r.created_at DESC LIMIT 300`, status ? [status] : []);
    const counts = await db.one("SELECT SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open, COUNT(*) AS total FROM question_reports");
    // where the teacher can fix each reported question: Question Bank questions (also in random full mocks) open
    // right on this page; quiz, level check and uploaded-mock questions link to their editor
    const parts = rows.map((r) => String(r.ref || '').split(':'));
    const bankIds = [...new Set(parts.filter(([s]) => s === 'qbank' || s === 'fullmock').map((p) => p.slice(1).join(':')))];
    const inBank = new Set(bankIds.length ? (await db.all('SELECT id FROM qbank_questions WHERE id = ANY(?::text[])', [bankIds])).map((x) => x.id) : []);
    const quizIds = [...new Set(parts.filter(([s]) => s === 'quiz').map((p) => Number(p[1])).filter(Number.isInteger))];
    const quizOf = new Map(quizIds.length ? (await db.all('SELECT id, quiz_id FROM questions WHERE id = ANY(?::int[])', [quizIds])).map((x) => [x.id, x.quiz_id]) : []);
    const fixOf = ([src, ...rest]) => {
      const id = rest.join(':');
      if ((src === 'qbank' || src === 'fullmock') && inBank.has(id)) return { type: 'qbank', id };
      if (src === 'fullmock') return { type: 'link', to: '/full-mocks', label: 'Open Full Mocks' };
      if (src === 'quiz' && quizOf.has(Number(rest[0]))) return { type: 'link', to: `/quizzes/${quizOf.get(Number(rest[0]))}/edit`, label: 'Open the quiz' };
      if (src === 'lesson' && rest[0]) return { type: 'link', to: `/lesson/${Number(rest[0])}`, label: 'Open the lesson' };
      return null;
    };
    res.json({ reports: rows.map((r, i) => ({ ...r, kind_label: KINDS[r.kind] || 'Other', fix: fixOf(parts[i]) })), open: Number(counts.open || 0), total: Number(counts.total || 0) });
  }));
  app.put('/api/question-reports/:id', requireMaster, h(async (req, res) => {
    const st = req.body?.status === 'open' ? 'open' : 'resolved';
    await db.run(`UPDATE question_reports SET status = ?, resolved_at = ${st === 'resolved' ? 'now()' : 'NULL'} WHERE id = ?`, [st, Number(req.params.id)]);
    res.json({ ok: true });
  }));
}
