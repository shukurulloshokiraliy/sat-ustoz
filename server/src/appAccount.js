/**
 * Routes the iOS app needs for the App Store (additive: nothing existing changes).
 *
 *  - DELETE /api/me            the student deletes their own account (App Store guideline 5.1.1(v)).
 *                              Payment records stay (keepPaymentRecords in finance.js keeps `who`), the audit log
 *                              notes it, money left in the wallet is lost only after the student confirms it.
 *  - POST   /api/auth/apple    "Sign in with Apple" (guideline 4.8). The app sends Apple's identity token; we verify its
 *                              signature against Apple's public keys, the issuer and the audience (APPLE_BUNDLE_ID).
 *
 * Payment rows survive the deletion (keepPaymentRecords in finance.js: user_id → NULL, the name stays in `who`).
 */
import bcrypt from 'bcryptjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { db } from './db.js';
import { startSession } from './auth.js';
import { audit } from './security.js';

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const bundleIds = () => String(process.env.APPLE_BUNDLE_ID || 'uz.ustozsat.app').split(',').map((s) => s.trim()).filter(Boolean);

export async function migrateAppAccount() {
  await db.exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub TEXT');
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_sub ON users(apple_sub) WHERE apple_sub IS NOT NULL');
}

async function verifyAppleToken(token) {
  try {
    const { payload } = await jwtVerify(String(token || ''), APPLE_JWKS, { issuer: 'https://appleid.apple.com', audience: bundleIds() });
    return { sub: String(payload.sub), email: payload.email ? String(payload.email).toLowerCase() : '', verified: payload.email_verified === true || payload.email_verified === 'true' };
  } catch (e) {
    const offline = /fetch|ENOTFOUND|ECONN|network/i.test(String(e?.message) + String(e?.cause?.code || ''));
    throw Object.assign(new Error(offline ? 'Could not reach Apple — check your internet connection' : 'Sign in with Apple failed — please try again'), { status: offline ? 502 : 401 });
  }
}

export function registerAppAuth(app, { h, bad }) {
  app.post('/api/auth/apple', h(async (req, res) => {
    const a = await verifyAppleToken(req.body?.identity_token);
    let u = await db.one('SELECT * FROM users WHERE apple_sub = ?', [a.sub]);
    // an existing website account with the same verified email signs in and gets linked
    if (!u && a.email && a.verified) {
      u = await db.one('SELECT * FROM users WHERE email = ? OR login = ?', [a.email, a.email]);
      if (u) await db.run('UPDATE users SET apple_sub = ? WHERE id = ?', [a.sub, u.id]);
    }
    if (u) {
      if (u.disabled) return bad(res, 'This account is turned off. Ask the teacher.', 403);
      if (u.role !== 'student') return bad(res, 'Teacher accounts use the website: ustozsat.uz', 403);
      await db.run('UPDATE users SET last_login_at = now() WHERE id = ?', [u.id]);
      return res.json({ token: startSession(res, u) });
    }
    // a new account: the oferta is accepted once, when the account is created (same rule as Google and Telegram)
    if (req.body?.accept_terms !== true) return bad(res, 'New account: tick “I agree to the oferta” to create it', 400, { code: 'terms_required' });
    // Apple sends the name only the first time; the app passes it on. Students can change it in Profile.
    const name = String(req.body?.name || '').trim().slice(0, 80) || 'SAT Student';
    const login = a.email || `apple_${a.sub.slice(0, 24)}`;
    const r = await db.run(
      "INSERT INTO users (name, login, email, password_hash, role, provider, apple_sub, last_login_at, terms_accepted_at) VALUES (?,?,?,NULL,'student','apple',?, now(), now()) RETURNING id, role",
      [name, login, a.email || null, a.sub]
    );
    res.json({ token: startSession(res, { id: r.id, role: 'student' }) });
  }));
}

export function registerAppAccount(app, { h, bad, requireStudent }) {
  app.delete('/api/me', requireStudent, h(async (req, res) => {
    const u = await db.one('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!u) return bad(res, 'Account not found', 404);
    if (req.body?.confirm !== 'DELETE') return bad(res, 'Type DELETE to confirm');
    // accounts with a password confirm it; Google / Telegram / Apple accounts have none
    if (u.password_hash && !bcrypt.compareSync(String(req.body?.password || '').slice(0, 200), u.password_hash)) {
      return bad(res, 'Wrong password', 401, { code: 'wrong_password' });
    }
    if (Number(u.balance) > 0 && req.body?.forfeit_balance !== true) {
      return bad(res, `Your wallet still has ${Number(u.balance).toLocaleString('en-US').replace(/,/g, ' ')} so'm. Deleting the account removes it.`, 409, { code: 'balance', balance: Number(u.balance) });
    }
    await audit(req, 'self_deleted', `student ${u.id}`, `${u.name} <${u.email || u.login}> balance ${u.balance}`);
    await db.run("DELETE FROM users WHERE id = ? AND role = 'student'", [u.id]);
    res.json({ ok: true });
  }));
}
