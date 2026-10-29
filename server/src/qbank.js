/**
 * Question Bank: original SAT Reading & Writing questions grouped by the official
 * domains and skills (content/qbank/*.json, synced on start; the teacher can import more).
 * Students practise one question at a time; answers are revealed only after a check.
 * Without a subscription only "easy" questions are open.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'content', 'qbank');

export const DOMAINS = [
  { domain: 'Information and Ideas', skills: [['central-ideas', 'Central Ideas and Details'], ['inferences', 'Inferences'], ['command-of-evidence', 'Command of Evidence']] },
  { domain: 'Craft and Structure', skills: [['words-in-context', 'Words in Context'], ['text-structure', 'Text Structure and Purpose'], ['cross-text', 'Cross-Text Connections']] },
  { domain: 'Expression of Ideas', skills: [['rhetorical-synthesis', 'Rhetorical Synthesis'], ['transitions', 'Transitions']] },
  { domain: 'Standard English Conventions', skills: [['boundaries', 'Boundaries'], ['form-structure-sense', 'Form, Structure, and Sense']] },
];
const SKILL = new Map(DOMAINS.flatMap((d) => d.skills.map(([id, name]) => [id, { id, name, domain: d.domain }])));
const LEVELS = ['easy', 'medium', 'hard'];
const FREE_LEVEL = 'easy';

export function validateBank(file) {
  const errs = [];
  if (!file || typeof file !== 'object') return ['Not a JSON object'];
  if (!SKILL.has(file.skill_id)) errs.push(`“skill_id” must be one of: ${[...SKILL.keys()].join(', ')}`);
  if (!Array.isArray(file.questions) || !file.questions.length) errs.push('“questions” must be a non-empty list');
  (file.questions || []).forEach((q, i) => {
    const at = `question ${q?.id || i + 1}`;
    if (!q?.id) errs.push(`${at}: “id” is required`);
    if (!q?.prompt) errs.push(`${at}: “prompt” is required`);
    if (!LEVELS.includes(q?.difficulty)) errs.push(`${at}: “difficulty” must be easy, medium or hard`);
    if (!Array.isArray(q?.options) || q.options.length !== 4) errs.push(`${at}: exactly 4 “options” are required`);
    if (!Number.isInteger(q?.answer) || q.answer < 0 || q.answer > 3) errs.push(`${at}: “answer” must be 0–3`);
  });
  return errs.slice(0, 12);
}

async function upsertBank(file, src) {
  const sk = SKILL.get(file.skill_id);
  return db.tx(async (t) => {
    const ids = [];
    for (const [i, q] of file.questions.entries()) {
      const id = String(q.id).slice(0, 60);
      ids.push(id);
      await t.run(`INSERT INTO qbank_questions (id, domain, skill_id, skill, difficulty, passage, data_table, prompt, options, answer, explanation, tip, position, src)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT (id) DO UPDATE SET domain = EXCLUDED.domain, skill_id = EXCLUDED.skill_id, skill = EXCLUDED.skill, difficulty = EXCLUDED.difficulty,
          passage = EXCLUDED.passage, data_table = EXCLUDED.data_table, prompt = EXCLUDED.prompt, options = EXCLUDED.options, answer = EXCLUDED.answer,
          explanation = EXCLUDED.explanation, tip = EXCLUDED.tip, position = EXCLUDED.position, src = EXCLUDED.src`,
      [id, sk.domain, sk.id, sk.name, q.difficulty, q.passage || '', q.table ? JSON.stringify(q.table) : '', q.prompt, JSON.stringify(q.options.map(String)), q.answer,
        q.explanation || '', q.tip || '', (src === 'bundled' ? 0 : 1000) + i, src]);
    }
    return ids;
  });
}

/** On start-up: bundled files → database. Questions the teacher imported are never touched. */
export async function syncQbank() {
  if (!fs.existsSync(DIR)) return;
  const keep = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
    let file;
    try { file = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { console.error(`[qbank] ${f}: ${e.message}`); continue; }
    const errs = validateBank(file);
    if (errs.length) { console.error(`[qbank] ${f}: ${errs.join('; ')}`); continue; }
    keep.push(...(await upsertBank(file, 'bundled')));
  }
  if (keep.length) await db.run("DELETE FROM qbank_questions WHERE src = 'bundled' AND NOT (id = ANY(?::text[]))", [keep]);
}

