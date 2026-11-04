/**
 * GIFs and memes on roadmap topics, lessons and vocabulary units.
 *
 * The teacher picks a GIF from GIPHY (search goes through our server, so the API key never reaches the browser)
 * or pastes a link (GIPHY page, Tenor or any https image). One GIF per topic / lesson / unit, stored here
 * instead of in the content tables, so course syncs and editors never overwrite it.
 */
import { db, getSettings } from './db.js';

export const GIF_KINDS = ['step', 'item', 'unit'];

export async function migrateGifs() {
  await db.exec(`CREATE TABLE IF NOT EXISTS media_gifs (
    kind TEXT NOT NULL, ref INTEGER NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (kind, ref));
  ALTER TABLE media_gifs ENABLE ROW LEVEL SECURITY;`);
}

/** Map ref → { url, title, source } for one kind. */
export async function gifMap(kind, ids) {
  if (!ids.length) return new Map();
  const rows = await db.all('SELECT ref, url, title, source FROM media_gifs WHERE kind = ? AND ref = ANY(?::int[])', [kind, ids.map(Number)]);
  return new Map(rows.map((r) => [r.ref, { url: r.url, title: r.title, source: r.source }]));
}

const key = (s) => String(process.env.GIPHY_API_KEY || s.giphy_key || '').trim();

/** A GIPHY page / media link, Tenor link or any https image → a direct image URL. */
export function cleanGifUrl(raw) {
  const u = String(raw || '').trim().slice(0, 600);
  let url;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  // https://giphy.com/gifs/some-slug-AbC123 → media link
  const gp = url.hostname.endsWith('giphy.com') && !url.hostname.startsWith('media') && !url.hostname.startsWith('i.') ? url.pathname.match(/\/(?:gifs|stickers|embed)\/(?:[\w-]*-)?([A-Za-z0-9]{6,})\/?$/) : null;
  if (gp) return { url: `https://media.giphy.com/media/${gp[1]}/giphy.webp`, source: 'giphy' };
  if (/(^|\.)giphy\.com$/.test(url.hostname)) return { url: url.href, source: 'giphy' };
  if (/(^|\.)tenor\.com$/.test(url.hostname)) {
    if (/^media\d*\.tenor\.com$/.test(url.hostname) || /\.(gif|webp|mp4)$/i.test(url.pathname)) return { url: url.href, source: 'tenor' };
    return { error: 'Tenor page links do not work — right-click the GIF and copy the image address (media.tenor.com/…)' };
  }
  if (/\.(gif|webp|png|jpe?g)$/i.test(url.pathname)) return { url: url.href, source: 'link' };
  return { error: 'Paste a GIPHY link, a Tenor image address or a link that ends in .gif / .webp' };
}

export function registerGifs(app, { h, bad, requireMaster }) {
  // teacher search (empty query = trending); results are cached for a short while to save the GIPHY quota
  const cache = new Map();
  app.get('/api/gifs/search', requireMaster, h(async (req, res) => {
    const s = await getSettings();
    const k = key(s);
    if (!k) return bad(res, 'Add a GIPHY API key in Settings → GIFs first', 409, { code: 'giphy_missing' });
    const q = String(req.query.q || '').trim().slice(0, 60);
    const offset = Math.max(0, Math.min(400, Number(req.query.offset) || 0));
    const id = `${q}|${offset}`;
    const hit = cache.get(id);
    if (hit && hit.at > Date.now() - 10 * 60e3) return res.json(hit.data);
    const p = new URLSearchParams({ api_key: k, limit: '24', offset: String(offset), rating: 'pg', lang: 'en', bundle: 'messaging_non_clips' });
    if (q) p.set('q', q);
    let r;
    try { r = await fetch(`https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}?${p}`, { signal: AbortSignal.timeout(8000) }); }
    catch { return bad(res, 'GIPHY did not answer — try again', 502); }
    if (r.status === 401 || r.status === 403) return bad(res, 'GIPHY rejected the API key — check it in Settings', 409, { code: 'giphy_key' });
    if (r.status === 429) return bad(res, 'GIPHY search limit reached for this hour — try later or paste a link', 429);
    if (!r.ok) return bad(res, `GIPHY error ${r.status}`, 502);
    const j = await r.json();
    const data = {
      items: (j.data || []).map((g) => ({
        id: g.id, title: String(g.title || '').slice(0, 120),
        preview: g.images?.fixed_width?.webp || g.images?.fixed_width?.url,
        url: g.images?.original?.webp || g.images?.downsized_medium?.url || g.images?.original?.url,
        w: Number(g.images?.fixed_width?.width) || 200, h: Number(g.images?.fixed_width?.height) || 150,
      })).filter((g) => g.preview && g.url),
      next: (j.pagination?.offset || 0) + (j.pagination?.count || 0) < (j.pagination?.total_count || 0) ? offset + 24 : null,
    };
    if (cache.size > 300) cache.clear();
    cache.set(id, { at: Date.now(), data });
    res.json(data);
  }));

  app.get('/api/gifs/status', requireMaster, h(async (req, res) => res.json({ giphy: !!key(await getSettings()) })));

  app.put('/api/gifs/:kind/:ref', requireMaster, h(async (req, res) => {
    const { kind } = req.params;
    const ref = Number(req.params.ref);
    if (!GIF_KINDS.includes(kind) || !Number.isInteger(ref) || ref <= 0) return bad(res, 'Not found', 404);
    const table = { step: 'roadmap_steps', item: 'roadmap_items', unit: 'vocab_units' }[kind];
    if (!(await db.one(`SELECT 1 AS x FROM ${table} WHERE id = ?`, [ref]))) return bad(res, 'Not found', 404);
    const c = cleanGifUrl(req.body?.url);
    if (!c) return bad(res, 'The link must start with https://');
    if (c.error) return bad(res, c.error);
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const source = req.body?.from === 'giphy' ? 'giphy' : c.source;
    await db.run(`INSERT INTO media_gifs (kind, ref, url, title, source) VALUES (?,?,?,?,?)
      ON CONFLICT (kind, ref) DO UPDATE SET url = EXCLUDED.url, title = EXCLUDED.title, source = EXCLUDED.source, updated_at = now()`, [kind, ref, c.url, title, source]);
    res.json({ url: c.url, title, source });
  }));

  app.delete('/api/gifs/:kind/:ref', requireMaster, h(async (req, res) => {
    await db.run('DELETE FROM media_gifs WHERE kind = ? AND ref = ?', [req.params.kind, Number(req.params.ref)]);
    res.json({ ok: true });
  }));
}
