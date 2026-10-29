import express from 'express';
import cors from 'cors';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, migrate, getSettings, setSettings, DB_KIND } from './db.js';
import { initSecret, signToken, publicUser, requireAuth, requireMaster, requireStudent, subActive, verifyGoogleCredential } from './auth.js';
import { parseUpload, buildTemplate, DEFAULT_PROMPT } from './parse.js';
import { userAnalytics, estimateScore } from './analytics.js';
import { seed } from './seed.js';
import { registerPlacement } from './placement/routes.js';
import { lessonSummary, syncBundledModules } from './course/modules.js';
import { registerLessons } from './course/lessons.js';
import { registerQbank, syncQbank } from './qbank.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg, code = 400, extra = {}) => res.status(code).json({ error: msg, ...extra });
class HttpError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

app.use(cors());
app.use(express.json({ limit: '5mb' }));

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
  return hash.digest('hex');
}
await migrate();
await initSecret();
const seeded = await seed();
const fingerprint = contentHash();
const synced = await db.one("SELECT value FROM settings WHERE key = '_content_hash'");
if (seeded || synced?.value !== fingerprint) {
  await syncBundledModules();
  await syncQbank();
  await db.run("INSERT INTO settings (key, value) VALUES ('_content_hash', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [fingerprint]);
}
if (seeded) console.log(`[seed] Teacher login: ${seeded.masterLogin}${process.env.VERCEL ? '' : ` / ${seeded.masterPass}  |  demo student: shukurullo / student123`}`);
console.log(`[db] ${DB_KIND === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'embedded PGlite (local)'}`);

// ---------- helpers ----------
const genPassword = () => crypto.randomBytes(5).toString('hex'); // 10 chars
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'student';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
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
  return {
    subscription_required: required,
    sub_active: subActive(user),
    can_practice: user.role === 'master' || !required || subActive(user),
    needs_placement: user.role === 'student' && !user.placement_at,
    needs_diagnostic: user.role === 'student' && !user.placement_at, // kept for older clients
  };
}
async function mepayload(user) {
  const group = user.group_id ? await db.one('SELECT id, name FROM groups WHERE id = ?', [user.group_id]) : null;
  return { ...publicUser(user), group, access: await accessFor(user) };
}

// ---------- public ----------
app.get('/api/config', h(async (req, res) => {
  const s = await getSettings();
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    google: !!process.env.GOOGLE_CLIENT_ID,
    telegram_bot: s.telegram_bot,
    prices: { month: +s.price_month || 0, quarter: +s.price_quarter || 0, currency: s.currency },
  });
}));

// ---------- auth ----------
app.post('/api/auth/login', h(async (req, res) => {
  const { login, password } = req.body || {};
  const id = String(login || '').trim().toLowerCase();
  const u = id && (await db.one('SELECT * FROM users WHERE login = ? OR email = ?', [id, id]));
  if (!u || !u.password_hash || !bcrypt.compareSync(String(password || ''), u.password_hash)) {
    return bad(res, u && !u.password_hash ? 'This account uses Google — tap “Continue with Google”' : 'Incorrect login or password', 401);
  }
  await db.run('UPDATE users SET last_login_at = now() WHERE id = ?', [u.id]);
  res.json({ token: signToken(u) });
}));

app.post('/api/auth/register', h(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (name.length < 2) return bad(res, 'Please enter your full name');
  if (!EMAIL_RE.test(email)) return bad(res, 'Please enter a valid email');
  if (password.length < 6) return bad(res, 'Password must be at least 6 characters');
  if (await db.one('SELECT 1 AS x FROM users WHERE email = ? OR login = ?', [email, email])) return bad(res, 'An account with this email already exists — sign in instead', 409);
  const r = await db.run(
    "INSERT INTO users (name, login, email, password_hash, role, provider, last_login_at) VALUES (?,?,?,?,'student','email', now()) RETURNING id",
    [name, email, email, bcrypt.hashSync(password, 10)]
  );
  res.json({ token: signToken({ id: r.id, role: 'student' }) });
}));

app.post('/api/auth/google', h(async (req, res) => {
  const g = await verifyGoogleCredential(req.body?.credential);
  let u = await db.one('SELECT * FROM users WHERE email = ? OR login = ?', [g.email, g.email]);
  if (u) {
    await db.run("UPDATE users SET last_login_at = now(), avatar_url = CASE WHEN avatar_url = '' THEN ? ELSE avatar_url END WHERE id = ?", [g.avatar, u.id]);
  } else {
    const r = await db.run(
      "INSERT INTO users (name, login, email, password_hash, role, provider, avatar_url, last_login_at) VALUES (?,?,?,NULL,'student','google',?, now()) RETURNING id, role",
      [g.name, g.email, g.email, g.avatar]
    );
    u = { id: r.id, role: 'student' };
  }
  res.json({ token: signToken(u) });
}));

