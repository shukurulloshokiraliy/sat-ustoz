/**
 * Vocabulary: decks → sets (5 units each, one video per set) → units (one reading passage) → words.
 * Students learn words with spaced repetition (Again / Hard / Good / Easy) and test themselves.
 * Bundled decks live in content/vocab/*.json; the teacher can create, rename and remove word books, sets, units and words, and set videos.
 * Without a subscription only the first `free_sets` sets of a deck are open.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'content', 'vocab');

export async function migrateVocab() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS vocab_decks (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', free_sets INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS vocab_sets (id SERIAL PRIMARY KEY, deck_id TEXT NOT NULL REFERENCES vocab_decks(id) ON DELETE CASCADE, n INTEGER NOT NULL, title TEXT NOT NULL, video_url TEXT NOT NULL DEFAULT '', UNIQUE (deck_id, n));
CREATE TABLE IF NOT EXISTS vocab_units (id SERIAL PRIMARY KEY, set_id INTEGER NOT NULL REFERENCES vocab_sets(id) ON DELETE CASCADE, n INTEGER NOT NULL, title TEXT NOT NULL, UNIQUE (set_id, n));
CREATE TABLE IF NOT EXISTS vocab_words (
  id SERIAL PRIMARY KEY, unit_id INTEGER NOT NULL REFERENCES vocab_units(id) ON DELETE CASCADE,
  word TEXT NOT NULL, definition TEXT NOT NULL DEFAULT '', uz TEXT NOT NULL DEFAULT '', ru TEXT NOT NULL DEFAULT '', example TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, src TEXT NOT NULL DEFAULT 'bundled', hidden BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vocab_word ON vocab_words(unit_id, lower(word));
CREATE TABLE IF NOT EXISTS vocab_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, word_id INTEGER NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'learning', ease REAL NOT NULL DEFAULT 2.5, interval_days REAL NOT NULL DEFAULT 0, step INTEGER NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(), reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0, last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, word_id)
);
CREATE INDEX IF NOT EXISTS idx_vocab_due ON vocab_progress(user_id, due_at);
CREATE TABLE IF NOT EXISTS vocab_tests (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, unit_id INTEGER REFERENCES vocab_units(id) ON DELETE CASCADE, set_id INTEGER REFERENCES vocab_sets(id) ON DELETE CASCADE, score INTEGER NOT NULL, total INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE vocab_decks ENABLE ROW LEVEL SECURITY; ALTER TABLE vocab_sets ENABLE ROW LEVEL SECURITY; ALTER TABLE vocab_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_words ENABLE ROW LEVEL SECURITY; ALTER TABLE vocab_progress ENABLE ROW LEVEL SECURITY; ALTER TABLE vocab_tests ENABLE ROW LEVEL SECURITY;
-- teacher CRUD: hidden = removed bundled content (stays removed after a content update), edited = teacher renamed it
ALTER TABLE vocab_decks ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vocab_decks ADD COLUMN IF NOT EXISTS edited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vocab_decks ADD COLUMN IF NOT EXISTS src TEXT NOT NULL DEFAULT 'bundled';
ALTER TABLE vocab_sets ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vocab_sets ADD COLUMN IF NOT EXISTS edited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vocab_sets ADD COLUMN IF NOT EXISTS src TEXT NOT NULL DEFAULT 'bundled';
ALTER TABLE vocab_units ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vocab_units ADD COLUMN IF NOT EXISTS edited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vocab_units ADD COLUMN IF NOT EXISTS src TEXT NOT NULL DEFAULT 'bundled';
`);
}

/** Bundled decks → database. Words are matched by (unit, word), so progress and teacher edits stay. */
export async function syncVocab() {
  if (!fs.existsSync(DIR)) return;
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { console.error(`[vocab] ${f}: ${e.message}`); continue; }
    if (!d?.id || !Array.isArray(d.sets)) continue;
    await db.tx(async (t) => {
      await t.run(`INSERT INTO vocab_decks (id, title, subtitle, free_sets) VALUES (?,?,?,?)
        ON CONFLICT (id) DO UPDATE SET title = CASE WHEN vocab_decks.edited THEN vocab_decks.title ELSE EXCLUDED.title END, subtitle = CASE WHEN vocab_decks.edited THEN vocab_decks.subtitle ELSE EXCLUDED.subtitle END`, [d.id, d.title, d.subtitle || '', d.free_sets ?? 1]);
      for (const s of d.sets) {
        const set = await t.one(`INSERT INTO vocab_sets (deck_id, n, title) VALUES (?,?,?)
          ON CONFLICT (deck_id, n) DO UPDATE SET title = CASE WHEN vocab_sets.edited THEN vocab_sets.title ELSE EXCLUDED.title END RETURNING id`, [d.id, s.n, s.title || `Set ${s.n}`]);
        for (const u of s.units) {
          const unit = await t.one(`INSERT INTO vocab_units (set_id, n, title) VALUES (?,?,?)
            ON CONFLICT (set_id, n) DO UPDATE SET title = CASE WHEN vocab_units.edited THEN vocab_units.title ELSE EXCLUDED.title END RETURNING id`, [set.id, u.n, u.title]);
          // one statement per unit (Neon round trips add up on a cold start)
          const seen = new Set();
          const rows = u.words.map((w, i) => [w, i]).filter(([w]) => w.word && !seen.has(w.word.toLowerCase()) && seen.add(w.word.toLowerCase()));
          if (!rows.length) continue;
          await t.run(`INSERT INTO vocab_words (unit_id, word, definition, uz, ru, example, position, src) VALUES ${rows.map(() => "(?,?,?,?,?,?,?, 'bundled')").join(',')}
            ON CONFLICT (unit_id, lower(word)) DO UPDATE SET definition = CASE WHEN vocab_words.src = 'bundled' THEN EXCLUDED.definition ELSE vocab_words.definition END,
              uz = CASE WHEN vocab_words.src = 'bundled' THEN EXCLUDED.uz ELSE vocab_words.uz END, ru = CASE WHEN vocab_words.src = 'bundled' THEN EXCLUDED.ru ELSE vocab_words.ru END,
              example = CASE WHEN vocab_words.src = 'bundled' THEN EXCLUDED.example ELSE vocab_words.example END, position = EXCLUDED.position`,
          rows.flatMap(([w, i]) => [unit.id, w.word, w.definition || '', w.uz || '', w.ru || '', w.example || '', i]));
        }
      }
    });
  }
}

