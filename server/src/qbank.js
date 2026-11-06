import { satScore } from './scoring.js';
/**
 * Question Bank: original SAT Reading & Writing questions grouped by the official
 * domains and skills (content/qbank/*.json, synced on start; the teacher can import more).
 * Students practise one question at a time; answers are revealed only after a check.
 * Without a subscription only "easy" questions are open.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { penaltyOf, focusSummary } from './focus.js';
import { db, getSettings } from './db.js';
import { moveBalance, meterAnswers, meterMap, assertLeft, limitError } from './tiers.js';

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
        ON CONFLICT (id) DO UPDATE SET domain = EXCLUDED.domain, skill_id = EXCLUDED.skill_id, skill = EXCLUDED.skill,
          difficulty = CASE WHEN qbank_questions.diff_locked THEN qbank_questions.difficulty ELSE EXCLUDED.difficulty END,
          passage = EXCLUDED.passage, data_table = EXCLUDED.data_table, prompt = EXCLUDED.prompt, options = EXCLUDED.options, answer = EXCLUDED.answer,
          explanation = EXCLUDED.explanation, tip = EXCLUDED.tip, position = EXCLUDED.position, src = EXCLUDED.src
        WHERE qbank_questions.edited IS NOT TRUE`,
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

// A 27-question module in the order of the digital SAT: Craft and Structure → Information and Ideas →
// Standard English Conventions → Expression of Ideas (transitions, then student notes).
export const MOCK_BLUEPRINT = [
  ['words-in-context', 4], ['text-structure', 2], ['cross-text', 1],
  ['central-ideas', 2], ['command-of-evidence', 3], ['inferences', 2],
  ['boundaries', 4], ['form-structure-sense', 3],
  ['transitions', 3], ['rhetorical-synthesis', 3],
];
/** Normalised passage + question, to spot the same question under another id. */
export const textKey = (passage, prompt) => `${String(passage || '').toLowerCase().replace(/\[\[|\]\]|\*\*|<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()}|${String(prompt || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
const MOCK_MINUTES = 32;

/** Settings of a roadmap "Random SAT module" item (stored as JSON in roadmap_items.body). */
export function randomCfg(body) {
  let c = {};
  try { c = JSON.parse(body || '{}'); } catch { /* defaults */ }
  const int = (v, d, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);
  const mix = { easy: int(c.mix?.easy, 0, 0, 100), medium: int(c.mix?.medium, 30, 0, 100), hard: int(c.mix?.hard, 70, 0, 100) };
  if (!mix.easy && !mix.medium && !mix.hard) mix.medium = 100;
  const skills = (Array.isArray(c.skills) ? c.skills : []).filter((s) => MOCK_BLUEPRINT.some(([id]) => id === s));
  return { count: int(c.count, 27, 5, 54), minutes: int(c.minutes, 32, 5, 120), pass_pct: int(c.pass_pct, 80, 10, 100), mix, skills: skills.length ? skills : MOCK_BLUEPRINT.map(([id]) => id) };
}

/** Split n into parts proportional to weights (largest remainders), so the parts add up to n. */
function spread(n, weights) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (n * w) / total);
  const out = raw.map(Math.floor);
  let left = n - out.reduce((a, b) => a + b, 0);
  raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
  return out;
}

/** One student's exam: the SAT blueprint scaled to `count`, the difficulty mix per skill, unseen and unreserved questions first. */
export async function randomSet(userId, cfg) {
  const plan = MOCK_BLUEPRINT.filter(([id]) => cfg.skills.includes(id));
  const perSkill = spread(cfg.count, plan.map(([, n]) => n));
  const ids = [];
  for (let i = 0; i < plan.length; i++) {
    const [skill] = plan[i];
    const byLevel = spread(perSkill[i], [cfg.mix.easy, cfg.mix.medium, cfg.mix.hard]);
    const picked = [];
    for (const [k, level] of LEVELS.entries()) {
      if (!byLevel[k]) continue;
      const rows = await db.all(`SELECT q.id FROM qbank_questions q LEFT JOIN qbank_answers a ON a.question_id = q.id AND a.user_id = ?
        WHERE q.active AND q.reserved_for IS NULL AND q.skill_id = ? AND q.difficulty = ? AND NOT (q.id = ANY(?::text[]))
        ORDER BY (a.question_id IS NOT NULL), random() LIMIT ?`, [userId, skill, level, ids.concat(picked), byLevel[k]]);
      picked.push(...rows.map((r) => r.id));
    }
    // not enough at that level: fill from the skill's other levels
    if (picked.length < perSkill[i]) {
      const more = await db.all(`SELECT q.id FROM qbank_questions q LEFT JOIN qbank_answers a ON a.question_id = q.id AND a.user_id = ?
        WHERE q.active AND q.reserved_for IS NULL AND q.skill_id = ? AND NOT (q.id = ANY(?::text[])) ORDER BY (a.question_id IS NOT NULL), random() LIMIT ?`,
      [userId, skill, ids.concat(picked), perSkill[i] - picked.length]);
      picked.push(...more.map((r) => r.id));
    }
    const lv = new Map((await db.all('SELECT id, difficulty FROM qbank_questions WHERE id = ANY(?::text[])', [picked])).map((r) => [r.id, r.difficulty]));
    ids.push(...picked.sort((a, b) => LV[lv.get(a)] - LV[lv.get(b)]));
  }
  return ids;
}
const LV = { easy: 0, medium: 1, hard: 2 };

export async function migrateQbankMocks() {
  await db.exec(`