const PUBLIC = new Set(['/auth/login', '/auth/register', '/auth/google', '/config', '/template.xlsx']);
app.use('/api', (req, res, next) => (PUBLIC.has(req.path) && req.path !== '/template.xlsx' ? next() : requireAuth(req, res, next)));

registerPlacement(app, { h, bad, requireStudent, requireMaster });
registerLessons(app, { h, bad, requireStudent, requireMaster, roadmapFor: (u) => roadmapFor(u), accessFor: (u) => accessFor(u) });
registerQbank(app, { h, bad, requireStudent, requireMaster, accessFor: (u) => accessFor(u), upload });

app.get('/api/me', h(async (req, res) => res.json(await mepayload(req.user))));
app.put('/api/me', h(async (req, res) => {
  const { name, target_english, target_math, exam_date } = req.body || {};
  const clamp = (v, d) => (Number.isFinite(+v) ? Math.max(200, Math.min(800, Math.round(+v))) : d);
  await db.run('UPDATE users SET name = ?, target_english = ?, target_math = ?, exam_date = ? WHERE id = ?', [
    String(name || req.user.name).trim() || req.user.name,
    clamp(target_english, req.user.target_english),
    clamp(target_math, req.user.target_math),
    exam_date || null,
    req.user.id,
  ]);
  res.json(await mepayload(await db.one('SELECT * FROM users WHERE id = ?', [req.user.id])));
}));
app.put('/api/me/password', h(async (req, res) => {
  const { current, next } = req.body || {};
  if (req.user.password_hash && !bcrypt.compareSync(String(current || ''), req.user.password_hash)) return bad(res, 'Current password is incorrect');
  if (String(next || '').length < 6) return bad(res, 'New password must be at least 6 characters');
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(next, 10), req.user.id]);
  res.json({ ok: true });
}));

