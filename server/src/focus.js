/**
 * Exam mode (real-test conditions): timed tests run in full screen. Leaving the test — exiting full screen,
 * switching tab or app, minimising — is recorded, the time away keeps running (the clock never stops), and every
 * exit also costs a fixed penalty taken off the remaining time (Settings → `focus_penalty`, default 30 s).
 * Results show time on screen, time away and the number of exits, for the student and the teacher.
 *
 * kinds: 'fullmock' (full_mock_attempts, per module), 'mock' (qbank_mocks: Take a quiz / roadmap exams),
 *        'quiz' (attempts: teacher quizzes), 'check' (lesson_checks: level and session checks)
 */
import { db, getSettings } from './db.js';

const TABLES = { fullmock: 'full_mock_attempts', mock: 'qbank_mocks', quiz: 'attempts', check: 'lesson_checks' };

export async function migrateFocus() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS exam_focus (
  kind TEXT NOT NULL, ref INTEGER NOT NULL, stage TEXT NOT NULL DEFAULT '',
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exits INTEGER NOT NULL DEFAULT 0, away_s INTEGER NOT NULL DEFAULT 0, penalty_s INTEGER NOT NULL DEFAULT 0,
  left_at TIMESTAMPTZ, events TEXT NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, ref, stage)
);
ALTER TABLE exam_focus ENABLE ROW LEVEL SECURITY;`);
}

/** Seconds taken off the clock for this attempt (and module, for full mocks). */
export async function penaltyOf(kind, ref, stage = '') {
  const r = await db.one('SELECT penalty_s FROM exam_focus WHERE kind = ? AND ref = ? AND stage = ?', [kind, Number(ref), stage || '']).catch(() => null);
  return Number(r?.penalty_s || 0);
}

/** Totals for a finished attempt (all modules), for result pages: { exits, away, penalty, events }. */
export async function focusSummary(kind, ref) {
  const rows = await db.all('SELECT stage, exits, away_s, penalty_s, events FROM exam_focus WHERE kind = ? AND ref = ?', [kind, Number(ref)]).catch(() => []);
  if (!rows.length) return null;
  const sum = (k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  const events = rows.flatMap((r) => { try { return JSON.parse(r.events).map((e) => ({ ...e, stage: r.stage || undefined })); } catch { return []; } })
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return { exits: sum('exits'), away: sum('away_s'), penalty: sum('penalty_s'), events: events.slice(-40) };
}

export function registerFocus(app, { h, bad, requireStudent }) {
  app.post('/api/focus', requireStudent, h(async (req, res) => {
    const kind = String(req.body?.kind || '');
    const ref = Number(req.body?.id);
    const stage = String(req.body?.stage || '').slice(0, 8);
    const event = req.body?.event === 'return' ? 'return' : 'leave';
    const reason = ['fullscreen', 'tab', 'window'].includes(req.body?.reason) ? req.body.reason : 'tab';
    if (!TABLES[kind] || !Number.isInteger(ref)) return bad(res, 'Unknown test');
    const own = await db.one(`SELECT id, finished_at FROM ${TABLES[kind]} WHERE id = ? AND user_id = ?`, [ref, req.user.id]);
    if (!own) return bad(res, 'Not found', 404);
    if (own.finished_at) return res.json({ penalty: await penaltyOf(kind, ref, stage), finished: true, added: 0 });
    const per = Math.max(0, Math.min(600, Number((await getSettings()).focus_penalty ?? 30) || 0));
    await db.run('INSERT INTO exam_focus (kind, ref, stage, user_id) VALUES (?,?,?,?) ON CONFLICT (kind, ref, stage) DO NOTHING', [kind, ref, stage, req.user.id]);
    const f = await db.one('SELECT * FROM exam_focus WHERE kind = ? AND ref = ? AND stage = ?', [kind, ref, stage]);
    let events; try { events = JSON.parse(f.events); } catch { events = []; }
    const now = new Date();
    let added = 0;
    if (event === 'leave' && !f.left_at) {
      added = per;
      events.push({ at: now.toISOString(), type: 'leave', reason });
      await db.run('UPDATE exam_focus SET exits = exits + 1, penalty_s = penalty_s + ?, left_at = now(), events = ?, updated_at = now() WHERE kind = ? AND ref = ? AND stage = ?',
        [per, JSON.stringify(events.slice(-100)), kind, ref, stage]);
    } else if (event === 'return' && f.left_at) {
      // time away is measured on the server, not trusted from the browser
      const away = Math.max(0, Math.min(6 * 3600, Math.round((now - new Date(f.left_at)) / 1000)));
      events.push({ at: now.toISOString(), type: 'return', away });
      await db.run('UPDATE exam_focus SET away_s = away_s + ?, left_at = NULL, events = ?, updated_at = now() WHERE kind = ? AND ref = ? AND stage = ?',
        [away, JSON.stringify(events.slice(-100)), kind, ref, stage]);
    }
    const r = await db.one('SELECT exits, away_s, penalty_s FROM exam_focus WHERE kind = ? AND ref = ? AND stage = ?', [kind, ref, stage]);
    res.json({ penalty: Number(r.penalty_s), exits: Number(r.exits), away: Number(r.away_s), per, added });
  }));
}
