import express from 'express';
import cors from 'cors';
import { corsOptions, securityHeaders, rateLimit, migrateSecurity, audit, weakPassword, clientIp } from './security.js';
import multer from 'multer';
import compression from 'compression';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, migrate, getSettings, setSettings, DB_KIND } from './db.js';
import { notifyAdmins } from './tgbot.js';
import { initSecret, signToken, publicUser, requireAuth, requireMaster, requireStudent, subActive, verifyGoogleCredential } from './auth.js';
import { parseUpload, buildTemplate, DEFAULT_PROMPT } from './parse.js';
import { userAnalytics, estimateScore } from './analytics.js';
import { SAT_DATES, isSatDate } from './satDates.js';
import { seed } from './seed.js';
import { registerPlacement } from './placement/routes.js';
import { lessonSummary, syncBundledModules } from './course/modules.js';
import { registerLessons, migrateLessonEdits } from './course/lessons.js';
import { registerQbank, syncQbank, migrateQbankMocks, randomCfg } from './qbank.js';
import { registerFullMocks, migrateFullMocks } from './fullmock.js';
import { registerVideo, playUrl, isBunny } from './video.js';
import { migrateGifs, registerGifs } from './gifs.js';
import { migrateFinance, registerFinance, keepPaymentRecords } from './finance.js';
import { migrateDrip, registerDrip, unlocksFor, dripDays } from './drip.js';
import { migrateLive, registerLive } from './live.js';
import { migrateReview, registerReview } from './review.js';
import { migrateCalib } from './calibrate.js';
import { registerQuality } from './quality.js';
import { migrateAssignments, registerAssignments, assignedQuizOpen } from './assignments.js';
import { migrateReserved, registerReserved, scanReserved, scanSoon } from './reserved.js';
import { registerProgress } from './progress.js';
import { migrateMistakes, registerMistakes } from './mistakes.js';
import { migrateFocus, registerFocus, penaltyOf, focusSummary } from './focus.js';
import { migratePictures, registerPictures } from './pictures.js';
import { readTiers, registerTiers, migrateTiers, tierOf, cleanTiers, usedToday, usageOf, meterAnswers, limitError, tooManyFails, noteFail, clearFails, moveBalance } from './tiers.js';
import { migrateVocab, registerVocab, syncVocab } from './vocab.js';
import { migrateGame, registerGame } from './game.js';
import { migrateSite, seedSite, registerSitePublic, registerSiteAdmin } from './site.js';
import { getSecret } from './auth.js';
import { migrateBot, registerBot, registerBotAdmin } from './tgbot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg, code = 400, extra = {}) => res.status(code).json({ error: msg, ...extra });
class HttpError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(securityHeaders);
// gzip for pages, scripts and JSON (students are mostly on mobile data); Vercel's CDN also compresses static files
app.use(compression({ threshold: 1024 }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
// floods and scripted guessing: a general cap per IP, a tight one on sign-in / sign-up
app.use('/api', rateLimit({ windowMs: 60e3, max: 600 }));
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/google'], rateLimit({ windowMs: 10 * 60e3, max: 40, message: 'Too many sign-in attempts from this network. Wait 10 minutes.' }));
app.use(['/api/me/password', '/api/plans/buy', '/api/full-mocks', '/api/students'], rateLimit({ windowMs: 60e3, max: 120 }));

/** Fingerprint of the bundled content: when it has not changed, start-up skips the content sync (fast cold starts on Vercel). */
function contentHash() {
  const hash = crypto.createHash('sha1');
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p); else { hash.update(p.slice(dir.length)); hash.update(String(fs.statSync(p).size)); hash.update(fs.readFileSync(p)); }
    }
  };
  walk(path.join(__dirname, 'content'));
  hash.update(fs.readFileSync(path.join(__dirname, 'course', 'modules.js')));
  hash.update(fs.readFileSync(path.join(__dirname, 'qbank.js')));
  hash.update(fs.readFileSync(path.join(__dirname, 'vocab.js')));
  return hash.digest('hex');
}
await migrate();
await migrateSite();
await migrateBot();
await migrateVocab();
await migrateQbankMocks();
await migrateFullMocks();
await migrateGifs();
await migrateLessonEdits();
await migrateFinance();
await migrateAssignments();
await migrateReserved();
await migrateMistakes();
await migrateFocus();
await migratePictures();
// roadmap history starts with today's roadmap, so even the first change can be undone
if (!(await db.one('SELECT 1 AS x FROM roadmap_versions LIMIT 1'))) setTimeout(() => rmVersion({ user: { id: null, name: 'System' } }, 'Starting point'), 0);
// keep exam questions out of practice: the first start scans every quiz and lesson check once
if (!(await db.one("SELECT 1 AS x FROM settings WHERE key = '_reserved_v1'"))) {
  await scanReserved().catch((e) => console.error('[reserved]', e.message));
  await db.run("INSERT INTO settings (key, value) VALUES ('_reserved_v1', '1') ON CONFLICT (key) DO NOTHING");
}
await migrateTiers();
await keepPaymentRecords();
await migrateDrip();
await migrateLive();
await migrateReview();
await migrateCalib();
await migrateSecurity();
await db.exec(`
CREATE TABLE IF NOT EXISTS user_activity (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, day DATE NOT NULL, section TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day, section)
);
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;
`);
await migrateGame();
await initSecret();
await seedSite();
const seeded = await seed();
const fingerprint = contentHash();
const synced = await db.one("SELECT value FROM settings WHERE key = '_content_hash'");
if (seeded || synced?.value !== fingerprint) {
  await syncBundledModules();
  await syncQbank();
  await syncVocab();
  await db.run("INSERT INTO settings (key, value) VALUES ('_content_hash', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [fingerprint]);
}
if (seeded) console.log(`[seed] Teacher login: ${seeded.masterLogin}${process.env.VERCEL ? '' : ` / ${seeded.masterPass}  |  demo student: shukurullo / student123`}`);
console.log(`[db] ${DB_KIND === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'embedded PGlite (local)'}`);

// ---------- helpers ----------
const genPassword = () => crypto.randomBytes(5).toString('hex'); // 10 chars
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'student';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** One mailbox = one account: Gmail ignores dots and “+tags”, so t.est+1@gmail.com is the same as test@gmail.com. */
const canonEmail = (e) => {
  const [local = '', domain = ''] = String(e || '').trim().toLowerCase().split('@');
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
  return `${local.split('+')[0]}@${domain}`;
};
async function emailTaken(email) {
  const c = canonEmail(email);
  const [, domain] = c.split('@');
  const rows = await db.all("SELECT email, login FROM users WHERE email ILIKE ? OR email ILIKE ? OR login ILIKE ?", [`%@${domain}`, '%@googlemail.com', `%@${domain}`]);
  return rows.some((r) => canonEmail(r.email || '') === c || canonEmail(r.login || '') === c);
}
async function uniqueLogin(name) {
  const base = slug(name);
  for (let i = 0; i < 50; i++) {
    const login = i === 0 ? base : base + Math.floor(100 + Math.random() * 900);
    if (!(await db.one('SELECT 1 AS x FROM users WHERE login = ?', [login]))) return login;
  }
  return base + Date.now().toString().slice(-5);
}
const LETTERS = ['A', 'B', 'C', 'D'];
const qPublic = (q) => ({
  id: q.id, position: q.position, passage: q.passage, prompt: q.prompt,
  options: LETTERS.map((L) => ({ key: L, text: q['opt_' + L.toLowerCase()] })).filter((o) => o.text !== ''),
  topic: q.topic,
});
const qFull = (q) => ({ ...qPublic(q), correct: q.correct, explanation: q.explanation, tip: q.tip || '' });
const reveal = (q) => ({ correct: q.correct, explanation: q.explanation, tip: q.tip || '' });

function validateQuestions(list) {
  if (!Array.isArray(list) || !list.length) throw new HttpError('Add at least one question');
  list.forEach((q, i) => {
    const n = i + 1;
    if (!String(q.passage || '').trim() && !String(q.prompt || '').trim()) throw new HttpError(`Question ${n} is empty`);
    if (!LETTERS.includes(String(q.correct || '').toUpperCase())) throw new HttpError(`Question ${n}: the correct answer (A/B/C/D) is not set`);
    const filled = LETTERS.filter((L) => String(q['opt_' + L.toLowerCase()] || '').trim());
    if (filled.length < 2) throw new HttpError(`Question ${n} needs at least 2 options`);
    if (!filled.includes(String(q.correct).toUpperCase())) throw new HttpError(`Question ${n}: the correct answer points to an empty option`);
  });
}
const cleanQ = (q) => ({
  passage: String(q.passage || '').trim(),
  prompt: String(q.prompt || '').trim() || DEFAULT_PROMPT,
  opt_a: String(q.opt_a || '').trim(), opt_b: String(q.opt_b || '').trim(),
  opt_c: String(q.opt_c || '').trim(), opt_d: String(q.opt_d || '').trim(),
  correct: String(q.correct).toUpperCase(),
  explanation: String(q.explanation || '').trim(),
  tip: String(q.tip || '').trim().slice(0, 1000),
  topic: String(q.topic || '').trim() || 'General',
});

/** What a student may do right now. Every new student takes the placement test first. */
async function accessFor(user, settings) {
  settings ||= await getSettings();
  const required = settings.require_subscription === 'true';
  const tier = tierOf(user, settings);
  const open = user.role === 'master' || !required;
  return {
    subscription_required: required,
    sub_active: subActive(user),
    tier: { id: tier.id, name: tier.name, q_day: open ? 0 : tier.q_day, quiz_day: open ? 0 : tier.quiz_day, fm_week: tier.fm_week, consult_days: tier.consult_days, consult_min: tier.consult_min },
    roadmap: open || tier.roadmap,
    video: open || tier.video,
    ask: user.role === 'master' || tier.ask,
    live: user.role === 'master' || tier.live,
    can_practice: open || subActive(user),
    needs_placement: user.role === 'student' && !user.placement_at,
    needs_diagnostic: user.role === 'student' && !user.placement_at, // kept for older clients
  };
}
async function mepayload(user) {
  const group = user.group_id ? await db.one('SELECT id, name FROM groups WHERE id = ?', [user.group_id]) : null;
  return { ...publicUser(user), group, access: await accessFor(user), usage: await usageOf(user) };
}

// ---------- public ----------
app.get('/api/config', h(async (req, res) => {
  const s = await getSettings();
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || s.google_client_id || '',
    google: !!(process.env.GOOGLE_CLIENT_ID || s.google_client_id),
    telegram_bot: s.telegram_bot,
    prices: { month: +s.price_month || 0, quarter: +s.price_quarter || 0, currency: s.currency },
    tiers: readTiers(s), free: tierOf({ role: 'student' }, s), fm_extra_price: Number(s.fm_extra_price) || 0, quiz_extra_price: Number(s.quiz_extra_price) || 0,
  });
}));

// ---------- auth ----------
const TERMS_MSG = 'Please accept the terms of use (oferta) to continue';

app.post('/api/auth/login', h(async (req, res) => {
  const { login, password } = req.body || {};
  const id = String(login || '').trim().toLowerCase();
  const failKey = `login:${id}`;
  if (id && (await tooManyFails(failKey))) return bad(res, 'Too many wrong passwords. Wait 15 minutes and try again.', 429);
  const u = id && (await db.one('SELECT * FROM users WHERE login = ? OR email = ?', [id, id]));
  if (!u || !u.password_hash || !bcrypt.compareSync(String(password || ''), u.password_hash)) {
    if (id && u?.password_hash) await noteFail(failKey);
    if (u?.role === 'master') { await audit(req, 'login_failed', `teacher ${u.id}`); notifyAdmins(`⚠️ Teacher sign-in failed (wrong password). IP: ${clientIp(req)}`); }
    return bad(res, u && !u.password_hash ? 'This account uses Google — tap “Continue with Google”' : 'Incorrect login or password', 401);
  }
  await clearFails(failKey);
  if (u.role === 'master') {
    const seen = await db.one("SELECT 1 AS x FROM audit_log WHERE action = 'login' AND actor_id = ? AND ip = ? LIMIT 1", [u.id, clientIp(req)]);
    await audit({ ...req, user: u }, 'login', `teacher ${u.id}`);
    if (!seen) notifyAdmins(`🔐 Teacher account signed in from a new network. IP: ${clientIp(req)}. If this was not you, change the password and press “Sign out everywhere”.`);
  }
  await db.run('UPDATE users SET last_login_at = now() WHERE id = ?', [u.id]);
  res.json({ token: signToken(u) });
}));

