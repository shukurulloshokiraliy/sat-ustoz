import { db } from '../db.js';
import { playUrl } from '../video.js';
import { scanSoon } from '../reserved.js';
import { getSettings } from '../db.js';
import { upsertModule, validateModule, previewModule } from './modules.js';
import { addCourseWords } from '../vocab.js';

const publicQ = (q) => ({ id: q.id, kind: q.kind, prompt: q.prompt, passage: q.passage || '', options: q.options });
const GRACE = 20; // seconds of network slack for timed checks
async function overTime(c) {
  const item = await db.one('SELECT content FROM roadmap_items WHERE id = ?', [c.item_id]);
  const min = JSON.parse(item?.content || '{}').time_minutes || 0;
  return !!min && Date.now() - new Date(c.started_at).getTime() > (min * 60 + GRACE) * 1000;
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
      else if (!access.roadmap && !content.free) locked = 'subscription';
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
      free: !!content.free,
      check: versions.length ? {
        versions, pass_percent: content.pass_percent ?? 80,
        count: content.checks?.[versions[0]]?.length || 0, time_minutes: content.time_minutes || 0,
        next_version: nextVersion, open_id: open?.id || null,
      } : null,
      passed: !!state.done, best: state.best ?? null, history,
    });
  }));

  // start (or resume) a level check — the next version in the A → B → C rotation
  app.post('/api/lessons/:id/check', requireStudent, h(async (req, res) => {
    const L = await lessonFor(req.user, req.params.id);
    if (!L) return bad(res, 'Not found', 404);
    if (L.locked === 'subscription') return bad(res, 'An active subscription is required for this lesson', 402, { code: 'subscription_required' });
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
      time_limit: limit || null, remaining: limit ? Math.max(0, limit - elapsed) : null,
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
      if (!(content.time_minutes && Date.now() - new Date(c.started_at).getTime() > (content.time_minutes * 60 + GRACE) * 1000)) {
        for (const [k, v] of Object.entries(req.body?.answers || {})) if (Number.isInteger(v)) answers[k] = v;
      }
      const score = qs.filter((q) => answers[q.id] === q.answer).length;
      const passed = qs.length > 0 && (score / qs.length) * 100 >= (content.pass_percent ?? 80);
      await db.run('UPDATE lesson_checks SET answers = ?, score = ?, total = ?, passed = ?, finished_at = now() WHERE id = ?', [JSON.stringify(answers), score, qs.length, passed, c.id]);
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
      lesson: { id: item.id, title: item.title }, next_lesson: nextLesson || null,
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
