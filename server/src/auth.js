import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DB_KIND, db } from './db.js';

let SECRET = process.env.JWT_SECRET || null;
/**
 * Signing secret for sessions: JWT_SECRET, else one generated once and kept in the database
 * (Postgres: shared by every server instance, e.g. on Vercel) or in DATA_DIR (local PGlite).
 */
export async function initSecret() {
  if (SECRET) return;
  if (DB_KIND === 'postgres') {
    await db.run("INSERT INTO settings (key, value) VALUES ('_jwt_secret', ?) ON CONFLICT (key) DO NOTHING", [crypto.randomBytes(48).toString('hex')]);
    SECRET = (await db.one("SELECT value FROM settings WHERE key = '_jwt_secret'")).value;
    return;
  }
  const f = path.join(DATA_DIR, '.jwt-secret');
  if (fs.existsSync(f)) { SECRET = fs.readFileSync(f, 'utf8'); return; }
  SECRET = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(f, SECRET, { mode: 0o600 });
}

export const signToken = (user) => jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '30d' });

export const subActive = (u) => !!(u?.sub_until && new Date(u.sub_until) > new Date());

export function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return { ...rest, has_password: !!password_hash, sub_active: subActive(u) };
}

export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please sign in' });
  let p;
  try {
    p = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired — please sign in again' });
  }
  try {
    const user = await db.one('SELECT * FROM users WHERE id = ?', [p.id]);
    if (!user) return res.status(401).json({ error: 'Account not found' });
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

export const requireMaster = (req, res, next) =>
  req.user?.role === 'master' ? next() : res.status(403).json({ error: 'Teachers only' });

export const requireStudent = (req, res, next) =>
  req.user?.role === 'student' ? next() : res.status(403).json({ error: 'Students only' });

/**
 * “Sign in with Google” (Google Identity Services): the browser gets an ID token (JWT) from Google.
 * We verify its signature against Google's public keys, the audience (our client ID) and the issuer.
 * Only the public GOOGLE_CLIENT_ID is needed — no client secret.
 */
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function verifyGoogleCredential(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw Object.assign(new Error('Google sign-in is not configured on this server'), { status: 400 });
  let payload;
  try {
    ({ payload } = await jwtVerify(String(credential || ''), GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
    }));
  } catch (e) {
    const offline = /fetch|ENOTFOUND|ECONN|network/i.test(String(e?.message) + String(e?.cause?.code || ''));
    throw Object.assign(new Error(offline ? 'Could not reach Google — check your internet connection' : 'Google sign-in failed — please try again'), { status: offline ? 502 : 401 });
  }
  if (!payload.email || payload.email_verified === false) throw Object.assign(new Error('Your Google email is not verified'), { status: 400 });
  return { id: payload.sub, email: String(payload.email).toLowerCase(), name: payload.name || payload.email.split('@')[0], avatar: payload.picture || '' };
}
