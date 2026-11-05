/**
 * A picture for every vocabulary word, so students remember the meaning, not only the definition.
 *
 * Source: Openverse (https://openverse.org, by WordPress) — openly licensed photos and illustrations, searched
 * with the word plus the key words of its definition ("passage" → "passage long journey"), filtered to licences
 * that allow use in a course. Each picture keeps its attribution, shown small under the image.
 * Pictures are found the first time a word is shown and cached here; the teacher can pick another one or remove it.
 * A teacher's own picture / GIF on the word (vocab_words.image_url) always wins.
 */
import { db } from './db.js';

const STOP = new Set('a an the of to in on at by for with from and or but is are be been being that this these those which who whom whose what when where why how as into onto about over under very more most some any each other such than then so not no can could would should may might will shall do does did has have had its it their them they someone something somebody person people thing things way used use usually often especially long short large small big good bad great make makes take give become feeling state quality act kind sort type part much many well also very'.split(' '));

export async function migratePictures() {
  await db.exec(`CREATE TABLE IF NOT EXISTS word_pictures (
    word_id INTEGER PRIMARY KEY REFERENCES vocab_words(id) ON DELETE CASCADE,
    url TEXT NOT NULL DEFAULT '', credit TEXT NOT NULL DEFAULT '', landing TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'auto', status TEXT NOT NULL DEFAULT 'ok', updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
  ALTER TABLE word_pictures ENABLE ROW LEVEL SECURITY;`);
}

/** "passage" + "A long journey by ship" → "passage long journey ship" */
export function pictureQuery(word, definition) {
  const keys = String(definition || '').toLowerCase().replace(/^\s*\(?(n|v|adj|adv|prep|conj)\.?\)?\s*/i, '').replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w) && w !== String(word).toLowerCase()).slice(0, 3);
  return [String(word).trim(), ...keys].join(' ').slice(0, 80);
}

async function openverse(q, size = 8) {
  const p = new URLSearchParams({ q, page_size: String(size), mature: 'false', license_type: 'commercial' });
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const headers = { accept: 'application/json', 'user-agent': 'SATUstoz/1.0 (vocabulary pictures; ustozsat.uz)' };
    if (process.env.OPENVERSE_TOKEN) headers.authorization = `Bearer ${process.env.OPENVERSE_TOKEN}`;
    const r = await fetch(`https://api.openverse.org/v1/images/?${p}`, { headers, signal: ctl.signal });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.results || []).filter((x) => x.thumbnail && (!x.width || x.width >= 240)).map((x) => ({
      url: x.thumbnail, full: x.url, landing: x.foreign_landing_url || '',
      credit: x.attribution ? String(x.attribution).replace(/\s+/g, ' ').slice(0, 300) : `${x.title || 'Image'}${x.creator ? ` by ${x.creator}` : ''} (${String(x.license || '').toUpperCase()} ${x.license_version || ''}) via Openverse`,
    }));
  } catch { return null; } finally { clearTimeout(t); }
}

/** Find and store a picture for one word; returns the row or null. Network errors are not cached (retried later). */
async function findPicture(w) {
  let list = await openverse(pictureQuery(w.word, w.definition), 4);
  if (list && !list.length) list = await openverse(w.word, 4); // the definition words narrowed it too much
  if (list == null) return null;
  const pick = list[0];
  if (!pick) { await db.run("INSERT INTO word_pictures (word_id, status) VALUES (?, 'none') ON CONFLICT (word_id) DO UPDATE SET status = 'none', updated_at = now() WHERE word_pictures.source = 'auto'", [w.id]); return null; }
  await db.run(`INSERT INTO word_pictures (word_id, url, credit, landing, source, status) VALUES (?,?,?,?, 'auto', 'ok')
    ON CONFLICT (word_id) DO UPDATE SET url = EXCLUDED.url, credit = EXCLUDED.credit, landing = EXCLUDED.landing, status = 'ok', updated_at = now() WHERE word_pictures.source = 'auto'`,
  [w.id, pick.url, pick.credit, pick.landing]);
  return { url: pick.url, credit: pick.credit, landing: pick.landing };
}

