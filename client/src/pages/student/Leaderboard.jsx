import { useState } from 'react';
import { api } from '../../api.js';
import { Avatar, Card, Empty, Gate, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import { IconTrophy } from '../../components/icons.jsx';

const HOW = [['Correct SAT answer', '+10'], ['Vocabulary review', '+2'], ['Correct Word Arena answer', '+5'], ['Minute of study', '+1']];

/** Ranking of all students by points earned this week or all time. */
export default function Leaderboard() {
  const [period, setPeriod] = useState('week');
  const st = useAsync(() => api.get('/leaderboard?period=' + period), [period]);
  return (
    <div className="page" style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <PageHeader title="Leaderboard" sub="Every correct answer and every minute of study earns points." />
      <Segmented value={period} onChange={setPeriod} options={[{ value: 'week', label: 'This week' }, { value: 'all', label: 'All time' }]} />
      <Gate state={st}>{(d) => {
        const top3 = d.top.filter((x) => x.points > 0).slice(0, 3);
        const rest = d.top.filter((x) => x.points > 0).slice(3);
        if (!top3.length) return <Card><Empty icon={<IconTrophy />} title="No points yet this week" text="Answer a few questions and you will be first on the board." /></Card>;
        return (
          <>
            {d.me && <div className={`lb-me ${d.me.rank <= 3 ? 'top' : ''}`}><span>Your place</span><b>#{d.me.rank}</b><small>{d.me.points} points{d.total ? ` · of ${d.total} ${d.total === 1 ? 'student' : 'students'}` : ''}</small></div>}
            <div className="lb-podium">
              {[top3[1], top3[0], top3[2]].map((x, i) => !x ? <div key={'e' + i} /> : (
                <div key={x.id} className={`lb-pod p${x.rank} ${x.me ? 'me' : ''}`} style={{ '--i': i }}>
                  <Avatar name={x.name} src={x.avatar_url} size={x.rank === 1 ? 64 : 52} />
                  <b>{x.name}{x.me ? ' (you)' : ''}</b>
                  <small>{x.points} pts</small>
                  <div className="lb-step"><span>{x.rank}</span></div>
                </div>
              ))}
            </div>
            {rest.length > 0 && (
              <Card className="lb-list">
                {rest.map((x) => (
                  <div key={x.id} className={`lb-row ${x.me ? 'me' : ''}`}>
                    <span className="lb-rank">{x.rank}</span>
                    <Avatar name={x.name} src={x.avatar_url} />
                    <b>{x.name}{x.me ? ' (you)' : ''}</b>
                    <span className="lb-pts">{x.points}</span>
                  </div>
                ))}
              </Card>
            )}
            {d.me && d.me.rank > 50 && <Card className="lb-row me"><span className="lb-rank">{d.me.rank}</span><b>You</b><span className="lb-pts">{d.me.points}</span></Card>}
          </>
        );
      }}</Gate>
      <Card>
        <h3 className="sr-h">How to earn points</h3>
        <div className="lb-how">{HOW.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 8 }}>The weekly board starts again every Monday. Only first names are shown.</p>
      </Card>
    </div>
  );
}
