import { Link } from 'react-router-dom';
import { api, daysUntil, fmtDate } from '../../api.js';
import { useAuth } from '../../context.jsx';
import { satScoreFromCount } from '../../../../server/src/scoring.js';
import { ActivityDots, Bars, Card, CountUp, Empty, Gate, LineChart, Progress, Ring, pctTone, useAsync } from '../../components/ui.jsx';
import PathTrack from '../../components/PathTrack.jsx';
import { PaywallBanner } from './Quizzes.jsx';
import { IconArrow, IconBolt, IconCheck, IconClock, IconFlame, IconQuiz, IconTarget } from '../../components/icons.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const st = useAsync(() => Promise.all([api.get('/me/analytics'), api.get('/quizzes'), api.get('/placement'), api.get('/me/report')]), []);
  const first = user.name.split(' ')[0];

  return (
    <div className="page">
      <Gate state={st}>{([a, quizzes, pl, rep]) => {
        const next = quizzes.find((q) => q.status === 'in_progress') || quizzes.find((q) => q.status === 'new') || quizzes[0];
        const left = daysUntil(user.exam_date);
        const all = combine(a, rep);
        const points = all.trend.map((t, i) => ({ value: t.est, label: `${t.title} (${fmtDate(t.date)})`, short: i + 1 }));
        const est = all.estimate ?? user.diagnostic_score;
        return (
          <>
            <div className="hello">
              <div>
                <h1>Hello, <span>{first}</span></h1>
                <p className="muted">{all.streak ? `${all.streak}-day streak: keep it going!` : 'Practise anything today to start a streak.'}</p>
              </div>
              <div className="row wrap">
                <span className="streak"><IconFlame /> {all.streak} {all.streak === 1 ? 'day' : 'days'}</span>
                <div className="xp">
                  <div className="row between"><span>Level {all.level}</span><span className="muted">{all.xp} XP</span></div>
                  <Progress value={all.levelProgress} />
                </div>
              </div>
            </div>

            {!user.access?.can_practice && <PaywallBanner />}
            {!pl.results.length && (
              <Link to="/placement" className="pl-invite">
                <span className="grow"><b>Find your level — optional</b><span className="muted"> · a short placement test shows your SAT estimate and what to study first (about 40 min).</span></span>
                <span className="btn soft sm">Take it <IconArrow width={16} height={16} /></span>
              </Link>
            )}

            <div className="grid g-main stagger">
              <Card>
                <div className="card-title"><h2>{"The 200 → 800 road"}</h2><Link to="/roadmap" className="btn soft sm">Roadmap <IconArrow width={16} height={16} /></Link></div>
                <PathTrack value={est} target={user.target_english} />
                {pl.results[0] && (
                  <Link to={`/placement/result/${pl.results[0].id}`} className="pl-row" style={{ marginBottom: 12 }}>
                    <span className="pl-lvl">{pl.results[0].cefr}</span>
                    <span className="grow"><b>Placement: {pl.results[0].midpoint - 30}–{pl.results[0].midpoint + 30}</b> <span className="muted">· see your weak areas</span></span>
                    <IconArrow width={16} height={16} />
                  </Link>
                )}
                <p className="muted" style={{ fontSize: '.85rem' }}>
                  {all.estimate == null ? 'Your estimated score appears after your first test or quiz.' : `Your estimated Reading & Writing score is ${all.estimate} — ${Math.max(0, user.target_english - all.estimate)} points to your goal.`}
                </p>
              </Card>

              <div className="stack">
                {next ? (
                  <Card className="next-card">
                    <div className="stack sm" style={{ position: 'relative' }}>
                      <span className="chip">{next.status === 'in_progress' ? "Continue" : next.status === 'new' ? "New quiz" : "Retake"}</span>
                      <h2 style={{ fontSize: '1.3rem' }}>{next.title}</h2>
                      <p className="muted">{next.questions} {"questions"}{next.duration_min ? ` · ${next.duration_min} min` : ''}</p>
                      <Link to={`/quiz/${next.id}`} className="btn primary" style={{ marginTop: 8 }}><IconBolt /> {next.status === 'in_progress' ? "Resume" : "Start"}</Link>
                    </div>
                  </Card>
                ) : (
                  <Card className="next-card">
                    <div className="stack sm" style={{ position: 'relative' }}>
                      <span className="chip">Take a quiz</span>
                      <h2 style={{ fontSize: '1.3rem' }}>A new SAT module</h2>
                      <p className="muted">27 random questions in real test order · 32 min</p>
                      <Link to="/mock" className="btn primary" style={{ marginTop: 8 }}><IconBolt /> Start</Link>
                    </div>
                  </Card>
                )}
                {left != null && left > 0 && (
                  <Card className="row between">
                    <div><div className="muted" style={{ fontSize: '.82rem', fontWeight: 600 }}>{"Until the exam"}</div><div className="countdown"><b><CountUp value={left} /></b><span className="muted">{"days"}</span></div></div>
                    <div className="chip primary"><IconTarget width={14} height={14} /> {fmtDate(user.exam_date)}</div>
                  </Card>
                )}
              </div>
            </div>

            <div className="grid g4 keep2 stagger">
              <Card className="stat"><div className="label"><IconTarget /> {"Estimated score"}</div><div className="value">{est ? <CountUp value={est} /> : '—'}<small> R&W</small></div></Card>
              <Card className="stat"><div className="label"><IconCheck /> {"Accuracy"}</div><div className="value"><CountUp value={all.accuracy} suffix="%" /></div></Card>
              <Card className="stat"><div className="label"><IconQuiz /> {"Questions solved"}</div><div className="value"><CountUp value={all.answered} /></div></Card>
              <Card className="stat"><div className="label"><IconClock /> {"Time"}</div><div className="value"><CountUp value={all.minutes} /><small> {"min"}</small></div></Card>
            </div>

            <div className="grid g-main">
              <Card>
                <div className="card-title"><h2>{"Score trend"}</h2><Link to="/analytics" className="btn ghost sm">{"Details"}</Link></div>
                <LineChart points={points} target={user.target_english} height={200} />
              </Card>
              <Card>
                <div className="card-title"><h2>{"Weak topics"}</h2></div>
                {all.weak.length ? <Bars rows={all.weak} /> : <p className="muted">No weak topics yet: answer a few more questions.</p>}
              </Card>
            </div>

            <div className="grid g2">
              <Card>
                <div className="card-title"><h2>{"Activity"}</h2><span className="chip">{all.activeDays.length} active days</span></div>
                <ActivityDots days={all.activeDays} />
              </Card>
              <Card>
                <div className="card-title"><h2>{"Recent results"}</h2></div>
                {all.recent.length === 0 ? <p className="muted">No results yet: take a practice test or Take a quiz.</p> : (
                  <div className="stack sm">
                    {all.recent.slice(0, 5).map((h) => (
                      <Link key={h.key} to={h.to} className="row between" style={{ color: 'inherit', textDecoration: 'none' }}>
                        <div className="row"><Ring value={h.pct} size={46} stroke={6} label={`${h.pct}`} color={`var(--${pctTone(h.pct)})`} /><div><b>{h.title}</b><div className="muted" style={{ fontSize: '.78rem' }}>{fmtDate(h.date)}</div></div></div>
                        <span className={`chip ${pctTone(h.pct)}`}>{h.score}/{h.total}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        );
      }}</Gate>
    </div>
  );
}

/** Digital SAT R&W estimate (IRT model, see server/src/scoring.js); stored per test, or from the count for old results. */
const estOf = (t) => t.estimate || satScoreFromCount(t.score, t.total)?.score || null;

/** One picture from every source: teacher quizzes, Take a quiz, practice tests and the Question Bank. */
export function combine(a, r) {
  const tests = [
    ...a.history.map((h) => ({ key: `q${h.id}`, to: `/result/${h.id}`, title: h.title, date: h.date, score: h.score, total: h.total })),
    ...r.mocks.map((m) => ({ key: `m${m.id}`, to: `/mock/${m.id}`, title: 'Take a quiz', date: m.finished_at, score: m.score, total: m.total, estimate: Number(m.estimate) || null })),
    ...(r.practice || []).map((p) => ({ key: `p${p.id}`, to: '/practice', title: 'Practice test', date: p.finished_at, score: p.score, total: p.total, estimate: p.estimate || null })),
  ].map((t) => ({ ...t, score: Number(t.score) || 0, total: Number(t.total) || 0 })).filter((t) => t.total > 0).map((t) => ({ ...t, pct: Math.round((t.score / t.total) * 100) })).sort((x, y) => new Date(y.date) - new Date(x.date));
  const full = tests.filter((t) => t.total >= 10); // short quizzes say little about the score
  const last = full.slice(0, 5);
  // latest tests weigh more (3, 2, 1, 1, 1): the estimate follows recent progress
  const W = [3, 2, 1, 1, 1];
  const estimateNow = last.length ? Math.round(last.reduce((s, t, i) => s + estOf(t) * W[i], 0) / last.reduce((s, t, i) => s + W[i], 0) / 10) * 10 : (a.estimates?.english ?? null);
  const quizQ = a.totals.answered || 0; const quizOk = Math.round(((a.totals.accuracy || 0) / 100) * quizQ);
  const mockQ = r.mocks.reduce((s, m) => s + Number(m.total || 0), 0); const mockOk = r.mocks.reduce((s, m) => s + Number(m.score || 0), 0);
  const practiceQ = (r.practice || []).reduce((s, p) => s + p.total, 0) + mockQ; const practiceOk = (r.practice || []).reduce((s, p) => s + p.score, 0) + mockOk;
  const answered = quizQ + r.qbank.answered + practiceQ;
  const correct = quizOk + r.qbank.correct + practiceOk;
  const weak = [
    ...r.qbank.skills.filter((x) => x.answered >= 3).map((x) => ({ label: x.skill, value: Math.round((x.correct / x.answered) * 100), sub: `${x.correct}/${x.answered}` })),
    ...a.weakTopics.map((t) => ({ label: t.topic, value: t.pct, sub: `${t.correct}/${t.answered}` })),
  ].filter((x) => x.value < 70).sort((x, y) => x.value - y.value).slice(0, 5);
  const days = new Set([...(a.activeDays || []), ...r.days.filter((d) => d.n > 0).map((d) => d.day), ...r.time.filter((t) => t.seconds >= 60).map((t) => t.day)]);
  const daySet = new Set(days);
  const dayKey = (i) => new Date(Date.now() + 5 * 3600e3 - i * 86400e3).toISOString().slice(0, 10);
  let streak = 0;
  for (let i = daySet.has(dayKey(0)) ? 0 : 1; daySet.has(dayKey(i)); i++) streak++;
  const minutes = Math.round(r.time.reduce((s, t) => s + t.seconds, 0) / 60) || a.totals.minutes || 0;
  const xp = correct * 10 + minutes * 2 + (r.vocab?.learned || 0) * 3;
  return {
    estimate: estimateNow, streak, xp, level: Math.floor(xp / 500) + 1, levelProgress: Math.round(((xp % 500) / 500) * 100),
    trend: [...full].reverse().slice(-12).map((t) => ({ est: estOf(t), title: t.title, date: t.date })),
    answered, accuracy: answered ? Math.round((correct / answered) * 100) : 0,
    minutes,
    weak, activeDays: [...days].sort(), recent: tests,
  };
}
