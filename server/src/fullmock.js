/**
 * Full mocks: official full-length SAT Reading & Writing practice tests uploaded by the teacher.
 *
 * Two ways to add one:
 *  - questions: Excel / CSV / PDF-text import per module (Module 1, Module 2 for everyone, or adaptive
 *    Module 2 hard + Module 2 easy) → played in the Bluebook layout.
 *  - pdf: the original PDF + the answer key per module → the student reads the PDF and fills an answer sheet.
 *
 * Adaptive routing: Module 1 ≥ 18/27 (ROUTE_CUT) → hard Module 2, otherwise easy (when both exist).
 * Weekly limit per student (settings fm_free / fm_month / fm_quarter), counted from Monday 00:00 Tashkent.
 */
import { db, getSettings } from './db.js';
import { tierOf, moveBalance, meterMap, assertLeft } from './tiers.js';
import { parseUpload } from './parse.js';
import { ROUTE_CUT, satScore } from './scoring.js';
import { MOCK_BLUEPRINT, DOMAINS } from './qbank.js';
import { penaltyOf, focusSummary } from './focus.js';
import { difficultyOf, thetaOf, recordAnswers, calibrateIfStale } from './calibrate.js';
import { scoreFromTheta, ROUTE_THETA } from './scoring.js';

export async function migrateFullMocks() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS full_mocks (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', mode TEXT NOT NULL DEFAULT 'questions',
  published BOOLEAN NOT NULL DEFAULT false, minutes INTEGER NOT NULL DEFAULT 32, keys TEXT NOT NULL DEFAULT '{}',
  pdf_name TEXT NOT NULL DEFAULT '', pdf_size INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS full_mock_pdfs (mock_id INTEGER PRIMARY KEY REFERENCES full_mocks(id) ON DELETE CASCADE, data BYTEA NOT NULL);
CREATE TABLE IF NOT EXISTS full_mock_questions (
  id SERIAL PRIMARY KEY, mock_id INTEGER NOT NULL REFERENCES full_mocks(id) ON DELETE CASCADE, module TEXT NOT NULL DEFAULT '1',
  position INTEGER NOT NULL DEFAULT 0, passage TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL DEFAULT '',
  opt_a TEXT NOT NULL DEFAULT '', opt_b TEXT NOT NULL DEFAULT '', opt_c TEXT NOT NULL DEFAULT '', opt_d TEXT NOT NULL DEFAULT '',
  correct TEXT NOT NULL DEFAULT '', explanation TEXT NOT NULL DEFAULT '', difficulty TEXT NOT NULL DEFAULT '', topic TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fmq_mock ON full_mock_questions(mock_id, module, position);
CREATE TABLE IF NOT EXISTS full_mock_attempts (
  id SERIAL PRIMARY KEY, mock_id INTEGER NOT NULL REFERENCES full_mocks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), stage TEXT NOT NULL DEFAULT 'm1', m2 TEXT, stage_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answers TEXT NOT NULL DEFAULT '{}', m1_correct INTEGER, m2_correct INTEGER, m1_total INTEGER, m2_total INTEGER,
  score INTEGER, low INTEGER, high INTEGER, route TEXT, finished_at TIMESTAMPTZ
);
ALTER TABLE full_mock_attempts ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE full_mock_attempts ADD COLUMN IF NOT EXISTS gen TEXT;
ALTER TABLE full_mock_attempts ADD COLUMN IF NOT EXISTS times TEXT NOT NULL DEFAULT '{}';
ALTER TABLE full_mocks ADD COLUMN IF NOT EXISTS conversion TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_fma_user ON full_mock_attempts(user_id, started_at DESC);
ALTER TABLE full_mocks ENABLE ROW LEVEL SECURITY; ALTER TABLE full_mock_pdfs ENABLE ROW LEVEL SECURITY;
ALTER TABLE full_mock_questions ENABLE ROW LEVEL SECURITY; ALTER TABLE full_mock_attempts ENABLE ROW LEVEL SECURITY;
`);
}

const MODULES = { 1: 'Module 1', 2: 'Module 2', '2h': 'Module 2 · harder', '2e': 'Module 2 · easier' };
const L = ['A', 'B', 'C', 'D'];
const WEEK = "date_trunc('week', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent'";
const parseJSON = (s, d) => { try { return JSON.parse(s || ''); } catch { return d; } };
const normModule = (v, fallback) => {
  const s = String(v || '').toLowerCase().replace(/\s+/g, '');
  if (!s) return fallback;
  if (/^(m?1|module1|modul1)$/.test(s)) return '1';
  if (/hard|qiyin|2h|upper/.test(s)) return '2h';
  if (/easy|oson|yengil|2e|lower/.test(s)) return '2e';
  if (/2/.test(s)) return '2';
  return fallback;
};
const cleanKey = (s) => String(s || '').toUpperCase().replace(/[^ABCD]/g, '');

// ---------- score report (prompt 11) ----------
const SKILL_DOMAIN = new Map(DOMAINS.flatMap((d) => d.skills.flatMap(([id, name]) => [[id, d.domain], [name.toLowerCase(), d.domain]])));
/** SAT domain of a question from its skill / topic name. */
export function domainOf(skill = '') {
  const t = String(skill || '').toLowerCase().trim();
  if (SKILL_DOMAIN.has(t)) return SKILL_DOMAIN.get(t);
  if (/(boundar|punctuat|form|structure, and sense|structure and sense|grammar|agreement|tense|pronoun|modifier|convention|clause|apostroph|possessive|parallel)/.test(t)) return 'Standard English Conventions';
  if (/(transition|rhetorical|synthesis|student notes)/.test(t)) return 'Expression of Ideas';
  if (/(words in context|vocab|text structure|purpose|cross[- ]text|craft)/.test(t)) return 'Craft and Structure';
  if (/(main idea|central|detail|evidence|inference|quantitative|information|graph|table)/.test(t)) return 'Information and Ideas';
  return null;
}
/**
 * The mock's own conversion table: { hard: { raw: scaled }, easy: {...}, single: {...} } where raw = Module 1 + Module 2 correct.
 * Teachers type it as lines "raw score" (e.g. "38 690"). A raw count missing from the table takes the nearest lower row.
 */
export function parseConversion(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^\s*(\d{1,2})\s*[,;:=\t -]+\s*(\d{3})\s*$/);
    if (m && Number(m[2]) >= 200 && Number(m[2]) <= 800) out[Number(m[1])] = Math.round(Number(m[2]) / 10) * 10;
  }
  return out;
}
function convert(table, raw) {
  const rows = Object.entries(table || {}).map(([k, v]) => [Number(k), Number(v)]).sort((a, b) => a[0] - b[0]);
  if (!rows.length) return null;
  let hit = rows[0];
  for (const r of rows) if (r[0] <= raw) hit = r;
  return hit[1];
}

/** Per-domain results, time per question and the lessons to revisit for the two weakest domains. */
async function scoreReport(review, answers, times) {
  const qs = review.flatMap((m) => m.questions);
  const dom = new Map(DOMAINS.map((d) => [d.domain, { domain: d.domain, correct: 0, total: 0, seconds: 0 }]));
  for (const q of qs) {
    const d = dom.get(q.domain); if (!d) continue;
    d.total += 1; d.correct += answers[q.id] === q.answer ? 1 : 0; d.seconds += Number(times[q.id] || 0);
  }
  const domains = [...dom.values()].filter((d) => d.total).map((d) => ({ ...d, pct: Math.round((d.correct / d.total) * 100) }));
  const timed = qs.filter((q) => q.seconds != null);
  const total = timed.reduce((t, q) => t + Number(q.seconds || 0), 0);
  const weakest = [...domains].filter((d) => d.pct < 100).sort((a, b) => a.pct - b.pct || b.total - a.total).slice(0, 2);
  const steps = weakest.length ? await db.all("SELECT s.id, s.title, s.subtitle, s.position, (SELECT MIN(i.id) FROM roadmap_items i WHERE i.step_id = s.id AND i.kind = 'lesson') AS first_lesson FROM roadmap_steps s WHERE s.deleted_at IS NULL ORDER BY s.position") : [];
  const weak = weakest.map((d) => ({
    ...d,
    skills: (DOMAINS.find((x) => x.domain === d.domain)?.skills || []).map(([id, name]) => ({ id, name })),
    lessons: steps.filter((st) => st.subtitle === d.domain || domainOf(`${st.title} ${st.subtitle}`) === d.domain).slice(0, 4)
      .map((st) => ({ step_id: st.id, title: st.title, lesson_id: st.first_lesson || null })),
  }));
  return {
    domains, weak,
    time: timed.length ? { total, avg: Math.round(total / timed.length), questions: timed.length,
      slowest: [...timed].sort((a, b) => b.seconds - a.seconds).slice(0, 3).map((q) => ({ id: q.id, n: qs.indexOf(q) + 1, seconds: q.seconds, ok: answers[q.id] === q.answer })) } : null,
  };
}

/** How many full mocks this student may start per week, and how many are used. */
export async function fmQuota(user) {
  const s = await getSettings();
  const tier = tierOf(user, s);
  const limit = user.role === 'master' || !tier.fm_week ? 999 : tier.fm_week; // 0 in a plan = unlimited
  const used = Number((await db.one(`SELECT COUNT(*) AS n FROM full_mock_attempts WHERE user_id = ? AND started_at >= ${WEEK} AND NOT paid`, [user.id])).n);
  const bal = await db.one('SELECT balance FROM users WHERE id = ?', [user.id]);
  const next = (await db.one(`SELECT (${WEEK}) + interval '7 days' AS t`)).t; // next Monday 00:00 Tashkent
  return { limit, used, left: Math.max(0, limit - used), unlimited: limit === 999, resets_at: next, plan: tier.id, plan_name: tier.name,
    extra_price: Number(s.fm_extra_price) || 0, balance: Number(bal?.balance || 0) };
}

export async function moduleSets(mock, a = null) {
  if (mock.mode === 'qbank') { // generated from the Question Bank: the question ids live on the attempt
    const gen = parseJSON(a?.gen, {});
    const pre = new Set(gen.pretest || []); // two unscored questions per module (they only measure the question)
    const mods = Object.entries(gen).filter(([m]) => MODULES[m]);
    const ids = mods.flatMap(([, v]) => v);
    if (!ids.length) return {};
    const rows = await db.all('SELECT * FROM qbank_questions WHERE id = ANY(?::text[])', [ids]);
    const by = new Map(rows.map((q) => [q.id, q]));
    const out = {};
    for (const [m, list] of mods) {
      out[m] = list.map((id) => by.get(id)).filter(Boolean).map((q) => {
        const o = parseJSON(q.options, []);
        return { id: q.id, module: m, passage: q.passage, table: parseJSON(q.data_table, null), prompt: q.prompt, skill: q.skill, skill_id: q.skill_id,
          opt_a: o[0] ?? '', opt_b: o[1] ?? '', opt_c: o[2] ?? '', opt_d: o[3] ?? '', correct: L[q.answer], explanation: q.explanation, difficulty: q.difficulty, pretest: pre.has(q.id) };
      });
    }
    return out;
  }
  if (mock.mode === 'pdf') {
    const k = parseJSON(mock.keys, {});
    const out = {};
    for (const m of Object.keys(MODULES)) if (cleanKey(k[m]).length) out[m] = cleanKey(k[m]).split('').map((c, i) => ({ id: `${m}-${i + 1}`, n: i + 1, correct: c }));
    return out;
  }
  const qs = await db.all('SELECT * FROM full_mock_questions WHERE mock_id = ? ORDER BY module, position, id', [mock.id]);
  const out = {};
  for (const q of qs) (out[q.module] ||= []).push(q);
  return out;
}
const summary = (sets) => Object.fromEntries(Object.entries(sets).map(([m, v]) => [m, v.length]));
const ready = (sets) => !!sets['1']?.length && !!(sets['2']?.length || (sets['2h']?.length && sets['2e']?.length));

const pubQ = (q, withKey) => ({
  id: q.id, n: q.n, passage: q.passage, table: q.table || undefined, skill: q.skill || undefined, prompt: q.prompt, options: q.opt_a != null ? [q.opt_a, q.opt_b, q.opt_c, q.opt_d] : null, difficulty: q.difficulty || undefined,
  ...(withKey ? { answer: L.indexOf(q.correct), explanation: q.explanation } : {}),
});

function grade(sets, a, answers) {
  const m1 = sets['1'] || []; const m2 = sets[a.m2] || [];
  const ok = (q) => answers[q.id] != null && L[answers[q.id]] === q.correct;
  const items = [
    ...m1.map((q) => ({ correct: ok(q), difficulty: q.difficulty || 'medium', module: 1 })),
    ...m2.map((q) => ({ correct: ok(q), difficulty: q.difficulty || (a.m2 === '2h' ? 'hard' : a.m2 === '2e' ? 'easy' : 'medium'), module: a.m2 === '2' ? undefined : 2 })),
  ];
  const sat = satScore(items);
  return { sat, m1: m1.filter(ok).length, m2: m2.filter(ok).length, m1_total: m1.length, m2_total: m2.length };
}

/**
 * Question Bank mocks: scored with the questions' learned difficulty (Rasch + guessing, see calibrate.js).
 * Unscored (pretest) questions are left out of the score, the routing and the counts.
 */
async function gradeCalibrated(sets, a, answers, route) {
  const m1 = (sets['1'] || []).filter((q) => !q.pretest); const m2 = (sets[a.m2] || []).filter((q) => !q.pretest);
  const ok = (q) => answers[q.id] != null && L[answers[q.id]] === q.correct;
  const diff = await difficultyOf([...m1, ...m2].map((q) => q.id));
  const items = [...m1, ...m2].map((q) => ({ correct: ok(q), b: diff.get(q.id)?.b ?? 0 }));
  const sat = items.length ? scoreFromTheta(thetaOf(items), route) : null;
  return { sat, m1: m1.filter(ok).length, m2: m2.filter(ok).length, m1_total: m1.length, m2_total: m2.length };
}

/**
 * Question types per module, varied like the real test (College Board ranges for one 27-question module:
 * Craft and Structure 6–8, Information and Ideas 6–7, Standard English Conventions 5–8, Expression of Ideas 4–6,
 * 25 scored), in the test's order. Returns [[skill_id, n], …].
 */
function blueprint() {
  const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  let cs; let ii; let sec; let eoi;
  do { cs = rnd(6, 8); ii = rnd(6, 7); sec = rnd(5, 8); eoi = rnd(4, 6); } while (cs + ii + sec + eoi !== 25);
  const wic = Math.ceil(cs / 2); const ctc = 1; const tsp = cs - wic - ctc;
  const coe = Math.round(ii * 0.4); const cid = Math.max(1, Math.round(ii * 0.3)); const inf = ii - coe - cid;
  const bnd = Math.ceil(sec * 0.55); const fss = sec - bnd;
  const rs = Math.ceil(eoi * 0.55); const tr = eoi - rs;
  return [['words-in-context', wic], ['text-structure', tsp], ['cross-text', ctc], ['central-ideas', cid], ['command-of-evidence', coe], ['inferences', inf],
    ['boundaries', bnd], ['form-structure-sense', fss], ['transitions', tr], ['rhetorical-synthesis', rs]].filter(([, n]) => n > 0);
}
// learned difficulty targets for each module: Module 1 covers the whole range, Module 2 leans hard or easy
const TARGET = { 1: [-1.5, 1.5], '2h': [-0.2, 2.2], '2e': [-2.0, 0.5] };

export function registerFullMocks(app, { h, bad, requireMaster, requireStudent, upload }) {
  const state = async (a, mock, sets) => {
    const pen = a.stage === 'done' ? 0 : await penaltyOf('fullmock', a.id, a.stage);
    const remaining = Math.max(0, Math.round((new Date(a.stage_started_at).getTime() + mock.minutes * 60e3 - Date.now()) / 1000) - pen);
    const answers = parseJSON(a.answers, {});
    const done = a.stage === 'done';
    const mod = a.stage === 'm1' ? '1' : a.stage === 'm2' ? a.m2 : null;
    const out = {
      id: a.id, mock: { id: mock.id, title: mock.title, mode: mock.mode, minutes: mock.minutes }, stage: a.stage, module: mod, module_label: mod ? MODULES[mod] : null,
      remaining, answers, route: a.route, started_at: a.started_at, finished_at: a.finished_at,
      questions: mod ? (sets[mod] || []).map((q) => pubQ(q, false)) : [],
    };
    if (done) {
      out.result = { score: a.score, low: a.low, high: a.high, route: a.route, m1: a.m1_correct, m2: a.m2_correct, m1_total: a.m1_total, m2_total: a.m2_total };
      const times = parseJSON(a.times, {});
      const stat = mock.mode === 'qbank' ? await difficultyOf([...(sets['1'] || []), ...(sets[a.m2] || [])].map((q) => q.id)) : new Map();
      out.review = [['1', sets['1'] || []], [a.m2, sets[a.m2] || []]].map(([m, qs]) => ({ module: m, label: MODULES[m],
        questions: qs.map((q) => {
          const st = stat.get(q.id);
          return { ...pubQ(q, true), domain: domainOf(q.skill || q.topic) || undefined, seconds: times[q.id] ?? null,
            ...(q.pretest ? { pretest: true } : {}), ...(st ? { level: st.level, pct: st.n >= 10 ? st.pct : null, answered_by: st.n } : {}) };
        }) }));
      out.report = await scoreReport(out.review.map((r) => ({ ...r, questions: r.questions.filter((q) => !q.pretest) })), answers, times);
      out.focus = await focusSummary('fullmock', a.id);
    }
    return out;
  };

  // ---------- student ----------
  app.get('/api/full-mocks', h(async (req, res) => {
    const mocks = await db.all('SELECT id, title, note, mode, minutes, created_at FROM full_mocks WHERE published ORDER BY position, id DESC');
    const tries = await db.all('SELECT id, mock_id, stage, score, low, high, started_at, finished_at FROM full_mock_attempts WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
    res.json({ quota: await fmQuota(req.user), mocks: mocks.map((m) => ({ ...m, attempts: tries.filter((t) => t.mock_id === m.id) })) });
  }));

  // ---------- random full mock from the Question Bank (Quizzes page) ----------
  const systemMock = async () => {
    let m = await db.one("SELECT * FROM full_mocks WHERE mode = 'qbank' ORDER BY id LIMIT 1");
    if (!m) {
      await db.run("INSERT INTO full_mocks (title, note, mode, published, minutes, position) VALUES ('SAT full mock', 'Random full test from the Question Bank', 'qbank', false, 32, 9999)");
      m = await db.one("SELECT * FROM full_mocks WHERE mode = 'qbank' ORDER BY id LIMIT 1");
    }
    return m;
  };
  /**
   * A full mock from the Question Bank, built like the real Digital SAT:
   *  - Module 1, Module 2 harder and Module 2 easier (27 each); the student gets one Module 2 after Module 1.
   *  - Question types vary per module within the official ranges, in the test's order; inside each type the
   *    questions go from easier to harder.
   *  - Difficulty comes from what students actually did (calibrate.js), not only from the label: Module 1 spans
   *    the whole range, the harder Module 2 is really hard, the easier one really easier.
   *  - 25 scored questions + 2 unscored ones per module: new or little-answered questions, so the bank keeps measuring
   *    itself. Unseen questions come first; nothing repeats inside one test.
   */
  async function generate(userId) {
    const pool = await db.all(`SELECT q.id, q.skill_id, q.difficulty, c.b, COALESCE(c.n, 0) AS n, (a.question_id IS NOT NULL) AS seen
      FROM qbank_questions q LEFT JOIN qbank_calib c ON c.question_id = q.id
      LEFT JOIN qbank_answers a ON a.question_id = q.id AND a.user_id = ?
      WHERE q.active AND q.reserved_for IS NULL`, [userId]);
    const PRIOR = { easy: -1.1, medium: 0, hard: 1.2 };
    for (const q of pool) q.bb = q.b != null ? Number(q.b) : PRIOR[q.difficulty] ?? 0;
    const used = new Set();
    const gen = { pretest: [] };
    for (const m of ['1', '2h', '2e']) {
      const plan = blueprint();
      const [lo, hi] = TARGET[m];
      const total = plan.reduce((x, [, n]) => x + n, 0);
      // spread difficulty targets over the module, then hand them out to the question types at random
      const targets = Array.from({ length: total }, (_, i) => lo + ((i + 0.5) / total) * (hi - lo) + (Math.random() - 0.5) * 0.3).sort(() => Math.random() - 0.5);
      let ti = 0;
      const groups = [];
      for (const [skill, n] of plan) {
        const pick = [];
        for (let i = 0; i < n; i++) {
          const want = targets[ti++];
          let best = null; let bestCost = Infinity;
          for (const q of pool) {
            if (q.skill_id !== skill || used.has(q.id)) continue;
            const cost = Math.abs(q.bb - want) + (q.seen ? 0.8 : 0) + Math.random() * 0.15;
            if (cost < bestCost) { best = q; bestCost = cost; }
          }
          if (best) { used.add(best.id); pick.push(best); }
        }
        groups.push([skill, pick.sort((x, y) => x.bb - y.bb)]);
      }
      // two unscored questions: the least-answered ones of two question types already in this module
      const skills = groups.map(([k]) => k).sort(() => Math.random() - 0.5);
      for (const skill of skills.slice(0, 2)) {
        const cand = pool.filter((q) => q.skill_id === skill && !used.has(q.id)).sort((x, y) => (x.n - y.n) || (x.seen - y.seen) || (Math.random() - 0.5))[0];
        if (!cand) continue;
        used.add(cand.id); gen.pretest.push(cand.id);
        const g = groups.find(([k]) => k === skill)[1];
        g.splice(Math.floor(Math.random() * (g.length + 1)), 0, cand);
      }
      gen[m] = groups.flatMap(([, g]) => g.map((q) => q.id));
    }
    return gen;
  }
  async function startAttempt(req, res, mock, gen = null) {
    const q = await fmQuota(req.user);
    let paid = false;
    if (q.left <= 0) {
      if (!req.body?.pay || !q.extra_price) return bad(res, `You have used ${q.limit} of ${q.limit} full mocks this week. Take one more for ${q.extra_price.toLocaleString('en-US').replace(/,/g, ' ')} from your wallet, or wait until Monday.`, 402, { code: 'full_mock_limit', quota: q });
      paid = true;
    }
    const id = await db.tx(async (t) => {
      const r = await t.run('INSERT INTO full_mock_attempts (mock_id, user_id, paid, gen) VALUES (?, ?, ?, ?) RETURNING id', [mock.id, req.user.id, paid, gen ? JSON.stringify(gen) : null]);
      if (paid && (await moveBalance(t, req.user.id, -q.extra_price, 'full_mock', { note: mock.title, ref: `fm:${r.id}` })) == null) throw Object.assign(new Error('Not enough money in your wallet. Top it up first.'), { status: 402 });
      return r.id;
    }).catch((e) => { if (e.status === 402) return { err: e.message }; throw e; });
    if (id?.err) return bad(res, id.err, 402, { code: 'balance_low', quota: q });
    const a = await db.one('SELECT * FROM full_mock_attempts WHERE id = ?', [id]);
    return res.json(await state(a, mock, await moduleSets(mock, a)));
  }
  app.get('/api/full-mocks/random', h(async (req, res) => {
    const m = await systemMock();
    const tries = await db.all('SELECT id, stage, score, low, high, m1_correct, m2_correct, m1_total, m2_total, route, finished_at FROM full_mock_attempts WHERE user_id = ? AND mock_id = ? ORDER BY id DESC LIMIT 20', [req.user.id, m.id]);
    const done = tries.filter((t) => t.stage === 'done');
    const right = done.reduce((s, t) => s + (t.m1_correct || 0) + (t.m2_correct || 0), 0);
    const total = done.reduce((s, t) => s + (t.m1_total || 0) + (t.m2_total || 0), 0);
    res.json({ quota: await fmQuota(req.user), open: tries.find((t) => t.stage !== 'done')?.id || null, taken: done.length,
      last: done[0] || null, best: done.reduce((b, t) => Math.max(b, t.score || 0), 0) || null,
      accuracy: total ? Math.round((right / total) * 100) : null, right, total, history: done.slice(0, 6) });
  }));
  app.post('/api/full-mocks/random/start', requireStudent, h(async (req, res) => {
    const m = await systemMock();
    const open = await db.one("SELECT * FROM full_mock_attempts WHERE user_id = ? AND mock_id = ? AND stage <> 'done' ORDER BY id DESC LIMIT 1", [req.user.id, m.id]);
    if (open) return res.json(await advanceIfExpired(open, m, await moduleSets(m, open)));
    await assertLeft(req.user);
    const gen = await generate(req.user.id);
    if ((gen['1']?.length || 0) < 20 || (gen['2h']?.length || 0) < 20 || (gen['2e']?.length || 0) < 20) return bad(res, 'The Question Bank does not have enough questions for a full mock yet');
    return startAttempt(req, res, m, gen);
  }));

  app.post('/api/full-mocks/:id/start', requireStudent, h(async (req, res) => {
    const mock = await db.one('SELECT * FROM full_mocks WHERE id = ? AND published', [Number(req.params.id)]);
    if (!mock) return bad(res, 'Mock not found', 404);
    const open = await db.one("SELECT * FROM full_mock_attempts WHERE user_id = ? AND mock_id = ? AND stage <> 'done' ORDER BY id DESC LIMIT 1", [req.user.id, mock.id]);
    const sets = await moduleSets(mock);
    if (open) return res.json(await advanceIfExpired(open, mock, sets));
    if (!ready(sets)) return bad(res, 'This mock is not ready yet');
    await assertLeft(req.user);
    const q = await fmQuota(req.user);
    let paid = false;
    if (q.left <= 0) {
      // beyond the weekly limit: one extra mock for fm_extra_price from the balance (only when the student asks to pay)
      if (!req.body?.pay || !q.extra_price) return bad(res, `You have used ${q.limit} of ${q.limit} full mocks this week. Take one more for ${q.extra_price.toLocaleString('en-US').replace(/,/g, ' ')} from your balance, or wait until Monday.`, 402, { code: 'full_mock_limit', quota: q });
      paid = true;
    }
    const id = await db.tx(async (t) => {
      const r = await t.run('INSERT INTO full_mock_attempts (mock_id, user_id, paid) VALUES (?, ?, ?) RETURNING id', [mock.id, req.user.id, paid]);
      if (paid && (await moveBalance(t, req.user.id, -q.extra_price, 'full_mock', { note: mock.title, ref: `fm:${r.id}` })) == null) throw Object.assign(new Error('Not enough money on your balance. Top it up first.'), { status: 402 });
      return r.id;
    }).catch((e) => { if (e.status === 402) return { err: e.message }; throw e; });
    if (id?.err) return bad(res, id.err, 402, { code: 'balance_low', quota: q });
    res.json(await state(await db.one('SELECT * FROM full_mock_attempts WHERE id = ?', [id]), mock, sets));
  }));

  // time over for a module → move on automatically (module 1 → module 2, module 2 → finish)
  async function advanceIfExpired(a, mock, sets) {
    const over = a.stage !== 'done' && Date.now() > new Date(a.stage_started_at).getTime() + mock.minutes * 60e3 + 30e3 - (await penaltyOf('fullmock', a.id, a.stage)) * 1000;
    if (over) a = await advance(a, mock, sets, parseJSON(a.answers, {}));
    return state(a, mock, sets);
  }
  async function advance(a, mock, sets, answers) {
    if (a.stage === 'm1') {
      const m1 = sets['1'] || [];
      const scored = m1.filter((q) => !q.pretest);
      const right = scored.filter((q) => answers[q.id] != null && L[answers[q.id]] === q.correct).length;
      const adaptive = sets['2h']?.length && sets['2e']?.length;
      let harder = scored.length && right / scored.length >= ROUTE_CUT;
      if (mock.mode === 'qbank' && scored.length) { // route by ability: which questions were right, not only how many
        const diff = await difficultyOf(scored.map((q) => q.id));
        harder = thetaOf(scored.map((q) => ({ correct: answers[q.id] != null && L[answers[q.id]] === q.correct, b: diff.get(q.id)?.b ?? 0 }))).theta >= ROUTE_THETA;
      }
      const m2 = adaptive ? (harder ? '2h' : '2e') : '2';
      await db.run("UPDATE full_mock_attempts SET stage = 'm2', m2 = ?, route = ?, stage_started_at = now(), answers = ?, m1_correct = ? WHERE id = ?",
        [m2, adaptive ? (m2 === '2h' ? 'hard' : 'easy') : null, JSON.stringify(answers), right, a.id]);
    } else if (a.stage === 'm2') {
      const g = mock.mode === 'qbank' ? await gradeCalibrated(sets, a, answers, a.route) : grade(sets, a, answers);
      const table = mock.mode === 'qbank' ? null : parseJSON(mock.conversion, {})[a.route || 'single'];
      const scaled = convert(table, g.m1 + g.m2);
      if (scaled != null && g.sat) g.sat = { score: scaled, low: Math.max(200, scaled - 20), high: Math.min(800, scaled + 20) };
      else if (scaled != null) g.sat = { score: scaled, low: scaled, high: scaled };
      await db.run("UPDATE full_mock_attempts SET stage = 'done', answers = ?, m1_correct = ?, m2_correct = ?, m1_total = ?, m2_total = ?, score = ?, low = ?, high = ?, finished_at = now() WHERE id = ?",
        [JSON.stringify(answers), g.m1, g.m2, g.m1_total, g.m2_total, g.sat?.score ?? 200, g.sat?.low ?? 200, g.sat?.high ?? 200, a.id]);
      if (mock.mode === 'qbank') {
        // every answer (scored or not) teaches the bank about its questions; then the difficulties are refreshed
        const all = [...(sets['1'] || []), ...(sets[a.m2] || [])].filter((q) => answers[q.id] != null);
        await db.tx((t) => recordAnswers(t, a.user_id, all.map((q) => ({ id: q.id, choice: answers[q.id], correct: L[answers[q.id]] === q.correct }))));
        await calibrateIfStale(10).catch((e) => console.error('[calibrate]', e.message));
      }
    }
    return db.one('SELECT * FROM full_mock_attempts WHERE id = ?', [a.id]);
  }
  const mine = async (req) => {
    const a = await db.one('SELECT * FROM full_mock_attempts WHERE id = ? AND user_id = ?', [Number(req.params.aid), req.user.id]);
    if (!a) return null;
    const mock = await db.one('SELECT * FROM full_mocks WHERE id = ?', [a.mock_id]);
    return { a, mock, sets: await moduleSets(mock, a) };
  };
  const keep = (sets, a, body) => { // only answers for questions of the current module, 0–3
    const mod = a.stage === 'm1' ? '1' : a.m2;
    const ids = new Set((sets[mod] || []).map((q) => String(q.id)));
    const answers = parseJSON(a.answers, {});
    for (const [k, v] of Object.entries(body?.answers || {})) if (ids.has(String(k))) { if (Number.isInteger(v) && v >= 0 && v <= 3) answers[k] = v; else delete answers[k]; }
    return answers;
  };
  // seconds spent on each question (the client sends running totals); kept separately from the answers
  const keepTimes = async (sets, a, body) => {
    if (!body?.times || typeof body.times !== 'object') return;
    const mod = a.stage === 'm1' ? '1' : a.m2;
    const ids = new Set((sets[mod] || []).map((q) => String(q.id)));
    const times = parseJSON(a.times, {});
    for (const [k, v] of Object.entries(body.times)) if (ids.has(String(k))) times[k] = Math.max(times[k] || 0, Math.min(3600, Math.round(Number(v) || 0)));
    await db.run('UPDATE full_mock_attempts SET times = ? WHERE id = ?', [JSON.stringify(times), a.id]);
  };

  app.get('/api/full-mocks/attempt/:aid', h(async (req, res) => {
    const x = await mine(req); if (!x) return bad(res, 'Not found', 404);
    res.json(await advanceIfExpired(x.a, x.mock, x.sets));
  }));
  app.put('/api/full-mocks/attempt/:aid', h(async (req, res) => {
    const x = await mine(req); if (!x) return bad(res, 'Not found', 404);
    if (x.a.stage === 'done') return res.json({ ok: true });
    const save = (ans) => db.run('UPDATE full_mock_attempts SET answers = ? WHERE id = ?', [JSON.stringify(ans), x.a.id]);
    await keepTimes(x.sets, x.a, req.body);
    // free daily limit: answers past it are not kept (what was allowed is saved, then the limit is reported)
    try { await save(await meterMap(req.user, `fm:${x.a.id}:`, keep(x.sets, x.a, req.body))); } catch (e) { if (e.kept) await save(e.kept); throw e; }
    res.json({ ok: true });
  }));
  // finish the current module (Module 1 → Module 2, Module 2 → result)
  app.post('/api/full-mocks/attempt/:aid/next', h(async (req, res) => {
    const x = await mine(req); if (!x) return bad(res, 'Not found', 404);
    if (x.a.stage === 'done') return res.json(await state(x.a, x.mock, x.sets));
    await keepTimes(x.sets, x.a, req.body);
    const a = await advance(x.a, x.mock, x.sets, await meterMap(req.user, `fm:${x.a.id}:`, keep(x.sets, x.a, req.body), { strict: false }));
    res.json(await state(a, x.mock, x.sets));
  }));
  app.get('/api/full-mocks/:id/pdf', h(async (req, res) => {
    const mock = await db.one('SELECT * FROM full_mocks WHERE id = ?', [Number(req.params.id)]);
    if (!mock) return bad(res, 'Not found', 404);
    if (req.user.role !== 'master' && !(await db.one("SELECT 1 AS x FROM full_mock_attempts WHERE user_id = ? AND mock_id = ?", [req.user.id, mock.id]))) return bad(res, 'Start the mock first', 403);
    const row = await db.one('SELECT data FROM full_mock_pdfs WHERE mock_id = ?', [mock.id]);
    if (!row) return bad(res, 'No PDF', 404);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(mock.pdf_name || 'mock.pdf')}"`, 'Cache-Control': 'private, max-age=600' });
    res.send(Buffer.from(row.data));
  }));

  // ---------- teacher ----------
  const adminRow = async (m) => {
    const sets = await moduleSets(m);
    const st = await db.one('SELECT COUNT(*) AS n, AVG(score) AS avg FROM full_mock_attempts WHERE mock_id = ? AND stage = ?', [m.id, 'done']);
    return { id: m.id, title: m.title, note: m.note, mode: m.mode, published: m.published, minutes: m.minutes, pdf_name: m.pdf_name, pdf_size: m.pdf_size,
      keys: parseJSON(m.keys, {}), conversion: parseJSON(m.conversion, {}), modules: summary(sets), ready: ready(sets), taken: Number(st.n), avg: st.avg == null ? null : Math.round(st.avg / 10) * 10, created_at: m.created_at };
  };
  app.get('/api/full-mocks/admin', requireMaster, h(async (req, res) => {
    const list = await db.all("SELECT * FROM full_mocks WHERE mode <> 'qbank' ORDER BY position, id DESC");
    const s = await getSettings();
    res.json({ mocks: await Promise.all(list.map(adminRow)), limits: { fm_free: s.fm_free, fm_month: s.fm_month, fm_quarter: s.fm_quarter } });
  }));
  app.post('/api/full-mocks/admin', requireMaster, h(async (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 120);
    if (!title) return bad(res, 'Give the mock a title');
    const mode = req.body?.mode === 'pdf' ? 'pdf' : 'questions';
    const r = await db.run('INSERT INTO full_mocks (title, note, mode, minutes) VALUES (?,?,?,?) RETURNING id', [title, String(req.body?.note || '').slice(0, 500), mode, Math.max(5, Math.min(120, Number(req.body?.minutes) || 32))]);
    res.json(await adminRow(await db.one('SELECT * FROM full_mocks WHERE id = ?', [r.id])));
  }));
  app.put('/api/full-mocks/admin/:id', requireMaster, h(async (req, res) => {
    const m = await db.one('SELECT * FROM full_mocks WHERE id = ?', [Number(req.params.id)]);
    if (!m) return bad(res, 'Not found', 404);
    const b = req.body || {};
    const keys = b.keys ? Object.fromEntries(Object.entries(b.keys).filter(([k]) => k in MODULES).map(([k, v]) => [k, cleanKey(v)])) : parseJSON(m.keys, {});
    const published = b.published ?? m.published;
    if (published && !ready(await moduleSets({ ...m, keys: JSON.stringify(keys) }))) return bad(res, 'Add Module 1 and Module 2 (or both harder and easier Module 2) before publishing');
    if (b.conversion && typeof b.conversion === 'object') {
      const conv = {};
      for (const k of ['hard', 'easy', 'single']) if (b.conversion[k] != null) { const t = typeof b.conversion[k] === 'string' ? parseConversion(b.conversion[k]) : b.conversion[k]; if (Object.keys(t).length) conv[k] = t; }
      await db.run('UPDATE full_mocks SET conversion = ? WHERE id = ?', [JSON.stringify(conv), m.id]);
    }
    await db.run('UPDATE full_mocks SET title = ?, note = ?, minutes = ?, keys = ?, published = ? WHERE id = ?', [
      String(b.title ?? m.title).trim().slice(0, 120) || m.title, String(b.note ?? m.note).slice(0, 500),
      Math.max(5, Math.min(120, Number(b.minutes ?? m.minutes) || 32)), JSON.stringify(keys), !!published, m.id]);
    res.json(await adminRow(await db.one('SELECT * FROM full_mocks WHERE id = ?', [m.id])));
  }));
  app.delete('/api/full-mocks/admin/:id', requireMaster, h(async (req, res) => {
    await db.run('DELETE FROM full_mocks WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
  }));
  // questions for one module from Excel / CSV / PDF text (a "module" column can split one file into modules)
  app.post('/api/full-mocks/admin/:id/import', requireMaster, upload.single('file'), h(async (req, res) => {
    const m = await db.one('SELECT * FROM full_mocks WHERE id = ?', [Number(req.params.id)]);
    if (!m) return bad(res, 'Not found', 404);
    if (!req.file) return bad(res, 'Choose a file');
    let rows;
    try { rows = await parseUpload(req.file); } catch (e) { return bad(res, e.message); }
    const fallback = normModule(req.body?.module, '1');
    rows = rows.filter((q) => q.correct);
    if (!rows.length) return bad(res, 'No questions with an answer were found. Use the template columns: passage, question, A, B, C, D, correct (and module, difficulty, explanation).');
    const byModule = {};
    for (const q of rows) (byModule[normModule(q.module, fallback)] ||= []).push(q);
    await db.tx(async (t) => {
      for (const [mod, qs] of Object.entries(byModule)) {
        await t.run('DELETE FROM full_mock_questions WHERE mock_id = ? AND module = ?', [m.id, mod]);
        for (const [i, q] of qs.entries()) {
          const d = String(q.difficulty || '').toLowerCase();
          await t.run('INSERT INTO full_mock_questions (mock_id, module, position, passage, prompt, opt_a, opt_b, opt_c, opt_d, correct, explanation, difficulty, topic) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [m.id, mod, i, q.passage, q.prompt, q.opt_a, q.opt_b, q.opt_c, q.opt_d, q.correct, q.explanation || '', /hard|qiyin/.test(d) ? 'hard' : /easy|oson/.test(d) ? 'easy' : /med|o'rta/.test(d) ? 'medium' : '', q.topic || '']);
        }
      }
      await t.run("UPDATE full_mocks SET mode = 'questions' WHERE id = ?", [m.id]);
    });
    res.json({ added: Object.fromEntries(Object.entries(byModule).map(([k, v]) => [k, v.length])), mock: await adminRow(await db.one('SELECT * FROM full_mocks WHERE id = ?', [m.id])) });
  }));
  app.delete('/api/full-mocks/admin/:id/module/:module', requireMaster, h(async (req, res) => {
    await db.run('DELETE FROM full_mock_questions WHERE mock_id = ? AND module = ?', [Number(req.params.id), req.params.module]);
    res.json(await adminRow(await db.one('SELECT * FROM full_mocks WHERE id = ?', [Number(req.params.id)])));
  }));
  app.post('/api/full-mocks/admin/:id/pdf', requireMaster, upload.single('file'), h(async (req, res) => {
    const m = await db.one('SELECT * FROM full_mocks WHERE id = ?', [Number(req.params.id)]);
    if (!m) return bad(res, 'Not found', 404);
    const f = req.file;
    if (!f || f.buffer.subarray(0, 4).toString() !== '%PDF') return bad(res, 'Choose a PDF file');
    await db.run('INSERT INTO full_mock_pdfs (mock_id, data) VALUES (?, ?) ON CONFLICT (mock_id) DO UPDATE SET data = EXCLUDED.data', [m.id, f.buffer]);
    await db.run("UPDATE full_mocks SET pdf_name = ?, pdf_size = ?, mode = 'pdf' WHERE id = ?", [f.originalname.slice(0, 160), f.size, m.id]);
    res.json(await adminRow(await db.one('SELECT * FROM full_mocks WHERE id = ?', [m.id])));
  }));
  app.get('/api/full-mocks/admin/:id/results', requireMaster, h(async (req, res) => {
    res.json(await db.all(`SELECT a.id, a.user_id, u.name, a.stage, a.score, a.low, a.high, a.route, a.m1_correct, a.m2_correct, a.m1_total, a.m2_total, a.started_at, a.finished_at
      FROM full_mock_attempts a JOIN users u ON u.id = a.user_id WHERE a.mock_id = ? ORDER BY a.id DESC LIMIT 200`, [Number(req.params.id)]));
  }));
}
