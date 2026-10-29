import { db } from './db.js';

const TZ_OFFSET_H = Number(process.env.APP_TZ_OFFSET ?? 5); // Asia/Tashkent
const dayKey = (iso) => new Date(new Date(iso).getTime() + TZ_OFFSET_H * 3600e3).toISOString().slice(0, 10);

export const estimateScore = (correct, total) => {
  if (!total) return null;
  const raw = 200 + (correct / total) * 600;
  return Math.max(200, Math.min(800, Math.round(raw / 10) * 10));
};

export async function userAnalytics(userId) {
  const user = await db.one('SELECT * FROM users WHERE id = ?', [userId]);
  const attempts = await db
    .all(
      `SELECT a.id, a.quiz_id, a.started_at, a.finished_at, a.score, a.total, q.title, q.section
       FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.user_id = ? AND a.finished_at IS NOT NULL ORDER BY a.finished_at ASC`,
      [userId]
    );

  const history = attempts.map((a) => ({
    id: a.id,
    quiz_id: a.quiz_id,
    title: a.title,
    section: a.section,
    date: a.finished_at,
    score: a.score,
    total: a.total,
    pct: a.total ? Math.round((a.score / a.total) * 100) : 0,
    seconds: Math.max(0, Math.round((new Date(a.finished_at) - new Date(a.started_at)) / 1000)),
  }));

  // Estimated section scores from the 5 latest attempts in that section
  const estimates = { english: null, math: null };
  for (const sec of ['english', 'math']) {
    const last = history.filter((h) => h.section === sec).slice(-5);
    const c = last.reduce((s, h) => s + h.score, 0);
    const t = last.reduce((s, h) => s + h.total, 0);
    estimates[sec] = estimateScore(c, t);
  }
  // trend of estimate after each attempt (for the line chart)
  const trend = [];
  const bySec = { english: [], math: [] };
  for (const h of history) {
    (bySec[h.section] ||= []).push(h);
    const last = bySec[h.section].slice(-5);
    trend.push({
      id: h.id,
      date: h.date,
      title: h.title,
      est: estimateScore(last.reduce((s, x) => s + x.score, 0), last.reduce((s, x) => s + x.total, 0)),
      pct: h.pct,
    });
  }

  const topics = (await db
    .all(
      `SELECT q.topic AS topic, COUNT(*) AS answered, SUM(an.is_correct) AS correct
       FROM answers an
       JOIN attempts a ON a.id = an.attempt_id AND a.finished_at IS NOT NULL
       JOIN questions q ON q.id = an.question_id
       WHERE a.user_id = ? GROUP BY q.topic ORDER BY (1.0 * SUM(an.is_correct) / COUNT(*)) ASC`,
      [userId]
    ))
    .map((t) => ({ ...t, correct: t.correct || 0, pct: Math.round(((t.correct || 0) / t.answered) * 100) }));

  const totalAnswered = history.reduce((s, h) => s + h.total, 0);
  const totalCorrect = history.reduce((s, h) => s + h.score, 0);
  const minutes = Math.round(history.reduce((s, h) => s + h.seconds, 0) / 60);

  // streak (days in a row with a finished attempt, counting today or yesterday as the end)
  const days = new Set(history.map((h) => dayKey(h.date)));
  let streak = 0;
  const today = dayKey(new Date().toISOString());
  let cursor = new Date(today + 'T00:00:00Z');
  if (!days.has(today)) cursor = new Date(cursor.getTime() - 86400e3);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86400e3);
  }

  // +10 XP per correct answer, +5 for trying, +20 per finished set
  const xp = totalCorrect * 10 + (totalAnswered - totalCorrect) * 5 + history.length * 20;
  const level = Math.floor(Math.sqrt(xp / 60)) + 1;
  const levelStart = 60 * (level - 1) ** 2;
  const levelEnd = 60 * level ** 2;

  const sections = ['english', 'math'].filter((s) => estimates[s] != null);
  const estimateTotal = sections.length === 2 ? estimates.english + estimates.math : null;
  const target = user ? user.target_english + user.target_math : null;

  return {
    user: user && { id: user.id, diagnostic_score: user.diagnostic_score, name: user.name, group_id: user.group_id, target_english: user.target_english, target_math: user.target_math, exam_date: user.exam_date },
    estimates,
    estimateTotal,
    target,
    history,
    trend,
    topics,
    weakTopics: topics.filter((t) => t.pct < 80).slice(0, 4),
    totals: {
      attempts: history.length,
      answered: totalAnswered,
      correct: totalCorrect,
      accuracy: totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
      minutes,
    },
    streak,
    activeDays: [...days].sort().slice(-35),
    xp,
    level,
    levelProgress: Math.round(((xp - levelStart) / (levelEnd - levelStart)) * 100),
  };
}