/** id → { url, credit, landing } for these words (teacher pictures first), finding up to `fill` missing ones now. */
export async function picturesFor(ids, fill = 8) {
  ids = [...new Set(ids.map(Number).filter(Boolean))].slice(0, 60);
  if (!ids.length) return {};
  const words = await db.all('SELECT id, word, definition, image_url FROM vocab_words WHERE id = ANY(?::int[])', [ids]);
  const rows = await db.all('SELECT * FROM word_pictures WHERE word_id = ANY(?::int[])', [ids]);
  const have = new Map(rows.map((r) => [r.word_id, r]));
  const out = {};
  const missing = [];
  for (const w of words) {
    if (w.image_url) { out[w.id] = { url: w.image_url, credit: '', landing: '', teacher: true }; continue; }
    const r = have.get(w.id);
    if (r?.status === 'ok' && r.url) out[w.id] = { url: r.url, credit: r.credit, landing: r.landing };
    else if (!r || (r.status === 'none' && r.source === 'auto' && Date.now() - new Date(r.updated_at).getTime() > 30 * 86400e3)) missing.push(w);
  }
  // a few at a time: fast enough for one flashcard session, gentle on the open API
  for (let i = 0; i < Math.min(missing.length, fill); i += 4) {
    const got = await Promise.all(missing.slice(i, Math.min(i + 4, fill)).map((w) => findPicture(w).then((p) => [w.id, p])));
    for (const [id, p] of got) if (p) out[id] = p;
  }
  return out;
}

export function registerPictures(app, { h, bad, requireMaster }) {
  // students and teacher: pictures for the words on screen
  app.get('/api/vocab/pictures', h(async (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean);
    res.json(await picturesFor(ids, req.user.role === 'master' ? 12 : 8));
  }));
  // teacher: other pictures to choose from (search text can be changed)
  app.get('/api/vocab/words/:id/picture-options', requireMaster, h(async (req, res) => {
    const w = await db.one('SELECT id, word, definition FROM vocab_words WHERE id = ?', [Number(req.params.id)]);
    if (!w) return bad(res, 'Word not found', 404);
    const q = String(req.query.q || '').trim().slice(0, 80) || pictureQuery(w.word, w.definition);
    const list = await openverse(q, 12);
    if (list == null) return bad(res, 'Could not reach the picture library (Openverse). Try again in a minute.', 502);
    res.json({ q, results: list });
  }));
  app.post('/api/vocab/words/:id/picture', requireMaster, h(async (req, res) => {
    const id = Number(req.params.id);
    const url = String(req.body?.url || '').trim();
    if (!/^https:\/\/\S+$/.test(url)) return bad(res, 'Choose a picture');
    await db.run(`INSERT INTO word_pictures (word_id, url, credit, landing, source, status) VALUES (?,?,?,?, 'chosen', 'ok')
      ON CONFLICT (word_id) DO UPDATE SET url = EXCLUDED.url, credit = EXCLUDED.credit, landing = EXCLUDED.landing, source = 'chosen', status = 'ok', updated_at = now()`,
    [id, url.slice(0, 500), String(req.body?.credit || '').slice(0, 300), String(req.body?.landing || '').slice(0, 500)]);
    res.json({ ok: true });
  }));
  app.delete('/api/vocab/words/:id/picture', requireMaster, h(async (req, res) => {
    await db.run(`INSERT INTO word_pictures (word_id, status, source) VALUES (?, 'none', 'chosen')
      ON CONFLICT (word_id) DO UPDATE SET url = '', credit = '', landing = '', status = 'none', source = 'chosen', updated_at = now()`, [Number(req.params.id)]);
    res.json({ ok: true });
  }));
}
