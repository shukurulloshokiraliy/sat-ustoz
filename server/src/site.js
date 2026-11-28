import { tokenPayload } from './auth.js';
import { satScore } from './scoring.js';
import { OFERTA, OFERTA_FREE, OFERTA_OLD_PAID } from './oferta.js';
import { PRIVACY } from './privacy.js';
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
import { db, FREE_PLATFORM } from './db.js';
import { DOMAINS } from './qbank.js';
import { subActive } from './auth.js';
import { clientIp } from './security.js';
import { registerPractice } from './practice.js';

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
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS estimate INTEGER;
CREATE INDEX IF NOT EXISTS idx_practice_ip ON practice_sessions(ip, started_at);
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT 'english';
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'topic';
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS module INTEGER NOT NULL DEFAULT 1;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS route TEXT;
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
    cta_primary: 'Create a free account',
    cta_secondary: 'Take a free practice test',
    cta_note: 'Free for everyone. No payments, ever.',
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
    { q: 'What do I get with a free account?', a: 'Everything: every roadmap lesson and video, the whole Question Bank, full mocks, quizzes and Word Arena. SAT Ustoz is free for everyone.' },
  ],
  sections: [
    { id: 'guides', label: 'Guides', enabled: true },
    { id: 'courses', label: 'Courses', enabled: true },
    { id: 'community', label: 'Community', enabled: false },
  ],
  practice: { pool_percent: 40, test_size: 27, minutes: 32, daily_limit: 100 },
  about: {
    title: 'About SAT Ustoz',
    intro: 'SAT Ustoz is an online platform for SAT Reading & Writing. Students from Uzbekistan learn step by step — from 200 to 800 — with video lessons, clear notes, practice with instant feedback and real exam-style tests.',
    points: [
      { emoji: '🗺️', title: 'A clear roadmap', text: 'Lessons open one by one, so a student always knows what to study next.' },
      { emoji: '🎯', title: 'Original SAT-style questions', text: 'Written for SAT Ustoz, every question has an explanation and an Ustoz tip.' },
      { emoji: '📊', title: 'Progress you can see', text: 'Score estimates, skill breakdowns and the teacher watching every result.' },
    ],
    founder_name: 'Ahror Alimjon',
    founder_role: 'Founder · SAT teacher',
    founder_bio: 'I created SAT Ustoz so that every student in Uzbekistan can prepare for the SAT with a real teacher’s method — not just random tests. Follow me on Instagram and Telegram for SAT tips, results of my students and news about new lessons.',
    photo_url: '/founder.jpg',
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
    body: 'Eight short lessons with video, notes and level checks, plus 25 SAT words.\n\nCreate a free account to start the lessons.' },
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
  // the teacher's name is spelled Ahror (an older default said "Axror"): fix it in saved blocks and pages once
  await db.run("UPDATE site_blocks SET data = replace(data, 'Axror', 'Ahror') WHERE data LIKE '%Axror%'");
  await db.run("UPDATE site_pages SET body = replace(body, 'Axror', 'Ahror'), title = replace(title, 'Axror', 'Ahror'), summary = replace(summary, 'Axror', 'Ahror') WHERE body LIKE '%Axror%' OR title LIKE '%Axror%' OR summary LIKE '%Axror%'");
  // SAT Ustoz became free: old wording about trials and first lessons only, in saved blocks and pages
  for (const [a, b] of [['Start free trial', 'Create a free account'], ['No card needed', 'Free for everyone. No payments, ever.'],
    ['Your results are saved, you get the readiness check and the first roadmap lessons.', 'Everything: every roadmap lesson and video, the whole Question Bank, full mocks, quizzes and Word Arena. SAT Ustoz is free for everyone.'], ['Create a free account to start the first two lessons.', 'Create a free account to start the lessons.']]) {
    await db.run('UPDATE site_blocks SET data = replace(data, ?, ?) WHERE data LIKE ?', [a, b, `%${a}%`]);
    await db.run('UPDATE site_pages SET body = replace(body, ?, ?) WHERE body LIKE ?', [a, b, `%${a}%`]);
  }
  // a daily allowance written into the hero ("Take 100 free practice questions every day…"): practice is unlimited now
  await db.run(`UPDATE site_blocks SET data = regexp_replace(data, 'Take [0-9]+ free practice questions every day to test yourself right now', 'Take unlimited free practice questions right now', 'g') WHERE data ~ 'Take [0-9]+ free practice questions every day'`);
  // the public offer page always exists (the teacher can edit it, it is never overwritten)
  await db.run('INSERT INTO site_pages (section, slug, title, summary, body, emoji, position) VALUES (?,?,?,?,?,?,?) ON CONFLICT (slug) DO NOTHING', [OFERTA.section, OFERTA.slug, OFERTA.title, OFERTA.summary, OFERTA.body, OFERTA.emoji, 999]);
  // the privacy policy page always exists too (App Store and Google sign-in need it); never overwritten
  await db.run('INSERT INTO site_pages (section, slug, title, summary, body, emoji, position) VALUES (?,?,?,?,?,?,?) ON CONFLICT (slug) DO NOTHING', [PRIVACY.section, PRIVACY.slug, PRIVACY.title, PRIVACY.summary, PRIVACY.body, PRIVACY.emoji, 1000]);
  // SAT Ustoz became free: swap the old payment section of the terms for the free one (other edits stay)
  const terms = await db.one("SELECT body FROM site_pages WHERE slug = 'oferta'");
  if (terms?.body?.includes(OFERTA_OLD_PAID.trim())) {
    const body = terms.body.replace(OFERTA_OLD_PAID.trim(), OFERTA_FREE.trim()).replace("4.3. Qoidalar buzilganda akkaunt to'lov qaytarilmasdan bloklanishi mumkin.", '4.3. Qoidalar buzilganda akkaunt bloklanishi mumkin.')
      .replace(", ustozga hisobot berish va to'lovlarni hisobga olish uchun ishlatiladi", ', ustozga hisobot berish uchun ishlatiladi');
    await db.run("UPDATE site_pages SET body = ? WHERE slug = 'oferta'", [body]);
  }
  const n = await db.one('SELECT COUNT(*) AS n FROM site_pages WHERE slug <> ?', ['oferta']);
  if (Number(n.n)) return;
  for (const [i, p] of DEFAULT_PAGES.entries()) {
    await db.run('INSERT INTO site_pages (section, slug, title, summary, body, emoji, position) VALUES (?,?,?,?,?,?,?) ON CONFLICT (slug) DO NOTHING', [p.section, p.slug, p.title, p.summary, p.body, p.emoji, i]);
  }
}

