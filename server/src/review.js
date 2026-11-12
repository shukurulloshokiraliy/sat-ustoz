/**
 * Question review (teacher, Question quality → Review): every question on the platform, one at a time, until the
 * teacher approves it. Approving changes nothing for students (every question stays in use); it only takes the
 * question off the review list.
 *
 * Sources: Question Bank (also used by Take a quiz and random full mocks), teacher quizzes, level / session checks
 * of the roadmap, and full mocks typed in question by question (PDF mocks have only answer keys, nothing to read).
 *
 * An approved question comes back when: its text, choices, key or explanation change (a fingerprint is kept at
 * approval), a student reports it after the approval, or the statistics raise a new flag on it.
 * Problems first: open reports, text errors / warnings and statistics flags put a question at the front.
 */
import crypto from 'node:crypto';
import { db } from './db.js';
import { checkQuestion } from './quality.js';

const L = ['A', 'B', 'C', 'D'];
const parse = (x, d) => { try { return x == null ? d : JSON.parse(x); } catch { return d; } };
const PROBLEM_FLAGS = ['strong_miss', 'distractor', 'weak', 'very_hard'];
const SRC_LABEL = { qbank: 'Question Bank', quiz: 'Quiz', check: 'Level check', fullmock: 'Full mock' };

export async function migrateReview() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS question_approvals (
  src TEXT NOT NULL, ref TEXT NOT NULL, hash TEXT NOT NULL, flags TEXT NOT NULL DEFAULT '[]',
  approved_by TEXT NOT NULL DEFAULT '', approved_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (src, ref));
ALTER TABLE question_approvals ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS check_edits (
  item_id INTEGER NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE, version TEXT NOT NULL, qid TEXT NOT NULL,
  data TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (item_id, version, qid));
