/**
 * Vocabulary unit → Reading + Words in Context.
 *
 * Flow for a student: learn the unit's words with flashcards → after one finished flashcard session the unit's
 * reading text (400–500 words, using the unit words) and its 15 Words in Context questions open.
 * Each question is a short SAT-style passage with a blank or a target word, four choices, one answer.
 * The teacher pastes the text and the questions into a form (numbered questions, A)–D) choices, "Answer: B",
 * optional "Explanation: …"). Results are saved (and shown to the teacher); the next unit stays open.
 * Answers never reach the student before they submit.
 */
import { db } from './db.js';
import { meterMap, assertLeft } from './tiers.js';
import { parseText, DEFAULT_PROMPT } from './parse.js';

export const WIC_PROMPT = 'Which choice completes the text with the most logical and precise word or phrase?';

export async function migrateVocabReading() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS vocab_unit_texts (
  unit_id INTEGER PRIMARY KEY REFERENCES vocab_units(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', questions_raw TEXT NOT NULL DEFAULT '', questions TEXT NOT NULL DEFAULT '[]',
  updated_by TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS vocab_unit_done (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, unit_id INTEGER NOT NULL REFERENCES vocab_units(id) ON DELETE CASCADE,
  flash_at TIMESTAMPTZ, read_at TIMESTAMPTZ, PRIMARY KEY (user_id, unit_id));
CREATE TABLE IF NOT EXISTS vocab_wic_attempts (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, unit_id INTEGER NOT NULL REFERENCES vocab_units(id) ON DELETE CASCADE,
  score INTEGER NOT NULL, total INTEGER NOT NULL, answers TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_wic_unit ON vocab_wic_attempts(unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wic_user ON vocab_wic_attempts(user_id, unit_id);
ALTER TABLE vocab_unit_texts ENABLE ROW LEVEL SECURITY; ALTER TABLE vocab_unit_done ENABLE ROW LEVEL SECURITY; ALTER TABLE vocab_wic_attempts ENABLE ROW LEVEL SECURITY;`);
}

const words = (t) => (String(t || '').match(/[A-Za-z’'-]+/g) || []).length;
const parseJson = (x, d) => { try { return JSON.parse(x); } catch { return d; } };

/** Pasted questions → [{ passage, prompt, options[4], answer 0–3, explanation }] plus readable problems. */
export function parseWic(raw) {
  const list = parseText(String(raw || ''));
  const problems = [];
  const qs = list.map((q, i) => {
    const options = [q.opt_a, q.opt_b, q.opt_c, q.opt_d].map((o) => String(o || '').trim());
    const answer = q.correct ? 'ABCD'.indexOf(q.correct) : -1;
    if (options.some((o) => !o)) problems.push(`Question ${i + 1}: it needs four choices, A) to D)`);
    if (answer < 0) problems.push(`Question ${i + 1}: add the answer line, for example "Answer: B"`);
    if (!q.passage.trim()) problems.push(`Question ${i + 1}: the short text (passage) is missing`);
    return { passage: q.passage.trim(), prompt: q.prompt === DEFAULT_PROMPT ? WIC_PROMPT : q.prompt, options, answer, explanation: (q.explanation || '').trim() };
  });
  return { questions: qs, problems };
}

export function registerVocabReading(app, { h, bad, requireMaster, requireStudent, setOpen }) {
  async function unitRow(id) {
    return db.one('SELECT u.id, u.title, s.deck_id, s.n AS set_n FROM vocab_units u JOIN vocab_sets s ON s.id = u.set_id WHERE u.id = ? AND NOT u.hidden AND NOT s.hidden', [Number(id)]);
  }
  /** The student finished a flashcard session (or has nothing new left) for this unit. */
  async function flashDone(userId, unitId) {
    const d = await db.one('SELECT flash_at FROM vocab_unit_done WHERE user_id = ? AND unit_id = ?', [userId, unitId]);
    return !!d?.flash_at;
  }

  // what the unit page needs: the text (when open), question count, last / best result
  app.get('/api/vocab/units/:id/reading', h(async (req, res) => {
    const u = await unitRow(req.params.id);
    if (!u) return bad(res, 'Unit not found', 404);
    if (!(await setOpen(req.user, { deck_id: u.deck_id, n: u.set_n }))) return bad(res, 'This set needs an active subscription', 402, { code: 'subscription_required' });
    const t = await db.one('SELECT * FROM vocab_unit_texts WHERE unit_id = ?', [u.id]);
    const qs = parseJson(t?.questions, []);
    const teacher = req.user.role === 'master';
    const done = teacher || (await flashDone(req.user.id, u.id));
    const tries = teacher ? [] : await db.all('SELECT score, total, created_at FROM vocab_wic_attempts WHERE user_id = ? AND unit_id = ? ORDER BY id DESC LIMIT 20', [req.user.id, u.id]);
    const out = {
      has_text: !!t?.body?.trim(), title: t?.title || '', word_count: words(t?.body), unlocked: done,
      body: done ? t?.body || '' : '',
      wic: { count: qs.length, last: tries[0] || null, best: tries.length ? Math.max(...tries.map((x) => Math.round((x.score / x.total) * 100))) : null, tries: tries.length },
    };
    if (teacher) {
      const r = await db.one('SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS students, ROUND(AVG(score * 100.0 / GREATEST(total, 1))) AS avg FROM vocab_wic_attempts WHERE unit_id = ?', [u.id]);
      Object.assign(out, { questions_raw: t?.questions_raw || '', updated_by: t?.updated_by || '', updated_at: t?.updated_at || null, results: { tries: Number(r?.n || 0), students: Number(r?.students || 0), avg: r?.avg == null ? null : Number(r.avg) } });
    }
    res.json(out);
  }));

  // teacher: paste the reading text and the 15 questions
  app.post('/api/vocab/units/:id/reading/check', requireMaster, h(async (req, res) => {
    res.json(parseWic(req.body?.questions_raw));
  }));
  app.put('/api/vocab/units/:id/reading', requireMaster, h(async (req, res) => {
    const u = await unitRow(req.params.id);
    if (!u) return bad(res, 'Unit not found', 404);
    const body = String(req.body?.body || '').replace(/\r\n/g, '\n').trim().slice(0, 20000);
    const raw = String(req.body?.questions_raw || '').replace(/\r\n/g, '\n').trim().slice(0, 60000);
    const { questions, problems } = raw ? parseWic(raw) : { questions: [], problems: [] };
    if (raw && !questions.length) return bad(res, 'No questions found. Number each question (1. 2. 3. …), give choices A) to D) and an "Answer: B" line.');
    if (problems.length) return bad(res, problems.slice(0, 5).join(' · '), 400, { problems });
    await db.run(`INSERT INTO vocab_unit_texts (unit_id, title, body, questions_raw, questions, updated_by, updated_at) VALUES (?,?,?,?,?,?, now())
      ON CONFLICT (unit_id) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, questions_raw = EXCLUDED.questions_raw, questions = EXCLUDED.questions, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [u.id, String(req.body?.title || '').trim().slice(0, 160), body, raw, JSON.stringify(questions), req.user.name || 'Teacher']);
    res.json({ ok: true, words: words(body), questions: questions.length });
  }));
  // teacher: who took the questions and how they did
  app.get('/api/vocab/units/:id/wic/results', requireMaster, h(async (req, res) => {
    res.json(await db.all(`SELECT a.id, a.score, a.total, a.created_at, u.id AS user_id, u.name FROM vocab_wic_attempts a JOIN users u ON u.id = a.user_id
      WHERE a.unit_id = ? ORDER BY a.created_at DESC LIMIT 300`, [Number(req.params.id)]));
  }));

  // student: one flashcard session finished → the reading and the questions open
  app.post('/api/vocab/units/:id/flash-done', requireStudent, h(async (req, res) => {
    const u = await unitRow(req.params.id);
    if (!u) return bad(res, 'Unit not found', 404);
    await db.run(`INSERT INTO vocab_unit_done (user_id, unit_id, flash_at) VALUES (?, ?, now())
      ON CONFLICT (user_id, unit_id) DO UPDATE SET flash_at = COALESCE(vocab_unit_done.flash_at, now())`, [req.user.id, u.id]);
    res.json({ ok: true });
  }));
  app.post('/api/vocab/units/:id/read', requireStudent, h(async (req, res) => {
    await db.run(`INSERT INTO vocab_unit_done (user_id, unit_id, read_at) VALUES (?, ?, now())
      ON CONFLICT (user_id, unit_id) DO UPDATE SET read_at = COALESCE(vocab_unit_done.read_at, now())`, [req.user.id, Number(req.params.id)]);
    res.json({ ok: true });
  }));

  // the questions without answers
  app.get('/api/vocab/units/:id/wic', h(async (req, res) => {
    const u = await unitRow(req.params.id);
    if (!u) return bad(res, 'Unit not found', 404);
    if (!(await setOpen(req.user, { deck_id: u.deck_id, n: u.set_n }))) return bad(res, 'This set needs an active subscription', 402, { code: 'subscription_required' });
    if (req.user.role !== 'master' && !(await flashDone(req.user.id, u.id))) return bad(res, 'Finish the flashcards of this unit first', 403);
    if (req.user.role === 'student') await assertLeft(req.user);
    const t = await db.one('SELECT questions FROM vocab_unit_texts WHERE unit_id = ?', [u.id]);
    const qs = parseJson(t?.questions, []);
    res.json({ questions: qs.map((q, i) => ({ n: i, passage: q.passage, prompt: q.prompt, options: q.options, ...(req.user.role === 'master' ? { answer: q.answer, explanation: q.explanation } : {}) })) });
  }));
  // submit: score on the server, save, return the review
  app.post('/api/vocab/units/:id/wic', requireStudent, h(async (req, res) => {
    const u = await unitRow(req.params.id);
    if (!u) return bad(res, 'Unit not found', 404);
    if (!(await setOpen(req.user, { deck_id: u.deck_id, n: u.set_n }))) return bad(res, 'This set needs an active subscription', 402, { code: 'subscription_required' });
    if (!(await flashDone(req.user.id, u.id))) return bad(res, 'Finish the flashcards of this unit first', 403);
    const t = await db.one('SELECT questions FROM vocab_unit_texts WHERE unit_id = ?', [u.id]);
    const qs = parseJson(t?.questions, []);
    if (!qs.length) return bad(res, 'This unit has no questions yet', 404);
    let given = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    // free daily limit: the run id groups this try's answers (the page counts each pick as it is made)
    const run = /^[a-z0-9]{4,24}$/.test(String(req.body?.run || '')) ? req.body.run : `s${Date.now().toString(36)}`;
    given = await meterMap(req.user, `wic:${u.id}:${run}:`, given, { strict: false });
    const pick = qs.map((_, i) => (Number.isInteger(given[i]) && given[i] >= 0 && given[i] < 4 ? given[i] : null));
    const score = qs.reduce((s, q, i) => s + (pick[i] === q.answer ? 1 : 0), 0);
    await db.tx(async (tx) => {
      await tx.run('INSERT INTO vocab_wic_attempts (user_id, unit_id, score, total, answers) VALUES (?,?,?,?,?)', [req.user.id, u.id, score, qs.length, JSON.stringify(pick)]);
      // also counts as this unit's test result (shown on the vocabulary page)
      await tx.run('INSERT INTO vocab_tests (user_id, unit_id, score, total) VALUES (?,?,?,?)', [req.user.id, u.id, score, qs.length]);
    });
    res.json({ score, total: qs.length, review: qs.map((q, i) => ({ n: i, picked: pick[i], answer: q.answer, explanation: q.explanation })) });
  }));
}