ALTER TABLE qbank_questions ADD COLUMN IF NOT EXISTS premium BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE qbank_questions ADD COLUMN IF NOT EXISTS edited BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS qbank_mocks (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_ids TEXT NOT NULL, answers TEXT NOT NULL DEFAULT '{}', score INTEGER, total INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_qbank_mocks_user ON qbank_mocks(user_id, started_at DESC);
ALTER TABLE qbank_mocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbank_mocks ADD COLUMN IF NOT EXISTS estimate INTEGER;
ALTER TABLE qbank_mocks ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE qbank_mocks ADD COLUMN IF NOT EXISTS item_id INTEGER;
ALTER TABLE qbank_mocks ADD COLUMN IF NOT EXISTS minutes INTEGER;
`);
}

export function registerQbank(app, { h, bad, requireStudent, requireMaster, accessFor, upload, usedToday, itemOpen }) {
  // Take a quiz: the plan's free quizzes a day, then a small price per extra quiz from the wallet
  const quizQuota = async (user) => {
    if (user.role === 'master') return { limit: 0, used: 0, left: 0, extra_price: 0, balance: 0 };
    const s = await getSettings();
    const limit = (await accessFor(user)).tier?.quiz_day || 0;
    const used = (await usedToday(user.id)).quizzes;
    const bal = await db.one('SELECT balance FROM users WHERE id = ?', [user.id]);
    return { limit, used, left: limit ? Math.max(0, limit - used) : null, extra_price: Number(s.quiz_extra_price) || 0, balance: Number(bal?.balance || 0) };
  };
  const openLevels = async (user) => (user.role === 'master' || (await accessFor(user)).can_practice ? LEVELS : [FREE_LEVEL]);

  // overview: domains → skills with counts and the student's own progress
  app.get('/api/qbank', h(async (req, res) => {
    const counts = await db.all('SELECT skill_id, difficulty, COUNT(*) AS n FROM qbank_questions WHERE active AND NOT premium AND reserved_for IS NULL GROUP BY skill_id, difficulty');
    const mine = req.user.role === 'student' ? await db.all(`SELECT q.skill_id, COUNT(*) AS answered, SUM(CASE WHEN a.correct THEN 1 ELSE 0 END) AS correct,
        SUM(CASE WHEN a.first_correct THEN 1 ELSE 0 END) AS first_correct
      FROM qbank_answers a JOIN qbank_questions q ON q.id = a.question_id WHERE a.user_id = ? AND q.active AND NOT q.premium AND q.reserved_for IS NULL GROUP BY q.skill_id`, [req.user.id]) : [];
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
      WHERE q.active AND NOT q.premium AND q.reserved_for IS NULL AND q.skill_id = ANY(?::text[]) AND q.difficulty = ANY(?::text[])
        ${status === 'new' ? 'AND a.question_id IS NULL' : status === 'mistakes' ? 'AND a.correct = false' : ''}
      ORDER BY (a.question_id IS NOT NULL), random() LIMIT ?`, [req.user.id, skillIds, allowed, limit]);
    res.json({ questions: rows.map(pub), status, levels: allowed });
  }));

  // check one answer → reveal the key, explanation and tip; remember the result
  app.post('/api/qbank/questions/:id/check', requireStudent, h(async (req, res) => {
    const q = await db.one('SELECT * FROM qbank_questions WHERE id = ? AND active AND NOT premium AND reserved_for IS NULL', [req.params.id]);
    if (!q) return bad(res, 'Question not found', 404);
    if (!(await openLevels(req.user)).includes(q.difficulty)) return bad(res, 'This question needs an active subscription', 402, { code: 'subscription_required' });
    const meter = await meterAnswers(req.user, [`qb:${q.id}`]);
    if (meter.refused) throw limitError(meter.cap);
    const choice = Number(req.body?.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return bad(res, 'Choose an answer first');
    const correct = choice === q.answer;
    await db.run(`INSERT INTO qbank_answers (user_id, question_id, choice, correct, first_correct, first_choice, tries, answered_at) VALUES (?,?,?,?,?,?,1,now())
      ON CONFLICT (user_id, question_id) DO UPDATE SET choice = EXCLUDED.choice, correct = EXCLUDED.correct, tries = qbank_answers.tries + 1, answered_at = now()`,
    [req.user.id, q.id, choice, correct, correct, choice]);
    res.json({ choice, answer: q.answer, correct, explanation: q.explanation, tip: q.tip });
  }));

  // ---------- "Take a quiz": a random SAT-style module from the bank ----------
  const accuracy = async (uid) => {
    const r = await db.one('SELECT COUNT(*) AS n, SUM(CASE WHEN correct THEN 1 ELSE 0 END) AS ok FROM qbank_answers WHERE user_id = ?', [uid]);
    return { answered: Number(r.n), correct: Number(r.ok || 0), percent: Number(r.n) ? Math.round((Number(r.ok || 0) / Number(r.n)) * 100) : null };
  };
  const mockState = async (m, withKey) => {
    const ids = JSON.parse(m.question_ids);
    const rows = await db.all('SELECT * FROM qbank_questions WHERE id = ANY(?::text[])', [ids]);
    const by = new Map(rows.map((q) => [q.id, q]));
    const qs = ids.map((id) => by.get(id)).filter(Boolean);
    const mins = m.minutes || MOCK_MINUTES;
    const pen = await penaltyOf('mock', m.id);
    const remaining = Math.max(0, Math.round((new Date(m.started_at).getTime() + mins * 60e3 - Date.now()) / 1000) - pen);
    const given = JSON.parse(m.answers || '{}');
    const sat = m.finished_at ? satScore(qs.map((q) => ({ correct: given[q.id] === q.answer, difficulty: q.difficulty }))) : null;
    return {
      sat,
      id: m.id, minutes: mins, remaining, item_id: m.item_id || null, finished: !!m.finished_at, score: m.score, total: m.total, started_at: m.started_at, finished_at: m.finished_at,
      answers: JSON.parse(m.answers || '{}'),
      focus: m.finished_at ? await focusSummary('mock', m.id) : undefined,
      questions: qs.map((q) => (withKey ? { ...pub(q), answer: q.answer, explanation: q.explanation, tip: q.tip } : pub(q))),
    };
  };

  app.get('/api/qbank/mocks', requireStudent, h(async (req, res) => {
    const list = await db.all('SELECT id, score, total, estimate, started_at, finished_at FROM qbank_mocks WHERE user_id = ? AND item_id IS NULL AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 10', [req.user.id]);
    const open = await db.one(`SELECT id FROM qbank_mocks WHERE user_id = ? AND item_id IS NULL AND finished_at IS NULL AND started_at > now() - interval '${MOCK_MINUTES} minutes' ORDER BY id DESC LIMIT 1`, [req.user.id]);
    const mockAcc = list.length ? Math.round((list.reduce((s, m) => s + m.score, 0) / list.reduce((s, m) => s + m.total, 0)) * 100) : null;
    res.json({ quota: await quizQuota(req.user), mocks: list, open: open?.id || null, accuracy: await accuracy(req.user.id), mock_accuracy: mockAcc, questions: MOCK_BLUEPRINT.reduce((s, [, n]) => s + n, 0), minutes: MOCK_MINUTES });
  }));

  // start a new module (or resume the one still running)
  app.post('/api/qbank/mock', requireStudent, h(async (req, res) => {
    const open = await db.one(`SELECT * FROM qbank_mocks WHERE user_id = ? AND item_id IS NULL AND finished_at IS NULL AND started_at > now() - interval '${MOCK_MINUTES} minutes' ORDER BY id DESC LIMIT 1`, [req.user.id]);
    if (open && !req.body?.fresh) return res.json(await mockState(open, false));
    await assertLeft(req.user);
    const quota = await quizQuota(req.user);
    const paid = quota.limit > 0 && quota.left <= 0;
    // beyond the plan's daily quizzes: one more for a small price from the wallet, only when the student asks to pay
    if (paid && (!req.body?.pay || !quota.extra_price)) return bad(res, `Today's ${quota.limit} free quiz${quota.limit === 1 ? '' : 'zes'} used. Take one more for ${quota.extra_price.toLocaleString('en-US').replace(/,/g, ' ')} from your wallet or come back tomorrow.`, 402, { code: 'daily_limit', quota });
    const levels = await openLevels(req.user);
    const picked = [];
    for (const [skill, n] of MOCK_BLUEPRINT) {
      // questions the student has not seen come first; inside a skill, easier questions first (as on the test)
      const rows = await db.all(`SELECT q.id, q.difficulty FROM qbank_questions q LEFT JOIN qbank_answers a ON a.question_id = q.id AND a.user_id = ?
        WHERE q.active AND NOT q.premium AND q.reserved_for IS NULL AND q.skill_id = ? AND q.difficulty = ANY(?::text[]) ORDER BY (a.question_id IS NOT NULL), random() LIMIT ?`, [req.user.id, skill, levels, n]);
      picked.push(...rows.sort((a, b) => LV[a.difficulty] - LV[b.difficulty]).map((r) => r.id));
    }
    if (picked.length < 10) return bad(res, 'The Question Bank does not have enough questions yet');
    const m = await db.tx(async (t) => {
      const r = await t.one('INSERT INTO qbank_mocks (user_id, question_ids, total, paid) VALUES (?,?,?,?) RETURNING *', [req.user.id, JSON.stringify(picked), picked.length, paid]);
      if (paid && (await moveBalance(t, req.user.id, -quota.extra_price, 'quiz', { note: 'Extra quiz', ref: `qz:${r.id}` })) == null) throw Object.assign(new Error('Not enough money in your wallet. Top it up first.'), { status: 402 });
      return r;
    }).catch((e) => { if (e.status === 402) return { err: e.message }; throw e; });
    if (m.err) return bad(res, m.err, 402, { code: 'balance_low', quota });
    res.json(await mockState(m, false));
  }));

  app.put('/api/qbank/mock/:id/progress', requireStudent, h(async (req, res) => {
    const id = Number(req.params.id);
    const save = (a) => db.run('UPDATE qbank_mocks SET answers = ? WHERE id = ? AND user_id = ? AND finished_at IS NULL', [JSON.stringify(a || {}).slice(0, 20000), id, req.user.id]);
    // free daily limit: answers past it are not kept (what was allowed is saved, then the limit is reported)
    const given = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    try { await save(await meterMap(req.user, `qz:${id}:`, given)); } catch (e) { if (e.kept) await save(e.kept); throw e; }
    res.json({ ok: true });
  }));

  // finish: grade, remember every answer in the bank stats, return the full review
  app.post('/api/qbank/mock/:id/submit', requireStudent, h(async (req, res) => {
    const m = await db.one('SELECT * FROM qbank_mocks WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
    if (!m) return bad(res, 'Quiz not found', 404);
    if (!m.finished_at) {
      const ids = JSON.parse(m.question_ids);
      let answers = {};
      for (const id of ids) { const c = Number(req.body?.answers?.[id]); if (Number.isInteger(c) && c >= 0 && c <= 3) answers[id] = c; }
      answers = await meterMap(req.user, `qz:${m.id}:`, answers, { strict: false });
      const keys = await db.all('SELECT id, answer, difficulty FROM qbank_questions WHERE id = ANY(?::text[])', [ids]);
      let score = 0;
      for (const k of keys) {
        if (answers[k.id] == null) continue;
        const ok = answers[k.id] === k.answer; score += ok ? 1 : 0;
        await db.run(`INSERT INTO qbank_answers (user_id, question_id, choice, correct, first_correct, first_choice, tries, answered_at) VALUES (?,?,?,?,?,?,1,now())
          ON CONFLICT (user_id, question_id) DO UPDATE SET choice = EXCLUDED.choice, correct = EXCLUDED.correct, tries = qbank_answers.tries + 1, answered_at = now()`,
        [req.user.id, k.id, answers[k.id], ok, ok, answers[k.id]]);
      }
      const est = satScore(keys.map((k) => ({ correct: answers[k.id] === k.answer, difficulty: k.difficulty })))?.score ?? null;
      await db.run('UPDATE qbank_mocks SET answers = ?, score = ?, estimate = ?, finished_at = now() WHERE id = ? AND finished_at IS NULL', [JSON.stringify(answers), score, est, m.id]);
    }
    res.json(await mockState(await db.one('SELECT * FROM qbank_mocks WHERE id = ?', [m.id]), true));
  }));

  app.get('/api/qbank/mock/:id', h(async (req, res) => {
    const m = req.user.role === 'master'
      ? await db.one('SELECT * FROM qbank_mocks WHERE id = ?', [Number(req.params.id)])
      : await db.one('SELECT * FROM qbank_mocks WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
    if (!m) return bad(res, 'Quiz not found', 404);
    res.json(await mockState(m, !!m.finished_at));
  }));

  // ---------- roadmap "Random SAT module": a final exam generated for each student ----------
  app.post('/api/roadmap/items/:id/exam', requireStudent, h(async (req, res) => {
    const it = await db.one("SELECT * FROM roadmap_items WHERE id = ? AND kind = 'random'", [Number(req.params.id)]);
    if (!it) return bad(res, 'Exam not found', 404);
    if (!(await itemOpen(req.user, it.id))) return bad(res, 'Finish the previous roadmap step first', 403);
    const cfg = randomCfg(it.body);
    const open = await db.one(`SELECT * FROM qbank_mocks WHERE user_id = ? AND item_id = ? AND finished_at IS NULL
      AND started_at > now() - (COALESCE(minutes, ${MOCK_MINUTES}) || ' minutes')::interval ORDER BY id DESC LIMIT 1`, [req.user.id, it.id]);
    if (open && !req.body?.fresh) return res.json(await mockState(open, false));
    await assertLeft(req.user);
    const ids = await randomSet(req.user.id, cfg);
    if (ids.length < Math.min(5, cfg.count)) return bad(res, 'The Question Bank does not have enough questions for this exam yet');
    const m = await db.one('INSERT INTO qbank_mocks (user_id, question_ids, total, item_id, minutes) VALUES (?,?,?,?,?) RETURNING *', [req.user.id, JSON.stringify(ids), ids.length, it.id, cfg.minutes]);
    res.json({ ...(await mockState(m, false)), exam: { title: it.title, pass_pct: cfg.pass_pct } });
  }));

  // teacher: browse every question with the key and class statistics
  // teacher: one page (50) of the Question Bank with filters — never the whole bank at once
  app.get('/api/qbank/admin', requireMaster, h(async (req, res) => {
    const where = []; const params = [];
    const qtxt = String(req.query.q || '').trim().slice(0, 100);
    if (qtxt) { where.push("(q.id ILIKE ? OR q.passage ILIKE ? OR q.prompt ILIKE ? OR q.options ILIKE ?)"); const p = `%${qtxt.replace(/[%_\\]/g, (c) => '\\' + c)}%`; params.push(p, p, p, p); }
    if (req.query.skill && req.query.skill !== 'all') { where.push('q.skill_id = ?'); params.push(String(req.query.skill)); }
    if (['easy', 'medium', 'hard'].includes(req.query.level)) { where.push('q.difficulty = ?'); params.push(req.query.level); }
    if (req.query.src === 'bundled' || req.query.src === 'upload') { where.push('q.src = ?'); params.push(req.query.src); }
    if (req.query.view === 'premium') where.push('q.premium'); else if (req.query.view === 'regular') where.push('NOT q.premium');
    if (req.query.reserved === 'any') where.push('q.reserved_for IS NOT NULL'); else if (req.query.reserved === 'none') where.push('q.reserved_for IS NULL');
    else if (['exam', 'lesson'].includes(req.query.reserved)) { where.push('q.reserved_for = ?'); params.push(req.query.reserved); }
    if (req.query.hidden === '1') where.push('NOT q.active');
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number((await db.one(`SELECT COUNT(*) AS n FROM qbank_questions q ${W}`, params)).n);
    const per = 50; const pages = Math.max(1, Math.ceil(total / per)); const page = Math.max(1, Math.min(pages, Number(req.query.page) || 1));
    const rows = await db.all(`SELECT q.* FROM qbank_questions q ${W} ORDER BY q.skill_id, q.position, q.id LIMIT ${per} OFFSET ${(page - 1) * per}`, params);
    const stats = rows.length ? new Map((await db.all(`SELECT question_id, COUNT(*) AS answered, SUM(CASE WHEN first_correct THEN 1 ELSE 0 END) AS first_correct
      FROM qbank_answers WHERE question_id = ANY(?::text[]) GROUP BY question_id`, [rows.map((r) => r.id)])).map((r) => [r.question_id, r])) : new Map();
    const counts = req.query.counts === '0' ? null : {
      skills: await db.all('SELECT skill_id AS id, MIN(skill) AS name, COUNT(*) AS n FROM qbank_questions GROUP BY skill_id ORDER BY skill_id'),
      all: Number((await db.one('SELECT COUNT(*) AS n FROM qbank_questions')).n),
      premium: Number((await db.one('SELECT COUNT(*) AS n FROM qbank_questions WHERE premium')).n),
      reserved: Number((await db.one('SELECT COUNT(*) AS n FROM qbank_questions WHERE reserved_for IS NOT NULL')).n),
    };
    res.json({ total, page, pages, counts, rows: rows.map((q) => {
      const st = stats.get(q.id);
      return { ...pub(q), answer: q.answer, explanation: q.explanation, tip: q.tip, src: q.src, active: q.active, premium: q.premium, edited: q.edited, reserved_for: q.reserved_for || null, reserve_off: !!q.reserve_off,
        answered: Number(st?.answered || 0), first_correct: Number(st?.first_correct || 0) };
    }) });
  }));
  // teacher: bulk changes on many questions (difficulty, skill, premium, visibility, reserved)
  app.post('/api/qbank/admin/bulk', requireMaster, h(async (req, res) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).slice(0, 5000);
    if (!ids.length) return bad(res, 'Choose questions first');
    const set = req.body?.set || {};
    if (['easy', 'medium', 'hard'].includes(set.difficulty)) await db.run('UPDATE qbank_questions SET difficulty = ?, edited = true WHERE id = ANY(?::text[])', [set.difficulty, ids]);
    if (set.skill_id && SKILL.has(set.skill_id)) { const sk = SKILL.get(set.skill_id); await db.run('UPDATE qbank_questions SET skill_id = ?, skill = ?, domain = ?, edited = true WHERE id = ANY(?::text[])', [sk.id, sk.name, sk.domain, ids]); }
    if ('premium' in set) await db.run('UPDATE qbank_questions SET premium = ? WHERE id = ANY(?::text[])', [!!set.premium, ids]);
    if ('active' in set) await db.run('UPDATE qbank_questions SET active = ? WHERE id = ANY(?::text[])', [!!set.active, ids]);
    if ('reserved' in set) {
      if (['exam', 'lesson'].includes(set.reserved)) await db.run('UPDATE qbank_questions SET reserved_for = ?, reserve_off = false WHERE id = ANY(?::text[])', [set.reserved, ids]);
      else await db.run('UPDATE qbank_questions SET reserved_for = NULL, reserve_off = true WHERE id = ANY(?::text[])', [ids]);
    }
    res.json({ ok: true, count: ids.length });
  }));
  // teacher: where one question is used (quizzes and roadmap lesson checks with the same text)
  app.get('/api/qbank/admin/:id/usage', requireMaster, h(async (req, res) => {
    const q = await db.one('SELECT id, passage, prompt FROM qbank_questions WHERE id = ?', [req.params.id]);
    if (!q) return bad(res, 'Not found', 404);
    const k = textKey(q.passage, q.prompt);
    const quizzes = (await db.all('SELECT DISTINCT z.id, z.title, x.passage, x.prompt FROM questions x JOIN quizzes z ON z.id = x.quiz_id')).filter((r) => textKey(r.passage, r.prompt) === k)
      .map((r) => ({ id: r.id, title: r.title })).filter((v, i, a) => a.findIndex((y) => y.id === v.id) === i);
    const steps = [];
    for (const it of await db.all("SELECT i.id, i.title, i.content, s.title AS step FROM roadmap_items i JOIN roadmap_steps s ON s.id = i.step_id WHERE i.kind = 'lesson' AND s.deleted_at IS NULL")) {
      let c; try { c = JSON.parse(it.content || '{}'); } catch { continue; }
      const all = Object.values(c.checks || {}).flat();
      if (all.some((x) => String(x?.id) === q.id || textKey(x?.passage, x?.prompt) === k)) steps.push({ step: it.step, lesson: it.title });
    }
    const exams = Number((await db.one('SELECT COUNT(*) AS n FROM qbank_mocks WHERE item_id IS NOT NULL AND question_ids LIKE ?', [`%"${q.id}"%`])).n);
    res.json({ quizzes, steps, exams });
  }));
  app.put('/api/qbank/admin/:id', requireMaster, h(async (req, res) => {
    const q = await db.one('SELECT * FROM qbank_questions WHERE id = ?', [req.params.id]);
    if (!q) return bad(res, 'Not found', 404);
    const b = req.body || {};
    const answer = Number.isInteger(b.answer) && b.answer >= 0 && b.answer <= 3 ? b.answer : q.answer;
    // the teacher can also fix the text itself (spelling, punctuation, a choice) and the difficulty label
    const txt = (v, max) => (v == null ? null : String(v).replace(/\r\n/g, '\n').slice(0, max));
    const passage = txt(b.passage, 6000) ?? q.passage; const prompt = txt(b.prompt, 600) ?? q.prompt;
    let options = q.options;
    if (Array.isArray(b.options) && b.options.length === 4 && b.options.every((o) => String(o).trim())) options = JSON.stringify(b.options.map((o) => String(o).slice(0, 600)));
    else if (b.options != null) return bad(res, 'Give four non-empty answer choices');
    const difficulty = ['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : q.difficulty;
    const explanation = b.explanation != null ? String(b.explanation).slice(0, 4000) : q.explanation;
    const fixed = answer !== q.answer || explanation !== q.explanation || passage !== q.passage || prompt !== q.prompt || options !== q.options;
    await db.run('UPDATE qbank_questions SET active = ?, premium = ?, answer = ?, explanation = ?, passage = ?, prompt = ?, options = ?, difficulty = ?, diff_locked = diff_locked OR ?, edited = edited OR ? WHERE id = ?', [
      'active' in b ? !!b.active : q.active, 'premium' in b ? !!b.premium : q.premium, answer, explanation, passage, prompt, options,
      difficulty, difficulty !== q.difficulty, fixed, q.id]);
    // a fixed key re-grades every answer already given to this question
    if (answer !== q.answer) await db.run('UPDATE qbank_answers SET correct = (choice = ?) WHERE question_id = ?', [answer, q.id]);
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
    // duplicates (same normalised passage + question as another question) are skipped and reported
    const existing = await db.all('SELECT id, passage, prompt FROM qbank_questions');
    const byKey = new Map(existing.map((r) => [textKey(r.passage, r.prompt), r.id]));
    const dupes = [];
    const fresh = file.questions.filter((x) => {
      const k = textKey(x.passage, x.prompt); const other = byKey.get(k);
      if (other && other !== String(x.id) && k.length > 12) { dupes.push({ id: String(x.id), of: other }); return false; }
      byKey.set(k, String(x.id)); return true;
    });
    if (!fresh.length) return bad(res, `Every question in the file is already in the bank (e.g. ${dupes[0]?.id} = duplicate of #${dupes[0]?.of})`);
    file = { ...file, questions: fresh };
    const ids = await upsertBank(file, 'upload');
    if (req.body?.premium === 'true' || file.premium === true) await db.run('UPDATE qbank_questions SET premium = true WHERE id = ANY(?::text[])', [ids]);
    res.json({ imported: ids.length, skill: SKILL.get(file.skill_id).name, premium: req.body?.premium === 'true' || file.premium === true, duplicates: dupes.slice(0, 50), duplicate_count: dupes.length });
  }));
}
