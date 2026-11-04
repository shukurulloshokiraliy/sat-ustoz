/**
 * Teacher "Progress" page: a list of things to act on rather than a list of students.
 *  - roadmap funnel: per step, how many students reached it, passed it, and are stuck on it (no activity for 7+ days)
 *  - stuck list: students who failed the same level check 3+ times (with their last scores) + a message button
 *  - per student: current step, steps done, level checks, quiz average, time this week, estimated score
 *  - question analysis: % correct and how often each wrong choice was picked; flags a likely wrong key
 *  - group comparison
 */
import { db } from './db.js';
import { notifyUser } from './tgbot.js';

const L = ['A', 'B', 'C', 'D'];

export function registerProgress(app, { h, bad, requireMaster, roadmapFor, userAnalytics }) {
  app.get('/api/progress', requireMaster, h(async (req, res) => {
    const students = await db.all(`SELECT u.id, u.name, u.group_id, g.name AS group_name,
        (SELECT MAX(day) FROM user_activity a WHERE a.user_id = u.id) AS last_day,
        (SELECT COALESCE(SUM(seconds), 0) FROM user_activity a WHERE a.user_id = u.id AND a.day > CURRENT_DATE - 7) AS week_seconds,
        u.created_at
      FROM users u LEFT JOIN groups g ON g.id = u.group_id WHERE u.role = 'student' ORDER BY u.name`);
    const funnel = new Map(); // step id → { title, index, reached, passed, stuck: [] }
    const rows = [];
    const weekAgo = Date.now() - 7 * 86400e3;
    for (const s of students) {
      const { steps, estimate } = await roadmapFor({ ...s, role: 'student' });
      const cur = steps.find((x) => x.status === 'current');
      const idle = !s.last_day || new Date(s.last_day).getTime() < weekAgo;
      steps.forEach((st, i) => {
        const f = funnel.get(st.id) || { id: st.id, title: st.title, index: i + 1, reached: 0, passed: 0, stuck: [] };
        if (st.status !== 'locked') f.reached++;
        if (st.status === 'done') f.passed++;
        if (st.status === 'current' && idle) f.stuck.push({ id: s.id, name: s.name, last_day: s.last_day });
        funnel.set(st.id, f);
      });
      const quiz = await db.one('SELECT ROUND(AVG(100.0 * score / NULLIF(total, 0))) AS avg, COUNT(*) AS n FROM attempts WHERE user_id = ? AND finished_at IS NOT NULL', [s.id]);
      const checks = await db.one('SELECT COUNT(*) AS n, SUM(CASE WHEN passed THEN 1 ELSE 0 END) AS passed FROM lesson_checks WHERE user_id = ? AND finished_at IS NOT NULL', [s.id]);
      const vocab = await db.one('SELECT ROUND(AVG(100.0 * score / NULLIF(total, 0))) AS avg FROM vocab_tests WHERE user_id = ?', [s.id]).catch(() => ({ avg: null }));
      rows.push({ id: s.id, name: s.name, group: s.group_name || '', step: cur ? `${steps.indexOf(cur) + 1}. ${cur.title}` : steps.length && steps.every((x) => x.status === 'done') ? 'Finished' : '—',
        steps_done: steps.filter((x) => x.status === 'done').length, steps_total: steps.length,
        checks: Number(checks?.n || 0), checks_passed: Number(checks?.passed || 0), quiz_avg: quiz?.avg == null ? null : Number(quiz.avg), quizzes: Number(quiz?.n || 0),
        vocab_avg: vocab?.avg == null ? null : Number(vocab.avg), week_min: Math.round(Number(s.week_seconds || 0) / 60), last_day: s.last_day, estimate: estimate ?? null, idle });
    }
    // failed the same level check 3+ times and never passed it
    const failing = await db.all(`SELECT c.user_id, u.name, c.item_id, i.title AS lesson, st.title AS step, COUNT(*) AS fails,
        (ARRAY_AGG(ROUND(100.0 * c.score / NULLIF(c.total, 0)) ORDER BY c.finished_at DESC))[1:3] AS last_scores, MAX(c.finished_at) AS last_at
      FROM lesson_checks c JOIN users u ON u.id = c.user_id JOIN roadmap_items i ON i.id = c.item_id JOIN roadmap_steps st ON st.id = i.step_id
      WHERE c.finished_at IS NOT NULL AND NOT c.passed
        AND NOT EXISTS (SELECT 1 FROM lesson_checks p WHERE p.user_id = c.user_id AND p.item_id = c.item_id AND p.passed)
      GROUP BY c.user_id, u.name, c.item_id, i.title, st.title HAVING COUNT(*) >= 3 ORDER BY MAX(c.finished_at) DESC LIMIT 200`);
    const groups = await db.all(`SELECT g.id, g.name, COUNT(u.id) AS students FROM groups g LEFT JOIN users u ON u.group_id = g.id AND u.role = 'student' GROUP BY g.id, g.name ORDER BY g.name`);
    const byGroup = groups.map((g) => {
      const r = rows.filter((x) => x.group === g.name);
      const avg = (k) => { const v = r.map((x) => x[k]).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
      return { id: g.id, name: g.name, students: Number(g.students), steps_done: avg('steps_done'), quiz_avg: avg('quiz_avg'), estimate: avg('estimate'), week_min: avg('week_min') };
    });
    res.json({ funnel: [...funnel.values()].sort((a, b) => a.index - b.index), failing: failing.map((f) => ({ ...f, fails: Number(f.fails), last_scores: (f.last_scores || []).map(Number) })), students: rows, groups: byGroup });
  }));

  // question analysis: Question Bank (source=qbank) or teacher quizzes (source=quiz)
  app.get('/api/progress/questions', requireMaster, h(async (req, res) => {
    const src = req.query.source === 'quiz' ? 'quiz' : 'qbank';
    const minN = Math.max(1, Math.min(50, Number(req.query.min) || 3));
    let rows; let strong;
    if (src === 'qbank') {
      // "strong" students: overall Question Bank accuracy at or above the median
      const acc = await db.all('SELECT user_id, AVG(CASE WHEN correct THEN 1 ELSE 0 END) AS a FROM qbank_answers GROUP BY user_id');
      const sorted = acc.map((x) => Number(x.a)).sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
      strong = new Set(acc.filter((x) => Number(x.a) >= med).map((x) => x.user_id));
      const ans = await db.all(`SELECT a.question_id AS id, a.user_id, a.choice, a.correct FROM qbank_answers a`);
      const qs = await db.all('SELECT id, skill, difficulty, prompt, passage, options, answer FROM qbank_questions');
      rows = analyse(qs.map((q) => ({ id: q.id, skill: q.skill, difficulty: q.difficulty, text: q.prompt, passage: q.passage, options: safe(q.options, []), key: q.answer })), ans, strong, minN, (c) => (Number.isInteger(c) ? c : L.indexOf(String(c))));
    } else {
      const acc = await db.all('SELECT t.user_id, AVG(a.is_correct) AS a FROM answers a JOIN attempts t ON t.id = a.attempt_id GROUP BY t.user_id');
      const sorted = acc.map((x) => Number(x.a)).sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
      strong = new Set(acc.filter((x) => Number(x.a) >= med).map((x) => x.user_id));
      const ans = await db.all('SELECT a.question_id AS id, t.user_id, a.choice, a.is_correct AS correct FROM answers a JOIN attempts t ON t.id = a.attempt_id WHERE a.choice IS NOT NULL');
      const qs = await db.all('SELECT x.id, z.title AS skill, x.topic AS difficulty, x.prompt, x.passage, x.opt_a, x.opt_b, x.opt_c, x.opt_d, x.correct FROM questions x JOIN quizzes z ON z.id = x.quiz_id');
      rows = analyse(qs.map((q) => ({ id: q.id, skill: q.skill, difficulty: q.difficulty, text: q.prompt, passage: q.passage, options: [q.opt_a, q.opt_b, q.opt_c, q.opt_d], key: L.indexOf(q.correct) })), ans, strong, minN, (c) => L.indexOf(String(c)));
    }
    res.json({ source: src, rows: rows.sort((a, b) => (b.suspect - a.suspect) || (a.pct - b.pct)).slice(0, 300) });
  }));

  // fix the key of a quiz question in one click (past answers are re-graded)
  app.post('/api/progress/quiz-question/:id/key', requireMaster, h(async (req, res) => {
    const k = String(req.body?.correct || '').toUpperCase();
    if (!L.includes(k)) return bad(res, 'Choose A, B, C or D');
    const q = await db.one('SELECT id FROM questions WHERE id = ?', [Number(req.params.id)]);
    if (!q) return bad(res, 'Not found', 404);
    await db.tx(async (t) => {
      await t.run('UPDATE questions SET correct = ? WHERE id = ?', [k, q.id]);
      await t.run('UPDATE answers SET is_correct = CASE WHEN choice = ? THEN 1 ELSE 0 END WHERE question_id = ?', [k, q.id]);
      await t.run('UPDATE attempts SET score = (SELECT COALESCE(SUM(is_correct), 0) FROM answers a WHERE a.attempt_id = attempts.id) WHERE id IN (SELECT attempt_id FROM answers WHERE question_id = ?) AND finished_at IS NOT NULL', [q.id]);
    });
    res.json({ ok: true });
  }));

  // message a student: in the website chat (they see it in "Ask Ustoz") and on Telegram if they linked the bot
  app.post('/api/progress/message', requireMaster, h(async (req, res) => {
    const u = await db.one("SELECT id, name FROM users WHERE id = ? AND role = 'student'", [Number(req.body?.user_id)]);
    const text = String(req.body?.text || '').trim().slice(0, 2000);
    if (!u) return bad(res, 'Student not found', 404);
    if (!text) return bad(res, 'Write a message');
    const chat = `web:u:${u.id}`;
    let t = await db.one("SELECT id FROM tg_tickets WHERE chat_id = ? AND channel = 'web' AND status <> 'closed' ORDER BY id DESC LIMIT 1", [chat]);
    if (!t) t = await db.one("INSERT INTO tg_tickets (chat_id, user_id, tg_name, category, channel, last_from, status) VALUES (?,?,?,'question','web','teacher','answered') RETURNING id", [chat, u.id, u.name]);
    await db.run("INSERT INTO tg_ticket_msgs (ticket_id, author, text, by_name) VALUES (?, 'teacher', ?, ?)", [t.id, text, String(req.user.name || 'Teacher').slice(0, 60)]);
    await db.run("UPDATE tg_tickets SET updated_at = now(), last_from = 'teacher', status = 'answered' WHERE id = ?", [t.id]);
    notifyUser(u.id, `👨‍🏫 <b>SAT Ustoz</b>\n\n${text.replace(/[<>&]/g, '')}`);
    res.json({ ok: true });
  }));
}

function safe(s, d) { try { return JSON.parse(s); } catch { return d; } }

/** % correct, how often each wrong choice was picked, and a flag when strong students agree on one wrong choice. */
function analyse(qs, answers, strong, minN, toIdx) {
  const by = new Map();
  for (const a of answers) { if (!by.has(a.id)) by.set(a.id, []); by.get(a.id).push(a); }
  const out = [];
  for (const q of qs) {
    const list = by.get(q.id) || [];
    if (list.length < minN) continue;
    const picks = [0, 0, 0, 0];
    let right = 0; const sp = [0, 0, 0, 0]; let sn = 0;
    for (const a of list) {
      const i = toIdx(a.choice);
      if (i >= 0 && i < 4) picks[i]++;
      if (a.correct === true || a.correct === 1) right++;
      if (strong.has(a.user_id) && i >= 0 && i < 4) { sp[i]++; sn++; }
    }
    const pct = Math.round((right / list.length) * 100);
    // a likely wrong key: at least 3 strong students, fewer than half of them chose the key, and one other choice got 60%+ of their answers
    let suspect = 0; let likely = null;
    if (sn >= 3) {
      const top = sp.map((n, i) => [n, i]).filter(([, i]) => i !== q.key).sort((a, b) => b[0] - a[0])[0];
      if (sp[q.key] / sn < 0.5 && top && top[0] / sn >= 0.6) { suspect = 1; likely = top[1]; }
    }
    out.push({ id: q.id, skill: q.skill, difficulty: q.difficulty, text: String(q.text || '').slice(0, 220), passage: String(q.passage || '').slice(0, 300), options: q.options, key: q.key, n: list.length, pct, picks, suspect, likely });
  }
  return out;
}
