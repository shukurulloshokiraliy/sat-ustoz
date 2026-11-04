/**
 * Platform hardening: security headers, CORS allow-list, request rate limits, session revocation and an audit log.
 */
import { db } from './db.js';

export const ORIGINS = ['https://www.ustozsat.uz', 'https://ustozsat.uz', 'https://sat-ustoz.vercel.app'];
const DEV = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
export const corsOptions = {
  origin: (origin, cb) => cb(null, !origin || ORIGINS.includes(origin) || (!process.env.VERCEL && DEV.test(origin))),
  credentials: false,
  maxAge: 600,
};

/** Content Security Policy shared by the API and the static site (vercel.json has the same value). */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://accounts.google.com/gsi/ https://video.bunnycdn.com",
  "frame-src 'self' blob: https://accounts.google.com https://player.mediadelivery.net https://iframe.mediadelivery.net https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://drive.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  else res.setHeader('Content-Security-Policy', CSP);
  next();
}

export const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);

/**
 * Simple sliding-window limiter per IP (per server instance). Stops floods and scripted guessing;
 * sign-in brute force is additionally counted in the database (tiers.js auth_fails).
 */
export function rateLimit({ windowMs, max, key = (req) => clientIp(req), message = 'Too many requests. Please wait a minute.' }) {
  const hits = new Map();
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(k, arr);
    if (hits.size > 20000) for (const [kk, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(kk);
    if (arr.length > max) { res.setHeader('Retry-After', Math.ceil(windowMs / 1000)); return res.status(429).json({ error: message }); }
    next();
  };
}

export async function migrateSecurity() {
  await db.exec(`
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY, actor_id INTEGER, actor TEXT NOT NULL DEFAULT '', action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '', at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
`);
}

/** Record a sensitive action (never throws). */
export async function audit(req, action, target = '', detail = '') {
  try {
    await db.run('INSERT INTO audit_log (actor_id, actor, action, target, detail, ip) VALUES (?,?,?,?,?,?)',
      [req?.user?.id || null, req?.user?.name || '', action, String(target).slice(0, 200), String(detail).slice(0, 500), req ? clientIp(req) : '']);
  } catch (e) { console.error('[audit]', e.message); }
}

const COMMON = new Set(['123456', '1234567', '12345678', '123456789', '1234567890', '111111', '000000', '654321', '123123', 'password', 'qwerty', 'qwerty123', 'abc123', 'password1', 'iloveyou', '11111111', '00000000', '12341234', 'parol', 'parol123', 'sat123', 'satustoz']);
/** Returns an error message, or '' when the password is acceptable. */
export function weakPassword(pw, { name = '', email = '' } = {}) {
  const p = String(pw || '');
  if (p.length < 8) return 'Password must be at least 8 characters';
  if (p.length > 100) return 'Password is too long';
  if (COMMON.has(p.toLowerCase()) || /^(.)\1+$/.test(p)) return 'This password is too easy to guess — choose another one';
  const low = p.toLowerCase();
  if ((email && low === String(email).toLowerCase()) || (name && low === String(name).toLowerCase().replace(/\s+/g, ''))) return 'Do not use your name or email as the password';
  return '';
}
