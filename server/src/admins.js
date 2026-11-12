/**
 * Admin accounts (created by the teacher = the owner). An admin is a teacher-panel account (role 'master') with a list
 * of sections in users.admin_perms; the owner has none (NULL = everything). Every API request of an admin is checked
 * against the section of its path; anything they change is written to the activity log the owner reads.
 *
 * Sections: students (students, groups, progress, assignments, consultations, live board), content (roadmap, lessons,
 * Question Bank, quality and reports, quizzes, full mocks, Word Vault, website pages), finance (Finance, payments,
 * receipts, wallets, plans given to students), support (support chats), settings (Settings, plans and prices, Telegram
 * bot, free / paid mode). Managing admins is for the owner only.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';
import { audit } from './security.js';

export const SECTIONS = ['students', 'content', 'finance', 'support', 'settings'];
const LABEL = { students: 'Students', content: 'Content', finance: 'Finance', support: 'Support', settings: 'Settings' };

export async function migrateAdmins() {
  await db.exec(`
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_perms TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by INTEGER;`);
}

export const permsOf = (u) => {
  if (!u || u.role !== 'master' || u.admin_perms == null) return null; // owner (or not staff)
  try { const a = JSON.parse(u.admin_perms); return Array.isArray(a) ? a.filter((x) => SECTIONS.includes(x)) : []; } catch { return []; }
};
export const isOwner = (u) => u?.role === 'master' && u.admin_perms == null;

/** Which section an API request belongs to (null = open to every staff account, 'owner' = owner only). */
export function sectionOf(method, path) {
  const p = path.replace(/^\/api/, '');
  const write = method !== 'GET';
  if (/^\/admins(\/|$)|^\/audit(\/|$)/.test(p)) return 'owner';
  // money first: wallets, receipts, plans given by hand, refunds
  if (/^\/(finance|payments)(\/|$)/.test(p)) return 'finance';
  if (/^\/telegram\/requests/.test(p)) return 'finance';
  if (/^\/students\/\d+\/(balance|subscription|sub|plan)(\/|$)/.test(p) && write) return 'finance';
  if (/^\/live\/bookings\/\d+\/cancel/.test(p)) return 'finance';
  if (/^\/(settings|speed|health)(\/|$)/.test(p)) return write || !p.startsWith('/settings') ? 'settings' : null;
  if (/^\/telegram(\/|$)/.test(p) && !/^\/telegram\/(webhook|link)/.test(p)) return 'settings';
  if (/^\/(plans|tiers)(\/|$)/.test(p) && write) return 'settings';
  if (/^\/(support|tg-support|asks?)(\/|$)/.test(p)) return 'support';
  if (/^\/(students|groups|progress|assignments|consultations|placement|leaderboard|live)(\/|$)/.test(p)) return 'students';
  if (/^\/(roadmap|lessons|lesson-checks|qbank|full-mocks|quizzes|questions|vocab|site|website|quality|review|question-reports|videos|videos-config|gifs|reserved|pictures|game)(\/|$)/.test(p)) return write ? 'content' : null;
  return null;
}

/** Plain words for the activity list. */
function describe(method, path) {
  const p = path.replace(/^\/api/, '');
  const id = (p.match(/\/([\w-]+)(\/[a-z-]+)?$/) || [])[1] || '';
  const rules = [
    [/^\/qbank\/admin\/bulk/, 'Changed Question Bank questions in bulk'],
    [/^\/qbank\/admin\//, `Edited question ${id}`],
    [/^\/review\/approve/, 'Approved a question'], [/^\/review\/unapprove/, 'Took back a question approval'], [/^\/review\/item/, 'Edited a question in Review'],
    [/^\/quality\/apply/, 'Applied learned difficulty'], [/^\/quality\/recalibrate/, 'Recalculated difficulty'],
    [/^\/question-reports/, 'Updated a question report'],
    [/^\/lessons\/\d+\/content/, 'Edited lesson notes'], [/^\/roadmap/, 'Changed the roadmap'],
    [/^\/quizzes/, method === 'DELETE' ? 'Deleted a quiz' : 'Saved a quiz'], [/^\/full-mocks/, 'Changed a full mock'], [/^\/vocab/, 'Changed Word Vault'],
    [/^\/site|^\/website/, 'Changed the website'],
    [/^\/students\/\d+\/balance/, 'Changed a student wallet'], [/^\/students\/\d+\/unlock/, 'Opened a lesson for a student'],
    [/^\/students\/\d+\/password/, 'Reset a student password'], [/^\/students/, method === 'DELETE' ? 'Deleted a student' : method === 'POST' ? 'Added or changed a student' : 'Edited a student'],
    [/^\/groups/, 'Changed a group'], [/^\/assignments/, 'Changed an assignment'], [/^\/consultations/, 'Changed a consultation'],
    [/^\/telegram\/requests\/\d+\/approve/, 'Approved a payment receipt'], [/^\/telegram\/requests\/\d+\/reject/, 'Rejected a payment receipt'],
    [/^\/live\/bookings/, 'Ended or cancelled a live booking'], [/^\/live\/closed/, 'Opened or closed a live time'],
    [/^\/settings/, 'Changed settings'], [/^\/support/, 'Answered in support'], [/^\/finance/, 'Changed finance'],
  ];
  for (const [re, text] of rules) if (re.test(p)) return text;
  return `${method} ${p}`;
}

/** After sign-in: block what an admin's sections don't include, and log what staff change. */
export function adminGuard() {
  return (req, res, next) => {
    const u = req.user;
    if (!u || u.role !== 'master') return next();
    if (u.disabled) return res.status(401).json({ error: 'This account is turned off. Ask the teacher.' });
    const perms = permsOf(u);
    const sec = sectionOf(req.method, req.path);
    if (perms && sec === 'owner') return res.status(403).json({ error: 'Only the main teacher account can do this' });
    if (perms && sec && sec !== 'owner' && !perms.includes(sec)) return res.status(403).json({ error: `Your admin account has no access to ${LABEL[sec]}` });
    if (req.method !== 'GET' && !/^\/api\/(visit|usage|me\/activity|activity)/.test(req.originalUrl)) {
      res.on('finish', () => {
        if (res.statusCode < 400) audit(req, 'staff', describe(req.method, req.originalUrl.split('?')[0]), req.originalUrl.split('?')[0].slice(0, 160)).catch(() => {});
      });
    }
    next();
  };
}

const genPassword = () => crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 12);