// ---------- spaced repetition (Anki-style, simplified) ----------
const MIN = 60e3, DAY = 86400e3;
const LEARN_STEPS = [1, 10]; // minutes
/** Next state of a card for a rating 1 Again · 2 Hard · 3 Good · 4 Easy. */
export function schedule(p, rating, now = Date.now()) {
  const c = { state: p?.state || 'new', ease: p?.ease ?? 2.5, interval_days: p?.interval_days ?? 0, step: p?.step ?? 0, reps: (p?.reps ?? 0) + 1, lapses: p?.lapses ?? 0 };
  let due;
  if (c.state === 'new' || c.state === 'learning') {
    if (rating === 1) { c.state = 'learning'; c.step = 0; due = now + LEARN_STEPS[0] * MIN; }
    else if (rating === 2) { c.state = 'learning'; due = now + 6 * MIN; }
    else if (rating === 3) {
      if (c.state === 'learning' && c.step >= LEARN_STEPS.length - 1) { c.state = 'review'; c.interval_days = 1; due = now + DAY; }
      else { c.state = 'learning'; c.step = Math.min(c.step + 1, LEARN_STEPS.length - 1); due = now + LEARN_STEPS[c.step] * MIN; }
    } else { c.state = 'review'; c.interval_days = 4; due = now + 4 * DAY; }
  } else {
    if (rating === 1) { c.state = 'learning'; c.step = 0; c.lapses += 1; c.ease = Math.max(1.3, c.ease - 0.2); c.interval_days = 1; due = now + 10 * MIN; }
    else {
      const iv = c.interval_days || 1;
      if (rating === 2) { c.ease = Math.max(1.3, c.ease - 0.15); c.interval_days = Math.max(1, iv * 1.2); }
      const good = Math.max(iv + 1, iv * c.ease);
      if (rating === 3) c.interval_days = good;
      if (rating === 4) { c.ease += 0.15; c.interval_days = Math.max(good + 2, iv * c.ease * 1.3); }
      c.interval_days = Math.min(365, Math.round(c.interval_days * 10) / 10);
      due = now + c.interval_days * DAY;
    }
  }
  return { ...c, due_at: new Date(due).toISOString() };
}
/** Short labels for the four buttons ("<1m", "10m", "1d", "4d"). */
const human = (ms) => (ms < 3600e3 ? `${Math.max(1, Math.round(ms / MIN))}m` : ms < DAY ? `${Math.round(ms / 3600e3)}h` : ms < 30 * DAY ? `${Math.round(ms / DAY)}d` : `${Math.round(ms / (30 * DAY))}mo`);
const previews = (p, now = Date.now()) => [1, 2, 3, 4].map((r) => human(new Date(schedule(p, r, now).due_at).getTime() - now));