// ---------- practice tests ----------
const LETTERS = 4;
export const pubQ = (q) => ({ id: q.id, domain: q.domain, skill_id: q.skill_id, skill: q.skill, difficulty: q.difficulty, passage: q.passage, table: parse(q.data_table, null), prompt: q.prompt, options: parse(q.options, []) });
export const cleanSeed = (s) => String(s || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || 'x';

/** The visible pool for one visit: a stable random part (pool_percent %) of the active bank. */
export async function poolIds(seed, cfg) {
  const total = Number((await db.one('SELECT COUNT(*) AS n FROM qbank_questions WHERE active AND NOT premium AND reserved_for IS NULL')).n);
  const size = Math.max(Math.min(total, cfg.test_size), Math.ceil((total * Math.min(100, Math.max(10, cfg.pool_percent))) / 100));
  const rows = await db.all('SELECT id FROM qbank_questions WHERE active AND NOT premium AND reserved_for IS NULL ORDER BY md5(id || ?) LIMIT ?', [seed, size]);
  return { ids: rows.map((r) => r.id), total };
}

function optionalUser(SECRET) {
  return (req) => tokenPayload(req);
}


/**
 * Free daily limit: guests and free accounts may answer `daily_limit` practice questions in any 24 hours
 * (rolling window). Subscribers and the teacher are unlimited. Accounts are counted per account (students in one
 * classroom share an IP), guests by a hashed IP.
 */
export const ipKey = (req) => crypto.createHash('sha256').update(`${clientIp(req)}:sat-ustoz`).digest('hex').slice(0, 24);
export async function quota(req, u, cfg) {
  const limit = Number(cfg.daily_limit) || 0;
  let unlimited = FREE_PLATFORM || limit <= 0; // SAT Ustoz is free: practice is unlimited for everyone, guests too
  if (u && !unlimited) {
    const row = await db.one('SELECT role, sub_until FROM users WHERE id = ?', [u.id]);
    unlimited = !!row; // SAT Ustoz is free: every signed-in account is unlimited (only guests have a daily allowance)
  }
  if (unlimited) return { unlimited: true, limit, used: 0, left: Infinity };
  const ip = ipKey(req);
  const r = await db.one(`SELECT COALESCE(SUM(total), 0) AS used, MIN(started_at) AS first FROM practice_sessions
    WHERE started_at > now() - interval '24 hours' AND ${u ? 'user_id = ?' : 'ip = ? AND user_id IS NULL'}`, [u ? u.id : ip]);
  const used = Number(r.used || 0);
  const resets_at = r.first ? new Date(new Date(r.first).getTime() + 24 * 3600e3).toISOString() : null;
  return { unlimited: false, limit, used, left: Math.max(0, limit - used), resets_at };
}
export const pubQuota = (q) => ({ unlimited: q.unlimited, limit: q.limit, used: q.used, left: q.unlimited ? null : q.left, resets_at: q.resets_at || null });

export function registerSitePublic(app, { h, bad, secret }) {
  const who = optionalUser(secret);

  app.get('/api/public/site', h(async (req, res) => {
    const [home, faq, sections, practice, about] = await Promise.all(['home', 'faq', 'sections', 'practice', 'about'].map(getBlock));
    const pages = await db.all('SELECT id, section, slug, title, summary, emoji FROM site_pages WHERE published ORDER BY section, position, id');
    const q = await db.one('SELECT COUNT(*) AS n FROM qbank_questions WHERE active AND NOT premium AND reserved_for IS NULL');
    const st = await db.one("SELECT COUNT(*) AS n FROM users WHERE role = 'student'");
    const tests = await db.one('SELECT COUNT(*) AS n FROM practice_sessions WHERE finished_at IS NOT NULL');
    const en = await db.one('SELECT COUNT(*) AS n FROM qbank_questions WHERE active');
    const mt = await db.one('SELECT COUNT(*) AS n FROM math_questions WHERE active').catch(() => ({ n: 0 }));
    res.json({ home, faq, about, sections: sections.filter((s) => s.enabled), pages, practice,
      counts: { questions: Number(q.n), english: Number(en.n), math: Number(mt.n), students: Number(st.n), tests: Number(tests.n), skills: DOMAINS.reduce((s, d) => s + d.skills.length, 0) } });
  }));

  app.get('/api/public/pages/:slug', h(async (req, res) => {
    const p = await db.one('SELECT * FROM site_pages WHERE slug = ? AND published', [req.params.slug]);
    if (!p) return bad(res, 'Page not found', 404);
    res.json(p);
  }));

  registerPractice(app, { h, bad, who });
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
    const bank = await db.one('SELECT COUNT(*) AS n FROM qbank_questions WHERE active AND NOT premium AND reserved_for IS NULL');
    res.json({ blocks, pages, stats: { started: Number(stats.started || 0), finished: Number(stats.finished || 0), guests: Number(stats.guests || 0), week: Number(stats.week || 0), avg_pct: stats.avg_pct == null ? null : Math.round(stats.avg_pct), bank: Number(bank.n) } });
  }));
  app.put('/api/site/blocks/:key', requireMaster, h(async (req, res) => {
    const key = req.params.key;
    if (!KEYS.includes(key)) return bad(res, 'Unknown block');
    let data = req.body?.data;
    if (key === 'practice') {
      const n = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(Number(v) || d)));
      data = { pool_percent: n(data?.pool_percent, 10, 100, 40), test_size: n(data?.test_size, 5, 60, 27), minutes: n(data?.minutes, 5, 120, 32), daily_limit: Math.min(5000, Math.max(0, Math.round(Number(data?.daily_limit ?? 100)))) };
    }
    if (key === 'about' && data) {
      for (const f of ['instagram', 'telegram', 'photo_url']) {
        const v = String(data[f] || '').trim();
        if (v && !/^(https?:\/\/|\/[\w./-]+$)/i.test(v)) return bad(res, `${{ instagram: 'Instagram', telegram: 'Telegram', photo_url: 'Photo' }[f]} link must start with https://`);
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
