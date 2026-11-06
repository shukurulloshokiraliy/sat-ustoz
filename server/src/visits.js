/**
 * Site visitors (teacher Overview → Visitors). Every page view of the website — the home page included, signed in or
 * not — sends a tiny beacon with an anonymous visitor id kept in the browser. One row per visitor per day (Tashkent):
 * unique visitors, page views, where they came from, phone or computer, guest or student. Teachers and bots are not
 * counted. No names, IPs or other personal data are stored for guests.
 */
import { db } from './db.js';

const DAY = "(now() AT TIME ZONE 'Asia/Tashkent')::date";
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|node-fetch|vercel/i;

export async function migrateVisits() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS site_visits (
  day DATE NOT NULL, vid TEXT NOT NULL, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'direct', device TEXT NOT NULL DEFAULT 'desktop', first_path TEXT NOT NULL DEFAULT '/',
  views INTEGER NOT NULL DEFAULT 1, first_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, vid));
CREATE INDEX IF NOT EXISTS idx_site_visits_day ON site_visits(day);
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;`);
}

/** google / instagram / telegram / … from the referrer or ?utm_source. */
function sourceOf(ref, utm) {
  const s = String(utm || '').toLowerCase().trim();
  const host = (() => { try { return new URL(ref).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } })();
  const t = s || host;
  if (!t) return 'direct';
  const known = [['google', /google/], ['yandex', /yandex|ya\.ru/], ['instagram', /instagram|^ig$/], ['telegram', /telegram|t\.me|^tg$/],
    ['facebook', /facebook|fb\.|^fb$/], ['youtube', /youtube|youtu\.be|^yt$/], ['tiktok', /tiktok/], ['bing', /bing/]];
  for (const [name, re] of known) if (re.test(t)) return name;
  if (/ustozsat|sat-ustoz/.test(t)) return 'direct';
  return t.slice(0, 40);
}

export function registerVisits(app, { h, requireMaster, userFrom }) {
  app.post('/api/visit', h(async (req, res) => {
    res.status(204).end();
    try {
      const ua = String(req.headers['user-agent'] || '');
      const vid = String(req.body?.vid || '').replace(/[^\w-]/g, '').slice(0, 40);
      if (!vid || vid.length < 8 || BOT.test(ua)) return;
      const user = await userFrom(req).catch(() => null);
      if (user?.role === 'master') return;
      const path = String(req.body?.path || '/').slice(0, 120);
      const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop';
      await db.run(`INSERT INTO site_visits (day, vid, user_id, source, device, first_path) VALUES (${DAY}, ?, ?, ?, ?, ?)
        ON CONFLICT (day, vid) DO UPDATE SET views = site_visits.views + 1, last_at = now(), user_id = COALESCE(EXCLUDED.user_id, site_visits.user_id)`,
      [vid, user?.id || null, sourceOf(req.body?.ref, req.body?.utm), device, path]);
    } catch (e) { console.error('[visit]', e.message); }
  }));

  app.get('/api/visits/summary', requireMaster, h(async (req, res) => {
    const days = await db.all(`SELECT day::text AS day, COUNT(*)::int AS visitors, SUM(views)::int AS views, COUNT(user_id)::int AS students
      FROM site_visits WHERE day > ${DAY} - 30 GROUP BY day ORDER BY day`);
    const sum = await db.one(`SELECT
        COUNT(DISTINCT vid) FILTER (WHERE day = ${DAY})::int AS today,
        COUNT(DISTINCT vid) FILTER (WHERE day = ${DAY} - 1)::int AS yesterday,
        COUNT(DISTINCT vid) FILTER (WHERE day > ${DAY} - 7)::int AS week,
        COUNT(DISTINCT vid) FILTER (WHERE day > ${DAY} - 30)::int AS month,
        COALESCE(SUM(views) FILTER (WHERE day = ${DAY}), 0)::int AS views_today,
        COUNT(*) FILTER (WHERE day = ${DAY} AND user_id IS NULL)::int AS guests_today,
        COUNT(*) FILTER (WHERE day = ${DAY} AND device = 'mobile')::int AS mobile_today
      FROM site_visits WHERE day > ${DAY} - 30`);
    const sources = await db.all(`SELECT source, COUNT(*)::int AS n FROM site_visits WHERE day > ${DAY} - 7 GROUP BY source ORDER BY n DESC LIMIT 6`);
    const today = (await db.one(`SELECT ${DAY}::text AS d`)).d;
    res.json({ ...sum, days, sources, date: today });
  }));
}
