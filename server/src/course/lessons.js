import { db } from '../db.js';
import { penaltyOf, focusSummary } from '../focus.js';
import { playUrl } from '../video.js';
import { scanSoon } from '../reserved.js';
import { getSettings } from '../db.js';
import { upsertModule, validateModule, previewModule } from './modules.js';
import { addCourseWords } from '../vocab.js';
import { afterPass, unlockPrice, dripDays } from '../drip.js';

/* ---------- Teacher edits of lesson notes ----------
 * The bundled module JSON is re-synced on every start-up, so the teacher's changes live in their own table and are laid
 * over the original when a lesson is shown: edits survive deploys and content updates. Every save is kept in history.
 */
export async function migrateLessonEdits() {
  await db.exec(`CREATE TABLE IF NOT EXISTS lesson_edits (
    item_id INTEGER PRIMARY KEY REFERENCES roadmap_items(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '', written TEXT NOT NULL DEFAULT '[]', sources TEXT NOT NULL DEFAULT '[]',
    updated_by TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS lesson_edit_history (
    id SERIAL PRIMARY KEY, item_id INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '', written TEXT NOT NULL DEFAULT '[]',
    sources TEXT NOT NULL DEFAULT '[]', note TEXT NOT NULL DEFAULT '', saved_by TEXT NOT NULL DEFAULT '', saved_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE INDEX IF NOT EXISTS idx_lesson_edit_history ON lesson_edit_history(item_id, id DESC);
  ALTER TABLE lesson_edits ENABLE ROW LEVEL SECURITY; ALTER TABLE lesson_edit_history ENABLE ROW LEVEL SECURITY;`);
}

const BLOCK_TYPES = new Set(['h', 'p', 'list', 'steps', 'table', 'examples', 'trap', 'tip', 'uz', 'source']);
const str = (x, max = 4000) => String(x ?? '').replace(/\r\n/g, '\n').slice(0, max);
/** Clean the blocks the editor sends: known types only, strings only, sensible sizes. */
export function cleanWritten(list) {
  if (!Array.isArray(list)) throw Object.assign(new Error('The lesson text is not valid'), { status: 400 });
  if (list.length > 300) throw Object.assign(new Error('Too many blocks (300 max)'), { status: 400 });
  return list.filter((b) => b && BLOCK_TYPES.has(b.type)).map((b) => {
    switch (b.type) {
      case 'list': case 'steps': return { type: b.type, items: (Array.isArray(b.items) ? b.items : []).map((x) => str(x, 2000)).filter((x) => x.trim()).slice(0, 60) };
      case 'table': {
        const columns = (Array.isArray(b.columns) ? b.columns : []).map((x) => str(x, 300)).slice(0, 12);
        const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 80).map((r) => columns.map((_, j) => str(Array.isArray(r) ? r[j] : '', 1500)));
        return { type: 'table', columns, rows };
      }
      case 'examples': return { type: 'examples', rows: (Array.isArray(b.rows) ? b.rows : []).slice(0, 60).map((r) => [str(r?.[0], 1500), str(r?.[1], 1500)]).filter((r) => r[0].trim() || r[1].trim()) };
      case 'trap': return { type: 'trap', title: str(b.title, 300), text: str(b.text) };
      default: return { type: b.type, text: str(b.text) };
    }
  }).filter((b) => (b.items ? b.items.length : b.rows ? b.rows.length || b.columns?.length : (b.text || '').trim() || b.title));
}
const parse = (x, d) => { try { return JSON.parse(x); } catch { return d; } };

const publicQ = (q) => ({ id: q.id, kind: q.kind, prompt: q.prompt, passage: q.passage || '', options: q.options });
const GRACE = 20; // seconds of network slack for timed checks
async function overTime(c) {
  const item = await db.one('SELECT content FROM roadmap_items WHERE id = ?', [c.item_id]);
  const min = JSON.parse(item?.content || '{}').time_minutes || 0;
  return !!min && Date.now() - new Date(c.started_at).getTime() > (min * 60 + GRACE - await penaltyOf('check', c.id)) * 1000;
}

