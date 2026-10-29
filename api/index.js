/**
 * Vercel entry: every /api/* request is handled by the Express app in server/src.
 * The app needs a hosted Postgres database (DATABASE_URL) and a teacher password
 * (MASTER_PASSWORD) — until both are set, the API answers with a setup message.
 */
const missing = ['DATABASE_URL', 'MASTER_PASSWORD'].filter((k) => !process.env[k]);
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
