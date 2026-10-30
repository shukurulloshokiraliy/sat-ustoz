/**
 * Public website (no sign-in needed) + teacher-editable content.
 *
 *  - Practice tests: 27 Reading & Writing questions drawn from the Question Bank.
 *    Each visit gets a fresh random "visible pool" (by default 40% of the bank), so a student
 *    sees different questions every time they come back, and the full bank is never exposed at once.
 *    Questions are only READ from qbank_questions — nothing in the bank is changed here.
 *  - Site content: home page texts, menu sections with pages (guides, courses, news…),
 *    student wins and FAQ — all editable by the teacher (Website in the teacher panel).
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { DOMAINS } from './qbank.js';

export async function migrateSite() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS site_blocks (
  key TEXT PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS site_pages (
  id SERIAL PRIMARY KEY,
  section TEXT NOT NULL DEFAULT 'guides',
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  question_ids TEXT NOT NULL,
  filters TEXT NOT NULL DEFAULT '{}',
  answers TEXT,
  score INTEGER, total INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_practice_user ON practice_sessions(user_id, started_at);
ALTER TABLE site_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
`);
}

// ---------- default content (the teacher can change all of it) ----------
export const DEFAULT_BLOCKS = {
  home: {
    hero_title: 'SAT score,',
    hero_accent: 'with an ustoz',
    hero_sub: 'SAT Ustoz is a complete Reading & Writing prep platform. Take a free 27-question practice test right now — no sign-up — then follow a step-by-step roadmap from 200 to 800.',
    cta_primary: 'Start free trial',
    cta_secondary: 'Take a free practice test',
    cta_note: 'No card needed',
    badges: ['Step-by-step explanations', 'Ustoz tips', 'Roadmap 200 → 800', 'Video lessons'],
    stats: [
      { value: '+120', label: 'average score lift' },
      { value: '27', label: 'questions per practice test' },
      { value: '32 min', label: 'like the real module' },
    ],
    steps: [
      { title: 'Find your weak spots', text: 'Take a free practice test. You get a score estimate and a skill-by-skill breakdown in seconds.' },
      { title: 'Follow the roadmap', text: 'Video lessons, notes and level checks — one step at a time, from 200 to 800.' },
      { title: 'Increase your score', text: 'Practise every day with new questions, learn from every mistake and watch your estimate climb.' },
    ],
    features: [
      { emoji: '🎯', title: 'Fresh questions every visit', text: 'Every time you come back, the practice pool is reshuffled.' },
      { emoji: '🧠', title: 'Explanations + Ustoz tips', text: 'Every question shows why the answer is right and a short tip to remember.' },
      { emoji: '🗺️', title: 'Roadmap 200 → 800', text: 'Lessons unlock one by one, so you always know what to do next.' },
      { emoji: '⏱️', title: 'Real exam timing', text: '27 questions, 32 minutes — just like a Reading & Writing module.' },
      { emoji: '📈', title: 'Score estimate', text: 'See your estimated score after every test.' },
      { emoji: '🏆', title: 'XP and progress', text: 'Earn XP, keep your streak and see your progress grow.' },
    ],
    final_title: 'Ready to lock in?',
    final_sub: 'Start with a free practice test — it takes 32 minutes.',
  },
  testimonials: [
    { name: 'Madina', from: '1180', to: '1420', text: 'The tips after each question helped me stop making the same grammar mistakes.' },
    { name: 'Javohir', from: '1250', to: '1480', text: 'I did one practice test every day. The questions were always new.' },
    { name: 'Sevara', from: '1100', to: '1350', text: 'The roadmap told me exactly what to study next. No more guessing.' },
  ],
  faq: [
    { q: 'Is the practice test really free?', a: 'Yes. You can take as many 27-question practice tests as you want without signing up.' },
    { q: 'Why are the questions different every time?', a: 'Each visit opens a new random part of our question bank, so you always practise with fresh questions.' },
    { q: 'What do I get with a free account?', a: 'Your results are saved, you get the readiness check and the first roadmap lessons.' },
  ],
  sections: [
    { id: 'guides', label: 'Guides', enabled: true },
    { id: 'courses', label: 'Courses', enabled: true },
    { id: 'community', label: 'Community', enabled: false },
  ],
  practice: { pool_percent: 40, test_size: 27, minutes: 32 },
  about: {
    title: 'About SAT Ustoz',
    intro: 'SAT Ustoz is an online platform for SAT Reading & Writing. Students from Uzbekistan learn step by step — from 200 to 800 — with video lessons, clear notes, practice with instant feedback and real exam-style tests.',
    points: [
      { emoji: '🗺️', title: 'A clear roadmap', text: 'Lessons open one by one, so a student always knows what to study next.' },
      { emoji: '🎯', title: 'Original SAT-style questions', text: 'Written for SAT Ustoz, every question has an explanation and an Ustoz tip.' },
      { emoji: '📊', title: 'Progress you can see', text: 'Score estimates, skill breakdowns and the teacher watching every result.' },
    ],
    founder_name: 'Axror Alimjon',
    founder_role: 'Founder · SAT teacher',
    founder_bio: 'I created SAT Ustoz so that every student in Uzbekistan can prepare for the SAT with a real teacher’s method — not just random tests. Follow me on Instagram and Telegram for SAT tips, results of my students and news about new lessons.',
    photo_url: '',
    instagram: 'https://www.instagram.com/ahroralimjon',
    telegram: 'https://t.me/ahroralimjon_life',
    show_on_home: true,
  },
};
const DEFAULT_PAGES = [
  { section: 'guides', slug: 'digital-sat-format', emoji: '🧭', title: 'Digital SAT format', summary: 'Modules, timing and what the Reading & Writing section looks like.',
    body: '## Reading and Writing\n\nThe section has **2 modules**. Each module has **27 questions** and **32 minutes**.\n\n- Module 1 is the same difficulty for everyone.\n- Module 2 is easier or harder depending on how you did in Module 1.\n\n## Question types\n\nInformation and Ideas, Craft and Structure, Expression of Ideas, Standard English Conventions.' },
  { section: 'guides', slug: 'good-sat-score', emoji: '🎯', title: 'What is a good SAT score?', summary: 'How scores work and what to aim for.',
    body: 'Each section is scored from **200 to 800**. A total of 1200+ is above average; 1400+ opens most top universities.\n\nTake a free practice test to see where you are now.' },
  { section: 'courses', slug: 'writing-part-1-clauses', emoji: '✍️', title: 'Writing Part 1: Clauses', summary: 'Standard English Conventions — sentences, clauses and punctuation.',
    body: 'Eight short lessons with video, notes and level checks, plus 25 SAT words.\n\nCreate a free account to start the first two lessons.' },
];

const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
export async function getBlock(key) {
  const r = await db.one('SELECT data FROM site_blocks WHERE key = ?', [key]);
  const def = DEFAULT_BLOCKS[key];
  const v = r ? parse(r.data, def) : def;
  return Array.isArray(def) ? v : { ...def, ...v };
}
async function setBlock(key, data) {
  await db.run('INSERT INTO site_blocks (key, data, updated_at) VALUES (?, ?, now()) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [key, JSON.stringify(data)]);
}

/** First start: example pages so the menu is not empty (only when there are none). */
export async function seedSite() {
  const n = await db.one('SELECT COUNT(*) AS n FROM site_pages');
  if (Number(n.n)) return;
  for (const [i, p] of DEFAULT_PAGES.entries()) {
    await db.run('INSERT INTO site_pages (section, slug, title, summary, body, emoji, position) VALUES (?,?,?,?,?,?,?) ON CONFLICT (slug) DO NOTHING', [p.section, p.slug, p.title, p.summary, p.body, p.emoji, i]);
  }
}

