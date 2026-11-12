/**
 * Video lessons on Bunny Stream (https://bunny.net/stream).
 *
 * Upload: the teacher's browser sends the MP4 straight to Bunny with TUS (big files never pass through our server);
 * the server only creates the video object and signs the upload with the library API key.
 * Watching: a lesson stores `bunny:<videoId>`; the server turns it into a player link signed with the token key,
 * valid for a few hours, and only for students whose plan includes video. Allowed referrers (set in Bunny) keep
 * the player on ustozsat.uz.
 */
import crypto from 'node:crypto';
import { getSettings } from './db.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const cfg = (s) => ({
  lib: String(process.env.BUNNY_LIBRARY_ID || s.bunny_library_id || '').trim(),
  key: String(process.env.BUNNY_API_KEY || s.bunny_api_key || '').trim(),
  token: String(process.env.BUNNY_TOKEN_KEY || s.bunny_token_key || '').trim(),
});
export const isBunny = (url) => /^bunny:[0-9a-f-]{36}$/i.test(String(url || ''));

/** `bunny:<id>` → signed player URL (other links pass through unchanged). */
export function playUrl(url, s, hours = 4) {
  if (!isBunny(url)) return url;
  const { lib, token } = cfg(s);
  const id = url.slice(6);
  if (!lib) return '';
  if (!token) return `https://player.mediadelivery.net/embed/${lib}/${id}?rememberPosition=true&preload=true`;
  const exp = Math.floor(Date.now() / 1000) + hours * 3600;
  // rememberPosition: a student who leaves comes back where they stopped (Bunny keeps it per browser)
  return `https://player.mediadelivery.net/embed/${lib}/${id}?token=${sha(token + id + exp)}&expires=${exp}&rememberPosition=true&preload=true`;
}

/** System check: are video uploads ready? { ok, detail } */
export async function bunnyCheck() {
  const { lib, key, token } = cfg(await getSettings());
  if (!lib || !key) return { ok: false, detail: 'Not set up: add the Bunny Stream library ID and API key below (Videos)' };
  try {
    const r = await fetch(`https://video.bunnycdn.com/library/${lib}/videos?page=1&itemsPerPage=1`, { headers: { AccessKey: key, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (r.status === 401) return { ok: false, detail: 'Bunny rejected the API key: check it below (Videos)' };
    if (!r.ok) return { ok: false, detail: `Bunny answered with error ${r.status}` };
    const j = await r.json().catch(() => ({}));
    return { ok: true, detail: `Uploads work · ${j.totalItems ?? 0} video${j.totalItems === 1 ? '' : 's'} in the library${token ? ' · links are signed' : ' · add the token key to protect links'}` };
  } catch { return { ok: false, detail: 'Could not reach Bunny Stream right now' }; }
}

export function registerVideo(app, { h, bad, requireMaster }) {
  const bunny = async (path, opts = {}) => {
    const { lib, key } = cfg(await getSettings());
    if (!lib || !key) throw Object.assign(new Error('Add the Bunny Stream library ID and API key in Settings first'), { status: 400 });
    let r;
    try { r = await fetch(`https://video.bunnycdn.com/library/${lib}${path}`, { ...opts, headers: { AccessKey: key, accept: 'application/json', 'content-type': 'application/json', ...(opts.headers || {}) } }); }
    catch { throw Object.assign(new Error('Could not reach Bunny Stream — try again'), { status: 502 }); }
    const text = await r.text();
    if (!r.ok) throw Object.assign(new Error(r.status === 401 ? 'Bunny rejected the API key — check it in Settings' : `Bunny Stream error ${r.status}`), { status: 502 });
    return text ? JSON.parse(text) : {};
  };

  // 1) create the video object and sign the TUS upload (the API key never leaves the server)
  app.post('/api/videos/upload', requireMaster, h(async (req, res) => {
    const title = String(req.body?.title || 'Lesson video').trim().slice(0, 150) || 'Lesson video';
    const v = await bunny('/videos', { method: 'POST', body: JSON.stringify({ title }) });
    const { lib, key } = cfg(await getSettings());
    const expire = Math.floor(Date.now() / 1000) + 6 * 3600;
    res.json({ videoId: v.guid, libraryId: lib, expire, signature: sha(lib + key + expire + v.guid), url: `bunny:${v.guid}` });
  }));
  // 2) processing status (0 created · 1 uploaded · 2 processing · 3 transcoding · 4 finished · 5 error)
  app.get('/api/videos/:id', requireMaster, h(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return bad(res, 'Bad id');
    const v = await bunny(`/videos/${req.params.id}`);
    res.json({ status: v.status, ready: v.status === 4 || v.status === 3 && v.encodeProgress >= 100, progress: v.encodeProgress ?? 0, length: v.length || 0, failed: v.status === 5 || v.status === 6,
      play: playUrl(`bunny:${req.params.id}`, await getSettings(), 1) });
  }));
  app.get('/api/videos-config', requireMaster, h(async (req, res) => {
    const c = cfg(await getSettings());
    res.json({ ready: !!(c.lib && c.key), token: !!c.token });
  }));
}
