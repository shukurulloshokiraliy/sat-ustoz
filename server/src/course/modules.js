/**
 * Course modules (e.g. content/grammar1.json): one roadmap step per module, one “lesson” item per
 * section. A lesson holds written notes, a video slot (URL added later by the teacher) and level
 * checks in several versions (A → B → C → A …). Passing a check opens the next lesson.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, '..', 'content');

/** “Grammar 1: Clauses” → “Writing Part 1: Clauses” (SAT Standard English Conventions). */
export const displayTitle = (m) => String(m.display_title || m.title || 'Module').replace(/^Grammar\s+(\d+)\s*:\s*/i, 'Writing Part $1: ');
const badgeFor = (m) => {
  const n = String(m.title || '').match(/(\d+)/)?.[1];
  return /grammar|writing/i.test(m.title || '') && n ? `W${n}` : String(displayTitle(m)).replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();
};

export function validateModule(m) {
  const errs = [];
  if (!m || typeof m !== 'object') return ['Not a JSON object'];
  if (!m.id) errs.push('“id” is required');
  if (!m.title) errs.push('“title” is required');
  if (!Array.isArray(m.sections) || !m.sections.length) errs.push('“sections” must be a non-empty list');
  (m.sections || []).forEach((s, i) => {
    if (!s?.id || !s?.title) errs.push(`section ${i + 1}: id and title are required`);
    for (const [v, qs] of Object.entries(s?.level_checks || {})) {
      if (!Array.isArray(qs)) { errs.push(`section ${s.id}: level_checks.${v} must be a list`); continue; }
      qs.forEach((q, k) => {
        if (!Array.isArray(q?.options) || q.options.length < 2 || !Number.isInteger(q?.answer) || q.answer < 0 || q.answer >= q.options.length) {
          errs.push(`section ${s.id} ${v}${k + 1}: options and a valid “answer” index are required`);
        }
      });
    }
  });
  for (const [v, qs] of Object.entries(m?.session_check?.versions || {})) {
    if (!Array.isArray(qs)) { errs.push(`session_check.versions.${v} must be a list`); continue; }
    qs.forEach((q, k) => {
      if (!Array.isArray(q?.options) || q.options.length < 2 || !Number.isInteger(q?.answer) || q.answer < 0 || q.answer >= q.options.length) errs.push(`session check ${v}${k + 1}: options and a valid “answer” index are required`);
    });
  }
  return errs.slice(0, 12);
}

/** Section → lesson content (kept server-side; answers never go to students before a check is submitted). */
function lessonContent(m, s, order) {
  const checks = s.level_checks || {};
  const versions = (m.pass_rule?.versions || Object.keys(checks)).filter((v) => Array.isArray(checks[v]) && checks[v].length);
  return {
    type: 'section', module_id: m.id, section_id: s.id, order,
    video: s.video || null,
    written: Array.isArray(s.written) ? s.written : [],
    sources: Array.isArray(s.sources) ? s.sources : [],
    checks, versions,
    pass_percent: m.pass_rule?.pass_percent ?? 80,
    questions_per_check: m.pass_rule?.questions_per_check ?? null,
    free: order <= (Number.isInteger(m.free_lessons) ? m.free_lessons : 0), // e.g. Writing Part 1: lessons 1–2 open to everyone
  };
}
const statusOf = (s) => ((Array.isArray(s.written) && s.written.length) || Object.keys(s.level_checks || {}).length ? 'ready' : 'soon');

/** Module vocabulary (studied alongside the lessons, tested in the session check). */
function vocabContent(m) {
  const v = m.vocabulary || {};
  return { type: 'vocab', module_id: m.id, section_id: '_vocab', words: Array.isArray(v.words) ? v.words : [], tested_in: v.tested_in || '' };
}
/** Session check: the final, timed check of a module; opens when every lesson is passed. */
function sessionContent(m) {
  const sc = m.session_check || {};
  const checks = sc.versions || {};
  const versions = (m.pass_rule?.versions || Object.keys(checks)).filter((v) => Array.isArray(checks[v]) && checks[v].length);
  return {
    type: 'session', module_id: m.id, section_id: '_session',
    checks, versions, pass_percent: sc.pass_percent ?? m.pass_rule?.pass_percent ?? 80,
    time_minutes: sc.time_minutes || 0, makeup: sc.makeup || '', unlock: sc.unlock || 'after all lessons are passed',
  };
}
const AUTO_DESC = /^\d+ lessons\. Each lesson has/;

/**
 * Creates or updates the roadmap step for a module. Existing lesson items are matched by section id,
 * so student progress and the teacher's video links survive content updates.
 */