/**
 * Lessons (sections of a course module) and their level checks.
 * Rules come from the module: pass_percent (80), versions A → B → C → A, one check = one version.
 */
export function registerLessons(app, { h, bad, requireStudent, requireMaster, roadmapFor, accessFor }) {
  /** The lesson as the current user may see it, with lock / pass state from the roadmap. */
  async function lessonFor(user, id) {
    const item = await db.one("SELECT * FROM roadmap_items WHERE id = ? AND kind = 'lesson'", [id]);
    if (!item) return null;
    const content = JSON.parse(item.content || '{}');
    const edit = await db.one('SELECT * FROM lesson_edits WHERE item_id = ?', [item.id]);
    if (edit) { content.written = parse(edit.written, content.written || []); content.sources = parse(edit.sources, content.sources || []); content.edited = { by: edit.updated_by, at: edit.updated_at }; }
    const { steps } = await roadmapFor(user);
    const step = steps.find((s) => s.id === item.step_id);
    if (!step && user.role !== 'master') return null; // the step is in the Trash
    const lessons = (step?.items || []).filter((i) => i.kind === 'lesson');
    const idx = lessons.findIndex((i) => i.id === item.id);
    const state = lessons[idx] || {};
    const access = await accessFor(user);
    let locked = null;
    if (user.role !== 'master') {
      if (item.status !== 'ready') locked = 'soon';
      else if (state.locked) locked = step?.status === 'locked' ? 'step' : content.type === 'session' ? 'lessons' : 'previous';
      else if (state.wait_until) locked = 'wait';
      else if (!access.roadmap && !content.free && !state.weekly_open && !state.done) locked = 'subscription';
    }
    return { item, content, step, lessons, idx, state, locked, access };
  }

  app.get('/api/lessons/:id', h(async (req, res) => {
    const L = await lessonFor(req.user, req.params.id);
    if (!L) return bad(res, 'Not found', 404);
    const { item, content, step, lessons, idx, state, locked, access } = L;
    const history = req.user.role === 'student'
      ? await db.all('SELECT id, version, score, total, passed, finished_at FROM lesson_checks WHERE user_id = ? AND item_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC', [req.user.id, item.id])
      : [];
    const versions = content.versions || [];
    const open = req.user.role === 'student' ? await db.one('SELECT id, version FROM lesson_checks WHERE user_id = ? AND item_id = ? AND finished_at IS NULL ORDER BY id DESC LIMIT 1', [req.user.id, item.id]) : null;
    const nextVersion = open?.version || versions[history.length % (versions.length || 1)] || null;
    const showContent = !locked;
    // opening a vocabulary lesson puts its words into the student's "Course words" deck (spaced reviews 1, 3, 7, 14, 30 days)
    let deck_added = 0;
    if (content.type === 'vocab' && showContent && req.user.role === 'student') deck_added = await addCourseWords(req.user.id, item, content.words).catch((e) => { console.error('[course words]', e.message); return 0; });
    const sections = lessons.filter((i) => (i.lesson?.type || 'section') === 'section');
    res.json({
      type: content.type || 'section',
      words: content.type === 'vocab' && showContent ? content.words || [] : undefined,
      deck_added: content.type === 'vocab' ? deck_added : undefined,
      tested_in: content.tested_in || undefined,
      session: content.type === 'session' ? { time_minutes: content.time_minutes || 0, makeup: content.makeup || '', unlock: content.unlock || '',
        lessons_passed: sections.filter((i) => i.done).length, lessons_total: sections.length } : undefined,
      done: !!state.done,
      id: item.id, title: item.title, status: item.status, video_url: showContent && (access.video || content.free) ? playUrl(item.url || '', await getSettings()) : '', video_locked: showContent && !!item.url && !(access.video || content.free), locked,
      module: { step_id: step?.id, title: step?.title, subtitle: step?.subtitle, step_status: step?.status, handout: step?.handout || null },
      sources: showContent ? content.sources || [] : [],
      order: idx + 1, count: lessons.length, sections: sections.length,
      prev: idx > 0 ? { id: lessons[idx - 1].id, title: lessons[idx - 1].title } : null,
      next: idx >= 0 && idx < lessons.length - 1 ? { id: lessons[idx + 1].id, title: lessons[idx + 1].title, locked: lessons[idx + 1].locked } : null,
      video: content.video || null,
      written: showContent ? content.written || [] : [],
      edited: req.user.role === 'master' ? content.edited || null : undefined,
      free: !!content.free,
      check: versions.length ? {
        versions, pass_percent: content.pass_percent ?? 80,
        count: content.checks?.[versions[0]]?.length || 0, time_minutes: content.time_minutes || 0,
        next_version: nextVersion, open_id: open?.id || null,
      } : null,
      passed: !!state.done, best: state.best ?? null, history,
      wait: locked === 'wait' ? { until: state.wait_until, price: unlockPrice(await getSettings()), days: dripDays(await getSettings()) } : undefined,
    });
  }));

  /* ---- teacher: edit the lesson notes (text, tables, lists…) — saved once, seen by every student right away ---- */
  app.put('/api/lessons/:id/content', requireMaster, h(async (req, res) => {
    const item = await db.one("SELECT id, title, content FROM roadmap_items WHERE id = ? AND kind = 'lesson'", [Number(req.params.id)]);
    if (!item) return bad(res, 'Lesson not found', 404);
    const written = cleanWritten(req.body?.written);
    const sources = (Array.isArray(req.body?.sources) ? req.body.sources : []).map((x) => str(x, 500)).filter((x) => x.trim()).slice(0, 30);
    const title = str(req.body?.title, 160).trim();
    const by = req.user.name || 'Teacher';
    await db.tx(async (t) => {
      // the very first edit also stores the original, so "Undo all changes" and History can always bring it back
      if (!(await t.one('SELECT 1 AS x FROM lesson_edit_history WHERE item_id = ? LIMIT 1', [item.id]))) {
        const c = parse(item.content, {});
        await t.run("INSERT INTO lesson_edit_history (item_id, title, written, sources, note, saved_by, saved_at) VALUES (?,?,?,?, 'Original', '', now() - interval '1 second')",
          [item.id, item.title, JSON.stringify(c.written || []), JSON.stringify(c.sources || [])]);
      }
      await t.run(`INSERT INTO lesson_edits (item_id, title, written, sources, updated_by, updated_at) VALUES (?,?,?,?,?, now())
        ON CONFLICT (item_id) DO UPDATE SET title = EXCLUDED.title, written = EXCLUDED.written, sources = EXCLUDED.sources, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [item.id, title, JSON.stringify(written), JSON.stringify(sources), by]);
      if (title && title !== item.title) await t.run('UPDATE roadmap_items SET title = ? WHERE id = ?', [title, item.id]);
      await t.run('INSERT INTO lesson_edit_history (item_id, title, written, sources, note, saved_by) VALUES (?,?,?,?,?,?)',
        [item.id, title || item.title, JSON.stringify(written), JSON.stringify(sources), str(req.body?.note, 120), by]);
    });
    res.json({ ok: true, blocks: written.length });
  }));
  app.get('/api/lessons/:id/content/history', requireMaster, h(async (req, res) => {
    const rows = await db.all('SELECT id, title, note, saved_by, saved_at, written, sources FROM lesson_edit_history WHERE item_id = ? ORDER BY id DESC LIMIT 40', [Number(req.params.id)]);
    res.json(rows.map((r) => ({ ...r, written: parse(r.written, []), sources: parse(r.sources, []) })));
  }));

  // start (or resume) a level check — the next version in the A → B → C rotation
  app.post('/api/lessons/:id/check', requireStudent, h(async (req, res) => {
    const L = await lessonFor(req.user, req.params.id);
    if (!L) return bad(res, 'Not found', 404);
    if (L.locked === 'subscription') return bad(res, 'An active subscription is required for this lesson', 402, { code: 'subscription_required' });
    if (L.locked === 'wait') return bad(res, 'This lesson opens later', 403);
    if (L.locked) return bad(res, L.locked === 'soon' ? 'This lesson is coming soon' : L.locked === 'lessons' ? 'Pass every lesson first' : 'Finish the previous lesson first', 403);
    const versions = L.content.versions || [];
    if (!versions.length) return bad(res, 'This lesson has no level check yet');
    let c = await db.one('SELECT * FROM lesson_checks WHERE user_id = ? AND item_id = ? AND finished_at IS NULL ORDER BY id DESC LIMIT 1', [req.user.id, L.item.id]);
    if (!c) {
      const { n } = await db.one('SELECT COUNT(*) AS n FROM lesson_checks WHERE user_id = ? AND item_id = ? AND finished_at IS NOT NULL', [req.user.id, L.item.id]);
      c = await db.one('INSERT INTO lesson_checks (user_id, item_id, version) VALUES (?,?,?) RETURNING *', [req.user.id, L.item.id, versions[n % versions.length]]);
    }
    const qs = L.content.checks[c.version] || [];
    const limit = (L.content.time_minutes || 0) * 60;
    const elapsed = Math.floor((Date.now() - new Date(c.started_at).getTime()) / 1000);
    res.json({
      id: c.id, version: c.version, pass_percent: L.content.pass_percent ?? 80, type: L.content.type || 'section',
      time_limit: limit || null, remaining: limit ? Math.max(0, limit - elapsed - await penaltyOf('check', c.id)) : null,
      lesson: { id: L.item.id, title: L.item.title, module: L.step?.title },
      questions: qs.map(publicQ), answers: JSON.parse(c.answers || '{}'),
    });
  }));

  // teacher: try a level check exactly as students see it — graded in the browser, nothing is saved
  app.get('/api/lessons/:id/preview-check', requireMaster, h(async (req, res) => {
    const item = await db.one("SELECT * FROM roadmap_items WHERE id = ? AND kind = 'lesson'", [req.params.id]);
    if (!item) return bad(res, 'Not found', 404);
    const content = JSON.parse(item.content || '{}');
    const versions = content.versions || Object.keys(content.checks || {});
    const v = versions.includes(req.query.version) ? req.query.version : versions[0];
    if (!v) return bad(res, 'This lesson has no level check yet');
    res.json({ versions, version: v, pass_percent: content.pass_percent ?? 80, questions: (content.checks?.[v] || []).map((q) => ({ ...publicQ(q), answer: q.answer, explanation: q.explanation || '' })) });
  }));

  app.put('/api/lesson-checks/:id', requireStudent, h(async (req, res) => {
    const c = await db.one('SELECT * FROM lesson_checks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!c || c.finished_at) return bad(res, 'This check is already finished', 409);
    if (await overTime(c)) return res.json({ ok: false, late: true });
    const answers = {};
    for (const [k, v] of Object.entries(req.body?.answers || {})) if (Number.isInteger(v)) answers[String(k).slice(0, 40)] = v;
    await db.run('UPDATE lesson_checks SET answers = ? WHERE id = ?', [JSON.stringify(answers), c.id]);
    res.json({ ok: true });
  }));

  app.post('/api/lesson-checks/:id/submit', requireStudent, h(async (req, res) => {
    const c = await db.one('SELECT * FROM lesson_checks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!c) return bad(res, 'Not found', 404);
    if (!c.finished_at) {
      const item = await db.one('SELECT content FROM roadmap_items WHERE id = ?', [c.item_id]);
      const content = JSON.parse(item?.content || '{}');
      const qs = content.checks?.[c.version] || [];
      const answers = { ...JSON.parse(c.answers || '{}') };
      // answers sent after a timed check's deadline are ignored (what was saved in time counts)
      if (!(content.time_minutes && Date.now() - new Date(c.started_at).getTime() > (content.time_minutes * 60 + GRACE - await penaltyOf('check', c.id)) * 1000)) {
        for (const [k, v] of Object.entries(req.body?.answers || {})) if (Number.isInteger(v)) answers[k] = v;
      }
      const score = qs.filter((q) => answers[q.id] === q.answer).length;
      const passed = qs.length > 0 && (score / qs.length) * 100 >= (content.pass_percent ?? 80);
      await db.run('UPDATE lesson_checks SET answers = ?, score = ?, total = ?, passed = ?, finished_at = now() WHERE id = ?', [JSON.stringify(answers), score, qs.length, passed, c.id]);
      if (passed) await afterPass(req.user, roadmapFor);
    }
    res.json({ id: c.id });
  }));

  app.get('/api/lesson-checks/:id', h(async (req, res) => {
    const c = await db.one('SELECT * FROM lesson_checks WHERE id = ?', [req.params.id]);
    if (!c || (req.user.role !== 'master' && c.user_id !== req.user.id)) return bad(res, 'Not found', 404);
    if (!c.finished_at) return bad(res, 'This check is not finished yet', 409);
    const item = await db.one('SELECT id, title, content, step_id FROM roadmap_items WHERE id = ?', [c.item_id]);
    const content = JSON.parse(item?.content || '{}');
    const answers = JSON.parse(c.answers || '{}');
    const { n } = await db.one('SELECT COUNT(*) AS n FROM lesson_checks WHERE user_id = ? AND item_id = ? AND finished_at IS NOT NULL', [c.user_id, c.item_id]);
    const versions = content.versions || [];
    const nextLesson = await db.one("SELECT id, title FROM roadmap_items WHERE step_id = ? AND kind = 'lesson' AND position > (SELECT position FROM roadmap_items WHERE id = ?) ORDER BY position LIMIT 1", [item.step_id, item.id]);
    res.json({
      id: c.id, type: content.type || 'section', version: c.version, score: c.score, total: c.total, passed: c.passed, finished_at: c.finished_at,
      pass_percent: content.pass_percent ?? 80, next_version: versions[n % (versions.length || 1)] || null,
      lesson: { id: item.id, title: item.title }, next_lesson: nextLesson || null, focus: await focusSummary('check', c.id),
      seconds: Math.round((new Date(c.finished_at) - new Date(c.started_at)) / 1000),
      review: (content.checks?.[c.version] || []).map((q) => ({ ...publicQ(q), answer: q.answer, given: answers[q.id] ?? null, explanation: q.explanation || '', source: q.source || '' })),
    });
  }));

  // teacher: import / update a course module from JSON (e.g. grammar2.json later)
  // body: the module JSON, or { module, mode: 'update' | 'new', after_step_id } after the preview
  const unwrap = (b) => (b && b.module && b.module.sections ? b : { module: b, mode: 'update', after_step_id: null });
  app.post('/api/roadmap/modules/preview', requireMaster, h(async (req, res) => {
    const { module: m } = unwrap(req.body);
    const errs = validateModule(m);
    if (errs.length) return bad(res, 'The file has problems: ' + errs.join('; '));
    if (!m.id) return bad(res, 'The module needs a top-level "id" (e.g. "words-in-context") so it can be updated later');
    res.json({ id: m.id, title: m.title, sections: m.sections.length, ...(await previewModule(m)) });
  }));
  app.post('/api/roadmap/modules', requireMaster, h(async (req, res) => {
    const { module: m, mode, after_step_id: after } = unwrap(req.body);
    const errs = validateModule(m);
    if (errs.length) return bad(res, 'The file has problems: ' + errs.join('; '));
    if (!m.id) return bad(res, 'The module needs a top-level "id" (e.g. "words-in-context") so it can be updated later');
    let insertAt = Number((await db.one('SELECT COUNT(*) AS n FROM roadmap_steps')).n);
    if (after) { const p = await db.one('SELECT position FROM roadmap_steps WHERE id = ?', [Number(after)]); if (p) insertAt = p.position + 1; }
    else if (after === 0) insertAt = 0;
    // "Import as a new step": a copy with its own module id, so the existing step stays as it is
    const mod = mode === 'new' && (await db.one('SELECT 1 AS x FROM roadmap_steps WHERE module_id = ?', [m.id])) ? { ...m, id: `${m.id}-${Date.now().toString(36)}` } : m;
    const r = await upsertModule(mod, { src: 'upload', insertAt });
    await scanSoon(m?.exam_reserve?.unused_question_bank_ids || []);
    res.json(r);
  }));
}
