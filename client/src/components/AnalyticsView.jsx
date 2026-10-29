import { Link } from 'react-router-dom';
import { fmtDate, fmtDuration } from '../api.js';
import { Bars, Card, Empty, LineChart, Ring, CountUp, ActivityDots, pctTone } from './ui.jsx';
import PathTrack from './PathTrack.jsx';
import { IconChart, IconClock, IconFlame, IconTarget, IconCheck } from './icons.jsx';

export const sectionName = (s) => (s === 'math' ? 'Math' : 'Reading & Writing');

export default function AnalyticsView({ a }) {
  const u = a.user;
  const points = a.trend.map((t, i) => ({ value: t.est, label: `${t.title} (${fmtDate(t.date)})`, short: i + 1 }));
  const rows = a.topics.map((t) => ({ label: t.topic, value: t.pct, sub: `${t.correct}/${t.answered} correct` }));

  return (
    <div className="stack">
      <div className="grid g4 keep2 stagger">
        <Card className="stat"><div className="label"><IconChart /> {"Estimated R&W"}</div><div className="value"><CountUp value={a.estimates.english} /><small> /800</small></div><div className="hint">{"Based on your last 5 quizzes"}</div></Card>
        <Card className="stat"><div className="label"><IconCheck /> {"Accuracy"}</div><div className="value"><CountUp value={a.totals.accuracy} suffix="%" /></div><div className="hint">{a.totals.correct}/{a.totals.answered} {"questions"}</div></Card>
        <Card className="stat"><div className="label"><IconClock /> {"Practice time"}</div><div className="value"><CountUp value={a.totals.minutes} /><small> {"min"}</small></div><div className="hint">{a.totals.attempts} {"attempts"}</div></Card>
        <Card className="stat"><div className="label"><IconFlame /> Streak</div><div className="value"><CountUp value={a.streak} /><small> {"days"}</small></div><div className="hint">Level {a.level} · {a.xp} XP</div></Card>
      </div>

      <div className="grid g-main">
        <Card>
          <div className="card-title"><h2>{"Score trend"}</h2>{u && <span className="chip good"><IconTarget width={14} height={14} /> {"Goal R&W"} {u.target_english}</span>}</div>
          <LineChart points={points} target={u?.target_english} />
        </Card>
        <Card>
          <div className="card-title"><h2>{"The 200 → 800 road"}</h2></div>
          <PathTrack value={a.estimates.english} target={u?.target_english} />
        </Card>
      </div>

      <div className="grid g2">
        <Card>
          <div className="card-title"><h2>{"Accuracy by topic"}</h2></div>
          <Bars rows={rows} />
        </Card>
        <Card>
          <div className="card-title"><h2>{"Activity (28 days)"}</h2></div>
          <ActivityDots days={a.activeDays} />
          <div className="row" style={{ marginTop: 18 }}>
            <Ring value={a.totals.accuracy} size={92} stroke={9} color={`var(--${pctTone(a.totals.accuracy)})`} />
            <div className="muted" style={{ fontSize: '.9rem' }}>
              {a.weakTopics.length
                ? <>{"Weakest topic:"} <b style={{ color: 'var(--ink)' }}>{a.weakTopics[0].topic}</b> ({a.weakTopics[0].pct}{"%). Practice this one more."}</>
                : "No weak topics detected yet. Keep going!"}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="card-title"><h2>{"Attempt history"}</h2></div>
        {a.history.length === 0 ? (
          <Empty icon={<IconChart />} title={"No results yet"} text={"Your history will appear here after you finish your first quiz."} />
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>{"Quiz"}</th><th>{"Date"}</th><th>{"Result"}</th><th>{"Time"}</th><th /></tr></thead>
              <tbody>
                {[...a.history].reverse().map((h) => (
                  <tr key={h.id}>
                    <td><b>{h.title}</b><div className="muted" style={{ fontSize: '.78rem' }}>{sectionName(h.section)}</div></td>
                    <td className="nowrap">{fmtDate(h.date)}</td>
                    <td><span className={`chip ${pctTone(h.pct)}`}>{h.score}/{h.total} · {h.pct}%</span></td>
                    <td className="nowrap">{fmtDuration(h.seconds)}</td>
                    <td className="actions"><Link className="btn soft sm" to={`/result/${h.id}`}>{"Analysis"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