export async function upsertModule(m, { src = 'bundled', insertAt = 1, renameFrom } = {}) {
  return db.tx(async (t) => {
    let step = await t.one('SELECT * FROM roadmap_steps WHERE module_id = ?', [m.id]);
    if (!step && renameFrom) step = await t.one("SELECT * FROM roadmap_steps WHERE module_id = '' AND title ~* ? ORDER BY position LIMIT 1", [renameFrom]);
    const meta = {
      title: displayTitle(m),
      subtitle: m.subtitle || 'Standard English Conventions',
      description: m.description || `${m.sections.length} lessons. Each lesson has a video, written notes and a level check (${m.pass_rule?.questions_per_check || 15} questions, pass with ${m.pass_rule?.pass_percent ?? 80}%). Passing a level check opens the next lesson.`
        + (m.vocabulary?.words?.length ? ` Learn ${m.vocabulary.words.length} SAT words along the way.` : '')
        + (m.session_check?.questions ? ` The part ends with a ${m.session_check.questions}-question session check (${m.session_check.time_minutes} min, pass with ${m.session_check.pass_percent ?? 80}%).` : ''),
      focus: Array.isArray(m.focus) ? m.focus.join(', ') : '',
    };
    let created = false;
    if (!step) {
      await t.run('UPDATE roadmap_steps SET position = position + 1 WHERE position >= ?', [insertAt]);
      step = await t.one(`INSERT INTO roadmap_steps (position, title, subtitle, description, focus, score_from, score_to, badge, color, pass_pct, module_id, module_src)
        VALUES (?,?,?,?,?,300,360,?,'signal',?,?,?) RETURNING *`, [insertAt, meta.title, meta.subtitle, meta.description, meta.focus, badgeFor(m), m.pass_rule?.pass_percent ?? 80, m.id, src]);
      created = true;
    } else if (!step.module_id) {
      // convert an older placeholder step (e.g. “Grammar 1: Clauses”) into the real module
      await t.run('UPDATE roadmap_steps SET title = ?, subtitle = ?, description = ?, focus = ?, badge = ?, module_id = ?, module_src = ?, pass_pct = ? WHERE id = ?',
        [meta.title, meta.subtitle, meta.description, meta.focus, badgeFor(m), m.id, src, m.pass_rule?.pass_percent ?? 80, step.id]);
      await t.run("DELETE FROM roadmap_items WHERE step_id = ? AND kind <> 'lesson'", [step.id]);
    } else {
      await t.run('UPDATE roadmap_steps SET module_src = ? WHERE id = ?', [src, step.id]);
      if (AUTO_DESC.test(step.description || '')) await t.run('UPDATE roadmap_steps SET description = ? WHERE id = ?', [meta.description, step.id]);
    }

    const existing = await t.all("SELECT id, content FROM roadmap_items WHERE step_id = ? AND kind = 'lesson'", [step.id]);
    const bySection = new Map(existing.map((r) => { try { return [JSON.parse(r.content || '{}').section_id, r.id]; } catch { return [null, r.id]; } }));
    const keep = [];
    for (let i = 0; i < m.sections.length; i++) {
      const s = m.sections[i];
      const content = JSON.stringify(lessonContent(m, s, i + 1));
      const title = `Lesson ${i + 1}: ${s.title}`;
      const id = bySection.get(s.id);
      if (id) {
        await t.run('UPDATE roadmap_items SET position = ?, title = ?, content = ?, status = ? WHERE id = ?', [i, title, content, statusOf(s), id]);
        keep.push(id);
      } else {
        keep.push((await t.run("INSERT INTO roadmap_items (step_id, position, kind, title, content, status) VALUES (?,?,'lesson',?,?,?) RETURNING id",
          [step.id, i, title, content, statusOf(s)])).id);
      }
    }
    // vocabulary + session check come after the lessons
    const extras = [];
    if (m.vocabulary?.words?.length) extras.push([`Vocabulary: ${m.vocabulary.words.length} SAT words`, JSON.stringify(vocabContent(m)), '_vocab']);
    if (Object.keys(m.session_check?.versions || {}).length) extras.push([`Session check: ${displayTitle(m).split(':')[0]}`, JSON.stringify(sessionContent(m)), '_session']);
    for (let k = 0; k < extras.length; k++) {
      const [title, content, sid] = extras[k];
      const pos = m.sections.length + k;
      const id = bySection.get(sid);
      if (id) { await t.run("UPDATE roadmap_items SET position = ?, title = ?, content = ?, status = 'ready' WHERE id = ?", [pos, title, content, id]); keep.push(id); }
      else keep.push((await t.run("INSERT INTO roadmap_items (step_id, position, kind, title, content, status) VALUES (?,?,'lesson',?,?,'ready') RETURNING id", [step.id, pos, title, content])).id);
    }
    await t.run("DELETE FROM roadmap_items WHERE step_id = ? AND kind = 'lesson' AND NOT (id = ANY(?::int[]))", [step.id, keep]);
    return { step_id: step.id, created, lessons: m.sections.length, ready: m.sections.filter((s) => statusOf(s) === 'ready').length, extras: extras.length };
  });
}