app.post('/api/auth/register', h(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (req.body?.accept_terms !== true) return bad(res, TERMS_MSG);
  if (name.split(/\s+/).filter((w) => w.length >= 2).length < 2) return bad(res, 'Please enter your real first and last name (e.g. Aziz Karimov)');
  if (!EMAIL_RE.test(email)) return bad(res, 'Please enter a valid email');
  const weak = weakPassword(password, { name, email });
  if (weak) return bad(res, weak);
  if (await emailTaken(email)) return bad(res, 'An account with this email already exists — sign in instead (or use “Continue with Google”)', 409);
  // hosted without MASTER_PASSWORD: the owner's email (MASTER_EMAIL) becomes the teacher on first sign-up
  const owner = process.env.MASTER_EMAIL && email === process.env.MASTER_EMAIL.trim().toLowerCase()
    && !(await db.one("SELECT 1 AS x FROM users WHERE role = 'master'"));
  const role = owner ? 'master' : 'student';
  const r = await db.run(
    "INSERT INTO users (name, login, email, password_hash, role, provider, last_login_at, terms_accepted_at) VALUES (?,?,?,?,?,?, now(), now()) RETURNING id",
    [name, email, email, bcrypt.hashSync(password, 12), role, owner ? 'teacher' : 'email']
  );
  res.json({ token: signToken({ id: r.id, role }) });
}));

app.post('/api/auth/google', h(async (req, res) => {
  const g = await verifyGoogleCredential(req.body?.credential, (await getSettings()).google_client_id);
  let u = await db.one('SELECT * FROM users WHERE email = ? OR login = ?', [g.email, g.email]);
  if (!u && (await emailTaken(g.email))) {
    // same Gmail written with dots / +tag on the website account → sign in to that account
    const all = await db.all("SELECT * FROM users WHERE email ILIKE '%@gmail.com' OR email ILIKE '%@googlemail.com'");
    u = all.find((x) => canonEmail(x.email) === canonEmail(g.email)) || null;
  }
  if (u) {
    await db.run("UPDATE users SET last_login_at = now(), avatar_url = CASE WHEN avatar_url = '' THEN ? ELSE avatar_url END WHERE id = ?", [g.avatar, u.id]);
  } else {
    // a new account: the oferta is accepted once, when the account is created
    if (req.body?.accept_terms !== true) return bad(res, 'New account: tick “I agree to the oferta” to create it', 400, { code: 'terms_required' });
    const r = await db.run(
      "INSERT INTO users (name, login, email, password_hash, role, provider, avatar_url, last_login_at, terms_accepted_at) VALUES (?,?,?,NULL,'student','google',?, now(), now()) RETURNING id, role",
      [g.name, g.email, g.email, g.avatar]
    );
    u = { id: r.id, role: 'student' };
  }
  res.json({ token: signToken(u) });
}));

// public website: home content, guide pages and free practice tests (no sign-in)
registerSitePublic(app, { h, bad, secret: getSecret });
registerBot(app, { h, bad });
registerGame(app, { h, bad, accessFor: (u) => accessFor(u) }); // Word Arena: guests can join with a code