export function registerAdmins(app, { h, bad, requireMaster }) {
  const owner = (req, res, next) => (isOwner(req.user) ? next() : res.status(403).json({ error: 'Only the main teacher account can do this' }));
  const pick = (v) => [...new Set((Array.isArray(v) ? v : []).filter((x) => SECTIONS.includes(x)))];

  app.get('/api/admins', requireMaster, owner, h(async (req, res) => {
    const rows = await db.all("SELECT id, name, login, admin_perms, disabled, last_login_at, created_at FROM users WHERE role = 'master' AND admin_perms IS NOT NULL ORDER BY created_at");
    const last = await db.all(`SELECT DISTINCT ON (actor_id) actor_id, at, target FROM audit_log WHERE action = 'staff' ORDER BY actor_id, at DESC`).catch(() => []);
    const lastBy = new Map(last.map((r) => [r.actor_id, r]));
    res.json({ sections: SECTIONS.map((id) => ({ id, label: LABEL[id] })), admins: rows.map((r) => ({ ...r, admin_perms: undefined, perms: permsOf({ ...r, role: 'master' }), last_action: lastBy.get(r.id) || null })) });
  }));

  app.post('/api/admins', requireMaster, owner, h(async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const login = String(req.body?.login || '').trim().toLowerCase().replace(/\s+/g, '').slice(0, 40);
    if (!name) return bad(res, 'Write the admin\'s name');
    if (!/^[a-z0-9._-]{3,40}$/.test(login)) return bad(res, 'Login: 3–40 letters, numbers, dots or dashes');
    if (await db.one('SELECT 1 AS x FROM users WHERE login = ? OR email = ?', [login, login])) return bad(res, 'This login is already taken');
    const perms = pick(req.body?.perms);
    if (!perms.length) return bad(res, 'Tick at least one section');
    const password = String(req.body?.password || '').trim() || genPassword();
    if (password.length < 8) return bad(res, 'The password needs at least 8 characters');
    const u = await db.one(`INSERT INTO users (name, login, password_hash, role, provider, admin_perms, created_by) VALUES (?, ?, ?, 'master', 'admin', ?, ?) RETURNING id`,
      [name, login, bcrypt.hashSync(password, 12), JSON.stringify(perms), req.user.id]);
    await audit(req, 'staff', `Created admin ${name}`, `admin ${u.id}`);
    res.json({ id: u.id, login, password });
  }));

  app.put('/api/admins/:id', requireMaster, owner, h(async (req, res) => {
    const a = await db.one("SELECT * FROM users WHERE id = ? AND role = 'master' AND admin_perms IS NOT NULL", [Number(req.params.id)]);
    if (!a) return bad(res, 'Admin not found', 404);
    const b = req.body || {};
    const perms = 'perms' in b ? pick(b.perms) : permsOf(a);
    if (!perms.length) return bad(res, 'Tick at least one section');
    const name = 'name' in b ? String(b.name || '').trim().slice(0, 80) || a.name : a.name;
    const disabled = 'disabled' in b ? !!b.disabled : a.disabled;
    // turning an account off or changing its sections signs it out everywhere
    await db.run('UPDATE users SET name = ?, admin_perms = ?, disabled = ?, token_version = token_version + 1 WHERE id = ?', [name, JSON.stringify(perms), disabled, a.id]);
    await audit(req, 'staff', disabled && !a.disabled ? `Turned off admin ${name}` : !disabled && a.disabled ? `Turned on admin ${name}` : `Changed admin ${name}`, `admin ${a.id}`);
    res.json({ ok: true });
  }));

  app.post('/api/admins/:id/password', requireMaster, owner, h(async (req, res) => {
    const a = await db.one("SELECT * FROM users WHERE id = ? AND role = 'master' AND admin_perms IS NOT NULL", [Number(req.params.id)]);
    if (!a) return bad(res, 'Admin not found', 404);
    const password = genPassword();
    await db.run('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [bcrypt.hashSync(password, 12), a.id]);
    await audit(req, 'staff', `New password for admin ${a.name}`, `admin ${a.id}`);
    res.json({ password });
  }));

  // activity of staff accounts (admins, and the owner's own changes when asked)
  app.get('/api/admins/activity', requireMaster, owner, h(async (req, res) => {
    const who = Number(req.query.admin) || null;
    const rows = await db.all(`SELECT l.id, l.actor_id, l.actor, l.target AS what, l.detail AS path, l.at FROM audit_log l
      JOIN users u ON u.id = l.actor_id WHERE l.action = 'staff' AND u.admin_perms IS NOT NULL ${who ? 'AND l.actor_id = ?' : ''} ORDER BY l.at DESC LIMIT 200`, who ? [who] : []);
    res.json({ rows });
  }));
}
