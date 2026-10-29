import { db } from '../db.js';
import { DEFAULT_TEST, publicTest, scorePlacement, validateTest } from './engine.js';

/** The active test: a teacher upload (settings.placement_json) or the bundled JSON. */
export async function activeTest() {
  const row = await db.one("SELECT value FROM settings WHERE key = 'placement_json'");
  if (row?.value) {
    try { const t = JSON.parse(row.value); if (!validateTest(t).length) return t; } catch { /* fall back */ }
  }
  return DEFAULT_TEST;
}

const GRACE_SECONDS = 20; // network slack before the server refuses late answers
const sectionIds = (t) => t.sections.map((s) => s.id);
const limitOf = (t, id) => (t.sections.find((s) => s.id === id)?.time_limit_minutes || 0) * 60;

function stateOf(t, a) {
  const answers = JSON.parse(a.answers || '{}');
  const limit = limitOf(t, a.section);
  const elapsed = Math.floor((Date.now() - new Date(a.section_started_at).getTime()) / 1000);
  return {
    id: a.id, section: a.section, current: a.current, answers,
    started_at: a.started_at, section_started_at: a.section_started_at,
    remaining: limit ? Math.max(0, limit - elapsed) : null,
    section_index: sectionIds(t).indexOf(a.section),
  };
}

/** Accept answers only for the running section's items (and only while its time is not over). */
function mergeAnswers(t, a, incoming) {
  const answers = JSON.parse(a.answers || '{}');
  const limit = limitOf(t, a.section);
  const elapsed = (Date.now() - new Date(a.section_started_at).getTime()) / 1000;
  if (limit && elapsed > limit + GRACE_SECONDS) return answers;
  const allowed = new Set(t.items.filter((i) => i.section === a.section).map((i) => i.id));
  for (const [id, v] of Object.entries(incoming || {})) {
    if (!allowed.has(id)) continue;
    answers[id] = typeof v === 'number' ? v : String(v ?? '').slice(0, 200);
  }
  return answers;
}

async function finishAttempt(t, a, userId) {
  const answers = JSON.parse(a.answers || '{}');
  const r = scorePlacement(t, answers);
  await db.tx(async (tx) => {
    await tx.run(`UPDATE placement_attempts SET finished_at = now(), section = 'done', grammar_points = ?, sat_points = ?, cefr = ?, admitted = ?, midpoint = ?, result = ? WHERE id = ?`,
      [r.grammar.points, r.sat.points, r.grammar.level, r.admitted, r.estimate.midpoint, JSON.stringify(r), a.id]);
    await tx.run('UPDATE users SET diagnostic_score = ?, cefr = ?, admitted = ?, placement_at = now() WHERE id = ?',
      [r.estimate.midpoint, r.grammar.level, r.admitted, userId]);
  });
  return a.id;
}

export function registerPlacement(app, { h, bad, requireStudent, requireMaster }) {
  const own = (id, uid) => db.one('SELECT * FROM placement_attempts WHERE id = ? AND user_id = ?', [id, uid]);

  // overview for the welcome page: test meta + open attempt + past results
  app.get('/api/placement', h(async (req, res) => {
    const t = await activeTest();
    const pub = publicTest(t);
    const uid = req.user.role === 'master' && req.query.user_id ? Number(req.query.user_id) : req.user.id;
    const open = await db.one('SELECT id, section FROM placement_attempts WHERE user_id = ? AND finished_at IS NULL ORDER BY id DESC LIMIT 1', [uid]);
    const results = await db.all(`SELECT id, finished_at, grammar_points, sat_points, cefr, admitted, midpoint FROM placement_attempts
      WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC`, [uid]);
    res.json({
      test: { id: pub.id, title: pub.title, sections: pub.sections.map(({ items, ...s }) => s), admission_minimum_level: t.scoring.grammar.admission_minimum_level },
      open, results,
    });
  }));

  // start or resume
  app.post('/api/placement/start', requireStudent, h(async (req, res) => {
    const t = await activeTest();
    let a = await db.one('SELECT * FROM placement_attempts WHERE user_id = ? AND finished_at IS NULL ORDER BY id DESC LIMIT 1', [req.user.id]);
    if (!a) a = await db.one('INSERT INTO placement_attempts (user_id, test_id, section) VALUES (?, ?, ?) RETURNING *', [req.user.id, t.id || '', t.sections[0].id]);
    res.json({ test: publicTest(t), attempt: stateOf(t, a) });
  }));

  app.put('/api/placement/:id/progress', requireStudent, h(async (req, res) => {
    const t = await activeTest();
    const a = await own(req.params.id, req.user.id);
    if (!a || a.finished_at) return bad(res, 'This test is already finished', 409);
    const answers = mergeAnswers(t, a, req.body?.answers);
    await db.run('UPDATE placement_attempts SET answers = ?, current = ? WHERE id = ?', [JSON.stringify(answers), Math.max(0, +req.body?.current || 0), a.id]);
    res.json({ ok: true });
  }));

  // finish the running part → next part starts with its own timer (or the test is scored)
  app.post('/api/placement/:id/next', requireStudent, h(async (req, res) => {
    const t = await activeTest();
    const a = await own(req.params.id, req.user.id);
    if (!a || a.finished_at) return bad(res, 'This test is already finished', 409);
    const answers = mergeAnswers(t, a, req.body?.answers);
    await db.run('UPDATE placement_attempts SET answers = ? WHERE id = ?', [JSON.stringify(answers), a.id]);
    const ids = sectionIds(t);
    const next = ids[ids.indexOf(a.section) + 1];
    if (next) {
      const b = await db.one('UPDATE placement_attempts SET section = ?, section_started_at = now(), current = 0 WHERE id = ? RETURNING *', [next, a.id]);
      return res.json({ done: false, attempt: stateOf(t, b) });
    }
    const fresh = await own(a.id, req.user.id);
    res.json({ done: true, id: await finishAttempt(t, fresh, req.user.id) });
  }));

  app.get('/api/placement/result/:id', h(async (req, res) => {
    const a = await db.one('SELECT * FROM placement_attempts WHERE id = ?', [req.params.id]);
    if (!a || (req.user.role !== 'master' && a.user_id !== req.user.id)) return bad(res, 'Not found', 404);
    if (!a.finished_at) return bad(res, 'This test is not finished yet', 409);
    const student = await db.one('SELECT id, name FROM users WHERE id = ?', [a.user_id]);
    res.json({ id: a.id, finished_at: a.finished_at, student, ...JSON.parse(a.result || '{}') });
  }));

  // teacher: download / replace / reset the test JSON
  app.get('/api/placement/test.json', requireMaster, h(async (req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="placement_test.json"');
    res.json(await activeTest());
  }));
  app.put('/api/placement/test', requireMaster, h(async (req, res) => {
    const t = req.body;
    const errs = validateTest(t);
    if (errs.length) return bad(res, 'The file has problems: ' + errs.join('; '));
    await db.run("INSERT INTO settings (key, value) VALUES ('placement_json', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify(t)]);
    res.json({ ok: true, items: t.items.length, title: t.title });
  }));
  app.delete('/api/placement/test', requireMaster, h(async (req, res) => {
    await db.run("DELETE FROM settings WHERE key = 'placement_json'");
    res.json({ ok: true });
  }));
}
