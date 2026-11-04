/**
 * Assignments: tasks that follow the roadmap, plus tasks the teacher gives to a student or a group.
 *
 * - Roadmap quizzes are NOT on the Quizzes page. Each quiz in a roadmap step becomes an assignment for the
 *   student once that step is unlocked; future steps show their assignments greyed out with a lock.
 * - The teacher can "Assign to…" any quiz (one student, several, or a group), optionally with a due date,
 *   a number of attempts and a pass mark — e.g. a retake outside the roadmap.
 * - Shape (general, so other task types can plug in later):
 *   { key, source: 'roadmap' | 'teacher', type: 'quiz', title, step, quiz_id, status, best, tries, due_at, attempts_allowed, pass_pct, locked }
 */
import { db } from './db.js';
import { notifyUser } from './tgbot.js';

export async function migrateAssignments() {
  await db.exec(`CREATE TABLE IF NOT EXISTS assignments (
    id SERIAL PRIMARY KEY, type TEXT NOT NULL DEFAULT 'quiz', quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    due_at TIMESTAMPTZ, attempts_allowed INTEGER NOT NULL DEFAULT 0, pass_pct INTEGER NOT NULL DEFAULT 70, note TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE INDEX IF NOT EXISTS idx_assign_user ON assignments(user_id);
  CREATE INDEX IF NOT EXISTS idx_assign_group ON assignments(group_id);
  ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;`);
}

/** The student's results per quiz: best %, tries, open attempt. */
async function quizResults(userId, quizIds) {
  if (!quizIds.length) return new Map();
  const rows = await db.all(`SELECT quiz_id, COUNT(finished_at) AS tries,
      MAX(CASE WHEN finished_at IS NOT NULL AND total > 0 THEN ROUND(100.0 * score / total) END) AS best,
      MAX(CASE WHEN finished_at IS NULL THEN id END) AS open_id,
      MAX(finished_at) AS last_at
    FROM attempts WHERE user_id = ? AND quiz_id = ANY(?::int[]) GROUP BY quiz_id`, [userId, quizIds]);
  return new Map(rows.map((r) => [r.quiz_id, { tries: Number(r.tries), best: r.best == null ? null : Number(r.best), open_id: r.open_id, last_at: r.last_at }]));
}

function statusOf(r, pass, allowed) {
  if (!r) return 'new';
  if (r.open_id) return 'in_progress';
  if (r.best != null && r.best >= pass) return 'passed';
  if (r.tries > 0) return allowed && r.tries >= allowed ? 'failed' : 'retake';
  return 'new';
}

/** Teacher assignments that apply to this user (directly or through the group). */
const teacherRows = (user) => db.all(`SELECT a.*, q.title, q.duration_min, (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = q.id) AS questions
  FROM assignments a JOIN quizzes q ON q.id = a.quiz_id WHERE a.user_id = ? OR (a.group_id IS NOT NULL AND a.group_id = ?) ORDER BY a.created_at DESC`, [user.id, user.group_id ?? -1]);

/** Every assignment for one student. `roadmapFor` comes from index.js (step locking lives there). */
export async function assignmentsFor(user, roadmapFor) {
  const { steps } = await roadmapFor(user);
  const out = [];
  steps.forEach((s, i) => {
    for (const it of s.items || []) {
      if (it.kind === 'random') {
        out.push({ key: `e${it.id}`, source: 'roadmap', type: 'exam', item_id: it.id, title: it.title, quiz_id: null,
          step: { id: s.id, title: s.title, index: i + 1 }, pass_pct: it.exam?.pass_pct ?? 80, attempts_allowed: 0, due_at: null,
          minutes: it.exam?.minutes, questions: it.exam?.count, best: it.best ?? null, tries: it.tries || 0,
          locked: s.status === 'locked', lock_reason: s.status === 'locked' ? `Finish “${steps[i - 1]?.title || 'the previous step'}” to unlock` : null });
        continue;
      }
      if (it.kind !== 'quiz' || !it.quiz_id) continue;
      out.push({ key: `r${it.id}`, source: 'roadmap', type: 'quiz', title: it.title || it.quiz_title, quiz_id: it.quiz_id,
        step: { id: s.id, title: s.title, index: i + 1 }, pass_pct: s.pass_pct, attempts_allowed: 0, due_at: null,
        minutes: it.quiz_minutes, questions: Number(it.quiz_questions || 0),
        locked: s.status === 'locked', lock_reason: s.status === 'locked' ? `Finish “${steps[i - 1]?.title || 'the previous step'}” to unlock` : null });
    }
  });
  for (const a of await teacherRows(user)) {
    out.push({ key: `t${a.id}`, id: a.id, source: a.group_id ? 'group' : 'teacher', type: a.type, title: a.title, quiz_id: a.quiz_id, step: null,
      pass_pct: a.pass_pct, attempts_allowed: a.attempts_allowed, due_at: a.due_at, note: a.note, minutes: a.duration_min, questions: Number(a.questions || 0), locked: false });
  }
  const res = await quizResults(user.id, [...new Set(out.map((a) => a.quiz_id).filter(Boolean))]);
  const openExams = new Set((await db.all("SELECT item_id FROM qbank_mocks WHERE user_id = ? AND item_id IS NOT NULL AND finished_at IS NULL AND started_at > now() - (COALESCE(minutes, 32) || ' minutes')::interval", [user.id])).map((r) => r.item_id));
  for (const a of out) {
    if (a.type === 'exam') {
      a.open_attempt = openExams.has(a.item_id) || null;
      a.status = a.locked ? 'locked' : a.open_attempt ? 'in_progress' : a.best != null && a.best >= a.pass_pct ? 'passed' : a.tries ? 'retake' : 'new';
      continue;
    }
    const r = res.get(a.quiz_id);
    a.best = r?.best ?? null; a.tries = r?.tries || 0; a.open_attempt = r?.open_id || null;
    a.status = a.locked ? 'locked' : statusOf(r, a.pass_pct, a.attempts_allowed);
    a.overdue = !!(a.due_at && new Date(a.due_at) < new Date() && a.status !== 'passed');
  }
  return out;
}