// profile photos: public URLs so <img> tags work without a token
app.get('/api/avatars/:id', h(async (req, res) => {
  const a = await db.one('SELECT data, type FROM user_avatars WHERE user_id = ?', [Number(req.params.id)]);
  if (!a) return res.status(404).end();
  res.set({ 'Content-Type': a.type, 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.send(Buffer.from(a.data));
}));

const PUBLIC = new Set(['/auth/login', '/auth/register', '/auth/google', '/config', '/template.xlsx', '/cron/drip']);
app.use('/api', (req, res, next) => (PUBLIC.has(req.path) && req.path !== '/template.xlsx' ? next() : requireAuth(req, res, next)));
// free daily limit: today's count, and counting one answer the moment it is picked inside a test
app.get('/api/usage', h(async (req, res) => res.json(await usageOf(req.user))));
app.post('/api/usage/answer', requireStudent, h(async (req, res) => {
  const keys = (Array.isArray(req.body?.keys) ? req.body.keys : [req.body?.key]).map(String).filter((k) => /^(qz|fm|lc|wic):[\w:.-]{1,100}$/.test(k)).slice(0, 60);
  const m = await meterAnswers(req.user, keys);
  if (m.refused) throw limitError(m.cap);
  res.json(await usageOf(req.user));
}));

registerSiteAdmin(app, { h, bad, requireMaster });
registerQuality(app, { h, bad, requireMaster });
registerDrip(app, { h, bad, requireMaster, requireStudent, roadmapFor: (u) => roadmapFor(u), accessFor: (u) => accessFor(u) });
registerLive(app, { h, bad, requireMaster, requireStudent });
registerReview(app, { h, bad, requireMaster });
registerBotAdmin(app, { h, bad, requireMaster, requireStudent });
registerVocab(app, { h, bad, requireMaster, requireStudent, accessFor: (u) => accessFor(u) });

registerPlacement(app, { h, bad, requireStudent, requireMaster });
registerLessons(app, { h, bad, requireStudent, requireMaster, roadmapFor: (u) => roadmapFor(u), accessFor: (u) => accessFor(u) });
registerQbank(app, { h, bad, requireStudent, requireMaster, accessFor: (u) => accessFor(u), upload, usedToday,
  itemOpen: async (user, itemId) => (await roadmapFor(user)).steps.some((st) => st.status !== 'locked' && st.items.some((i) => i.id === Number(itemId))) });
registerFullMocks(app, { h, bad, requireStudent, requireMaster, upload });
registerTiers(app, { h, bad, requireStudent, requireMaster });
registerVideo(app, { h, bad, requireMaster });
registerGifs(app, { h, bad, requireMaster });
registerFinance(app, { h, bad, requireMaster });
registerAssignments(app, { h, bad, requireMaster, requireStudent, roadmapFor });
registerReserved(app, { h, bad, requireMaster });
registerProgress(app, { h, bad, requireMaster, roadmapFor, userAnalytics });
registerMistakes(app, { h, bad, requireStudent, requireMaster });
registerFocus(app, { h, bad, requireStudent });
registerPictures(app, { h, bad, requireMaster });

app.get('/api/me', h(async (req, res) => res.json(await mepayload(req.user))));
app.get('/api/sat-dates', (req, res) => res.json(SAT_DATES));

/**
 * Leaderboard: every student ranked by points for the week (Mon–Sun, Tashkent) or all time.
 * 10 points per correct SAT answer (Question Bank, Take a quiz, practice tests, quizzes), 2 per vocabulary
 * review, 5 per correct Word Arena answer, 1 per minute of active study. Only first name + initial is shown.
 */
const WEEK_START = "date_trunc('week', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent'";
const shortName = (n) => { const w = String(n || '').trim().split(/\s+/); return w[0] + (w[1] ? ` ${w[1][0]}.` : ''); };
/** Students ranked by points between `since` and `until` (SQL expressions). */
async function boardRows(since, until, meId) {
  const rng = (col) => `${col} >= ${since} AND ${col} < ${until}`;
  const rows = await db.all(`
    WITH pts AS (
      SELECT user_id, 10 * COUNT(*) AS p FROM qbank_answers WHERE correct AND ${rng('answered_at')} GROUP BY user_id
      UNION ALL SELECT user_id, 10 * SUM(score) FROM practice_sessions WHERE user_id IS NOT NULL AND ${rng('finished_at')} GROUP BY user_id
      UNION ALL SELECT user_id, 10 * SUM(CASE WHEN total > 0 THEN score ELSE 0 END) FROM attempts WHERE ${rng('finished_at')} GROUP BY user_id
      UNION ALL SELECT user_id, 2 * COUNT(*) FROM vocab_progress WHERE ${rng('last_at')} GROUP BY user_id
      UNION ALL SELECT user_id, 5 * SUM(correct) FROM game_players WHERE user_id IS NOT NULL AND ${rng('joined_at')} GROUP BY user_id
      UNION ALL SELECT user_id, SUM(seconds) / 60 FROM user_activity WHERE day >= (${since})::date AND day < (${until})::date GROUP BY user_id
    )
    SELECT u.id, u.name, u.avatar_url, COALESCE(SUM(pts.p), 0) AS points
    FROM users u LEFT JOIN pts ON pts.user_id = u.id
    WHERE u.role = 'student' GROUP BY u.id HAVING COALESCE(SUM(pts.p), 0) > 0 OR u.id = ?
    ORDER BY points DESC, u.id`, [meId || 0]);
  return rows.map((r, i) => ({ rank: i + 1, id: r.id, name: shortName(r.name), avatar_url: r.avatar_url, points: Number(r.points), me: r.id === meId }));
}
const DEFAULT_PRIZES = [{ text: '30 000 so‘m to your wallet', bonus: 30000 }, { text: '20 000 so‘m to your wallet', bonus: 20000 }, { text: '10 000 so‘m to your wallet', bonus: 10000 }];
const readPrizes = (s) => { try { const p = JSON.parse(s.lb_prizes || ''); if (Array.isArray(p)) return p.slice(0, 5); } catch { /* default */ } return DEFAULT_PRIZES; };

app.get('/api/leaderboard', h(async (req, res) => {
  const week = req.query.period !== 'all';
  const list = await boardRows(week ? WEEK_START : "'1970-01-01'::timestamptz", "now() + interval '1 minute'", req.user.id);
  const ranked = list.filter((x) => x.points > 0);
  const me = list.find((x) => x.me) || null;
  // the one just above you, so you know how many points it takes to pass them
  const above = me && me.rank > 1 ? list[me.rank - 2] : null;
  const s = await getSettings();
  const ends = (await db.one(`SELECT (${WEEK_START}) + interval '7 days' AS t`)).t;
  const last = (await boardRows(`(${WEEK_START}) - interval '7 days'`, WEEK_START, 0)).filter((x) => x.points > 0).slice(0, 3);
  const wk = (await db.one(`SELECT to_char((${WEEK_START}) - interval '7 days', 'YYYY-MM-DD') AS d`)).d;
  const paid = new Set((await db.all('SELECT ref FROM balance_ledger WHERE ref LIKE ?', [`lb:${wk}:%`])).map((r) => r.ref));
  res.json({
    period: week ? 'week' : 'all', total: ranked.length, top: list.slice(0, 50), me,
    chase: above && me.points >= 0 ? { name: above.name, rank: above.rank, gap: above.points - me.points + 1 } : null,
    prizes: readPrizes(s), prize_note: s.lb_prize_note || '', ends_at: ends,
    last_week: { week: wk, winners: last.map((x, i) => ({ ...x, awarded: paid.has(`lb:${wk}:${i + 1}`) })) },
  });
}));
app.put('/api/leaderboard/prizes', requireMaster, h(async (req, res) => {
  const prizes = (Array.isArray(req.body?.prizes) ? req.body.prizes : []).slice(0, 3).map((p) => ({
    text: String(p?.text || '').trim().slice(0, 80), bonus: Math.max(0, Math.min(10_000_000, Math.round(+p?.bonus || 0))),
  }));
  await setSettings({ lb_prizes: JSON.stringify(prizes), lb_prize_note: String(req.body?.note || '').trim().slice(0, 200) });
  res.json({ prizes, note: String(req.body?.note || '').trim().slice(0, 200) });
}));
// teacher: pay last week's wallet prizes (each place once — the ledger ref stops double payments)
app.post('/api/leaderboard/award', requireMaster, h(async (req, res) => {
  const s = await getSettings();
  const prizes = readPrizes(s);
  const wk = (await db.one(`SELECT to_char((${WEEK_START}) - interval '7 days', 'YYYY-MM-DD') AS d`)).d;
  const last = (await boardRows(`(${WEEK_START}) - interval '7 days'`, WEEK_START, 0)).filter((x) => x.points > 0).slice(0, 3);
  let n = 0;
  for (let i = 0; i < last.length; i++) {
    const bonus = prizes[i]?.bonus || 0;
    if (!bonus) continue;
    const ok = await db.tx((t) => moveBalance(t, last[i].id, bonus, 'prize', { note: `Leaderboard #${i + 1} · week of ${wk}`, ref: `lb:${wk}:${i + 1}`, by: req.user.id }));
    if (ok != null) n++;
  }
  audit(req, 'leaderboard_award', wk, `${n} prizes`);
  res.json({ awarded: n });
}));
app.put('/api/me', h(async (req, res) => {
  const { name, target_english, target_math, exam_date } = req.body || {};
  if (exam_date && exam_date !== req.user.exam_date && !isSatDate(exam_date)) return bad(res, 'Choose one of the official SAT test dates.');
  const clamp = (v, d) => (Number.isFinite(+v) ? Math.max(200, Math.min(800, Math.round(+v))) : d);
  await db.run('UPDATE users SET name = ?, target_english = ?, target_math = ?, exam_date = ? WHERE id = ?', [
    String(name || req.user.name).trim() || req.user.name,
    clamp(target_english, req.user.target_english),
    clamp(target_math, req.user.target_math),
    exam_date === undefined ? req.user.exam_date : exam_date || null,
    req.user.id,
  ]);
  res.json(await mepayload(await db.one('SELECT * FROM users WHERE id = ?', [req.user.id])));
}));
// student / teacher: upload or remove a profile photo (the browser sends a small square JPEG/PNG/WebP)
app.post('/api/me/avatar', upload.single('file'), h(async (req, res) => {
  const f = req.file;
  if (!f) return bad(res, 'Choose a photo');
  if (!/^image\/(jpeg|png|webp)$/.test(f.mimetype)) return bad(res, 'Use a JPG, PNG or WebP photo');
  if (f.size > 400 * 1024) return bad(res, 'The photo is too large');
  await db.run(`INSERT INTO user_avatars (user_id, data, type, updated_at) VALUES (?,?,?, now())
    ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, type = EXCLUDED.type, updated_at = now()`, [req.user.id, f.buffer, f.mimetype]);
  await db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [`/api/avatars/${req.user.id}?v=${Date.now().toString(36)}`, req.user.id]);
  res.json(await mepayload(await db.one('SELECT * FROM users WHERE id = ?', [req.user.id])));
}));
app.delete('/api/me/avatar', h(async (req, res) => {
  await db.run('DELETE FROM user_avatars WHERE user_id = ?', [req.user.id]);
  await db.run("UPDATE users SET avatar_url = '' WHERE id = ?", [req.user.id]);
  res.json(await mepayload(await db.one('SELECT * FROM users WHERE id = ?', [req.user.id])));
}));
app.put('/api/me/password', h(async (req, res) => {
  const { current, next } = req.body || {};
  if (req.user.password_hash && !bcrypt.compareSync(String(current || ''), req.user.password_hash)) return bad(res, 'Current password is incorrect');
  const weak = weakPassword(next, { name: req.user.name, email: req.user.email });
  if (weak) return bad(res, weak);
  // a new password ends every other session
  const u = await db.one('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ? RETURNING id, role, token_version', [bcrypt.hashSync(String(next), 12), req.user.id]);
  await audit(req, 'password_changed', `user ${req.user.id}`);
  res.json({ ok: true, token: signToken(u) });
}));
app.post('/api/me/logout-all', h(async (req, res) => {
  const u = await db.one('UPDATE users SET token_version = token_version + 1 WHERE id = ? RETURNING id, role, token_version', [req.user.id]);
  await audit(req, 'logout_all', `user ${req.user.id}`);
  res.json({ token: signToken(u) });
}));
app.get('/api/audit', requireMaster, h(async (req, res) => {
  res.json(await db.all('SELECT id, actor, action, target, detail, ip, at FROM audit_log ORDER BY id DESC LIMIT 100'));
}));

// ---------- settings (teacher) ----------
app.get('/api/settings', requireMaster, h(async (req, res) => {
  const st = await getSettings();
  const secret = (v) => (v ? `••••${String(v).slice(-4)}` : '');
  res.json({ ...st, bunny_api_key: secret(st.bunny_api_key), bunny_token_key: secret(st.bunny_token_key), giphy_key: secret(st.giphy_key), giphy_env: !!process.env.GIPHY_API_KEY, bunny_env: !!process.env.BUNNY_API_KEY, google_configured: !!(process.env.GOOGLE_CLIENT_ID || st.google_client_id), google_env: !!process.env.GOOGLE_CLIENT_ID, database: DB_KIND });
}));
app.put('/api/settings', requireMaster, h(async (req, res) => {
  const b = req.body || {};
  const digits = (v) => String(v ?? '').replace(/\D/g, '').slice(0, 12);
  const patch = {};
  if ('require_subscription' in b) patch.require_subscription = b.require_subscription ? 'true' : 'false';
  if ('price_month' in b) patch.price_month = digits(b.price_month);
  if ('price_quarter' in b) patch.price_quarter = digits(b.price_quarter);
  if ('currency' in b) patch.currency = String(b.currency || 'UZS').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'UZS';
  if ('google_client_id' in b) {
    const id = String(b.google_client_id || '').trim();
    if (id && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) return bad(res, 'Google Client ID looks like 1234-abc.apps.googleusercontent.com');
    patch.google_client_id = id;
  }
  if ('pay_card' in b) patch.pay_card = String(b.pay_card || '').replace(/[^\d ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 23);
  if ('pay_holder' in b) patch.pay_holder = String(b.pay_holder || '').trim().slice(0, 60);
  if ('tiers' in b) patch.tiers = cleanTiers(b.tiers);
  if ('fm_extra_price' in b) patch.fm_extra_price = digits(b.fm_extra_price) || '0';
  if ('focus_penalty' in b) patch.focus_penalty = String(Math.max(0, Math.min(600, Number(digits(b.focus_penalty)) || 0)));
  if ('drip_days' in b) patch.drip_days = String(Math.max(0, Math.min(60, Number(digits(b.drip_days)) || 0)));
  if ('lesson_unlock_price' in b) patch.lesson_unlock_price = String(Math.max(0, Math.min(10_000_000, Number(digits(b.lesson_unlock_price)) || 0)));
  if ('quiz_extra_price' in b) patch.quiz_extra_price = digits(b.quiz_extra_price) || '0';
  if ('free_q_day' in b) patch.free_q_day = String(Math.max(0, Math.min(999, Math.round(+b.free_q_day || 0))));
  if ('bunny_library_id' in b) patch.bunny_library_id = String(b.bunny_library_id || '').replace(/\D/g, '').slice(0, 12);
  for (const k of ['bunny_api_key', 'bunny_token_key', 'giphy_key']) if (k in b && !String(b[k]).startsWith('••••')) patch[k] = String(b[k] || '').trim().replace(/[^\w-]/g, '').slice(0, 100);
  if ('live_link' in b) patch.live_link = /^https?:\/\//i.test(String(b.live_link || '').trim()) ? String(b.live_link).trim().slice(0, 300) : '';
  if ('live_note' in b) patch.live_note = String(b.live_note || '').trim().slice(0, 300);
  for (const k of ['fm_free', 'fm_month', 'fm_quarter']) if (k in b) patch[k] = String(Math.max(0, Math.min(99, Math.round(+b[k] || 0))));
  if ('telegram_bot' in b) patch.telegram_bot = String(b.telegram_bot || '').trim().replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64);
  const out = await setSettings(patch);
  await audit(req, 'settings_changed', '', Object.keys(patch).join(', '));
  res.json({ ...out, bunny_api_key: out.bunny_api_key ? `••••${out.bunny_api_key.slice(-4)}` : '', bunny_token_key: out.bunny_token_key ? `••••${out.bunny_token_key.slice(-4)}` : '', giphy_key: out.giphy_key ? `••••${out.giphy_key.slice(-4)}` : '' });
}));

// ---------- groups (teacher) ----------
app.get('/api/groups', requireMaster, h(async (req, res) => {
  res.json(await db.all(`SELECT g.*, (SELECT COUNT(*) FROM users u WHERE u.group_id = g.id) AS students,
    (SELECT COUNT(*) FROM quiz_groups qg WHERE qg.group_id = g.id) AS quizzes FROM groups g ORDER BY g.name`));
}));
app.post('/api/groups', requireMaster, h(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return bad(res, 'Group name is required');
  if (await db.one('SELECT 1 AS x FROM groups WHERE name = ?', [name])) return bad(res, 'A group with this name already exists');
  const r = await db.run('INSERT INTO groups (name) VALUES (?) RETURNING id', [name]);
  res.json({ id: r.id, name });
}));
app.put('/api/groups/:id', requireMaster, h(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return bad(res, 'Group name is required');
  if (await db.one('SELECT 1 AS x FROM groups WHERE name = ? AND id <> ?', [name, req.params.id])) return bad(res, 'A group with this name already exists');
  await db.run('UPDATE groups SET name = ? WHERE id = ?', [name, req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/groups/:id', requireMaster, h(async (req, res) => {
  await db.run('DELETE FROM groups WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- students (teacher) ----------
const studentRow = `SELECT u.id, u.name, u.login, u.email, u.provider, u.avatar_url, u.group_id, g.name AS group_name, u.target_english, u.target_math,
  u.exam_date, u.created_at, u.last_login_at, u.balance, u.diagnostic_score, u.cefr, u.admitted, u.placement_at, u.sub_until, u.sub_plan,
  (SELECT MAX(finished_at) FROM attempts a WHERE a.user_id = u.id) AS last_active,
  (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.finished_at IS NOT NULL) AS attempts,
  (SELECT COALESCE(SUM(seconds), 0) FROM user_activity x WHERE x.user_id = u.id AND x.day > CURRENT_DATE - 7) AS week_seconds,
  (SELECT MAX(day) FROM user_activity x WHERE x.user_id = u.id) AS last_seen_day
  FROM users u LEFT JOIN groups g ON g.id = u.group_id WHERE u.role = 'student'`;
const withSub = (s) => ({ ...s, sub_active: subActive(s) });
app.get('/api/students', requireMaster, h(async (req, res) => {
  const rows = await db.all(studentRow + ' ORDER BY u.created_at DESC, u.id DESC');
  const out = await Promise.all(rows.map(async (s) => {
    const a = await userAnalytics(s.id);
    return { ...withSub(s), estimates: a.estimates, accuracy: a.totals.accuracy, streak: a.streak };
  }));
  res.json(out);
}));
app.get('/api/students/:id', requireMaster, h(async (req, res) => {
  const s = await db.one(studentRow + ' AND u.id = ?', [req.params.id]);
  if (!s) return bad(res, 'Not found', 404);
  const payments = await db.all('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC', [s.id]);
  res.json({ ...withSub(s), payments });
}));
// time on the platform: the student app sends a ping every ~30 s while the tab is visible and in use
const SECTIONS = ['home', 'lessons', 'quiz', 'practice', 'qbank', 'mock', 'vocab', 'arena', 'placement', 'other'];
app.post('/api/activity', h(async (req, res) => {
  if (req.user.role !== 'student') return res.json({ ok: true });
  const section = SECTIONS.includes(req.body?.section) ? req.body.section : 'other';
  const seconds = Math.max(0, Math.min(60, Math.round(Number(req.body?.seconds) || 0)));
  if (seconds) await db.run(`INSERT INTO user_activity (user_id, day, section, seconds) VALUES (?, (now() AT TIME ZONE 'Asia/Tashkent')::date, ?, ?)
    ON CONFLICT (user_id, day, section) DO UPDATE SET seconds = user_activity.seconds + EXCLUDED.seconds`, [req.user.id, section, seconds]);
  res.json({ ok: true });
}));

// full report for the teacher: everything the student did on the platform
/** Everything one student did on the platform (teacher report and the student's own Results page). */
async function buildReport(id) {
  const num = (v) => Number(v || 0);
  const full = await db.all(`SELECT a.id, a.mock_id, m.title, a.score, a.low, a.high, a.route, a.m1_correct, a.m2_correct, a.m1_total, a.m2_total, a.finished_at
    FROM full_mock_attempts a JOIN full_mocks m ON m.id = a.mock_id WHERE a.user_id = ? AND a.stage = 'done' ORDER BY a.finished_at DESC LIMIT 20`, [id]).catch(() => []);
  const [practice, reviews, time, assigned, qb, qbTot, mocks, vocab, vtests, arena, lessons, checks, quizzes, days] = await Promise.all([
    db.all(`SELECT id, score, total, estimate, finished_at, filters FROM practice_sessions WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 30`, [id]).catch(() => []),
    db.all(`SELECT to_char(last_at, 'YYYY-MM-DD') AS day, COUNT(*) AS n FROM vocab_progress WHERE user_id = ? AND last_at > now() - interval '28 days' GROUP BY 1 ORDER BY 1`, [id]),
    db.all(`SELECT to_char(day, 'YYYY-MM-DD') AS day, section, seconds FROM user_activity WHERE user_id = ? AND day > CURRENT_DATE - 56 ORDER BY day`, [id]),
    db.one(`SELECT COUNT(*) AS n FROM quizzes q WHERE q.is_public OR EXISTS (SELECT 1 FROM quiz_groups qg JOIN users u ON u.group_id = qg.group_id WHERE qg.quiz_id = q.id AND u.id = ?)`, [id]).catch(() => ({ n: 0 })),
    db.all(`SELECT q.domain, q.skill, COUNT(*) AS n, SUM(CASE WHEN a.correct THEN 1 ELSE 0 END) AS ok
      FROM qbank_answers a JOIN qbank_questions q ON q.id = a.question_id WHERE a.user_id = ? GROUP BY q.domain, q.skill ORDER BY q.domain, q.skill`, [id]),
    db.one('SELECT COUNT(*) AS n, SUM(CASE WHEN correct THEN 1 ELSE 0 END) AS ok, MAX(answered_at) AS last FROM qbank_answers WHERE user_id = ?', [id]),
    db.all('SELECT id, score, total, estimate, finished_at FROM qbank_mocks WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 20', [id]),
    db.one(`SELECT SUM(CASE WHEN state = 'review' THEN 1 ELSE 0 END) AS learned, SUM(CASE WHEN state = 'learning' THEN 1 ELSE 0 END) AS learning,
      SUM(CASE WHEN due_at <= now() THEN 1 ELSE 0 END) AS due, MAX(last_at) AS last FROM vocab_progress WHERE user_id = ?`, [id]),
    db.all(`SELECT t.score, t.total, t.created_at, u.title, u.n FROM vocab_tests t LEFT JOIN vocab_units u ON u.id = t.unit_id
      WHERE t.user_id = ? ORDER BY t.created_at DESC LIMIT 20`, [id]),
    db.one(`SELECT COUNT(*) AS games, MAX(p.score) AS best, SUM(p.correct) AS correct, SUM(p.answered) AS answered, MAX(p.joined_at) AS last
      FROM game_players p WHERE p.user_id = ?`, [id]),
    db.one(`SELECT (SELECT COUNT(*) FROM roadmap_items) AS total, (SELECT COUNT(*) FROM roadmap_done WHERE user_id = ?) AS done,
      (SELECT MAX(done_at) FROM roadmap_done WHERE user_id = ?) AS last`, [id, id]),
    db.all(`SELECT c.score, c.total, c.passed, c.finished_at, i.title FROM lesson_checks c JOIN roadmap_items i ON i.id = c.item_id
      WHERE c.user_id = ? AND c.finished_at IS NOT NULL ORDER BY c.finished_at DESC LIMIT 20`, [id]),
    db.all(`SELECT a.id, a.score, a.total, a.finished_at, q.title
      FROM attempts a JOIN quizzes q ON q.id = a.quiz_id WHERE a.user_id = ? AND a.finished_at IS NOT NULL ORDER BY a.finished_at DESC LIMIT 20`, [id]),
    // activity per day for the last 28 days (any answer, card, game, lesson or quiz)
    db.all(`SELECT to_char(d, 'YYYY-MM-DD') AS day, COUNT(*) AS n FROM (
        SELECT answered_at AS d FROM qbank_answers WHERE user_id = ? UNION ALL
        SELECT last_at FROM vocab_progress WHERE user_id = ? AND last_at IS NOT NULL UNION ALL
        SELECT created_at FROM vocab_tests WHERE user_id = ? UNION ALL
        SELECT joined_at FROM game_players WHERE user_id = ? UNION ALL
        SELECT done_at FROM roadmap_done WHERE user_id = ? UNION ALL
        SELECT finished_at FROM attempts WHERE user_id = ? AND finished_at IS NOT NULL UNION ALL
        SELECT finished_at FROM practice_sessions WHERE user_id = ? AND finished_at IS NOT NULL UNION ALL
        SELECT finished_at FROM qbank_mocks WHERE user_id = ? AND finished_at IS NOT NULL UNION ALL
        SELECT at FROM mistake_reviews WHERE user_id = ?
      ) x WHERE d > now() - interval '28 days' GROUP BY 1 ORDER BY 1`, [id, id, id, id, id, id, id, id, id]),
  ]);
  return {
    qbank: { answered: num(qbTot.n), correct: num(qbTot.ok), last: qbTot.last, skills: qb.map((r) => ({ domain: r.domain, skill: r.skill, answered: num(r.n), correct: num(r.ok) })) },
    mocks,
    vocab: { learned: num(vocab.learned), learning: num(vocab.learning), due: num(vocab.due), last: vocab.last, tests: vtests },
    arena: { games: num(arena.games), best: num(arena.best), correct: num(arena.correct), answered: num(arena.answered), last: arena.last },
    lessons: { total: num(lessons.total), done: num(lessons.done), last: lessons.last, checks },
    quizzes,
    days: days.map((d) => ({ day: d.day, n: num(d.n) })),
    time: time.map((t) => ({ day: t.day, section: t.section, seconds: num(t.seconds) })),
    quizzes_available: num(assigned.n),
    practice: practice.map((p) => ({ id: p.id, score: num(p.score), total: num(p.total), estimate: p.estimate == null ? null : num(p.estimate), finished_at: p.finished_at })),
    reviews: reviews.map((r) => ({ day: r.day, n: num(r.n) })),
    full: full.map((f) => ({ ...f, score: num(f.score), low: num(f.low), high: num(f.high), m1_correct: num(f.m1_correct), m2_correct: num(f.m2_correct), m1_total: num(f.m1_total), m2_total: num(f.m2_total) })),
  };
}

app.get('/api/students/:id/report', requireMaster, h(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await db.one("SELECT id FROM users WHERE id = ? AND role = 'student'", [id]))) return bad(res, 'Not found', 404);
  res.json(await buildReport(id));
}));
app.get('/api/me/report', h(async (req, res) => res.json(await buildReport(req.user.id))));
app.post('/api/students', requireMaster, h(async (req, res) => {
  const { name, group_id, login, password } = req.body || {};
  const nm = String(name || '').trim();
  if (!nm) return bad(res, 'Name is required');
  const lg = String(login || '').trim().toLowerCase() || (await uniqueLogin(nm));
  if (await db.one('SELECT 1 AS x FROM users WHERE login = ? OR email = ?', [lg, lg])) return bad(res, 'This login is already taken');
  const pw = String(password || '').trim() || genPassword();
  const r = await db.run("INSERT INTO users (name, login, password_hash, role, provider, group_id) VALUES (?,?,?,'student','teacher',?) RETURNING id",
    [nm, lg, bcrypt.hashSync(pw, 12), group_id || null]);
  res.json({ id: r.id, name: nm, login: lg, password: pw });
}));
app.put('/api/students/:id', requireMaster, h(async (req, res) => {
  const s = await db.one("SELECT * FROM users WHERE id = ? AND role = 'student'", [req.params.id]);
  if (!s) return bad(res, 'Not found', 404);
  const { name, group_id, target_english, target_math, exam_date } = req.body || {};
  if (exam_date && exam_date !== s.exam_date && !isSatDate(exam_date)) return bad(res, 'Choose one of the official SAT test dates.');
  await db.run('UPDATE users SET name = ?, group_id = ?, target_english = ?, target_math = ?, exam_date = ? WHERE id = ?', [
    String(name || s.name).trim(), group_id || null,
    target_english ?? s.target_english, target_math ?? s.target_math, exam_date ?? s.exam_date, s.id,
  ]);
  res.json({ ok: true });
}));
app.post('/api/students/:id/reset-password', requireMaster, h(async (req, res) => {
  // a student keeps the password they chose; the teacher replaces it only when asked, after confirming
  if (req.body?.confirm !== true) return bad(res, 'Confirm the password reset first');
  const pw = String(req.body?.password || '').trim() || genPassword();
  if (req.body?.password) { const weak = weakPassword(pw); if (weak) return bad(res, weak); }
  const r = await db.run("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ? AND role = 'student'", [bcrypt.hashSync(pw, 12), req.params.id]);
  if (!r.rowCount) return bad(res, 'Not found', 404);
  await audit(req, 'student_password_reset', `student ${req.params.id}`);
  const u = await db.one('SELECT login FROM users WHERE id = ?', [req.params.id]);
  res.json({ password: pw, login: u.login });
}));
app.delete('/api/students/:id', requireMaster, h(async (req, res) => {
  const st = await db.one("SELECT name, email, login, balance FROM users WHERE id = ? AND role = 'student'", [req.params.id]);
  await db.run("DELETE FROM users WHERE id = ? AND role = 'student'", [req.params.id]);
  if (st) await audit(req, 'student_deleted', `student ${req.params.id}`, `${st.name} <${st.email || st.login}> balance ${st.balance}`);
  res.json({ ok: true });
}));
app.get('/api/students/:id/analytics', requireMaster, h(async (req, res) => {
  if (!(await db.one("SELECT 1 AS x FROM users WHERE id = ? AND role = 'student'", [req.params.id]))) return bad(res, 'Not found', 404);
  res.json(await userAnalytics(Number(req.params.id)));
}));

// subscriptions — granted by the teacher today, by the Telegram bot later (same table)
app.post('/api/students/:id/subscription', requireMaster, h(async (req, res) => {
  const s = await db.one("SELECT * FROM users WHERE id = ? AND role = 'student'", [req.params.id]);
  if (!s) return bad(res, 'Not found', 404);
  const days = Math.max(1, Math.min(730, Math.round(+req.body?.days || 30)));
  const plan = ['t1', 't2', 't3', 't4'].includes(req.body?.plan) ? req.body.plan : (subActive(s) && s.sub_plan) || 't2';
  const amount = Math.max(0, Math.round(+req.body?.amount || 0));
  const settings = await getSettings();
  const from = subActive(s) ? new Date(s.sub_until) : new Date();
  const until = new Date(from.getTime() + days * 86400e3).toISOString();
  await db.tx(async (t) => {
    await t.run('UPDATE users SET sub_until = ?, sub_plan = ? WHERE id = ?', [until, plan, s.id]);
    await t.run("INSERT INTO payments (user_id, provider, plan, days, amount, currency, note, created_by) VALUES (?, 'manual', ?, ?, ?, ?, ?, ?)",
      [s.id, plan, days, amount, settings.currency, String(req.body?.note || '').slice(0, 300), req.user.id]);
  });
  await audit(req, 'subscription_granted', `student ${s.id}`, `${plan} · ${days} days · ${amount}`);
  res.json({ sub_until: until, sub_active: true });
}));
app.delete('/api/students/:id/subscription', requireMaster, h(async (req, res) => {
  await db.run("UPDATE users SET sub_until = NULL WHERE id = ? AND role = 'student'", [req.params.id]);
  await audit(req, 'subscription_cancelled', `student ${req.params.id}`);
  res.json({ ok: true });
}));

// ---------- teacher overview ----------
app.get('/api/master/overview', requireMaster, h(async (req, res) => {
  const c = async (sql) => (await db.one(sql)).c;
  const recent = await db.all(`SELECT a.id, a.score, a.total, a.finished_at, u.name AS student, u.id AS student_id, q.title
    FROM attempts a JOIN users u ON u.id = a.user_id JOIN quizzes q ON q.id = a.quiz_id
    WHERE a.finished_at IS NOT NULL ORDER BY a.finished_at DESC LIMIT 8`);
  const signups = await db.all(`SELECT id, name, email, provider, created_at, diagnostic_score, cefr, admitted, sub_until FROM users
    WHERE role = 'student' ORDER BY created_at DESC, id DESC LIMIT 6`);
  const topics = (await db.all(`SELECT q.topic, COUNT(*) AS answered, SUM(an.is_correct) AS correct FROM answers an
    JOIN attempts a ON a.id = an.attempt_id AND a.finished_at IS NOT NULL JOIN questions q ON q.id = an.question_id
    GROUP BY q.topic ORDER BY (1.0*SUM(an.is_correct)/COUNT(*)) ASC LIMIT 6`))
    .map((t) => ({ ...t, correct: t.correct || 0, pct: Math.round(((t.correct || 0) / t.answered) * 100) }));
  const acc = await db.one('SELECT SUM(score) AS s, SUM(total) AS t FROM attempts WHERE finished_at IS NOT NULL');
  res.json({
    students: await c("SELECT COUNT(*) AS c FROM users WHERE role='student'"),
    new_week: await c("SELECT COUNT(*) AS c FROM users WHERE role='student' AND created_at > now() - interval '7 days'"),
    subscribers: await c("SELECT COUNT(*) AS c FROM users WHERE role='student' AND sub_until > now()"),
    groups: await c('SELECT COUNT(*) AS c FROM groups'),
    quizzes: await c('SELECT COUNT(*) AS c FROM quizzes'),
    attempts: await c('SELECT COUNT(*) AS c FROM attempts WHERE finished_at IS NOT NULL'),
    accuracy: acc.t ? Math.round((acc.s / acc.t) * 100) : 0,
    recent: recent.map((r) => ({ ...r })), signups: signups.map(withSub), topics,
  });
}));

// ---------- quizzes ----------
app.get('/api/template.xlsx', h(async (req, res) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="questions-template.xlsx"');
  res.send(buildTemplate());
}));

app.post('/api/quizzes/parse', requireMaster, upload.single('file'), h(async (req, res) => {
  if (!req.file) return bad(res, 'Please upload a file');
  try {
    const questions = await parseUpload(req.file);
    if (!questions.length) return bad(res, 'No questions found in the file. Check it against the template.');
    res.json({ questions, filename: req.file.originalname });
  } catch (e) { bad(res, e.message || 'Could not read the file'); }
}));

// Quizzes page: public, diagnostic and group quizzes — never roadmap quizzes (those are assignments that open step by step)
const VISIBLE = `((q.is_public OR q.kind = 'diagnostic'
  OR q.id IN (SELECT quiz_id FROM quiz_groups WHERE group_id = ?))
  AND q.id NOT IN (SELECT ri.quiz_id FROM roadmap_items ri JOIN roadmap_steps rs ON rs.id = ri.step_id WHERE ri.quiz_id IS NOT NULL AND rs.deleted_at IS NULL)
  AND q.id NOT IN (SELECT ri.retake_quiz_id FROM roadmap_items ri JOIN roadmap_steps rs ON rs.id = ri.step_id WHERE ri.retake_quiz_id IS NOT NULL AND rs.deleted_at IS NULL))`;
async function canAccess(user, quizId) {
  if (user.role === 'master') return true;
  if (await db.one(`SELECT 1 AS x FROM quizzes q WHERE q.id = ? AND ${VISIBLE}`, [quizId, user.group_id ?? -1])) return true;
  return assignedQuizOpen(user, quizId, roadmapFor); // unlocked roadmap step, or assigned by the teacher
}

async function quizList(user) {
  const base = `SELECT q.id, q.title, q.section, q.kind, q.is_public, q.duration_min, q.created_at,
    (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = q.id) AS questions FROM quizzes q`;
  if (user.role === 'master') {
    const rows = await db.all(base + ' ORDER BY q.created_at DESC, q.id DESC');
    return Promise.all(rows.map(async (q) => ({
      ...q,
      groups: await db.all('SELECT g.id, g.name FROM quiz_groups qg JOIN groups g ON g.id = qg.group_id WHERE qg.quiz_id = ?', [q.id]),
      attempts: (await db.one('SELECT COUNT(*) AS c FROM attempts WHERE quiz_id = ? AND finished_at IS NOT NULL', [q.id])).c,
      roadmap: (await db.one('SELECT COUNT(*) AS c FROM roadmap_items WHERE quiz_id = ?', [q.id])).c > 0,
    })));
  }
  const rows = await db.all(base + ` WHERE ${VISIBLE} ORDER BY (q.kind = 'diagnostic') DESC, q.created_at DESC, q.id DESC`, [user.group_id ?? -1]);
  return Promise.all(rows.map(async (q) => {
    const fin = await db.all('SELECT id, score, total, finished_at FROM attempts WHERE user_id = ? AND quiz_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC', [user.id, q.id]);
    const open = await db.one('SELECT id FROM attempts WHERE user_id = ? AND quiz_id = ? AND finished_at IS NULL', [user.id, q.id]);
    const best = fin.reduce((m, a) => Math.max(m, a.total ? Math.round((a.score / a.total) * 100) : 0), 0);
    return { ...q, status: open ? 'in_progress' : fin.length ? 'done' : 'new', last_attempt_id: fin[0]?.id ?? null, last: fin[0] ?? null, best, tries: fin.length };
  }));
}
app.get('/api/quizzes', h(async (req, res) => res.json(await quizList(req.user))));

async function saveQuiz(req, existingId) {
  const { title, section, kind, is_public, duration_min, group_ids, questions } = req.body || {};
  if (!String(title || '').trim()) throw new HttpError('Quiz name is required');
  validateQuestions(questions);
  const sec = section === 'math' ? 'math' : 'english';
  const knd = ['practice', 'diagnostic', 'mock'].includes(kind) ? kind : 'practice';
  const dur = Math.max(0, Math.min(300, Math.round(+duration_min || 0)));
  return db.tx(async (t) => {
    let id = existingId;
    const shC = !!req.body?.shuffle_choices; const shQ = !!req.body?.shuffle_questions;
    if (id) await t.run('UPDATE quizzes SET title = ?, section = ?, kind = ?, is_public = ?, duration_min = ?, shuffle_choices = ?, shuffle_questions = ? WHERE id = ?', [title.trim(), sec, knd, !!is_public, dur, shC, shQ, id]);
    else id = (await t.run('INSERT INTO quizzes (title, section, kind, is_public, duration_min, created_by, shuffle_choices, shuffle_questions) VALUES (?,?,?,?,?,?,?,?) RETURNING id', [title.trim(), sec, knd, !!is_public, dur, req.user.id, shC, shQ])).id;

    const keep = new Set();
    for (let i = 0; i < questions.length; i++) {
      const raw = questions[i];
      const q = cleanQ(raw);
      const vals = [q.passage, q.prompt, q.opt_a, q.opt_b, q.opt_c, q.opt_d, q.correct, q.explanation, q.tip, q.topic];
      if (raw.id && (await t.one('SELECT 1 AS x FROM questions WHERE id = ? AND quiz_id = ?', [raw.id, id]))) {
        await t.run('UPDATE questions SET position=?, passage=?, prompt=?, opt_a=?, opt_b=?, opt_c=?, opt_d=?, correct=?, explanation=?, tip=?, topic=? WHERE id=? AND quiz_id=?', [i, ...vals, raw.id, id]);
        keep.add(Number(raw.id));
      } else {
        keep.add((await t.run('INSERT INTO questions (quiz_id, position, passage, prompt, opt_a, opt_b, opt_c, opt_d, correct, explanation, tip, topic) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id', [id, i, ...vals])).id);
      }
    }
    for (const old of await t.all('SELECT id FROM questions WHERE quiz_id = ?', [id])) {
      if (!keep.has(old.id)) await t.run('DELETE FROM questions WHERE id = ?', [old.id]);
    }
    if (Array.isArray(group_ids)) {
      await t.run('DELETE FROM quiz_groups WHERE quiz_id = ?', [id]);
      for (const g of group_ids) await t.run('INSERT INTO quiz_groups (quiz_id, group_id) VALUES (?,?) ON CONFLICT DO NOTHING', [id, g]);
    }
    return id;
  });
}
app.post('/api/quizzes', requireMaster, h(async (req, res) => { const id = await saveQuiz(req); await scanSoon(); res.json({ id }); }));
app.put('/api/quizzes/:id', requireMaster, h(async (req, res) => {
  if (!(await db.one('SELECT 1 AS x FROM quizzes WHERE id = ?', [req.params.id]))) return bad(res, 'Not found', 404);
  const id = await saveQuiz(req, Number(req.params.id));
  await scanSoon();
  res.json({ id });
}));
app.put('/api/quizzes/:id/groups', requireMaster, h(async (req, res) => {
  const ids = Array.isArray(req.body?.group_ids) ? req.body.group_ids : [];
  await db.tx(async (t) => {
    await t.run('DELETE FROM quiz_groups WHERE quiz_id = ?', [req.params.id]);
    for (const g of ids) await t.run('INSERT INTO quiz_groups (quiz_id, group_id) VALUES (?,?) ON CONFLICT DO NOTHING', [req.params.id, g]);
    if ('is_public' in (req.body || {})) await t.run('UPDATE quizzes SET is_public = ? WHERE id = ?', [!!req.body.is_public, req.params.id]);
  });
  res.json({ ok: true });
}));
app.delete('/api/quizzes/:id', requireMaster, h(async (req, res) => {
  await db.run('DELETE FROM quizzes WHERE id = ?', [req.params.id]);
  await scanSoon();
  res.json({ ok: true });
}));
app.get('/api/quizzes/:id', requireMaster, h(async (req, res) => {
  const q = await db.one('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
  if (!q) return bad(res, 'Not found', 404);
  const questions = await db.all('SELECT * FROM questions WHERE quiz_id = ? ORDER BY position, id', [q.id]);
  const group_ids = (await db.all('SELECT group_id FROM quiz_groups WHERE quiz_id = ?', [q.id])).map((r) => r.group_id);
  res.json({ ...q, group_ids, questions });
}));
app.get('/api/quizzes/:id/stats', requireMaster, h(async (req, res) => {
  const rows = await db.all(`SELECT u.id AS student_id, u.name, MAX(1.0*a.score/NULLIF(a.total,0)) AS best, COUNT(*) AS tries, MAX(a.finished_at) AS last
    FROM attempts a JOIN users u ON u.id = a.user_id WHERE a.quiz_id = ? AND a.finished_at IS NOT NULL GROUP BY u.id, u.name ORDER BY best DESC`, [req.params.id]);
  const hardest = await db.all(`SELECT q.id, q.position, q.topic, COUNT(*) AS answered, SUM(an.is_correct) AS correct FROM answers an
    JOIN questions q ON q.id = an.question_id WHERE q.quiz_id = ? GROUP BY q.id ORDER BY (1.0*SUM(an.is_correct)/COUNT(*)) ASC LIMIT 5`, [req.params.id]);
  res.json({
    students: rows.map((r) => ({ ...r, best: Math.round((r.best || 0) * 100) })),
    hardest: hardest.map((r) => ({ ...r, correct: r.correct || 0, pct: Math.round(((r.correct || 0) / r.answered) * 100) })),
  });
}));

// ---------- attempts (student) ----------
function timing(quiz, attempt, penalty = 0) {
  const total = quiz.duration_min * 60;
  const elapsed = Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000);
  // exam mode: leaving the test takes time off the clock
  return { total_seconds: total, remaining: total ? Math.max(0, total - elapsed - penalty) : null, elapsed, penalty };
}
/** Small seeded shuffle: the same attempt always gets the same order (resume after reload). */
function seedRnd(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
function shuffled(list, rnd) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function attemptPayload(attempt, quiz) {
  const rows = await db.all('SELECT * FROM questions WHERE quiz_id = ? ORDER BY position, id', [quiz.id]);
  let qs = rows.map(qPublic);
  // per-quiz options: shuffle questions inside each skill (skill order stays) and/or the answer choices.
  // Choices keep their original key (grading is unchanged) and get a display label A–D in the new order.
  if (quiz.shuffle_questions) {
    const rnd = seedRnd(attempt.id * 7919);
    const order = [...new Set(qs.map((q) => q.topic || ''))];
    qs = order.flatMap((t) => shuffled(qs.filter((q) => (q.topic || '') === t), rnd));
  }
  if (quiz.shuffle_choices) qs = qs.map((q) => ({ ...q, options: shuffled(q.options, seedRnd(attempt.id * 31 + q.id)).map((o, i) => ({ ...o, label: LETTERS[i] })) }));
  const progress = JSON.parse(attempt.progress || '{}');
  // practice mode: questions already checked come back with their feedback (resume after reload)
  const checked = {};
  if (quiz.kind === 'practice') for (const q of rows) if (progress.answers?.[q.id]?.checked) checked[q.id] = reveal(q);
  return {
    mode: quiz.kind === 'practice' ? 'practice' : 'exam',
    checked,
    attempt: { id: attempt.id, quiz_id: quiz.id, started_at: attempt.started_at, current: attempt.current },
    quiz: { id: quiz.id, title: quiz.title, section: quiz.section, kind: quiz.kind, duration_min: quiz.duration_min },
    questions: qs,
    progress,
    ...timing(quiz, attempt, await penaltyOf('quiz', attempt.id)),
  };
}
app.post('/api/quizzes/:id/start', requireStudent, h(async (req, res) => {
  const quiz = await db.one('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
  if (!quiz || !(await canAccess(req.user, quiz.id))) return bad(res, 'This quiz is not available to you', 403);
  if (quiz.kind !== 'diagnostic') {
    const acc = await accessFor(req.user);
    if (!acc.can_practice) return bad(res, 'An active subscription is required to practice', 402, { code: 'subscription_required' });
  }
  let attempt = await db.one('SELECT * FROM attempts WHERE user_id = ? AND quiz_id = ? AND finished_at IS NULL', [req.user.id, quiz.id]);
  if (!attempt) {
    const { c: total } = await db.one('SELECT COUNT(*) AS c FROM questions WHERE quiz_id = ?', [quiz.id]);
    if (!total) return bad(res, 'This quiz has no questions yet');
    attempt = await db.one('INSERT INTO attempts (user_id, quiz_id, started_at, total) VALUES (?,?,now(),?) RETURNING *', [req.user.id, quiz.id, total]);
  }
  res.json(await attemptPayload(attempt, quiz));
}));
app.put('/api/attempts/:id/progress', requireStudent, h(async (req, res) => {
  const a = await db.one('SELECT * FROM attempts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!a || a.finished_at) return bad(res, 'This attempt is already closed', 409);
  const next = req.body?.progress && typeof req.body.progress === 'object' ? req.body.progress : {};
  // answers that were already checked in practice mode cannot be changed afterwards
  const prev = JSON.parse(a.progress || '{}');
  next.answers = { ...(next.answers || {}) };
  for (const [qid, ans] of Object.entries(prev.answers || {})) if (ans?.checked) next.answers[qid] = ans;
  const progress = JSON.stringify(next).slice(0, 200000);
  await db.run('UPDATE attempts SET progress = ?, current = ? WHERE id = ?', [progress, Math.max(0, +req.body?.current || 0), a.id]);
  res.json({ ok: true, saved_at: new Date().toISOString() });
}));
/** Practice mode: check one answer and get the explanation right away (the answer is then locked). */
app.post('/api/attempts/:id/check', requireStudent, h(async (req, res) => {
  const a = await db.one('SELECT * FROM attempts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!a || a.finished_at) return bad(res, 'This attempt is already closed', 409);
  const quiz = await db.one('SELECT kind FROM quizzes WHERE id = ?', [a.quiz_id]);
  if (quiz?.kind !== 'practice') return bad(res, 'Answers are checked at the end of this test', 400);
  const q = await db.one('SELECT * FROM questions WHERE id = ? AND quiz_id = ?', [req.body?.question_id, a.quiz_id]);
  if (!q) return bad(res, 'Question not found', 404);
  const progress = JSON.parse(a.progress || '{}');
  progress.answers ||= {};
  const prev = progress.answers[q.id];
  if (prev?.checked) return res.json({ ...reveal(q), choice: prev.choice, is_correct: prev.choice === q.correct, already: true });
  const choice = String(req.body?.choice || '').toUpperCase();
  if (!LETTERS.includes(choice)) return bad(res, 'Choose an answer first');
  progress.answers[q.id] = { ...(prev || {}), choice, checked: true };
  await db.run('UPDATE attempts SET progress = ? WHERE id = ?', [JSON.stringify(progress), a.id]);
  res.json({ ...reveal(q), choice, is_correct: choice === q.correct });
}));
app.post('/api/attempts/:id/finish', requireStudent, h(async (req, res) => {
  const a = await db.one('SELECT * FROM attempts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!a) return bad(res, 'Not found', 404);
  if (a.finished_at) return res.json({ id: a.id });
  const stored = JSON.parse(a.progress || '{}');
  const progress = req.body?.progress || stored;
  progress.answers = { ...(progress.answers || {}) };
  for (const [qid, ans] of Object.entries(stored.answers || {})) if (ans?.checked) progress.answers[qid] = ans;
  const answers = progress.answers;
  const qs = await db.all('SELECT id, correct FROM questions WHERE quiz_id = ?', [a.quiz_id]);
  const quiz = await db.one('SELECT kind FROM quizzes WHERE id = ?', [a.quiz_id]);
  let score = 0;
  await db.tx(async (t) => {
    for (const q of qs) {
      const choice = answers[q.id]?.choice || null;
      const ok = choice && choice === q.correct ? 1 : 0;
      score += ok;
      await t.run(`INSERT INTO answers (attempt_id, question_id, choice, is_correct) VALUES (?,?,?,?)
        ON CONFLICT (attempt_id, question_id) DO UPDATE SET choice = EXCLUDED.choice, is_correct = EXCLUDED.is_correct`, [a.id, q.id, choice, ok]);
    }
    await t.run('UPDATE attempts SET finished_at = now(), score = ?, total = ?, progress = ? WHERE id = ?', [score, qs.length, JSON.stringify(progress), a.id]);
    if (quiz?.kind === 'diagnostic') {
      await t.run('UPDATE users SET diagnostic_score = ?, diagnostic_attempt_id = ? WHERE id = ?', [estimateScore(score, qs.length), a.id, req.user.id]);
    }
  });
  res.json({ id: a.id, score, total: qs.length });
}));
app.get('/api/attempts', h(async (req, res) => {
  const uid = req.user.role === 'master' ? Number(req.query.user_id) : req.user.id;
  res.json((await userAnalytics(uid)).history.slice().reverse());
}));
app.get('/api/attempts/:id/result', h(async (req, res) => {
  const a = await db.one('SELECT * FROM attempts WHERE id = ?', [req.params.id]);
  if (!a || (req.user.role !== 'master' && a.user_id !== req.user.id)) return bad(res, 'Not found', 404);
  if (!a.finished_at) return bad(res, 'This attempt is not finished yet', 409);
  const quiz = await db.one('SELECT * FROM quizzes WHERE id = ?', [a.quiz_id]);
  const student = await db.one('SELECT id, name FROM users WHERE id = ?', [a.user_id]);
  const saved = new Set((await db.all('SELECT question_id FROM saved WHERE user_id = ?', [req.user.id])).map((r) => r.question_id));
  const progress = JSON.parse(a.progress || '{}');
  const rows = await db.all(`SELECT q.*, an.choice, an.is_correct FROM questions q
    LEFT JOIN answers an ON an.question_id = q.id AND an.attempt_id = ? WHERE q.quiz_id = ? ORDER BY q.position, q.id`, [a.id, a.quiz_id]);
  const items = rows.map((q, i) => ({
    ...qFull(q), n: i + 1, choice: q.choice || null, is_correct: !!q.is_correct,
    marked: !!progress.answers?.[q.id]?.marked, saved: saved.has(q.id),
  }));
  const topicMap = {};
  items.forEach((it) => { const t = (topicMap[it.topic] ||= { topic: it.topic, total: 0, correct: 0 }); t.total++; t.correct += it.is_correct ? 1 : 0; });
  res.json({
    attempt: { id: a.id, score: a.score, total: a.total, started_at: a.started_at, finished_at: a.finished_at,
      seconds: Math.round((new Date(a.finished_at) - new Date(a.started_at)) / 1000), pct: a.total ? Math.round((a.score / a.total) * 100) : 0,
      estimate: estimateScore(a.score, a.total) },
    quiz: { id: quiz.id, title: quiz.title, section: quiz.section, kind: quiz.kind }, student, items,
    topics: Object.values(topicMap).map((t) => ({ ...t, pct: Math.round((t.correct / t.total) * 100) })),
    focus: await focusSummary('quiz', a.id),
  });
}));

// ---------- saved questions ----------
app.get('/api/saved', requireStudent, h(async (req, res) => {
  const rows = await db.all(`SELECT s.note, s.created_at AS saved_at, q.*, qz.title AS quiz_title FROM saved s
    JOIN questions q ON q.id = s.question_id JOIN quizzes qz ON qz.id = q.quiz_id WHERE s.user_id = ? ORDER BY s.created_at DESC`, [req.user.id]);
  res.json(rows.map((q) => ({ ...qFull(q), note: q.note, saved_at: q.saved_at, quiz_title: q.quiz_title })));
}));
app.post('/api/saved', requireStudent, h(async (req, res) => {
  const { question_id, note } = req.body || {};
  const q = await db.one('SELECT q.id, q.quiz_id FROM questions q WHERE q.id = ?', [question_id]);
  if (!q || !(await canAccess(req.user, q.quiz_id))) return bad(res, 'Question not found', 404);
  await db.run(`INSERT INTO saved (user_id, question_id, note) VALUES (?,?,?)
    ON CONFLICT (user_id, question_id) DO UPDATE SET note = EXCLUDED.note`, [req.user.id, q.id, String(note || '').slice(0, 2000)]);
  res.json({ ok: true });
}));
app.delete('/api/saved/:question_id', requireStudent, h(async (req, res) => {
  await db.run('DELETE FROM saved WHERE user_id = ? AND question_id = ?', [req.user.id, req.params.question_id]);
  res.json({ ok: true });
}));

// ---------- analytics / dashboard ----------
app.get('/api/me/analytics', requireStudent, h(async (req, res) => res.json(await userAnalytics(req.user.id))));

// ---------- roadmap ----------
// A roadmap is a list of steps (topics). Each step holds items: video lessons, reading notes and quizzes.
const STEP_COLORS = ['signal', 'sky', 'sun', 'night', 'white'];
const ITEM_KINDS = ['video', 'quiz', 'reading', 'lesson', 'random'];

async function loadSteps(where = 'WHERE deleted_at IS NULL', params = []) {
  const steps = await db.all(`SELECT * FROM roadmap_steps ${where} ORDER BY position, id`, params);
  if (!steps.length) return [];
  const items = await db.all(`SELECT i.*, q.title AS quiz_title, q.kind AS quiz_kind, q.duration_min AS quiz_minutes,
      (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = i.quiz_id) AS quiz_questions
    FROM roadmap_items i LEFT JOIN quizzes q ON q.id = i.quiz_id
    WHERE i.step_id = ANY(?::int[]) ORDER BY i.position, i.id`, [steps.map((s) => s.id)]);
  const sheets = new Map((await db.all('SELECT step_id, name, title, pages, size, src, updated_at FROM step_handouts WHERE step_id = ANY(?::int[])', [steps.map((s) => s.id)])).map((h) => [h.step_id, h]));
  const by = {};
  for (const it of items) {
    const { content, ...rest } = it; // lesson content (incl. answers) never leaves through the roadmap
    (by[it.step_id] ||= []).push(it.kind === 'lesson' ? { ...rest, lesson: lessonSummary(it) } : rest);
  }
  return steps.map((s) => {
    const h = sheets.get(s.id);
    return { ...s, items: by[s.id] || [], handout: h ? { name: h.name, title: h.title || h.name, pages: h.pages, size: h.size, src: h.src, updated_at: h.updated_at } : null };
  });
}

/**
 * Steps unlock one after another. A step is complete when every item in it is done
 * (quiz: best score ≥ pass_pct, video/reading: marked as done). A step with no items is
 * complete once the student's estimated score reaches score_to.
 */
async function roadmapFor(user) {
  const steps = await loadSteps();
  if (user.role === 'master') return { steps, estimate: null };
  const qrows = await db.all(`SELECT quiz_id, MAX(ROUND(100.0 * score / NULLIF(total, 0))) AS best, COUNT(*) AS tries, MAX(finished_at) AS last_at FROM attempts
    WHERE user_id = ? AND finished_at IS NOT NULL GROUP BY quiz_id`, [user.id]);
  const best = new Map(qrows.map((r) => [r.quiz_id, r.best || 0]));
  const qinfo = new Map(qrows.map((r) => [r.quiz_id, r]));
  const done = new Set((await db.all('SELECT item_id FROM roadmap_done WHERE user_id = ?', [user.id])).map((r) => r.item_id));
  const exams = new Map((await db.all(`SELECT item_id, MAX(ROUND(100.0 * score / NULLIF(total, 0))) AS best, COUNT(*) AS tries
    FROM qbank_mocks WHERE user_id = ? AND item_id IS NOT NULL AND finished_at IS NOT NULL GROUP BY item_id`, [user.id])).map((r) => [r.item_id, r]));
  const checks = new Map((await db.all(`SELECT item_id, bool_or(passed) AS passed, MAX(ROUND(100.0 * score / NULLIF(total, 0))) AS best,
    COUNT(finished_at) AS tries, MIN(finished_at) FILTER (WHERE passed) AS passed_at FROM lesson_checks WHERE user_id = ? GROUP BY item_id`, [user.id])).map((r) => [r.item_id, r]));
  // free audience: lessons after the free ones open one by one, drip_days after the previous lesson was passed
  const weekly = user.role === 'student' && !(await accessFor(user)).roadmap;
  const waitMs = weekly ? dripDays(await getSettings()) * 86400e3 : 0;
  const early = weekly ? await unlocksFor(user.id) : new Set();
  let lastPassAt = null;
  const a = await userAnalytics(user.id);
  const estimate = a.estimates.english ?? user.diagnostic_score ?? null;
  let blocked = false;
  const out = steps.map((s) => {
    // lessons open one after another; vocabulary is open with the step; the session check opens after every lesson
    let prevLessonsPassed = true;
    const items = s.items.map((it) => {
      if (it.kind === 'random') {
        const cfg = randomCfg(it.body);
        const e = exams.get(it.id);
        const b = e?.best == null ? null : Number(e.best);
        return { ...it, exam: cfg, best: b, tries: Number(e?.tries || 0), done: b != null && b >= cfg.pass_pct };
      }
      if (it.kind === 'quiz') {
        const b = it.quiz_id ? best.get(it.quiz_id) ?? null : null;
        if (!it.retake_quiz_id) return { ...it, best: b, done: b != null && b >= s.pass_pct, current_quiz_id: it.quiz_id };
        // Exam A / Exam B: B opens only after failing A (after a wait); failing B alternates back to A after the wait
        const rb = best.get(it.retake_quiz_id) ?? null;
        const passed = (b != null && b >= s.pass_pct) || (rb != null && rb >= s.pass_pct);
        const a = qinfo.get(it.quiz_id); const r = qinfo.get(it.retake_quiz_id);
        let current = it.quiz_id; let opensAt = null;
        const lastA = a ? new Date(a.last_at) : null; const lastB = r ? new Date(r.last_at) : null;
        const last = lastA && (!lastB || lastA > lastB) ? 'A' : lastB ? 'B' : null;
        if (!passed && last) {
          current = last === 'A' ? it.retake_quiz_id : it.quiz_id;
          const t = new Date((last === 'A' ? lastA : lastB).getTime() + (it.retake_hours ?? 24) * 3600e3);
          if (t > new Date()) opensAt = t;
        }
        return { ...it, best: Math.max(b ?? -1, rb ?? -1) < 0 ? null : Math.max(b ?? -1, rb ?? -1), done: passed,
          current_quiz_id: current, retake_used: !!r, retake_opens_at: opensAt, tries: (Number(a?.tries) || 0) + (Number(r?.tries) || 0) };
      }
      if (it.kind === 'lesson') {
        const type = it.lesson?.type || 'section';
        if (type === 'vocab') return { ...it, done: done.has(it.id), locked: blocked, ...(weekly ? { weekly_open: true } : {}) };
        const c = checks.get(it.id);
        const passed = !!c?.passed;
        const locked = blocked || it.status !== 'ready' || !prevLessonsPassed;
        let wait = null;
        if (weekly && type === 'section' && !it.lesson?.free && !passed && !locked && !early.has(it.id) && waitMs && lastPassAt) {
          const t = new Date(new Date(lastPassAt).getTime() + waitMs);
          if (t > new Date()) wait = t.toISOString();
        }
        if (type === 'section') prevLessonsPassed = prevLessonsPassed && passed;
        if (passed && c.passed_at) lastPassAt = c.passed_at;
        return { ...it, done: passed, best: c?.best ?? null, tries: c?.tries || 0, locked, ...(weekly ? { weekly_open: !wait, wait_until: wait } : {}) };
      }
      return { ...it, done: done.has(it.id) };
    });
    const total = items.length;
    const completed = items.filter((i) => i.done).length;
    const passed = total ? completed === total : estimate != null && estimate >= s.score_to;
    let status;
    if (blocked) status = 'locked';
    else if (passed) status = 'done';
    else { status = 'current'; blocked = true; }
    return { ...s, items, total, completed, progress: total ? Math.round((completed / total) * 100) : passed ? 100 : 0, status };
  });
  return { steps: out, estimate };
}
app.get('/api/roadmap', h(async (req, res) => {
  const r0 = await roadmapFor(req.user);
  const st = await getSettings();
  const sign = (it) => (isBunny(it.url) ? { ...it, url: req.user.role === 'master' ? it.url : playUrl(it.url, st), play: req.user.role === 'master' ? playUrl(it.url, st, 1) : undefined } : it);
  const r = { ...r0, steps: r0.steps.map((x) => ({ ...x, items: (x.items || []).map(sign) })) };
  if (req.user.role === 'master' || (await accessFor(req.user)).video) return res.json(r);
  // video links only reach students whose plan includes video (free lessons excepted)
  const hide = (it) => ((it.kind === 'video' || (it.kind === 'lesson' && !it.lesson?.free)) && it.url ? { ...it, url: '', video_locked: true } : it);
  res.json({ ...r, steps: r.steps.map((st) => ({ ...st, items: (st.items || []).map(hide) })) });
}));

app.post('/api/roadmap/items/:id/done', requireStudent, h(async (req, res) => {
  const it = await db.one('SELECT * FROM roadmap_items WHERE id = ?', [req.params.id]);
  if (!it || it.kind === 'quiz') return bad(res, 'Not found', 404);
  const { steps } = await roadmapFor(req.user);
  if (steps.find((s) => s.id === it.step_id)?.status === 'locked') return bad(res, 'Finish the previous step first', 403);
  if (req.body?.done === false) await db.run('DELETE FROM roadmap_done WHERE user_id = ? AND item_id = ?', [req.user.id, it.id]);
  else await db.run('INSERT INTO roadmap_done (user_id, item_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [req.user.id, it.id]);
  res.json({ ok: true });
}));

function stepBody(b) {
  const title = String(b?.title || '').trim().slice(0, 120);
  if (!title) throw new HttpError('Step title is required');
  let from = Math.max(200, Math.min(800, Math.round(+b.score_from || 200)));
  let to = Math.max(200, Math.min(800, Math.round(+b.score_to || 800)));
  if (to < from) [from, to] = [to, from];
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 40).map((it, i) => {
    const kind = ITEM_KINDS.includes(it?.kind) ? it.kind : 'reading';
    const url = String(it?.url || '').trim().slice(0, 500);
    const out = {
      id: it?.id ? Number(it.id) : null, kind,
      title: String(it?.title || '').trim().slice(0, 160),
      quiz_id: kind === 'quiz' && it?.quiz_id ? Number(it.quiz_id) : null,
      retake_quiz_id: kind === 'quiz' && it?.retake_quiz_id && Number(it.retake_quiz_id) !== Number(it.quiz_id) ? Number(it.retake_quiz_id) : null,
      retake_hours: Math.max(0, Math.min(720, Math.round(Number(it?.retake_hours ?? 24)) || 0)),
      url: kind === 'video' || kind === 'lesson' ? url : '',
      body: kind === 'reading' ? String(it?.body || '').slice(0, 10000) : kind === 'random' ? JSON.stringify(randomCfg(typeof it?.body === 'string' ? it.body : JSON.stringify(it?.body || {}))) : '',
    };
    if (kind === 'quiz' && !out.quiz_id) throw new HttpError(`Item ${i + 1}: choose a quiz`);
    if (kind === 'video' && !/^https?:\/\//i.test(out.url) && !isBunny(out.url)) throw new HttpError(`Item ${i + 1}: paste a video link (https://…)`);
    if (kind === 'lesson' && out.url && !/^https?:\/\//i.test(out.url) && !isBunny(out.url)) throw new HttpError(`Item ${i + 1}: the video link must start with https://`);
    if (kind === 'lesson' && !out.id) throw new HttpError(`Item ${i + 1}: lessons are added by importing a course module`);
    if (kind === 'reading' && !out.body.trim() && !out.title) throw new HttpError(`Item ${i + 1}: write the notes`);
    if (!out.title) out.title = kind === 'video' ? 'Video lesson' : kind === 'quiz' ? 'Practice quiz' : kind === 'random' ? 'Final exam' : 'Study notes';
    return out;
  });
  return {
    step: {
      title,
      subtitle: String(b.subtitle || '').trim().slice(0, 120),
      description: String(b.description || '').slice(0, 4000),
      focus: String(b.focus || '').slice(0, 500),
      score_from: from, score_to: to,
      badge: String(b.badge || '').trim().slice(0, 3) || title.replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '★',
      color: STEP_COLORS.includes(b.color) ? b.color : 'signal',
      pass_pct: Math.max(10, Math.min(100, Math.round(+b.pass_pct || 70))),
    },
    items,
  };
}
const STEP_COLS = ['title', 'subtitle', 'description', 'focus', 'score_from', 'score_to', 'badge', 'color', 'pass_pct'];
async function saveItems(t, stepId, items) {
  const keep = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === 'lesson') { // lesson content comes from the module; the teacher edits title, order and video link
      if (await t.one("SELECT 1 AS x FROM roadmap_items WHERE id = ? AND step_id = ? AND kind = 'lesson'", [it.id, stepId])) {
        await t.run('UPDATE roadmap_items SET position = ?, title = ?, url = ? WHERE id = ?', [i, it.title, it.url, it.id]);
        keep.push(it.id);
      }
      continue;
    }
    const vals = [i, it.kind, it.title, it.quiz_id, it.url, it.body, it.retake_quiz_id, it.retake_hours];
    if (it.id && (await t.one('SELECT 1 AS x FROM roadmap_items WHERE id = ? AND step_id = ?', [it.id, stepId]))) {
      await t.run('UPDATE roadmap_items SET position=?, kind=?, title=?, quiz_id=?, url=?, body=?, retake_quiz_id=?, retake_hours=? WHERE id = ?', [...vals, it.id]);
      keep.push(it.id);
    } else {
      keep.push((await t.run('INSERT INTO roadmap_items (step_id, position, kind, title, quiz_id, url, body, retake_quiz_id, retake_hours) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id', [stepId, ...vals])).id);
    }
  }
  await t.run('DELETE FROM roadmap_items WHERE step_id = ? AND NOT (id = ANY(?::int[]))', [stepId, keep]);
}
app.post('/api/roadmap/steps', requireMaster, h(async (req, res) => {
  const { step, items } = stepBody(req.body);
  const at = Number.isInteger(req.body?.insert_at) ? req.body.insert_at : null;
  const id = await db.tx(async (t) => {
    let pos;
    if (at == null) pos = ((await t.one('SELECT MAX(position) AS m FROM roadmap_steps')).m ?? -1) + 1;
    else { pos = Math.max(0, at); await t.run('UPDATE roadmap_steps SET position = position + 1 WHERE position >= ?', [pos]); }
    const sid = (await t.run(`INSERT INTO roadmap_steps (position, ${STEP_COLS.join(', ')}) VALUES (?, ${STEP_COLS.map(() => '?').join(', ')}) RETURNING id`,
      [pos, ...STEP_COLS.map((k) => step[k])])).id;
    await saveItems(t, sid, items);
    return sid;
  });
  await rmVersion(req, `Added “${step.title}”`);
  res.json((await loadSteps('WHERE id = ?', [id]))[0]);
}));
app.put('/api/roadmap/steps/:id', requireMaster, h(async (req, res) => {
  const { step, items } = stepBody(req.body);
  const ok = await db.tx(async (t) => {
    const r = await t.run(`UPDATE roadmap_steps SET ${STEP_COLS.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...STEP_COLS.map((k) => step[k]), req.params.id]);
    if (!r.rowCount) return false;
    await saveItems(t, Number(req.params.id), items);
    return true;
  });
  if (!ok) return bad(res, 'Not found', 404);
  await rmVersion(req, `Edited “${step.title}”`);
  res.json((await loadSteps('WHERE id = ?', [req.params.id]))[0]);
}));
// rules sheet (PDF) of a step: students download it, the teacher uploads/replaces/removes it
app.get('/api/roadmap/steps/:id/handout', h(async (req, res) => {
  const row = await db.one('SELECT name, data FROM step_handouts WHERE step_id = ?', [req.params.id]);
  if (!row) return bad(res, 'No rules sheet for this step', 404);
  if (req.user.role !== 'master' && !(await accessFor(req.user)).roadmap) {
    const free = (await db.all("SELECT content FROM roadmap_items WHERE step_id = ? AND kind = 'lesson'", [req.params.id])).some((i) => { try { return JSON.parse(i.content || '{}').free; } catch { return false; } });
    if (!free) return bad(res, 'An active subscription is required', 402, { code: 'subscription_required' });
  }
  const buf = Buffer.from(row.data);
  // big files go out in 3 MB parts (?part=0,1,…): one hosting response carries at most ~4.5 MB
  const PART = 3 * 1024 * 1024; const parts = Math.ceil(buf.length / PART) || 1;
  res.set({ 'X-Parts': String(parts), 'Access-Control-Expose-Headers': 'X-Parts', 'Cache-Control': 'private, max-age=300' });
  if (req.query.part != null) {
    const p = Math.max(0, Math.min(parts - 1, Number(req.query.part) || 0));
    res.set({ 'Content-Type': 'application/octet-stream' });
    return res.send(buf.subarray(p * PART, (p + 1) * PART));
  }
  if (parts > 1) { res.set({ 'Content-Type': 'application/octet-stream' }); return res.send(buf.subarray(0, PART)); }
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(row.name)}"` });
  res.send(buf);
}));
app.post('/api/roadmap/steps/:id/handout', requireMaster, upload.single('file'), h(async (req, res) => {
  const f = req.file;
  if (!f) return bad(res, 'Please choose a PDF file');
  if (f.buffer.subarray(0, 4).toString() !== '%PDF') return bad(res, 'Only PDF files can be used as a rules sheet');
  const step = await db.one('SELECT id, title FROM roadmap_steps WHERE id = ?', [req.params.id]);
  if (!step) return bad(res, 'Not found', 404);
  const pages = (f.buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length || null;
  const title = String(req.body?.title || '').trim().slice(0, 120) || `${step.title.split(':')[0]} · Rules sheet`;
  await db.run(`INSERT INTO step_handouts (step_id, name, title, pages, size, src, data) VALUES (?,?,?,?,?,'upload',?)
    ON CONFLICT (step_id) DO UPDATE SET name = EXCLUDED.name, title = EXCLUDED.title, pages = EXCLUDED.pages, size = EXCLUDED.size, src = 'upload', data = EXCLUDED.data, updated_at = now()`,
    [step.id, f.originalname.slice(0, 160), title, pages, f.size, f.buffer]);
  res.json((await loadSteps('WHERE id = ?', [step.id]))[0]);
}));
// big PDFs (up to 25 MB) arrive in ~3 MB pieces: one request on Vercel carries at most ~4.5 MB
app.post('/api/roadmap/steps/:id/handout/chunk', requireMaster, express.raw({ type: 'application/octet-stream', limit: '4mb' }), h(async (req, res) => {
  const up = String(req.query.upload || '').replace(/[^\w-]/g, '').slice(0, 40);
  const i = Number(req.query.i); const n = Number(req.query.n);
  if (!up || !Number.isInteger(i) || !Number.isInteger(n) || n < 1 || n > 10 || i < 0 || i >= n || !Buffer.isBuffer(req.body) || !req.body.length) return bad(res, 'Bad upload piece');
  const step = await db.one('SELECT id, title FROM roadmap_steps WHERE id = ?', [req.params.id]);
  if (!step) return bad(res, 'Not found', 404);
  await db.exec('CREATE TABLE IF NOT EXISTS upload_chunks (upload TEXT NOT NULL, i INTEGER NOT NULL, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (upload, i)); ALTER TABLE upload_chunks ENABLE ROW LEVEL SECURITY;');
  await db.run("DELETE FROM upload_chunks WHERE created_at < now() - interval '1 day'");
  await db.run('INSERT INTO upload_chunks (upload, i, data) VALUES (?,?,?) ON CONFLICT (upload, i) DO UPDATE SET data = EXCLUDED.data', [up, i, req.body]);
  const parts = await db.all('SELECT i, data FROM upload_chunks WHERE upload = ? ORDER BY i', [up]);
  if (parts.length < n) return res.json({ ok: true, received: parts.length, of: n });
  const buf = Buffer.concat(parts.map((p) => Buffer.from(p.data)));
  await db.run('DELETE FROM upload_chunks WHERE upload = ?', [up]);
  if (buf.length > 25 * 1024 * 1024) return bad(res, 'The PDF is larger than 25 MB — compress it (e.g. ilovepdf.com → Compress) and try again');
  if (buf.subarray(0, 4).toString() !== '%PDF') return bad(res, 'Only PDF files can be used as a rules sheet');
  const name = String(req.query.name || 'rules.pdf').slice(0, 160);
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length || null;
  const title = `${step.title.split(':')[0]} · Rules sheet`;
  await db.run(`INSERT INTO step_handouts (step_id, name, title, pages, size, src, data) VALUES (?,?,?,?,?,'upload',?)
    ON CONFLICT (step_id) DO UPDATE SET name = EXCLUDED.name, title = EXCLUDED.title, pages = EXCLUDED.pages, size = EXCLUDED.size, src = 'upload', data = EXCLUDED.data, updated_at = now()`,
    [step.id, name, title, pages, buf.length, buf]);
  res.json((await loadSteps('WHERE id = ?', [step.id]))[0]);
}));
app.delete('/api/roadmap/steps/:id/handout', requireMaster, h(async (req, res) => {
  await db.run('DELETE FROM step_handouts WHERE step_id = ?', [req.params.id]);
  res.json((await loadSteps('WHERE id = ?', [req.params.id]))[0]);
}));

// deleting a step moves it to the Trash for 30 days (lessons and student progress stay, so Restore brings everything back)
app.delete('/api/roadmap/steps/:id', requireMaster, h(async (req, res) => {
  const st = await db.one('SELECT title FROM roadmap_steps WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!st) return bad(res, 'Not found', 404);
  await db.run('UPDATE roadmap_steps SET deleted_at = now(), deleted_by = ? WHERE id = ?', [req.user.id, req.params.id]);
  await rmVersion(req, `Moved “${st.title}” to Trash`);
  res.json({ ok: true });
}));
app.get('/api/roadmap/trash', requireMaster, h(async (req, res) => {
  await db.run("DELETE FROM roadmap_steps WHERE deleted_at < now() - interval '30 days'");
  res.json(await db.all(`SELECT s.id, s.title, s.deleted_at, u.name AS deleted_by_name, (SELECT COUNT(*) FROM roadmap_items i WHERE i.step_id = s.id) AS items
    FROM roadmap_steps s LEFT JOIN users u ON u.id = s.deleted_by WHERE s.deleted_at IS NOT NULL ORDER BY s.deleted_at DESC`));
}));
app.post('/api/roadmap/steps/:id/restore', requireMaster, h(async (req, res) => {
  const st = await db.one('SELECT title FROM roadmap_steps WHERE id = ? AND deleted_at IS NOT NULL', [req.params.id]);
  if (!st) return bad(res, 'Not in the Trash', 404);
  await db.run('UPDATE roadmap_steps SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [req.params.id]);
  await normalizePositions();
  await rmVersion(req, `Restored “${st.title}”`);
  res.json({ ok: true });
}));
async function normalizePositions(t = db) {
  const rows = await t.all('SELECT id FROM roadmap_steps WHERE deleted_at IS NULL ORDER BY position, id');
  for (let i = 0; i < rows.length; i++) await t.run('UPDATE roadmap_steps SET position = ? WHERE id = ? AND position <> ?', [i, rows[i].id, i]);
}
app.put('/api/roadmap/order', requireMaster, h(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  await db.tx(async (t) => {
    for (let i = 0; i < ids.length; i++) await t.run('UPDATE roadmap_steps SET position = ? WHERE id = ?', [i, ids[i]]);
  });
  await rmVersion(req, 'Changed the order of steps');
  res.json({ ok: true });
}));
// "Spread score ranges evenly from 200 to 800" across the current steps (rounded to 10)
app.put('/api/roadmap/spread', requireMaster, h(async (req, res) => {
  const steps = await db.all('SELECT id FROM roadmap_steps WHERE deleted_at IS NULL ORDER BY position, id');
  const n = steps.length || 1;
  const at = (i) => Math.round((200 + (600 * i) / n) / 10) * 10;
  await db.tx(async (t) => { for (let i = 0; i < steps.length; i++) await t.run('UPDATE roadmap_steps SET score_from = ?, score_to = ? WHERE id = ?', [at(i), at(i + 1), steps[i].id]); });
  await rmVersion(req, 'Spread score ranges from 200 to 800');
  res.json({ ok: true });
}));

// ---------- roadmap version history: who changed what, when, with "Restore this version" ----------
const ITEM_SNAP = ['id', 'step_id', 'position', 'kind', 'title', 'quiz_id', 'url', 'body', 'retake_quiz_id', 'retake_hours', 'status'];
async function rmVersion(req, action) {
  try {
    const steps = await db.all(`SELECT id, position, ${STEP_COLS.join(', ')} FROM roadmap_steps WHERE deleted_at IS NULL ORDER BY position, id`);
    const items = await db.all(`SELECT ${ITEM_SNAP.join(', ')} FROM roadmap_items WHERE step_id = ANY(?::int[]) ORDER BY step_id, position`, [steps.map((x) => x.id)]);
    await db.run('INSERT INTO roadmap_versions (user_id, user_name, action, data) VALUES (?,?,?,?)', [req.user.id, req.user.name, String(action).slice(0, 200), JSON.stringify({ steps, items })]);
    await db.run('DELETE FROM roadmap_versions WHERE id NOT IN (SELECT id FROM roadmap_versions ORDER BY id DESC LIMIT 60)');
  } catch (e) { console.error('[roadmap version]', e.message); }
}
app.get('/api/roadmap/versions', requireMaster, h(async (req, res) => {
  res.json(await db.all("SELECT id, user_name, action, created_at, (length(data) > 0) AS ok FROM roadmap_versions ORDER BY id DESC LIMIT 60"));
}));
app.post('/api/roadmap/versions/:id/restore', requireMaster, h(async (req, res) => {
  const v = await db.one('SELECT * FROM roadmap_versions WHERE id = ?', [Number(req.params.id)]);
  if (!v) return bad(res, 'Version not found', 404);
  const { steps, items } = JSON.parse(v.data);
  await db.tx(async (t) => {
    const keepSteps = [];
    for (const st of steps) {
      if (!(await t.one('SELECT 1 AS x FROM roadmap_steps WHERE id = ?', [st.id]))) continue; // purged from the Trash
      await t.run(`UPDATE roadmap_steps SET position = ?, deleted_at = NULL, deleted_by = NULL, ${STEP_COLS.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [st.position, ...STEP_COLS.map((k) => st[k]), st.id]);
      keepSteps.push(st.id);
      const snap = items.filter((i) => i.step_id === st.id);
      const keep = [];
      for (const it of snap) {
        const cur = await t.one('SELECT kind FROM roadmap_items WHERE id = ? AND step_id = ?', [it.id, st.id]);
        if (cur) {
          if (cur.kind === 'lesson') await t.run('UPDATE roadmap_items SET position = ?, title = ?, url = ? WHERE id = ?', [it.position, it.title, it.url, it.id]);
          else await t.run('UPDATE roadmap_items SET position=?, kind=?, title=?, quiz_id=?, url=?, body=?, retake_quiz_id=?, retake_hours=? WHERE id = ?', [it.position, it.kind, it.title, it.quiz_id, it.url, it.body, it.retake_quiz_id, it.retake_hours, it.id]);
          keep.push(it.id);
        } else if (it.kind !== 'lesson') {
          keep.push((await t.one('INSERT INTO roadmap_items (step_id, position, kind, title, quiz_id, url, body, retake_quiz_id, retake_hours) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id', [st.id, it.position, it.kind, it.title, it.quiz_id, it.url, it.body, it.retake_quiz_id, it.retake_hours])).id);
        }
      }
      await t.run("DELETE FROM roadmap_items WHERE step_id = ? AND kind <> 'lesson' AND NOT (id = ANY(?::int[]))", [st.id, keep]);
    }
    // steps added after that version go to the Trash (restorable)
    await t.run('UPDATE roadmap_steps SET deleted_at = now(), deleted_by = ? WHERE deleted_at IS NULL AND NOT (id = ANY(?::int[]))', [req.user.id, keepSteps]);
    await normalizePositions(t);
  });
  await rmVersion(req, `Restored the version from ${new Date(v.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Tashkent', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
  res.json({ ok: true });
}));

// ---------- portfolio ----------
app.get('/api/portfolio', h(async (req, res) => {
  const uid = req.user.role === 'master' ? Number(req.query.user_id) : req.user.id;
  const items = await db.all('SELECT * FROM portfolio WHERE user_id = ? ORDER BY COALESCE(date, created_at::text) DESC, id DESC', [uid]);
  const u = await db.one('SELECT id, name, target_english, target_math, exam_date FROM users WHERE id = ?', [uid]);
  res.json({ user: u, items, analytics: await userAnalytics(uid) });
}));
function portfolioBody(b) {
  const title = String(b?.title || '').trim();
  if (!title) throw new HttpError('Title is required');
  return [title, String(b.category || 'Achievement'), String(b.description || '').slice(0, 3000), b.date || null, String(b.link || '').slice(0, 500)];
}
app.post('/api/portfolio', requireStudent, h(async (req, res) => {
  const r = await db.run('INSERT INTO portfolio (user_id, title, category, description, date, link) VALUES (?,?,?,?,?,?) RETURNING id', [req.user.id, ...portfolioBody(req.body)]);
  res.json({ id: r.id });
}));
app.put('/api/portfolio/:id', requireStudent, h(async (req, res) => {
  await db.run('UPDATE portfolio SET title=?, category=?, description=?, date=?, link=? WHERE id=? AND user_id=?', [...portfolioBody(req.body), req.params.id, req.user.id]);
  res.json({ ok: true });
}));
app.delete('/api/portfolio/:id', requireStudent, h(async (req, res) => {
  await db.run('DELETE FROM portfolio WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

// ---------- static client ----------
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '365d' })); // hashed build files
  app.use(express.static(dist, { extensions: ['html'], setHeaders: (res, file) => { if (/sw\.js$/.test(file)) res.setHeader('Cache-Control', 'no-cache'); } })); // /practice → practice.html (prerendered public pages)
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, fs.existsSync(path.join(dist, 'app.html')) ? 'app.html' : 'index.html')));
}

app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return bad(res, 'File is too large (max 15 MB)');
  if (err instanceof HttpError || Number.isInteger(err?.status)) return bad(res, err.message, err.status || 400, typeof err.code === 'string' && /^[a-z_]+$/.test(err.code) ? { code: err.code } : {});
  console.error(err);
  // the teacher sees the real reason (helps fixing it); students only a short message
  res.status(500).json({ error: req.user?.role === 'master' ? `Server error: ${String(err?.message || err).slice(0, 300)}` : 'Server error' });
});

export default app;
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));
}