// ---------- practice tests ----------
const LETTERS = 4;
const pubQ = (q) => ({ id: q.id, domain: q.domain, skill_id: q.skill_id, skill: q.skill, difficulty: q.difficulty, passage: q.passage, table: parse(q.data_table, null), prompt: q.prompt, options: parse(q.options, []) });
const cleanSeed = (s) => String(s || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || 'x';

/** The visible pool for one visit: a stable random part (pool_percent %) of the active bank. */
async function poolIds(seed, cfg) {
  const total = Number((await db.one('SELECT COUNT(*) AS n FROM qbank_questions WHERE active')).n);
  const size = Math.max(Math.min(total, cfg.test_size), Math.ceil((total * Math.min(100, Math.max(10, cfg.pool_percent))) / 100));
  const rows = await db.all('SELECT id FROM qbank_questions WHERE active ORDER BY md5(id || ?) LIMIT ?', [seed, size]);
  return { ids: rows.map((r) => r.id), total };
}

function optionalUser(SECRET) {
  return (req) => {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return null;
    try { return jwt.verify(h.slice(7), SECRET()); } catch { return null; }
  };
}

/** Rough SAT R&W scaled score from the share of correct answers (estimate only). */
const estimate = (pct) => Math.round((200 + 600 * Math.pow(pct, 0.9)) / 10) * 10;

export function registerSitePublic(app, { h, bad, secret }) {
  const who = optionalUser(secret);

  app.get('/api/public/site', h(async (req, res) => {
    const [home, faq, sections, practice, about] = await Promise.all(['home', 'faq', 'sections', 'practice', 'about'].map(getBlock));
    const pages = await db.all('SELECT id, section, slug, title, summary, emoji FROM site_pages WHERE published ORDER BY section, position, id');
    const q = await db.one('SELECT COUNT(*) AS n FROM qbank_questions WHERE active');
    const st = await db.one("SELECT COUNT(*) AS n FROM users WHERE role = 'student'");
    const tests = await db.one('SELECT COUNT(*) AS n FROM practice_sessions WHERE finished_at IS NOT NULL');
    res.json({ home, faq, about, sections: sections.filter((s) => s.enabled), pages, practice,
      counts: { questions: Number(q.n), students: Number(st.n), tests: Number(tests.n), skills: DOMAINS.reduce((s, d) => s + d.skills.length, 0) } });
  }));

  app.get('/api/public/pages/:slug', h(async (req, res) => {
    const p = await db.one('SELECT * FROM site_pages WHERE slug = ? AND published', [req.params.slug]);
    if (!p) return bad(res, 'Page not found', 404);
    res.json(p);
  }));

  // what this visit can practise: domains → skills with counts inside the visible pool
  app.get('/api/public/practice', h(async (req, res) => {
    const cfg = await getBlock('practice');
    const seed = cleanSeed(req.query.seed);
    const { ids, total } = await poolIds(seed, cfg);
    const rows = ids.length ? await db.all('SELECT skill_id, difficulty, COUNT(*) AS n FROM qbank_questions WHERE id = ANY(?::text[]) GROUP BY skill_id, difficulty', [ids]) : [];
    const domains = DOMAINS.map((d) => ({
      domain: d.domain,
      skills: d.skills.map(([id, name]) => {
        const per = Object.fromEntries(['easy', 'medium', 'hard'].map((l) => [l, Number(rows.find((r) => r.skill_id === id && r.difficulty === l)?.n || 0)]));
        return { id, name, per, n: per.easy + per.medium + per.hard };
      }),
    }));
    const u = who(req);
    const recent = u ? await db.all('SELECT id, score, total, finished_at FROM practice_sessions WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 5', [u.id]) : [];
    res.json({ seed, visible: ids.length, total, percent: cfg.pool_percent, test_size: cfg.test_size, minutes: cfg.minutes, domains, recent });
  }));

  // start a test: up to test_size random questions from this visit's pool, after filters
  app.post('/api/public/practice/start', h(async (req, res) => {
    const cfg = await getBlock('practice');
    const seed = cleanSeed(req.body?.seed);
    const { ids } = await poolIds(seed, cfg);
    const skills = (Array.isArray(req.body?.skills) ? req.body.skills : []).map(String).slice(0, 20);
    const levels = (Array.isArray(req.body?.levels) ? req.body.levels : []).filter((l) => ['easy', 'medium', 'hard'].includes(l));
    const rows = await db.all(`SELECT * FROM qbank_questions WHERE active AND id = ANY(?::text[])
      ${skills.length ? 'AND skill_id = ANY(?::text[])' : ''} ${levels.length ? 'AND difficulty = ANY(?::text[])' : ''}
      ORDER BY random() LIMIT ?`, [ids, ...(skills.length ? [skills] : []), ...(levels.length ? [levels] : []), cfg.test_size]);
    if (rows.length < 3) return bad(res, 'Not enough questions for these filters today — choose more skills or levels.');
    // SAT order: by domain the way the real module goes
    const order = new Map(DOMAINS.map((d, i) => [d.domain, i]));
    rows.sort((a, b) => (order.get(a.domain) ?? 9) - (order.get(b.domain) ?? 9));
    const id = crypto.randomBytes(9).toString('base64url');
    const u = who(req);
    await db.run('INSERT INTO practice_sessions (id, user_id, question_ids, filters, total) VALUES (?,?,?,?,?)',
      [id, u?.id || null, JSON.stringify(rows.map((r) => r.id)), JSON.stringify({ skills, levels }), rows.length]);
    res.json({ id, minutes: Math.max(5, Math.round((cfg.minutes * rows.length) / cfg.test_size)), questions: rows.map(pubQ) });
  }));

  // finish: answers → score, estimate, per-skill result and the full review
  app.post('/api/public/practice/:id/submit', h(async (req, res) => {
    const s = await db.one('SELECT * FROM practice_sessions WHERE id = ?', [req.params.id]);
    if (!s) return bad(res, 'Test not found', 404);
    const ids = parse(s.question_ids, []);
    const qs = await db.all('SELECT * FROM qbank_questions WHERE id = ANY(?::text[])', [ids]);
    const by = new Map(qs.map((q) => [q.id, q]));
    const given = s.finished_at ? parse(s.answers, {}) : (req.body?.answers || {});
    const review = ids.map((qid) => by.get(qid)).filter(Boolean).map((q) => {
      const c = Number.isInteger(given[q.id]) && given[q.id] >= 0 && given[q.id] < LETTERS ? given[q.id] : null;
      return { ...pubQ(q), choice: c, answer: q.answer, correct: c === q.answer, explanation: q.explanation, tip: q.tip };
    });
    const score = review.filter((r) => r.correct).length;
    if (!s.finished_at) {
      const u = who(req);
      await db.run('UPDATE practice_sessions SET answers = ?, score = ?, finished_at = now(), user_id = COALESCE(user_id, ?) WHERE id = ?', [JSON.stringify(given), score, u?.id || null, s.id]);
    }
    const skills = {};
    for (const r of review) { const k = (skills[r.skill] ||= { skill: r.skill, domain: r.domain, n: 0, ok: 0 }); k.n++; k.ok += r.correct ? 1 : 0; }
    const pct = review.length ? score / review.length : 0;
    res.json({ id: s.id, score, total: review.length, percent: Math.round(pct * 100), estimate: estimate(pct), skills: Object.values(skills), review });
  }));
}

export function registerSiteAdmin(app, { h, bad, requireMaster }) {
  const KEYS = Object.keys(DEFAULT_BLOCKS);
  app.get('/api/site/admin', requireMaster, h(async (req, res) => {
    const blocks = Object.fromEntries(await Promise.all(KEYS.map(async (k) => [k, await getBlock(k)])));
    const pages = await db.all('SELECT * FROM site_pages ORDER BY section, position, id');
    const stats = await db.one(`SELECT COUNT(*) AS started, SUM(CASE WHEN finished_at IS NOT NULL THEN 1 ELSE 0 END) AS finished,
      SUM(CASE WHEN finished_at IS NOT NULL AND user_id IS NULL THEN 1 ELSE 0 END) AS guests,
      AVG(CASE WHEN finished_at IS NOT NULL AND total > 0 THEN score * 100.0 / total END) AS avg_pct,
      SUM(CASE WHEN started_at > now() - interval '7 days' THEN 1 ELSE 0 END) AS week FROM practice_sessions`);
    const bank = await db.one('SELECT COUNT(*) AS n FROM qbank_questions WHERE active');
    res.json({ blocks, pages, stats: { started: Number(stats.started || 0), finished: Number(stats.finished || 0), guests: Number(stats.guests || 0), week: Number(stats.week || 0), avg_pct: stats.avg_pct == null ? null : Math.round(stats.avg_pct), bank: Number(bank.n) } });
  }));
  app.put('/api/site/blocks/:key', requireMaster, h(async (req, res) => {
    const key = req.params.key;
    if (!KEYS.includes(key)) return bad(res, 'Unknown block');
    let data = req.body?.data;
    if (key === 'practice') {
      const n = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(Number(v) || d)));
      data = { pool_percent: n(data?.pool_percent, 10, 100, 40), test_size: n(data?.test_size, 5, 60, 27), minutes: n(data?.minutes, 5, 120, 32) };
    }
    if (key === 'about' && data) {
      for (const f of ['instagram', 'telegram', 'photo_url']) {
        const v = String(data[f] || '').trim();
        if (v && !/^https?:\/\//i.test(v)) return bad(res, `“${f}” must be a link starting with https://`);
        data[f] = v;
      }
    }
    if (Array.isArray(DEFAULT_BLOCKS[key]) !== Array.isArray(data)) return bad(res, 'Wrong format');
    if (JSON.stringify(data).length > 200_000) return bad(res, 'Too much text');
    await setBlock(key, data);
    res.json({ ok: true, data: await getBlock(key) });
  }));
  app.post('/api/site/blocks/:key/reset', requireMaster, h(async (req, res) => {
    await db.run('DELETE FROM site_blocks WHERE key = ?', [req.params.key]);
    res.json({ ok: true, data: await getBlock(req.params.key) });
  }));

  const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';
  const body = (b) => {
    const title = String(b?.title || '').trim().slice(0, 160);
    if (!title) throw Object.assign(new Error('Title is required'), { status: 400 });
    return [String(b.section || 'guides').slice(0, 40), title, String(b.summary || '').slice(0, 400), String(b.body || '').slice(0, 60_000),
      String(b.emoji || '').slice(0, 8), String(b.video_url || '').slice(0, 500), b.published !== false, Number(b.position) || 0];
  };
  async function uniqueSlug(want, exceptId) {
    const base = slugify(want);
    for (let i = 0; i < 50; i++) {
      const s = i ? `${base}-${i + 1}` : base;
      const r = await db.one('SELECT id FROM site_pages WHERE slug = ?', [s]);
      if (!r || r.id === exceptId) return s;
    }
    return `${base}-${Date.now()}`;
  }
  app.post('/api/site/pages', requireMaster, h(async (req, res) => {
    const v = body(req.body);
    const slug = await uniqueSlug(req.body?.slug || v[1]);
    const r = await db.run('INSERT INTO site_pages (section, title, summary, body, emoji, video_url, published, position, slug) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id', [...v, slug]);
    res.json({ id: r.id, slug });
  }));
  app.put('/api/site/pages/:id', requireMaster, h(async (req, res) => {
    const id = Number(req.params.id);
    const v = body(req.body);
    const slug = await uniqueSlug(req.body?.slug || v[1], id);
    await db.run('UPDATE site_pages SET section=?, title=?, summary=?, body=?, emoji=?, video_url=?, published=?, position=?, slug=?, updated_at=now() WHERE id=?', [...v, slug, id]);
    res.json({ ok: true, slug });
  }));
  app.delete('/api/site/pages/:id', requireMaster, h(async (req, res) => {
    await db.run('DELETE FROM site_pages WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
  }));
}