// ---------- settings (teacher) ----------
app.get('/api/settings', requireMaster, h(async (req, res) => {
  res.json({ ...(await getSettings()), google_configured: !!process.env.GOOGLE_CLIENT_ID, database: DB_KIND });
}));
app.put('/api/settings', requireMaster, h(async (req, res) => {
  const b = req.body || {};
  const digits = (v) => String(v ?? '').replace(/\D/g, '').slice(0, 12);
  const patch = {};
  if ('require_subscription' in b) patch.require_subscription = b.require_subscription ? 'true' : 'false';
  if ('price_month' in b) patch.price_month = digits(b.price_month);
  if ('price_quarter' in b) patch.price_quarter = digits(b.price_quarter);
  if ('currency' in b) patch.currency = String(b.currency || 'UZS').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'UZS';
  if ('telegram_bot' in b) patch.telegram_bot = String(b.telegram_bot || '').trim().replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64);
  res.json(await setSettings(patch));
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
  u.exam_date, u.created_at, u.last_login_at, u.diagnostic_score, u.cefr, u.admitted, u.placement_at, u.sub_until, u.sub_plan,
  (SELECT MAX(finished_at) FROM attempts a WHERE a.user_id = u.id) AS last_active,
  (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.finished_at IS NOT NULL) AS attempts
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
app.post('/api/students', requireMaster, h(async (req, res) => {
  const { name, group_id, login, password } = req.body || {};
  const nm = String(name || '').trim();
  if (!nm) return bad(res, 'Name is required');
  const lg = String(login || '').trim().toLowerCase() || (await uniqueLogin(nm));
  if (await db.one('SELECT 1 AS x FROM users WHERE login = ? OR email = ?', [lg, lg])) return bad(res, 'This login is already taken');
  const pw = String(password || '').trim() || genPassword();
  const r = await db.run("INSERT INTO users (name, login, password_hash, role, provider, group_id) VALUES (?,?,?,'student','teacher',?) RETURNING id",
    [nm, lg, bcrypt.hashSync(pw, 10), group_id || null]);
  res.json({ id: r.id, name: nm, login: lg, password: pw });
}));
app.put('/api/students/:id', requireMaster, h(async (req, res) => {
  const s = await db.one("SELECT * FROM users WHERE id = ? AND role = 'student'", [req.params.id]);
  if (!s) return bad(res, 'Not found', 404);
  const { name, group_id, target_english, target_math, exam_date } = req.body || {};
  await db.run('UPDATE users SET name = ?, group_id = ?, target_english = ?, target_math = ?, exam_date = ? WHERE id = ?', [
    String(name || s.name).trim(), group_id || null,
    target_english ?? s.target_english, target_math ?? s.target_math, exam_date ?? s.exam_date, s.id,
  ]);
  res.json({ ok: true });
}));
app.post('/api/students/:id/reset-password', requireMaster, h(async (req, res) => {
  const pw = String(req.body?.password || '').trim() || genPassword();
  const r = await db.run("UPDATE users SET password_hash = ? WHERE id = ? AND role = 'student'", [bcrypt.hashSync(pw, 10), req.params.id]);
  if (!r.rowCount) return bad(res, 'Not found', 404);
  const u = await db.one('SELECT login FROM users WHERE id = ?', [req.params.id]);
  res.json({ password: pw, login: u.login });
}));
app.delete('/api/students/:id', requireMaster, h(async (req, res) => {
  await db.run("DELETE FROM users WHERE id = ? AND role = 'student'", [req.params.id]);
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
  const plan = String(req.body?.plan || (days >= 90 ? 'quarter' : 'month')).slice(0, 20);
  const amount = Math.max(0, Math.round(+req.body?.amount || 0));
  const settings = await getSettings();
  const from = subActive(s) ? new Date(s.sub_until) : new Date();
  const until = new Date(from.getTime() + days * 86400e3).toISOString();
  await db.tx(async (t) => {
    await t.run('UPDATE users SET sub_until = ?, sub_plan = ? WHERE id = ?', [until, plan, s.id]);
    await t.run("INSERT INTO payments (user_id, provider, plan, days, amount, currency, note, created_by) VALUES (?, 'manual', ?, ?, ?, ?, ?, ?)",
      [s.id, plan, days, amount, settings.currency, String(req.body?.note || '').slice(0, 300), req.user.id]);
  });
  res.json({ sub_until: until, sub_active: true });
}));
app.delete('/api/students/:id/subscription', requireMaster, h(async (req, res) => {
  await db.run("UPDATE users SET sub_until = NULL WHERE id = ? AND role = 'student'", [req.params.id]);
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

const VISIBLE = `(q.is_public OR q.kind = 'diagnostic'
  OR q.id IN (SELECT quiz_id FROM quiz_groups WHERE group_id = ?)
  OR q.id IN (SELECT quiz_id FROM roadmap_items WHERE quiz_id IS NOT NULL))`;
async function canAccess(user, quizId) {
  if (user.role === 'master') return true;
  return !!(await db.one(`SELECT 1 AS x FROM quizzes q WHERE q.id = ? AND ${VISIBLE}`, [quizId, user.group_id ?? -1]));
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
    if (id) await t.run('UPDATE quizzes SET title = ?, section = ?, kind = ?, is_public = ?, duration_min = ? WHERE id = ?', [title.trim(), sec, knd, !!is_public, dur, id]);
    else id = (await t.run('INSERT INTO quizzes (title, section, kind, is_public, duration_min, created_by) VALUES (?,?,?,?,?,?) RETURNING id', [title.trim(), sec, knd, !!is_public, dur, req.user.id])).id;

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
app.post('/api/quizzes', requireMaster, h(async (req, res) => res.json({ id: await saveQuiz(req) })));
app.put('/api/quizzes/:id', requireMaster, h(async (req, res) => {
  if (!(await db.one('SELECT 1 AS x FROM quizzes WHERE id = ?', [req.params.id]))) return bad(res, 'Not found', 404);
  res.json({ id: await saveQuiz(req, Number(req.params.id)) });
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
function timing(quiz, attempt) {
  const total = quiz.duration_min * 60;
  const elapsed = Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000);
  return { total_seconds: total, remaining: total ? Math.max(0, total - elapsed) : null, elapsed };
}
async function attemptPayload(attempt, quiz) {
  const rows = await db.all('SELECT * FROM questions WHERE quiz_id = ? ORDER BY position, id', [quiz.id]);
  const qs = rows.map(qPublic);
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
    ...timing(quiz, attempt),
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
const ITEM_KINDS = ['video', 'quiz', 'reading', 'lesson'];

async function loadSteps(where = '', params = []) {
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
  const best = new Map((await db.all(`SELECT quiz_id, MAX(ROUND(100.0 * score / NULLIF(total, 0))) AS best FROM attempts
    WHERE user_id = ? AND finished_at IS NOT NULL GROUP BY quiz_id`, [user.id])).map((r) => [r.quiz_id, r.best || 0]));
  const done = new Set((await db.all('SELECT item_id FROM roadmap_done WHERE user_id = ?', [user.id])).map((r) => r.item_id));
  const checks = new Map((await db.all(`SELECT item_id, bool_or(passed) AS passed, MAX(ROUND(100.0 * score / NULLIF(total, 0))) AS best,
    COUNT(finished_at) AS tries FROM lesson_checks WHERE user_id = ? GROUP BY item_id`, [user.id])).map((r) => [r.item_id, r]));
  const a = await userAnalytics(user.id);
  const estimate = a.estimates.english ?? user.diagnostic_score ?? null;
  let blocked = false;
  const out = steps.map((s) => {
    // lessons open one after another; vocabulary is open with the step; the session check opens after every lesson
    let prevLessonsPassed = true;
    const items = s.items.map((it) => {
      if (it.kind === 'quiz') {
        const b = it.quiz_id ? best.get(it.quiz_id) ?? null : null;
        return { ...it, best: b, done: b != null && b >= s.pass_pct };
      }
      if (it.kind === 'lesson') {
        const type = it.lesson?.type || 'section';
        if (type === 'vocab') return { ...it, done: done.has(it.id), locked: blocked };
        const c = checks.get(it.id);
        const passed = !!c?.passed;
        const locked = blocked || it.status !== 'ready' || !prevLessonsPassed;
        if (type === 'section') prevLessonsPassed = prevLessonsPassed && passed;
        return { ...it, done: passed, best: c?.best ?? null, tries: c?.tries || 0, locked };
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
app.get('/api/roadmap', h(async (req, res) => res.json(await roadmapFor(req.user))));

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
      url: kind === 'video' || kind === 'lesson' ? url : '',
      body: kind === 'reading' ? String(it?.body || '').slice(0, 10000) : '',
    };
    if (kind === 'quiz' && !out.quiz_id) throw new HttpError(`Item ${i + 1}: choose a quiz`);
    if (kind === 'video' && !/^https?:\/\//i.test(out.url)) throw new HttpError(`Item ${i + 1}: paste a video link (https://…)`);
    if (kind === 'lesson' && out.url && !/^https?:\/\//i.test(out.url)) throw new HttpError(`Item ${i + 1}: the video link must start with https://`);
    if (kind === 'lesson' && !out.id) throw new HttpError(`Item ${i + 1}: lessons are added by importing a course module`);
    if (kind === 'reading' && !out.body.trim() && !out.title) throw new HttpError(`Item ${i + 1}: write the notes`);
    if (!out.title) out.title = kind === 'video' ? 'Video lesson' : kind === 'quiz' ? 'Practice quiz' : 'Study notes';
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
    const vals = [i, it.kind, it.title, it.quiz_id, it.url, it.body];
    if (it.id && (await t.one('SELECT 1 AS x FROM roadmap_items WHERE id = ? AND step_id = ?', [it.id, stepId]))) {
      await t.run('UPDATE roadmap_items SET position=?, kind=?, title=?, quiz_id=?, url=?, body=? WHERE id = ?', [...vals, it.id]);
      keep.push(it.id);
    } else {
      keep.push((await t.run('INSERT INTO roadmap_items (step_id, position, kind, title, quiz_id, url, body) VALUES (?,?,?,?,?,?,?) RETURNING id', [stepId, ...vals])).id);
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
  res.json((await loadSteps('WHERE id = ?', [req.params.id]))[0]);
}));
// rules sheet (PDF) of a step: students download it, the teacher uploads/replaces/removes it
app.get('/api/roadmap/steps/:id/handout', h(async (req, res) => {
  const row = await db.one('SELECT name, data FROM step_handouts WHERE step_id = ?', [req.params.id]);
  if (!row) return bad(res, 'No rules sheet for this step', 404);
  if (req.user.role !== 'master' && !(await accessFor(req.user)).can_practice) {
    const free = (await db.all("SELECT content FROM roadmap_items WHERE step_id = ? AND kind = 'lesson'", [req.params.id])).some((i) => { try { return JSON.parse(i.content || '{}').free; } catch { return false; } });
    if (!free) return bad(res, 'An active subscription is required', 402, { code: 'subscription_required' });
  }
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(row.name)}"`, 'Cache-Control': 'private, max-age=300' });
  res.send(Buffer.from(row.data));
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
app.delete('/api/roadmap/steps/:id/handout', requireMaster, h(async (req, res) => {
  await db.run('DELETE FROM step_handouts WHERE step_id = ?', [req.params.id]);
  res.json((await loadSteps('WHERE id = ?', [req.params.id]))[0]);
}));

app.delete('/api/roadmap/steps/:id', requireMaster, h(async (req, res) => {
  await db.run('DELETE FROM roadmap_steps WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));
app.put('/api/roadmap/order', requireMaster, h(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  await db.tx(async (t) => {
    for (let i = 0; i < ids.length; i++) await t.run('UPDATE roadmap_steps SET position = ? WHERE id = ?', [i, ids[i]]);
  });
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
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return bad(res, 'File is too large (max 15 MB)');
  if (err instanceof HttpError || Number.isInteger(err?.status)) return bad(res, err.message, err.status || 400);
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

export default app;
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));
}
