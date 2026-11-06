/**
 * Question quality (teacher): learned difficulty, automatic text checks and statistically suspicious questions.
 *  - Difficulty: teacher label vs what students actually did (calibrate.js), % right, strong vs weak students.
 *  - Text checks: double spaces, missing spaces, unbalanced quotes, repeated words, missing blank, duplicate options…
 *  - Suspicious: strong students miss it more than weak ones, a wrong choice beats the key, almost nobody gets it right.
 * The teacher fixes a question right here (text, choices, key, explanation, difficulty).
 */
import { db } from './db.js';
import { calibrate } from './calibrate.js';

const parse = (x, d) => { try { return JSON.parse(x); } catch { return d; } };
const MISSPELT = /\b(recieve[sd]?|seperate(ly)?|occured|definately|untill|wich|thier|alot|accomodate|goverment|enviroment|begining|beleive[sd]?|occassion|refered|succesful(ly)?|neccessary|adress|existance|publically|arguement|independant|similiar|tommorow|writting|comming|acheive[sd]?|wierd|truely|noticable|calender|concious|embarass|harrass|millenium|persue|reccomend|rythm|supercede|tounge)\b/i;
const NEEDS_BLANK = new Set(['boundaries', 'form-structure-sense', 'transitions']);

/** Text problems of one question: [{ level: 'error'|'warn'|'info', where, text }]. */
export function checkQuestion(q) {
  const out = [];
  const add = (level, where, text) => out.push({ level, where, text });
  const fields = [['passage', q.passage || ''], ['question', q.prompt || ''], ...q.options.map((o, i) => [`choice ${'ABCD'[i]}`, o || '']), ['explanation', q.explanation || '']];
  for (const [where, raw] of fields) {
    const t = String(raw).replace(/\*\*|\[\[|\]\]|<[^>]+>/g, '');
    if (!t.trim()) continue;
    if (/\S {2,}\S/.test(t)) add('warn', where, 'Double space');
    if (/[^\s_] [,;:.?!](?=\s|$|[A-Z])/.test(t)) add('warn', where, 'Space before punctuation');
    const glued = t.match(/[a-z][,;:][A-Za-z]{2}|[a-z]{2}\.[A-Z][a-z]/);
    if (glued) add('warn', where, `Missing space after punctuation: "${glued[0]}"`);
    const rep = t.match(/\b(\w{2,})\s+\1\b/i);
    if (rep && !/^(that|had|is)$/i.test(rep[1])) add('warn', where, `Repeated word: "${rep[0]}"`);
    if ((t.match(/"/g) || []).length % 2) add('warn', where, 'Unbalanced quotation marks');
    if ((t.match(/“/g) || []).length !== (t.match(/”/g) || []).length) add('warn', where, 'Opening and closing quotes do not match');
    if ((t.match(/\(/g) || []).length !== (t.match(/\)/g) || []).length) add('warn', where, 'Unbalanced parentheses');
    const low = t.match(/[a-z]{2}[.!?]\s+[a-z]\w*/);
    if (low && !/\b(e\.g|i\.e|etc|vs)\.\s/i.test(low[0])) add('warn', where, `Sentence starts with a small letter: "${low[0]}"`);
    const sp = t.match(MISSPELT);
    if (sp) add('warn', where, `Possible misspelling: "${sp[0]}"`);
  }
  if (q.options.some((o) => !String(o || '').trim())) add('error', 'choices', 'An answer choice is empty');
  const norm = q.options.map((o) => String(o || '').trim().toLowerCase());
  if (new Set(norm.filter(Boolean)).size < norm.filter(Boolean).length) add('error', 'choices', 'Two answer choices are the same');
  if (!(q.answer >= 0 && q.answer <= 3)) add('error', 'answer', 'No correct answer set');
  if (NEEDS_BLANK.has(q.skill_id) && !/_{3,}/.test(q.passage || '')) add('error', 'passage', 'This question type needs a blank (______) in the text');
  if (q.prompt && !/\?\s*$/.test(q.prompt.trim())) add('info', 'question', 'The question does not end with "?"');
  if (!String(q.explanation || '').trim()) add('info', 'explanation', 'No explanation');
  const words = (String(q.passage || '').match(/[A-Za-z'’-]+/g) || []).length;
  if (q.passage && words < 25 && q.skill_id !== 'rhetorical-synthesis') add('info', 'passage', `Very short text (${words} words): real SAT texts are 25–150 words`);
  return out;
}

const FLAG = {
  strong_miss: 'Strong students miss it more often than weak ones: check the answer key',
  distractor: 'A wrong choice is picked more often than the correct one: check the key or that choice',
  weak: 'Strong and weak students do about the same: the question does not separate them',
  very_hard: 'Fewer than 20% get it right',
  very_easy: 'More than 95% get it right',
  label: 'The label differs from how students actually did',
};

export function registerQuality(app, { h, bad, requireMaster }) {
  app.get('/api/quality', requireMaster, h(async (req, res) => {
    const rows = await db.all(`SELECT q.id, q.skill_id, q.skill, q.difficulty, q.diff_locked, q.passage, q.prompt, q.options, q.answer, q.explanation, q.active, q.src,
        c.n, c.right_n, c.b, c.se, c.level, c.upper_p, c.lower_p, c.choices, c.flags
      FROM qbank_questions q LEFT JOIN qbank_calib c ON c.question_id = q.id ORDER BY q.skill_id, q.position, q.id`);
    const at = await db.one("SELECT value FROM settings WHERE key = '_calib_at'");
    const list = rows.map((r) => {
      let options = parse(r.options, []);
      if (!Array.isArray(options)) options = [];
      options = [0, 1, 2, 3].map((i) => String(options[i] ?? ''));
      let checks;
      try { checks = checkQuestion({ ...r, passage: String(r.passage ?? ''), prompt: String(r.prompt ?? ''), explanation: String(r.explanation ?? ''), options }); }
      catch (e) { checks = [{ level: 'warn', where: 'question', text: `Could not check this question (${e.message})` }]; }
      let flags = parse(r.flags, []);
      if (!Array.isArray(flags)) flags = [];
      return {
        id: r.id, skill: r.skill, skill_id: r.skill_id, label: r.difficulty, locked: r.diff_locked, active: r.active, src: r.src,
        preview: `${String(r.passage || r.prompt || '').replace(/\*\*|\[\[|\]\]|<[^>]+>/g, '').slice(0, 150)}`, prompt: r.prompt,
        options, answer: r.answer,
        n: Number(r.n || 0), pct: r.n ? Math.round((100 * r.right_n) / r.n) : null, b: r.b != null ? Number(r.b) : null, se: r.se != null ? Number(r.se) : null,
        level: r.level || null, upper: r.upper_p == null ? null : Number(r.upper_p), lower: r.lower_p == null ? null : Number(r.lower_p), choices: (() => { const c = parse(r.choices, null); return Array.isArray(c) && c.length === 4 ? c.map(Number) : [0, 0, 0, 0]; })(), flags: flags.map((f) => ({ code: f, text: FLAG[f] || f })), checks,
      };
    });
    res.json({
      calibrated_at: at && Number(at.value) ? new Date(Number(at.value)).toISOString() : null,
      summary: {
        questions: list.length, with_data: list.filter((x) => x.n >= 10).length, reliable: list.filter((x) => x.n >= 30).length,
        mismatch: list.filter((x) => x.flags.some((f) => f.code === 'label')).length,
        suspicious: list.filter((x) => x.flags.some((f) => ['strong_miss', 'distractor', 'weak', 'very_hard'].includes(f.code))).length,
        text_errors: list.filter((x) => x.checks.some((c) => c.level === 'error')).length, text_warnings: list.filter((x) => x.checks.some((c) => c.level === 'warn')).length,
      },
      rows: list,
    });
  }));

  app.post('/api/quality/recalibrate', requireMaster, h(async (req, res) => { res.json(await calibrate()); }));

  // use the learned level as the question's label (and keep it when the bundled bank updates)
  app.post('/api/quality/apply', requireMaster, h(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 5000) : null;
    const min = Math.max(10, Number(req.body?.min) || 30);
    const r = await db.all(`UPDATE qbank_questions q SET difficulty = c.level, diff_locked = true FROM qbank_calib c
      WHERE c.question_id = q.id AND c.n >= ? AND c.level <> q.difficulty ${ids ? 'AND q.id = ANY(?::text[])' : ''} RETURNING q.id`, ids ? [min, ids] : [min]);
    res.json({ updated: r.length });
  }));

  // full question for the editor
  app.get('/api/quality/q/:id', requireMaster, h(async (req, res) => {
    const q = await db.one('SELECT id, skill_id, skill, difficulty, passage, prompt, options, answer, explanation, active FROM qbank_questions WHERE id = ?', [req.params.id]);
    if (!q) return bad(res, 'Not found', 404);
    res.json({ ...q, options: parse(q.options, []) });
  }));
}