const pubWord = (w, p) => ({
  id: w.id, word: w.word, definition: w.definition, uz: w.uz, ru: w.ru, example: w.example, image_url: w.image_url, unit_id: w.unit_id,
  state: p ? p.state : 'new', due_at: p?.due_at || null, previews: previews(p),
});

export function registerVocab(app, { h, bad, requireMaster, requireStudent, accessFor }) {
  const canPractice = async (u) => u.role === 'master' || (await accessFor(u)).can_practice;
  async function setOpen(user, setRow) {
    if (await canPractice(user)) return true;
    const deck = await db.one('SELECT free_sets FROM vocab_decks WHERE id = ?', [setRow.deck_id]);
    return setRow.n <= (deck?.free_sets ?? 1);
  }

  // decks → sets → units with counts and this student's progress
  app.get('/api/vocab', h(async (req, res) => {
    const decks = await db.all('SELECT * FROM vocab_decks WHERE NOT hidden ORDER BY position, id');
    const sets = await db.all('SELECT * FROM vocab_sets WHERE NOT hidden ORDER BY deck_id, n');
    const units = await db.all(`SELECT u.*, (SELECT COUNT(*) FROM vocab_words w WHERE w.unit_id = u.id AND NOT w.hidden) AS words FROM vocab_units u WHERE NOT u.hidden ORDER BY u.set_id, u.n`);
    const prog = await db.all(`SELECT w.unit_id, COUNT(*) AS seen, SUM(CASE WHEN p.state = 'review' THEN 1 ELSE 0 END) AS learned,
        SUM(CASE WHEN p.due_at <= now() THEN 1 ELSE 0 END) AS due
      FROM vocab_progress p JOIN vocab_words w ON w.id = p.word_id WHERE p.user_id = ? AND NOT w.hidden GROUP BY w.unit_id`, [req.user.id]);
    const best = await db.all('SELECT unit_id, MAX(score * 100 / GREATEST(total, 1)) AS best FROM vocab_tests WHERE user_id = ? AND unit_id IS NOT NULL GROUP BY unit_id', [req.user.id]);
    const pm = new Map(prog.map((r) => [r.unit_id, r])); const bm = new Map(best.map((r) => [r.unit_id, Number(r.best)]));
    const full = await canPractice(req.user);
    const totals = { words: 0, learned: 0, due: 0, seen: 0 };
    const out = decks.map((d) => ({
      ...d,
      sets: sets.filter((s) => s.deck_id === d.id).map((s) => {
        const us = units.filter((u) => u.set_id === s.id).map((u) => {
          const p = pm.get(u.id) || {};
          const r = { id: u.id, n: u.n, title: u.title, words: Number(u.words), seen: Number(p.seen || 0), learned: Number(p.learned || 0), due: Number(p.due || 0), best: bm.get(u.id) ?? null };
          totals.words += r.words; totals.learned += r.learned; totals.due += r.due; totals.seen += r.seen;
          return r;
        });
        return { id: s.id, n: s.n, title: s.title, video_url: s.video_url, open: full || s.n <= d.free_sets, units: us };
      }),
    }));
    res.json({ decks: out, totals, full });
  }));

  // one unit (or a whole set with ?set=) with words and the student's card state
  app.get('/api/vocab/units/:id', h(async (req, res) => {
    const u = await db.one('SELECT u.*, s.deck_id, s.n AS set_n, s.title AS set_title, s.video_url, s.id AS set_id FROM vocab_units u JOIN vocab_sets s ON s.id = u.set_id WHERE u.id = ? AND NOT u.hidden AND NOT s.hidden', [Number(req.params.id)]);
    if (!u) return bad(res, 'Unit not found', 404);
    if (!(await setOpen(req.user, { deck_id: u.deck_id, n: u.set_n }))) return bad(res, 'This set needs an active subscription', 402, { code: 'subscription_required' });
    const words = await db.all('SELECT * FROM vocab_words WHERE unit_id = ? AND NOT hidden ORDER BY position, id', [u.id]);
    const prog = await db.all('SELECT * FROM vocab_progress WHERE user_id = ? AND word_id = ANY(?::int[])', [req.user.id, words.map((w) => w.id)]);
    const pm = new Map(prog.map((p) => [p.word_id, p]));
    const siblings = await db.all('SELECT id, n, title FROM vocab_units WHERE set_id = ? AND NOT hidden ORDER BY n', [u.set_id]);
    res.json({ id: u.id, n: u.n, title: u.title, set: { id: u.set_id, n: u.set_n, title: u.set_title, video_url: u.video_url, deck_id: u.deck_id }, siblings,
      words: words.map((w) => pubWord(w, pm.get(w.id))) });
  }));

  // words due for review across every open set (the "Review" button)
  app.get('/api/vocab/due', h(async (req, res) => {
    const full = await canPractice(req.user);
    const rows = await db.all(`SELECT w.*, p.state AS p_state, p.ease, p.interval_days, p.step, p.reps, p.lapses, p.due_at AS p_due, s.n AS set_n, d.free_sets
      FROM vocab_progress p JOIN vocab_words w ON w.id = p.word_id JOIN vocab_units u ON u.id = w.unit_id JOIN vocab_sets s ON s.id = u.set_id JOIN vocab_decks d ON d.id = s.deck_id
      WHERE p.user_id = ? AND p.due_at <= now() + interval '20 minutes' AND NOT w.hidden AND NOT u.hidden AND NOT s.hidden AND NOT d.hidden ORDER BY p.due_at LIMIT 100`, [req.user.id]);
    res.json({ words: rows.filter((r) => full || r.set_n <= r.free_sets).map((r) => pubWord(r, { state: r.p_state, ease: r.ease, interval_days: r.interval_days, step: r.step, reps: r.reps, lapses: r.lapses, due_at: r.p_due })) });
  }));

  // rate one card
  app.post('/api/vocab/review', requireStudent, h(async (req, res) => {
    const id = Number(req.body?.word_id); const rating = Number(req.body?.rating);
    if (![1, 2, 3, 4].includes(rating)) return bad(res, 'Rating must be 1–4');
    const w = await db.one('SELECT w.id, s.deck_id, s.n FROM vocab_words w JOIN vocab_units u ON u.id = w.unit_id JOIN vocab_sets s ON s.id = u.set_id WHERE w.id = ?', [id]);
    if (!w) return bad(res, 'Word not found', 404);
    if (!(await setOpen(req.user, { deck_id: w.deck_id, n: w.n }))) return bad(res, 'This set needs an active subscription', 402, { code: 'subscription_required' });
    const p = await db.one('SELECT * FROM vocab_progress WHERE user_id = ? AND word_id = ?', [req.user.id, id]);
    const c = schedule(p, rating);
    await db.run(`INSERT INTO vocab_progress (user_id, word_id, state, ease, interval_days, step, due_at, reps, lapses, last_at) VALUES (?,?,?,?,?,?,?,?,?, now())
      ON CONFLICT (user_id, word_id) DO UPDATE SET state = EXCLUDED.state, ease = EXCLUDED.ease, interval_days = EXCLUDED.interval_days, step = EXCLUDED.step,
        due_at = EXCLUDED.due_at, reps = EXCLUDED.reps, lapses = EXCLUDED.lapses, last_at = now()`,
    [req.user.id, id, c.state, c.ease, c.interval_days, c.step, c.due_at, c.reps, c.lapses]);
    res.json({ id, state: c.state, due_at: c.due_at, previews: previews(c) });
  }));

  // save a test result (the test itself runs in the browser)
  app.post('/api/vocab/tests', requireStudent, h(async (req, res) => {
    const score = Math.max(0, Number(req.body?.score) || 0); const total = Math.max(1, Number(req.body?.total) || 1);
    await db.run('INSERT INTO vocab_tests (user_id, unit_id, set_id, score, total) VALUES (?,?,?,?,?)', [req.user.id, req.body?.unit_id || null, req.body?.set_id || null, Math.min(score, total), total]);
    // words missed in the test come back for review soon
    for (const id of (Array.isArray(req.body?.missed) ? req.body.missed : []).slice(0, 60)) {
      await db.run(`INSERT INTO vocab_progress (user_id, word_id, state, due_at) VALUES (?,?, 'learning', now())
        ON CONFLICT (user_id, word_id) DO UPDATE SET state = 'learning', step = 0, due_at = now()`, [req.user.id, Number(id)]).catch(() => {});
    }
    res.json({ ok: true });
  }));

  // ---------- teacher ----------
  const txt = (v, max) => String(v ?? '').trim().slice(0, max);
  // bundled rows are hidden (a content update must not bring them back); the teacher's own rows are deleted
  const remove = async (table, id) => {
    const r = await db.one(`SELECT src FROM ${table} WHERE id = ?`, [id]);
    if (!r) return false;
    if (r.src === 'bundled') await db.run(`UPDATE ${table} SET hidden = true WHERE id = ?`, [id]);
    else await db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
    return true;
  };

  // decks (word books)
  app.post('/api/vocab/decks', requireMaster, h(async (req, res) => {
    const title = txt(req.body?.title, 80);
    if (!title) return bad(res, 'Give the word book a title');
    const id = 'custom-' + Date.now().toString(36);
    const { p } = await db.one('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM vocab_decks');
    await db.run("INSERT INTO vocab_decks (id, title, subtitle, free_sets, position, src, edited) VALUES (?,?,?,?,?, 'teacher', true)",
      [id, title, txt(req.body?.subtitle, 200), Math.max(0, Number(req.body?.free_sets ?? 1) || 0), Number(p)]);
    res.json({ id });
  }));
  app.put('/api/vocab/decks/:id', requireMaster, h(async (req, res) => {
    const title = txt(req.body?.title, 80);
    if (!title) return bad(res, 'Give the word book a title');
    await db.run('UPDATE vocab_decks SET title = ?, subtitle = ?, free_sets = ?, edited = true WHERE id = ?',
      [title, txt(req.body?.subtitle, 200), Math.max(0, Number(req.body?.free_sets ?? 1) || 0), req.params.id]);
    res.json({ ok: true });
  }));
  app.delete('/api/vocab/decks/:id', requireMaster, h(async (req, res) => {
    const d = await db.one('SELECT src FROM vocab_decks WHERE id = ?', [req.params.id]);
    if (!d) return bad(res, 'Not found', 404);
    if (d.src === 'bundled') await db.run('UPDATE vocab_decks SET hidden = true WHERE id = ?', [req.params.id]);
    else await db.run('DELETE FROM vocab_decks WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  }));

  // sets (five units and one video each)
  app.post('/api/vocab/decks/:id/sets', requireMaster, h(async (req, res) => {
    const deck = await db.one('SELECT id FROM vocab_decks WHERE id = ?', [req.params.id]);
    if (!deck) return bad(res, 'Word book not found', 404);
    const { n } = await db.one('SELECT COALESCE(MAX(n), 0) + 1 AS n FROM vocab_sets WHERE deck_id = ?', [deck.id]);
    const r = await db.one("INSERT INTO vocab_sets (deck_id, n, title, src, edited) VALUES (?,?,?, 'teacher', true) RETURNING id", [deck.id, Number(n), txt(req.body?.title, 80) || `Set ${n}`]);
    res.json({ id: r.id });
  }));
  app.put('/api/vocab/sets/:id', requireMaster, h(async (req, res) => {
    const id = Number(req.params.id);
    if (req.body?.video_url !== undefined) await db.run('UPDATE vocab_sets SET video_url = ? WHERE id = ?', [txt(req.body.video_url, 500), id]);
    if (txt(req.body?.title, 80)) await db.run('UPDATE vocab_sets SET title = ?, edited = true WHERE id = ?', [txt(req.body.title, 80), id]);
    res.json({ ok: true });
  }));
  app.delete('/api/vocab/sets/:id', requireMaster, h(async (req, res) => {
    if (!(await remove('vocab_sets', Number(req.params.id)))) return bad(res, 'Not found', 404);
    res.json({ ok: true });
  }));

  // units (one reading passage each)
  app.post('/api/vocab/sets/:id/units', requireMaster, h(async (req, res) => {
    const set = await db.one('SELECT id FROM vocab_sets WHERE id = ?', [Number(req.params.id)]);
    if (!set) return bad(res, 'Set not found', 404);
    const title = txt(req.body?.title, 120);
    if (!title) return bad(res, 'Give the unit a title');
    const { n } = await db.one('SELECT COALESCE(MAX(n), 0) + 1 AS n FROM vocab_units WHERE set_id = ?', [set.id]);
    const r = await db.one("INSERT INTO vocab_units (set_id, n, title, src, edited) VALUES (?,?,?, 'teacher', true) RETURNING id", [set.id, Number(n), title]);
    res.json({ id: r.id });
  }));
  app.put('/api/vocab/units/:id', requireMaster, h(async (req, res) => {
    const title = txt(req.body?.title, 120);
    if (!title) return bad(res, 'Give the unit a title');
    await db.run('UPDATE vocab_units SET title = ?, edited = true WHERE id = ?', [title, Number(req.params.id)]);
    res.json({ ok: true });
  }));
  app.delete('/api/vocab/units/:id', requireMaster, h(async (req, res) => {
    if (!(await remove('vocab_units', Number(req.params.id)))) return bad(res, 'Not found', 404);
    res.json({ ok: true });
  }));

  const wordBody = (b) => ({ word: String(b?.word || '').trim().slice(0, 80), definition: String(b?.definition || '').trim().slice(0, 400), uz: String(b?.uz || '').trim().slice(0, 200),
    ru: String(b?.ru || '').trim().slice(0, 200), example: String(b?.example || '').trim().slice(0, 500), image_url: String(b?.image_url || '').trim().slice(0, 500) });
  app.post('/api/vocab/units/:id/words', requireMaster, h(async (req, res) => {
    const list = Array.isArray(req.body?.words) ? req.body.words : [req.body];
    let added = 0;
    for (const raw of list.slice(0, 200)) {
      const w = wordBody(raw);
      if (!w.word) continue;
      const { n } = await db.one('SELECT COUNT(*) AS n FROM vocab_words WHERE unit_id = ?', [Number(req.params.id)]);
      const r = await db.run(`INSERT INTO vocab_words (unit_id, word, definition, uz, ru, example, image_url, position, src) VALUES (?,?,?,?,?,?,?,?, 'teacher')
        ON CONFLICT (unit_id, lower(word)) DO UPDATE SET definition = EXCLUDED.definition, uz = EXCLUDED.uz, ru = EXCLUDED.ru, example = EXCLUDED.example, image_url = EXCLUDED.image_url, src = 'teacher', hidden = false`,
      [Number(req.params.id), w.word, w.definition, w.uz, w.ru, w.example, w.image_url, Number(n)]);
      added += r.rowCount ? 1 : 0;
    }
    res.json({ added });
  }));
  app.put('/api/vocab/words/:id', requireMaster, h(async (req, res) => {
    const w = wordBody(req.body);
    if (!w.word) return bad(res, 'The word is required');
    await db.run("UPDATE vocab_words SET word = ?, definition = ?, uz = ?, ru = ?, example = ?, image_url = ?, src = 'teacher' WHERE id = ?", [w.word, w.definition, w.uz, w.ru, w.example, w.image_url, Number(req.params.id)]);
    res.json({ ok: true });
  }));
  app.delete('/api/vocab/words/:id', requireMaster, h(async (req, res) => {
    // bundled words are hidden (so a content update does not bring them back); teacher words are deleted
    const w = await db.one('SELECT src FROM vocab_words WHERE id = ?', [Number(req.params.id)]);
    if (w?.src === 'bundled') await db.run('UPDATE vocab_words SET hidden = true WHERE id = ?', [Number(req.params.id)]);
    else await db.run('DELETE FROM vocab_words WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
  }));
}

/** Random words for the game from the given sets (all open sets when none are given). */
export async function gameWords(setIds, limit = 40) {
  const rows = await db.all(`SELECT w.id, w.word, w.definition, w.uz, w.example FROM vocab_words w JOIN vocab_units u ON u.id = w.unit_id JOIN vocab_sets s ON s.id = u.set_id
    WHERE NOT w.hidden AND NOT u.hidden AND NOT s.hidden AND w.definition <> '' ${setIds?.length ? 'AND u.set_id = ANY(?::int[])' : ''} ORDER BY random() LIMIT ?`, setIds?.length ? [setIds, limit] : [limit]);
  return rows;
}
