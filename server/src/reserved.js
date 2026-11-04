/**
 * Reserved questions: Question Bank questions that are also used in an exam (quizzes, part / session checks)
 * or a lesson level check never appear in practice, "Take a quiz" or any random generator,
 * so students do not meet exam questions before the exam.
 *
 * qbank_questions.reserved_for: null | 'lesson' | 'exam'. A question matches by its id (when the source has one)
 * or by normalised passage + question text. reserve_off = the teacher released it by hand (never re-reserved).
 */
import { db } from './db.js';

export async function migrateReserved() {
  await db.exec(`ALTER TABLE qbank_questions ADD COLUMN IF NOT EXISTS reserved_for TEXT;
  ALTER TABLE qbank_questions ADD COLUMN IF NOT EXISTS reserve_off BOOLEAN NOT NULL DEFAULT false;
  CREATE INDEX IF NOT EXISTS idx_qbank_reserved ON qbank_questions(reserved_for);
  CREATE TABLE IF NOT EXISTS qbank_reserve_extra (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  ALTER TABLE qbank_reserve_extra ENABLE ROW LEVEL SECURITY;`);
}

const norm = (s) => String(s || '').toLowerCase().replace(/\[\[|\]\]|\*\*|<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const keyOf = (passage, prompt) => `${norm(passage)}|${norm(prompt)}`;
const RANK = { lesson: 1, exam: 2 };

/** Walk lesson / session check content and collect its questions. */
function checkQuestions(content) {
  const out = [];
  const add = (q) => { if (q && typeof q === 'object') out.push(q); };
  for (const list of Object.values(content?.checks || {})) if (Array.isArray(list)) list.forEach(add);
  for (const list of Object.values(content?.versions || {})) if (Array.isArray(list)) list.forEach(add);
  return out;
}

/**
 * Scan every quiz and lesson check and mark matching Question Bank questions. Cheap enough to run after each
 * quiz save or module import (≈ 8k bank rows are matched in memory). `extraExamIds` = module exam_reserve ids.
 */
export async function scanReserved(extraExamIds = []) {
  // module files list Question Bank ids kept for exams (exam_reserve.unused_question_bank_ids): remember them
  for (const id of extraExamIds.slice(0, 5000)) await db.run('INSERT INTO qbank_reserve_extra (id) VALUES (?) ON CONFLICT DO NOTHING', [String(id)]);
  extraExamIds = (await db.all('SELECT id FROM qbank_reserve_extra')).map((r) => r.id);
  const bank = await db.all('SELECT id, passage, prompt, reserved_for, reserve_off FROM qbank_questions');
  if (!bank.length) return { exam: 0, lesson: 0 };
  const byId = new Map(bank.map((q) => [q.id, q]));
  const byKey = new Map();
  for (const q of bank) { const k = keyOf(q.passage, q.prompt); if (k.length > 12) byKey.set(k, q.id); }
  const want = new Map(); // id → 'lesson' | 'exam'
  const mark = (id, kind) => { if (id && byId.has(id) && (RANK[kind] > (RANK[want.get(id)] || 0))) want.set(id, kind); };
  const match = (q, kind) => { if (q.id && byId.has(String(q.id))) return mark(String(q.id), kind); mark(byKey.get(keyOf(q.passage, q.prompt ?? q.question)), kind); };

  // quizzes (exams uploaded from Excel / PDF)
  for (const q of await db.all('SELECT passage, prompt FROM questions')) match(q, 'exam');
  // roadmap lessons: level checks = lesson, session checks = exam
  for (const it of await db.all("SELECT content FROM roadmap_items WHERE kind = 'lesson' AND content <> ''")) {
    let c; try { c = JSON.parse(it.content); } catch { continue; }
    const kind = c.type === 'session' ? 'exam' : 'lesson';
    for (const q of checkQuestions(c)) match(q, kind);
    for (const id of c.exam_reserve?.unused_question_bank_ids || c.reserved_ids || []) mark(String(id), 'exam');
  }
  for (const id of extraExamIds) mark(String(id), 'exam');

  // write only the changes; teacher-released questions stay released
  let exam = 0; let lesson = 0;
  const sets = { exam: [], lesson: [], none: [] };
  for (const q of bank) {
    const w = q.reserve_off ? null : (want.get(q.id) || null);
    if (w === 'exam') exam++; if (w === 'lesson') lesson++;
    if ((q.reserved_for || null) !== w) sets[w || 'none'].push(q.id);
  }
  if (sets.exam.length) await db.run("UPDATE qbank_questions SET reserved_for = 'exam' WHERE id = ANY(?::text[])", [sets.exam]);
  if (sets.lesson.length) await db.run("UPDATE qbank_questions SET reserved_for = 'lesson' WHERE id = ANY(?::text[])", [sets.lesson]);
  if (sets.none.length) await db.run('UPDATE qbank_questions SET reserved_for = NULL WHERE id = ANY(?::text[])', [sets.none]);
  return { exam, lesson, changed: sets.exam.length + sets.lesson.length + sets.none.length };
}

/** Re-scan after content changes (awaited: serverless functions stop right after the response). */
export const scanSoon = (ids = []) => scanReserved(ids).catch((e) => console.error('[reserved]', e.message));

export function registerReserved(app, { h, bad, requireMaster }) {
  app.post('/api/qbank/reserved/scan', requireMaster, h(async (req, res) => res.json(await scanReserved())));
  // teacher: reserve / release one or many questions by hand
  app.post('/api/qbank/reserved', requireMaster, h(async (req, res) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).slice(0, 2000);
    if (!ids.length) return bad(res, 'Choose questions');
    const to = ['exam', 'lesson'].includes(req.body?.reserved_for) ? req.body.reserved_for : null;
    if (to) await db.run('UPDATE qbank_questions SET reserved_for = ?, reserve_off = false WHERE id = ANY(?::text[])', [to, ids]);
    else await db.run('UPDATE qbank_questions SET reserved_for = NULL, reserve_off = true WHERE id = ANY(?::text[])', [ids]);
    res.json({ ok: true, count: ids.length });
  }));
}