ALTER TABLE check_edits ENABLE ROW LEVEL SECURITY;`);
}

/**
 * Teacher fixes to level check questions are kept apart from the module JSON (which is re-synced on every start),
 * like lesson notes in lesson_edits. Every place that reads a check applies them.
 */
export async function applyCheckEdits(itemId, content) {
  if (!content?.checks) return content;
  const rows = await db.all('SELECT version, qid, data FROM check_edits WHERE item_id = ?', [Number(itemId)]).catch(() => []);
  for (const r of rows) {
    const list = content.checks[r.version];
    if (!Array.isArray(list)) continue;
    const i = list.findIndex((q) => String(q?.id) === r.qid);
    if (i >= 0) list[i] = { ...list[i], ...parse(r.data, {}) };
  }
  return content;
}

const fingerprint = (q) => crypto.createHash('sha1').update(JSON.stringify([q.passage || '', q.prompt || '', q.options || [], q.answer, q.explanation || ''])).digest('hex').slice(0, 16);

/** Every reviewable question, in one shape: { src, ref, where, type, passage, prompt, options, answer, explanation, … }. */
async function allQuestions(only = null) {
  // `only` = { src, ref }: load just that question (one click in Review must not read the whole bank)
  const want = (s) => !only || only.src === s;
  const out = [];
  const bank = !want('qbank') ? [] : await db.all(`SELECT q.id, q.skill_id, q.skill, q.difficulty, q.passage, q.prompt, q.options, q.answer, q.explanation, q.active, q.position,
      c.n, c.right_n, c.flags FROM qbank_questions q LEFT JOIN qbank_calib c ON c.question_id = q.id ${only ? 'WHERE q.id = ?' : ''} ORDER BY q.skill_id, q.position, q.id`, only ? [only.ref] : []);
  for (const q of bank) {
    const o = parse(q.options, []);
    out.push({ src: 'qbank', ref: q.id, where: `Question Bank · ${q.skill}`, type: q.skill, skill_id: q.skill_id, label: q.difficulty, hidden: !q.active,
      passage: q.passage || '', prompt: q.prompt || '', options: [0, 1, 2, 3].map((i) => String(o?.[i] ?? '')), answer: q.answer, explanation: q.explanation || '',
      n: Number(q.n || 0), pct: q.n ? Math.round((100 * q.right_n) / q.n) : null, flags: (parse(q.flags, []) || []).filter((f) => PROBLEM_FLAGS.includes(f)) });
  }
  const quiz = !want('quiz') ? [] : await db.all(`SELECT q.*, z.title FROM questions q JOIN quizzes z ON z.id = q.quiz_id ${only ? 'WHERE q.id = ?' : ''} ORDER BY z.id, q.position, q.id`, only ? [Number(only.ref) || 0] : []);
  for (const q of quiz) {
    out.push({ src: 'quiz', ref: String(q.id), where: `Quiz · ${q.title}`, type: q.topic || 'Quiz', quiz_id: q.quiz_id,
      passage: q.passage || '', prompt: q.prompt || '', options: [q.opt_a, q.opt_b, q.opt_c, q.opt_d].map((x) => String(x ?? '')), answer: L.indexOf(String(q.correct || '').toUpperCase()), explanation: q.explanation || '', flags: [] });
  }
  const fm = !want('fullmock') ? [] : await db.all(`SELECT q.*, m.title FROM full_mock_questions q JOIN full_mocks m ON m.id = q.mock_id WHERE m.mode <> 'qbank' ${only ? 'AND q.id = ?' : ''} ORDER BY m.id, q.module, q.position, q.id`, only ? [Number(only.ref) || 0] : []).catch(() => []);
  for (const q of fm) {
    out.push({ src: 'fullmock', ref: String(q.id), where: `Full mock · ${q.title} · Module ${q.module}`, type: q.topic || 'Full mock', mock_id: q.mock_id,
      passage: q.passage || '', prompt: q.prompt || '', options: [q.opt_a, q.opt_b, q.opt_c, q.opt_d].map((x) => String(x ?? '')), answer: L.indexOf(String(q.correct || '').toUpperCase()), explanation: q.explanation || '', flags: [] });
  }
  const itemId = only?.src === 'check' ? Number(String(only.ref).split(':')[0]) || 0 : null;
  const items = !want('check') ? [] : await db.all(`SELECT i.id, i.title, i.content, s.title AS step FROM roadmap_items i LEFT JOIN roadmap_steps s ON s.id = i.step_id
    WHERE i.kind = 'lesson' ${itemId != null ? 'AND i.id = ?' : ''} ORDER BY s.position, i.position, i.id`, itemId != null ? [itemId] : []);
  const edits = !items.length ? [] : await db.all(`SELECT item_id, version, qid, data FROM check_edits ${itemId != null ? 'WHERE item_id = ?' : ''}`, itemId != null ? [itemId] : []).catch(() => []);
  const ed = new Map(edits.map((r) => [`${r.item_id}:${r.version}:${r.qid}`, parse(r.data, {})]));
  for (const it of items) {
    const c = parse(it.content, {});
    for (const [v, list] of Object.entries(c.checks || {})) {
      if (!Array.isArray(list)) continue;
      list.forEach((raw, k) => {
        if (!raw || raw.id == null || !Array.isArray(raw.options)) return;
        const q = { ...raw, ...(ed.get(`${it.id}:${v}:${raw.id}`) || {}) };
        out.push({ src: 'check', ref: `${it.id}:${v}:${raw.id}`, where: `${c.type === 'session' ? 'Session check' : 'Level check'} · ${it.title} · version ${v}, question ${k + 1}`,
          type: it.step || 'Roadmap', item_id: it.id, version: v, qid: String(raw.id),
          passage: q.passage || '', prompt: q.prompt || '', options: q.options.map((x) => String(x ?? '')), answer: Number.isInteger(q.answer) ? q.answer : -1, explanation: q.explanation || '', flags: [] });
      });
    }
  }
  return only ? out.filter((x) => x.ref === String(only.ref)) : out;
}

/** Reports that point at each question (refs from "Report a problem": qbank:ID, fullmock:ID, quiz:ID, lesson:ITEM:QID). */
async function reportsBy(items) {
  const rows = await db.all('SELECT id, kind, ref, about, note, status, created_at, user_id FROM question_reports ORDER BY created_at DESC LIMIT 3000').catch(() => []);
  const bank = new Set(items.filter((x) => x.src === 'qbank').map((x) => x.ref));
  const checkByLesson = new Map();
  for (const x of items) if (x.src === 'check') { const k = `${x.item_id}:${x.qid}`; if (!checkByLesson.has(k)) checkByLesson.set(k, []); checkByLesson.get(k).push(x); }
  const by = new Map();
  const add = (key, r) => { if (!by.has(key)) by.set(key, []); by.get(key).push(r); };
  for (const r of rows) {
    const [src, ...rest] = String(r.ref || '').split(':');
    const id = rest.join(':');
    if ((src === 'qbank' || src === 'fullmock') && bank.has(id)) add(`qbank|${id}`, r);
    else if (src === 'fullmock' && id) add(`fullmock|${id}`, r);
    else if (src === 'quiz' && id) add(`quiz|${rest[0]}`, r);
    else if (src === 'lesson' && rest.length >= 2) for (const x of checkByLesson.get(`${rest[0]}:${rest.slice(1).join(':')}`) || []) add(`check|${x.ref}`, r);
  }
  return by;
}

/** Everything with its review state; `pending` = still to review. */
async function reviewState(only = null) {
  const items = await allQuestions(only);
  const appr = new Map((await db.all(`SELECT * FROM question_approvals ${only ? 'WHERE src = ? AND ref = ?' : ''}`, only ? [only.src, String(only.ref)] : [])).map((a) => [`${a.src}|${a.ref}`, a]));
  const reps = await reportsBy(items);
  for (const x of items) {
    const key = `${x.src}|${x.ref}`;
    x.hash = fingerprint(x);
    x.reports = reps.get(key) || [];
    x.open_reports = x.reports.filter((r) => r.status === 'open').length;
    let checks = [];
    try { checks = checkQuestion({ ...x, skill_id: x.skill_id || '' }); } catch { checks = []; }
    x.checks = checks;
    const a = appr.get(key);
    x.approved = null; x.back = null;
    if (a) {
      const seen = new Set(parse(a.flags, []));
      if (a.hash !== x.hash) x.back = 'Changed since you approved it';
      else if (x.reports.some((r) => new Date(r.created_at) > new Date(a.approved_at))) x.back = 'A student reported it after you approved it';
      else if (x.flags.some((f) => !seen.has(f))) x.back = 'The statistics flagged it after you approved it';
      else x.approved = { by: a.approved_by, at: a.approved_at };
    }
    const err = checks.filter((c) => c.level === 'error').length; const warn = checks.filter((c) => c.level === 'warn').length;
    x.prio = x.open_reports * 100 + (x.back ? 60 : 0) + err * 30 + x.flags.length * 20 + warn * 5;
  }
  return items;
}

const FLAG = {
  strong_miss: 'Strong students miss it more often than weak ones',
  distractor: 'A wrong choice is picked more often than the correct one',
  weak: 'Strong and weak students do about the same',
  very_hard: 'Fewer than 20% get it right',
};
const reasons = (x) => [
  ...(x.back ? [x.back] : []),
  ...(x.open_reports ? [`${x.open_reports} open report${x.open_reports > 1 ? 's' : ''}`] : []),
  ...x.checks.filter((c) => c.level !== 'info').map((c) => `${c.where}: ${c.text}`),
  ...x.flags.map((f) => FLAG[f] || f),
];

export function registerReview(app, { h, bad, requireMaster }) {
  app.get('/api/review', requireMaster, h(async (req, res) => {
    const items = await reviewState();
    const pending = items.filter((x) => !x.approved);
    // problems first, then each source in its own order (question type / quiz / lesson)
    const order = new Map(items.map((x, i) => [x, i]));
    pending.sort((a, b) => (b.prio > 0) - (a.prio > 0) || b.prio - a.prio || order.get(a) - order.get(b));
    const by = {};
    for (const s of Object.keys(SRC_LABEL)) {
      const all = items.filter((x) => x.src === s);
      by[s] = { label: SRC_LABEL[s], total: all.length, left: all.filter((x) => !x.approved).length };
    }
    const recent = items.filter((x) => x.approved).sort((a, b) => new Date(b.approved.at) - new Date(a.approved.at)).slice(0, 30)
      .map((x) => ({ src: x.src, ref: x.ref, where: x.where, preview: (x.prompt || x.passage).slice(0, 120), at: x.approved.at }));
    res.json({
      total: items.length, approved: items.length - pending.length, left: pending.length, by,
      queue: pending.map((x) => ({ src: x.src, ref: x.ref, problem: x.prio > 0, back: !!x.back })),
      recent,
    });
  }));

  app.get('/api/review/item', requireMaster, h(async (req, res) => {
    const src = String(req.query.src || ''); const ref = String(req.query.ref || '');
    const x = (await reviewState({ src, ref }))[0];
    if (!x) return bad(res, 'This question no longer exists', 404);
    const names = new Map((await db.all('SELECT id, name FROM users WHERE id = ANY(?::int[])', [[...new Set(x.reports.map((r) => r.user_id).filter(Boolean))]])).map((u) => [u.id, u.name]));
    res.json({
      src: x.src, ref: x.ref, src_label: SRC_LABEL[x.src], where: x.where, type: x.type, label: x.label || null, hidden: !!x.hidden,
      passage: x.passage, prompt: x.prompt, options: x.options, answer: x.answer, explanation: x.explanation,
      n: x.n ?? null, pct: x.pct ?? null, reasons: reasons(x), approved: x.approved, back: x.back,
      reports: x.reports.slice(0, 10).map((r) => ({ id: r.id, kind: r.kind, note: r.note, status: r.status, at: r.created_at, student: names.get(r.user_id) || 'Student' })),
      link: x.src === 'quiz' ? `/quizzes/${x.quiz_id}/edit` : x.src === 'check' ? `/lesson/${x.item_id}` : x.src === 'fullmock' ? '/full-mocks' : null,
    });
  }));

  app.post('/api/review/approve', requireMaster, h(async (req, res) => {
    const src = String(req.body?.src || ''); const ref = String(req.body?.ref || '');
    const x = (await reviewState({ src, ref }))[0];
    if (!x) return bad(res, 'This question no longer exists', 404);
    await db.run(`INSERT INTO question_approvals (src, ref, hash, flags, approved_by, approved_at) VALUES (?,?,?,?,?, now())
      ON CONFLICT (src, ref) DO UPDATE SET hash = EXCLUDED.hash, flags = EXCLUDED.flags, approved_by = EXCLUDED.approved_by, approved_at = now()`,
    [src, ref, x.hash, JSON.stringify(x.flags), req.user.name || 'Teacher']);
    // approving also closes the open reports on it (the teacher has looked at it)
    const open = x.reports.filter((r) => r.status === 'open').map((r) => r.id);
    if (open.length) await db.run("UPDATE question_reports SET status = 'resolved', resolved_at = now() WHERE id = ANY(?::int[])", [open]);
    res.json({ ok: true, closed_reports: open.length });
  }));
  app.post('/api/review/unapprove', requireMaster, h(async (req, res) => {
    await db.run('DELETE FROM question_approvals WHERE src = ? AND ref = ?', [String(req.body?.src || ''), String(req.body?.ref || '')]);
    res.json({ ok: true });
  }));

  // fix a quiz, level check or full mock question (Question Bank questions use PUT /api/qbank/admin/:id)
  app.put('/api/review/item', requireMaster, h(async (req, res) => {
    const b = req.body || {};
    const src = String(b.src || ''); const ref = String(b.ref || '');
    const txt = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').slice(0, max);
    const options = Array.isArray(b.options) ? b.options.map((o) => txt(o, 600)) : null;
    if (!options || options.length < 2 || options.some((o) => !o.trim())) return bad(res, 'Every answer choice needs text');
    const answer = Number(b.answer);
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return bad(res, 'Choose the correct answer');
    const q = { passage: txt(b.passage, 6000), prompt: txt(b.prompt, 600), explanation: txt(b.explanation, 4000) };
    if (src === 'quiz' || src === 'fullmock') {
      if (options.length !== 4) return bad(res, 'Give four answer choices');
      const table = src === 'quiz' ? 'questions' : 'full_mock_questions';
      const r = await db.one(`UPDATE ${table} SET passage = ?, prompt = ?, opt_a = ?, opt_b = ?, opt_c = ?, opt_d = ?, correct = ?, explanation = ? WHERE id = ? RETURNING id`,
        [q.passage, q.prompt, ...options, L[answer], q.explanation, Number(ref)]);
      if (!r) return bad(res, 'Question not found', 404);
    } else if (src === 'check') {
      const [item, version, ...rest] = ref.split(':');
      const qid = rest.join(':');
      const it = await db.one("SELECT content FROM roadmap_items WHERE id = ? AND kind = 'lesson'", [Number(item)]);
      const list = parse(it?.content, {})?.checks?.[version];
      if (!Array.isArray(list) || !list.some((x) => String(x?.id) === qid)) return bad(res, 'Question not found', 404);
      await db.run(`INSERT INTO check_edits (item_id, version, qid, data, updated_by, updated_at) VALUES (?,?,?,?,?, now())
        ON CONFLICT (item_id, version, qid) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [Number(item), version, qid, JSON.stringify({ ...q, options, answer }), req.user.name || 'Teacher']);
    } else return bad(res, 'Unknown question');
    res.json({ ok: true });
  }));
}