const HANDOUT_DIR = path.join(CONTENT_DIR, 'handouts');
/** Bundled rules sheets (content/handouts/handouts.json): stored with the step unless the teacher uploaded their own. */
async function syncHandout(moduleId) {
  let map = {};
  try { map = JSON.parse(fs.readFileSync(path.join(HANDOUT_DIR, 'handouts.json'), 'utf8')); } catch { return; }
  const h = map[moduleId];
  if (!h?.file || !fs.existsSync(path.join(HANDOUT_DIR, h.file))) return;
  const step = await db.one('SELECT id FROM roadmap_steps WHERE module_id = ?', [moduleId]);
  if (!step) return;
  const data = fs.readFileSync(path.join(HANDOUT_DIR, h.file));
  const cur = await db.one('SELECT src, size, name, title FROM step_handouts WHERE step_id = ?', [step.id]);
  if (cur && (cur.src !== 'bundled' || (cur.size === data.length && cur.name === h.file && cur.title === (h.title || '')))) return;
  await db.run(`INSERT INTO step_handouts (step_id, name, title, pages, size, src, data) VALUES (?,?,?,?,?,'bundled',?)
    ON CONFLICT (step_id) DO UPDATE SET name = EXCLUDED.name, title = EXCLUDED.title, pages = EXCLUDED.pages, size = EXCLUDED.size, src = 'bundled', data = EXCLUDED.data, updated_at = now()`,
    [step.id, h.file, h.title || '', h.pages || null, data.length, data]);
}

/** On start-up: sync bundled modules (unless the teacher replaced one by upload). */
export async function syncBundledModules() {
  if (!fs.existsSync(CONTENT_DIR)) return;
  for (const f of fs.readdirSync(CONTENT_DIR).filter((x) => x.endsWith('.json')).sort()) {
    let m;
    try { m = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8')); } catch (e) { console.error(`[content] ${f}: ${e.message}`); continue; }
    const errs = validateModule(m);
    if (errs.length) { console.error(`[content] ${f}: ${errs.join('; ')}`); continue; }
    const cur = await db.one('SELECT module_src FROM roadmap_steps WHERE module_id = ?', [m.id]);
    if (cur?.module_src !== 'upload') {
      const n = String(m.title || '').match(/(\d+)/)?.[1];
      // a new module goes right after the module with the previous number (e.g. Writing Part 3 after Part 2's step)
      const prev = n ? await db.one("SELECT MAX(position) AS p FROM roadmap_steps WHERE title ~* ?", [`^(Grammar|Writing Part) ${Number(n) - 1}([^0-9]|$)`]) : null;
      const r = await upsertModule(m, { src: 'bundled', insertAt: prev?.p != null ? prev.p + 1 : 1, renameFrom: n ? `^(Grammar|Writing Part) ${n}(:|$)` : null });
      if (r.created) console.log(`[content] added “${displayTitle(m)}” (${r.ready}/${r.lessons} lessons ready)`);
    }
    await syncHandout(m.id);
  }
  // keep the naming consistent for the remaining grammar placeholders
  await db.run("UPDATE roadmap_steps SET title = regexp_replace(title, '^Grammar ([0-9]+):', 'Writing Part \\1:'), badge = regexp_replace(badge, '^G([0-9])$', 'W\\1') WHERE module_id = '' AND title ~ '^Grammar [0-9]+:'");
}

/** Short, answer-free description of a lesson for roadmap lists and the editor. */
export function lessonSummary(item) {
  let c = {};
  try { c = JSON.parse(item.content || '{}'); } catch { /* ignore */ }
  const versions = c.versions || [];
  return {
    type: c.type || 'section', words: c.words?.length || 0, time_minutes: c.time_minutes || 0,
    section_id: c.section_id, order: c.order, free: !!c.free,
    has_notes: !!c.written?.length,
    check_count: versions.length ? (c.checks?.[versions[0]]?.length || 0) : 0,
    versions, pass_percent: c.pass_percent ?? 80,
    video_meta: c.video || null,
  };
}
