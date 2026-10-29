import { Link } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { Avatar, Bars, Card, CountUp, Empty, Gate, PageHeader, pctTone, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconCrown, IconGoogle, IconLayers, IconPlus, IconQuiz, IconUsers } from '../../components/icons.jsx';

export default function Overview() {
  const st = useAsync(() => api.get('/master/overview'), []);
  return (
    <div className="page">
      <PageHeader title={"Overview"} sub={"Live statistics across all students, groups and quizzes."}>
        <Link className="btn ghost" to="/students"><IconUsers /> Students</Link>
        <Link className="btn primary" to="/quizzes/new"><IconPlus /> {"New quiz"}</Link>
      </PageHeader>
      <Gate state={st}>{(o) => (
        <>
          <div className="grid g4 keep2 stagger">
            <Card className="stat"><div className="label"><IconUsers /> Students</div><div className="value"><CountUp value={o.students} /></div><div className="hint">+{o.new_week} this week</div></Card>
            <Card className="stat"><div className="label"><IconCrown /> Subscribers</div><div className="value"><CountUp value={o.subscribers} /></div><div className="hint">{o.students ? Math.round((o.subscribers / o.students) * 100) : 0}% of students</div></Card>
            <Card className="stat"><div className="label"><IconQuiz /> {"Quizzes"}</div><div className="value"><CountUp value={o.quizzes} /></div></Card>
            <Card className="stat"><div className="label"><IconCheck /> {"Average accuracy"}</div><div className="value"><CountUp value={o.accuracy} suffix="%" /></div><div className="hint">{o.attempts} {"attempts"}</div></Card>
          </div>
          <div className="grid g-main">
            <Card>
              <div className="card-title"><h2>{"Recent activity"}</h2></div>
              {o.recent.length === 0 ? <Empty icon={<IconQuiz />} title={"No attempts yet"} text={"Students' attempts will show up here."} /> : (
                <div className="table-wrap"><table className="t"><tbody>
                  {o.recent.map((r) => {
                    const p = Math.round((r.score / r.total) * 100);
                    return (
                      <tr key={r.id}>
                        <td><Link to={`/students/${r.student_id}`}><b>{r.student}</b></Link><div className="muted" style={{ fontSize: '.78rem' }}>{r.title}</div></td>
                        <td><span className={`chip ${pctTone(p)}`}>{r.score}/{r.total} · {p}%</span></td>
                        <td className="muted nowrap">{fmtDate(r.finished_at)}</td>
                        <td className="actions"><Link className="btn soft sm" to={`/result/${r.id}`}>{"Analysis"} <IconArrow width={14} height={14} /></Link></td>
                      </tr>
                    );
                  })}
                </tbody></table></div>
              )}
            </Card>
            <div className="stack" style={{ alignContent: 'start' }}>
              <Card>
                <div className="card-title"><h2>New sign-ups</h2><Link className="btn soft sm" to="/students?">All <IconArrow width={14} height={14} /></Link></div>
                {o.signups.length === 0 ? <p className="muted">No students yet.</p> : (
                  <div className="stack sm">
                    {o.signups.map((u) => (
                      <Link key={u.id} to={`/students/${u.id}`} className="row" style={{ color: 'inherit', textDecoration: 'none' }}>
                        <Avatar name={u.name} size={32} />
                        <div className="grow"><b style={{ fontSize: '.9rem' }}>{u.name}</b><div className="muted row" style={{ fontSize: '.76rem', gap: 4 }}>{u.provider === 'google' && <IconGoogle width={11} height={11} />}{u.email || 'created by teacher'} · {fmtDate(u.created_at)}</div></div>
                        {u.sub_active ? <span className="chip good">Paid</span> : u.cefr ? <span className={`chip ${u.admitted ? 'good' : ''}`}>{u.cefr} · {u.diagnostic_score}</span> : <span className="chip warn">No test</span>}
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <div className="card-title"><h2>Hardest topics</h2></div>
                <Bars rows={o.topics.map((t) => ({ label: t.topic, value: t.pct, sub: `${t.correct}/${t.answered}` }))} />
              </Card>
            </div>
          </div>
        </>
      )}</Gate>
    </div>
  );
}