/** Can this user open this roadmap / assigned quiz right now? */
export async function assignedQuizOpen(user, quizId, roadmapFor) {
  const list = await assignmentsFor(user, roadmapFor);
  return list.some((a) => a.quiz_id === Number(quizId) && !a.locked && a.status !== 'failed');
}

export function registerAssignments(app, { h, bad, requireMaster, requireStudent, roadmapFor }) {
  app.get('/api/assignments', requireStudent, h(async (req, res) => {
    const items = await assignmentsFor(req.user, roadmapFor);
    res.json({ items, open: items.filter((a) => ['new', 'in_progress', 'retake'].includes(a.status)).length });
  }));

  // teacher: one student's assignments (same view as the student's)
  app.get('/api/students/:id/assignments', requireMaster, h(async (req, res) => {
    const u = await db.one("SELECT * FROM users WHERE id = ? AND role = 'student'", [Number(req.params.id)]);
    if (!u) return bad(res, 'Not found', 404);
    res.json({ items: await assignmentsFor(u, roadmapFor) });
  }));

  // teacher: every assignment given outside the roadmap, with progress
  app.get('/api/master/assignments', requireMaster, h(async (req, res) => {
    const rows = await db.all(`SELECT a.*, q.title, u.name AS user_name, g.name AS group_name FROM assignments a
      JOIN quizzes q ON q.id = a.quiz_id LEFT JOIN users u ON u.id = a.user_id LEFT JOIN groups g ON g.id = a.group_id
      ORDER BY a.created_at DESC LIMIT 300`);
    const out = [];
    for (const a of rows) {
      const students = a.user_id ? [{ id: a.user_id, name: a.user_name }] : await db.all("SELECT id, name FROM users WHERE role = 'student' AND group_id = ? ORDER BY name", [a.group_id]);
      let passed = 0; let started = 0;
      const per = [];
      for (const s of students) {
        const r = (await quizResults(s.id, [a.quiz_id])).get(a.quiz_id);
        const st = statusOf(r, a.pass_pct, a.attempts_allowed);
        if (st === 'passed') passed++; if (st !== 'new') started++;
        per.push({ id: s.id, name: s.name, status: st, best: r?.best ?? null, tries: r?.tries || 0 });
      }
      out.push({ ...a, students: per, total: students.length, passed, started });
    }
    res.json(out);
  }));

  app.post('/api/assignments', requireMaster, h(async (req, res) => {
    const b = req.body || {};
    const quiz = await db.one('SELECT id, title FROM quizzes WHERE id = ?', [Number(b.quiz_id)]);
    if (!quiz) return bad(res, 'Choose a quiz');
    const userIds = (Array.isArray(b.user_ids) ? b.user_ids : []).map(Number).filter(Boolean).slice(0, 500);
    const groupId = b.group_id ? Number(b.group_id) : null;
    if (!userIds.length && !groupId) return bad(res, 'Choose students or a group');
    const due = b.due_at && !Number.isNaN(Date.parse(b.due_at)) ? new Date(b.due_at).toISOString() : null;
    const allowed = Math.max(0, Math.min(20, Math.round(+b.attempts_allowed || 0)));
    const pass = Math.max(10, Math.min(100, Math.round(+b.pass_pct || 70)));
    const note = String(b.note || '').trim().slice(0, 300);
    const made = [];
    await db.tx(async (t) => {
      if (groupId) made.push((await t.one('INSERT INTO assignments (quiz_id, group_id, due_at, attempts_allowed, pass_pct, note, created_by) VALUES (?,?,?,?,?,?,?) RETURNING id', [quiz.id, groupId, due, allowed, pass, note, req.user.id])).id);
      for (const u of userIds) made.push((await t.one('INSERT INTO assignments (quiz_id, user_id, due_at, attempts_allowed, pass_pct, note, created_by) VALUES (?,?,?,?,?,?,?) RETURNING id', [quiz.id, u, due, allowed, pass, note, req.user.id])).id);
    });
    // Telegram for students who linked the bot
    const targets = groupId ? (await db.all("SELECT id FROM users WHERE role = 'student' AND group_id = ?", [groupId])).map((r) => r.id) : userIds;
    const when = due ? ` · due ${new Date(due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Tashkent' })}` : '';
    for (const id of targets.slice(0, 200)) notifyUser(id, `📝 New assignment: <b>${quiz.title.replace(/[<>&]/g, '')}</b>${when}\nOpen ustozsat.uz → Assignments`);
    res.json({ ids: made });
  }));

  app.delete('/api/assignments/:id', requireMaster, h(async (req, res) => {
    await db.run('DELETE FROM assignments WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
  }));
}
