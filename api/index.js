/**
 * Vercel entry: every /api/* request is handled by the Express app in server/src.
 * The app needs a hosted Postgres database (DATABASE_URL / POSTGRES_URL, e.g. Neon via Vercel Storage)
 * and a teacher: MASTER_EMAIL (that email becomes the teacher on first sign-up) or MASTER_PASSWORD.
 * Until both are set, the API answers with a setup message.
 */
const missing = [];
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) missing.push('DATABASE_URL');
if (!process.env.MASTER_PASSWORD && !process.env.MASTER_EMAIL) missing.push('MASTER_EMAIL (or MASTER_PASSWORD)');
let handler;
if (missing.length) {
  handler = (req, res) => {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Setup needed: add ${missing.join(' and ')} in Vercel → Project → Settings → Environment Variables, then redeploy.` }));
  };
} else {
  handler = (await import('../server/src/index.js')).default;
}
export default handler;
