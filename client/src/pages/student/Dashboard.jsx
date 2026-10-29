import { Link } from 'react-router-dom';
import { api, daysUntil, fmtDate } from '../../api.js';
import { useAuth } from '../../context.jsx';
import { ActivityDots, Bars, Card, CountUp, Empty, Gate, LineChart, Progress, Ring, pctTone, useAsync } from '../../components/ui.jsx';
import PathTrack from '../../components/PathTrack.jsx';
import { PaywallBanner } from './Quizzes.jsx';
import { IconArrow, IconBolt, IconCheck, IconClock, IconFlame, IconQuiz, IconTarget } from '../../components/icons.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const st = useAsync(() => Promise.all([api.get('/me/analytics'), api.get('/quizzes'), api.get('/placement')]), []);
  const first = user.name.split(' ')[0];

  return (
    <div className="page">
      <Gate state={st}>{([a, quizzes, pl]) => {
        const next = quizzes.find((q) => q.status === 'in_progress') || quizzes.find((q) => q.status === 'new') || quizzes[0];
        const left = daysUntil(user.exam_date);
        const points = a.trend.map((t, i) => ({ value: t.est, label: `${t.title} (${fmtDate(t.date)})`, short: i + 1 }));
        return (
          <>
            <div className="hello">
              <div>
                <h1>Hello, <span>{first}</span></h1>
                <p className="muted">{a.streak ? `${a.streak}-day streak — keep it going!` : "Take a quiz today to start a streak."}</p>
              </div>
              <div className="row wrap">
                <span className="streak"><IconFlame /> {a.streak} {a.streak === 1 ? 'day' : 'days'}</span>
                <div className="xp">
                  <div className="row between"><span>Level {a.level}</span><span className="muted">{a.xp} XP</span></div>
                  <Progress value={a.levelProgress} />
                </div>
              </div>
            </div>

            {!user.access?.can_practice && <PaywallBanner />}

            <div className="grid g-main stagger">
              <Card>
                <div className="card-title"><h2>{"The 200 → 800 road"}</h2><Link to="/roadmap" className="btn soft sm">Roadmap <IconArrow width={16} height={16} /></Link></div>
                <PathTrack value={a.estimates.english ?? user.diagnostic_score} target={user.target_english} />
                {pl.results[0] && (
                  <Link to={`/placement/result/${pl.results[0].id}`} className="pl-row" style={{ marginBottom: 12 }}>
                    <span className="pl-lvl">{pl.results[0].cefr}</span>
                    <span className="grow"><b>Placement: {pl.results[0].midpoint - 30}–{pl.results[0].midpoint + 30}</b> <span className="muted">· see your weak areas</span></span>
                    <IconArrow width={16} height={16} />
                  </Link>
                )}
                <p className="muted" style={{ fontSize: '.85rem' }}>
                  {a.estimates.english == null ? "Your estimated score appears after the first quiz." : `Your estimated Reading & Writing score is ${a.estimates.english} — ${Math.max(0, user.target_english - a.estimates.english)} points to your goal.`}
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
                  <Card><Empty icon={<IconQuiz />} title={"No quiz assigned"} text={"Your teacher needs to assign a quiz to your group."} /></Card>
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
              <Card className="stat"><div className="label"><IconTarget /> {"Estimated score"}</div><div className="value"><CountUp value={a.estimates.english ?? user.diagnostic_score} /><small> R&W</small></div></Card>
              <Card className="stat"><div className="label"><IconCheck /> {"Accuracy"}</div><div className="value"><CountUp value={a.totals.accuracy} suffix="%" /></div></Card>
              <Card className="stat"><div className="label"><IconQuiz /> {"Questions solved"}</div><div className="value"><CountUp value={a.totals.answered} /></div></Card>
              <Card className="stat"><div className="label"><IconClock /> {"Time"}</div><div className="value"><CountUp value={a.totals.minutes} /><small> {"min"}</small></div></Card>
            </div>

            <div className="grid g-main">
              <Card>
                <div className="card-title"><h2>{"Score trend"}</h2><Link to="/analytics" className="btn ghost sm">{"Details"}</Link></div>
                <LineChart points={points} target={user.target_english} height={200} />
              </Card>
              <Card>
                <div className="card-title"><h2>{"Weak topics"}</h2></div>
                {a.weakTopics.length ? <Bars rows={a.weakTopics.map((t) => ({ label: t.topic, value: t.pct, sub: `${t.correct}/${t.answered}` }))} /> : <p className="muted">{"No weak topics yet — or not enough data."}</p>}
              </Card>
            </div>

            <div className="grid g2">
              <Card>
                <div className="card-title"><h2>{"Activity"}</h2><span className="chip">{a.activeDays.length} {"active days"}</span></div>
                <ActivityDots days={a.activeDays} />
              </Card>
              <Card>
                <div className="card-title"><h2>{"Recent results"}</h2></div>
                {a.history.length === 0 ? <p className="muted">{"No results yet."}</p> : (
                  <div className="stack sm">
                    {[...a.history].reverse().slice(0, 4).map((h) => (
                      <Link key={h.id} to={`/result/${h.id}`} className="row between" style={{ color: 'inherit', textDecoration: 'none' }}>
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
