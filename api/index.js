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
  try {
    handler = (await import('../server/src/index.js')).default;
  } catch (e) {
    // start-up failed (most often the database): answer with the reason instead of crashing every request,
    // then let Vercel start a fresh instance for the next request
    console.error('[startup] failed:', e);
    const why = String(e?.message || e).replace(/postgres(ql)?:\/\/\S+/gi, '[database]').slice(0, 200);
    let left = 3;
    handler = (req, res) => {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `The site is temporarily unavailable. Please try again in a minute. (${why})` }));
      if (--left <= 0) setTimeout(() => process.exit(1), 50);
    };
  }
}
export default handler;