const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const pub = (q) => ({
  id: q.id, domain: q.domain, skill_id: q.skill_id, skill: q.skill, difficulty: q.difficulty,
  passage: q.passage, table: parse(q.data_table, null), prompt: q.prompt, options: parse(q.options, []),
});

export function registerQbank(app, { h, bad, requireStudent, requireMaster, accessFor, upload }) {
  const openLevels = async (user) => (user.role === 'master' || (await accessFor(user)).can_practice ? LEVELS : [FREE_LEVEL]);

  // overview: domains → skills with counts and the student's own progress
  app.get('/api/qbank', h(async (req, res) => {
    const counts = await db.all('SELECT skill_id, difficulty, COUNT(*) AS n FROM qbank_questions WHERE active GROUP BY skill_id, difficulty');
    const mine = req.user.role === 'student' ? await db.all(`SELECT q.skill_id, COUNT(*) AS answered, SUM(CASE WHEN a.correct THEN 1 ELSE 0 END) AS correct,
        SUM(CASE WHEN a.first_correct THEN 1 ELSE 0 END) AS first_correct
      FROM qbank_answers a JOIN qbank_questions q ON q.id = a.question_id WHERE a.user_id = ? AND q.active GROUP BY q.skill_id`, [req.user.id]) : [];
    const levels = await openLevels(req.user);
    const by = new Map(mine.map((r) => [r.skill_id, r]));
    const domains = DOMAINS.map((d) => {
      const skills = d.skills.map(([id, name]) => {
        const per = Object.fromEntries(LEVELS.map((l) => [l, Number(counts.find((c) => c.skill_id === id && c.difficulty === l)?.n || 0)]));
        const total = LEVELS.reduce((s, l) => s + per[l], 0);
        const m = by.get(id);
        return { id, name, total, per, open: levels.reduce((s, l) => s + per[l], 0),
          answered: Number(m?.answered || 0), correct: Number(m?.correct || 0), first_correct: Number(m?.first_correct || 0) };
      });
      return { domain: d.domain, total: skills.reduce((s, x) => s + x.total, 0), skills };
    });
    res.json({ total: domains.reduce((s, d) => s + d.total, 0), domains, open_levels: levels, free_level: FREE_LEVEL });
  }));

  // a practice set: filters → up to `limit` questions without answers
  app.get('/api/qbank/questions', requireStudent, h(async (req, res) => {
    const levels = await openLevels(req.user);
    const want = String(req.query.difficulty || '').split(',').filter((l) => LEVELS.includes(l));
    const allowed = (want.length ? want : LEVELS).filter((l) => levels.includes(l));
    if (!allowed.length) return bad(res, 'Medium and hard questions need an active subscription', 402, { code: 'subscription_required' });
    const skills = String(req.query.skill || '').split(',').filter((s) => SKILL.has(s));
    const domain = DOMAINS.find((d) => d.domain === req.query.domain);
    const skillIds = skills.length ? skills : domain ? domain.skills.map(([id]) => id) : [...SKILL.keys()];
    const status = ['new', 'mistakes'].includes(req.query.status) ? req.query.status : 'all';
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 10));
    const rows = await db.all(`SELECT q.*, a.correct AS last_correct FROM qbank_questions q
      LEFT JOIN qbank_answers a ON a.question_id = q.id AND a.user_id = ?
      WHERE q.active AND q.skill_id = ANY(?::text[]) AND q.difficulty = ANY(?::text[])
        ${status === 'new' ? 'AND a.question_id IS NULL' : status === 'mistakes' ? 'AND a.correct = false' : ''}
      ORDER BY (a.question_id IS NOT NULL), random() LIMIT ?`, [req.user.id, skillIds, allowed, limit]);
    res.json({ questions: rows.map(pub), status, levels: allowed });
  }));

  // check one answer → reveal the key, explanation and tip; remember the result
  app.post('/api/qbank/questions/:id/check', requireStudent, h(async (req, res) => {
    const q = await db.one('SELECT * FROM qbank_questions WHERE id = ? AND active', [req.params.id]);
    if (!q) return bad(res, 'Question not found', 404);
    if (!(await openLevels(req.user)).includes(q.difficulty)) return bad(res, 'This question needs an active subscription', 402, { code: 'subscription_required' });
    const choice = Number(req.body?.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return bad(res, 'Choose an answer first');
    const correct = choice === q.answer;
    await db.run(`INSERT INTO qbank_answers (user_id, question_id, choice, correct, first_correct, tries, answered_at) VALUES (?,?,?,?,?,1,now())
      ON CONFLICT (user_id, question_id) DO UPDATE SET choice = EXCLUDED.choice, correct = EXCLUDED.correct, tries = qbank_answers.tries + 1, answered_at = now()`,
    [req.user.id, q.id, choice, correct, correct]);
    res.json({ choice, answer: q.answer, correct, explanation: q.explanation, tip: q.tip });
  }));

  // teacher: browse every question with the key and class statistics
  app.get('/api/qbank/admin', requireMaster, h(async (req, res) => {
    const rows = await db.all(`SELECT q.*, COUNT(a.user_id) AS answered, SUM(CASE WHEN a.first_correct THEN 1 ELSE 0 END) AS first_correct
      FROM qbank_questions q LEFT JOIN qbank_answers a ON a.question_id = q.id
      GROUP BY q.id ORDER BY q.skill_id, q.position`);
    res.json(rows.map((q) => ({ ...pub(q), answer: q.answer, explanation: q.explanation, tip: q.tip, src: q.src, active: q.active,
      answered: Number(q.answered || 0), first_correct: Number(q.first_correct || 0) })));
  }));
  app.put('/api/qbank/admin/:id', requireMaster, h(async (req, res) => {
    await db.run('UPDATE qbank_questions SET active = ? WHERE id = ?', [!!req.body?.active, req.params.id]);
    res.json({ ok: true });
  }));
  app.delete('/api/qbank/admin/:id', requireMaster, h(async (req, res) => {
    const q = await db.one('SELECT src FROM qbank_questions WHERE id = ?', [req.params.id]);
    if (!q) return bad(res, 'Not found', 404);
    if (q.src === 'bundled') return bad(res, 'Built-in questions can only be hidden, not deleted');
    await db.run('DELETE FROM qbank_questions WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  }));
  // teacher: import a JSON file in the same format as content/qbank/*.json
  app.post('/api/qbank/import', requireMaster, upload.single('file'), h(async (req, res) => {
    let file = req.body;
    if (req.file) { try { file = JSON.parse(req.file.buffer.toString('utf8')); } catch { return bad(res, 'The file is not valid JSON'); } }
    const errs = validateBank(file);
    if (errs.length) return bad(res, 'The file has problems: ' + errs.join('; '));
    const clash = await db.all("SELECT id FROM qbank_questions WHERE src = 'bundled' AND id = ANY(?::text[])", [file.questions.map((q) => String(q.id))]);
    if (clash.length) return bad(res, `These ids belong to built-in questions — use different ids: ${clash.map((c) => c.id).slice(0, 5).join(', ')}`);
    const ids = await upsertBank(file, 'upload');
    res.json({ imported: ids.length, skill: SKILL.get(file.skill_id).name });
  }));
}
