import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useToast } from '../../context.jsx';
import { Confirm } from '../../components/ui.jsx';
import { canSee } from '../../components/Layout.jsx';
import { api, fmtDate } from '../../api.js';
import { Avatar, Bars, Card, CountUp, Empty, Gate, PageHeader, pctTone, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconCrown, IconEye, IconGoogle, IconLayers, IconPlus, IconQuiz, IconUsers } from '../../components/icons.jsx';

export default function Overview() {
  const { user } = useAuth();
  const st = useAsync(() => api.get('/master/overview'), []);
  return (
    <div className="page">
      <PageHeader title={"Overview"} sub={"Live statistics across all students, groups and quizzes."}>
        {canSee(user, '/students') && <Link className="btn ghost" to="/students"><IconUsers /> Students</Link>}
        {canSee(user, '/quizzes') && <Link className="btn primary" to="/quizzes/new"><IconPlus /> {"New quiz"}</Link>}
      </PageHeader>
      <FreeMode />
      <Gate state={st}>{(o) => (
        <>
          <div className="grid g4 keep2 stagger">
            <Card className="stat"><div className="label"><IconUsers /> Students</div><div className="value"><CountUp value={o.students} /></div><div className="hint">+{o.new_week} this week</div></Card>
            <Card className="stat"><div className="label"><IconCrown /> Subscribers</div><div className="value"><CountUp value={o.subscribers} /></div><div className="hint">{o.students ? Math.round((o.subscribers / o.students) * 100) : 0}% of students</div></Card>
            <Card className="stat"><div className="label"><IconQuiz /> {"Quizzes"}</div><div className="value"><CountUp value={o.quizzes} /></div></Card>
            <Card className="stat"><div className="label"><IconCheck /> {"Average accuracy"}</div><div className="value"><CountUp value={o.accuracy} suffix="%" /></div><div className="hint">{o.attempts} {"attempts"}</div></Card>
          </div>
          <Visitors />
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

const SRC = { direct: 'Direct', google: 'Google', yandex: 'Yandex', instagram: 'Instagram', telegram: 'Telegram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok', bing: 'Bing' };
const shortDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/** Website visitors: every page counts, the home page too (guests and students; not teachers, not bots). */
function Visitors() {
  const st = useAsync(() => api.get('/visits/summary'), []);
  const v = st.data;
  if (!v) return null;
  // last 14 days, days without visits included
  const by = new Map(v.days.map((d) => [d.day, d]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const t = new Date(`${v.date}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - (13 - i));
    const k = t.toISOString().slice(0, 10);
    return { day: k, visitors: by.get(k)?.visitors || 0, views: by.get(k)?.views || 0 };
  });
  const max = Math.max(1, ...days.map((d) => d.visitors));
  const total = v.sources.reduce((s, x) => s + x.n, 0) || 1;
  const diff = v.today - v.yesterday;
  return (
    <Card className="vis">
      <div className="vis-kpis">
        <div className="vis-main"><small><IconEye width={16} height={16} /> Visitors today</small><b><CountUp value={v.today} /></b>
          <span className={diff >= 0 ? 'good-text' : 'bad-text'}>{diff >= 0 ? '+' : ''}{diff} vs yesterday</span></div>
        <div><small>Yesterday</small><b>{v.yesterday}</b></div>
        <div><small>7 days</small><b>{v.week}</b></div>
        <div><small>30 days</small><b>{v.month}</b></div>
        <div><small>Views today</small><b>{v.views_today}</b></div>
      </div>
      <div className="vis-chart" role="img" aria-label="Visitors in the last 14 days">
        {days.map((d) => (
          <div key={d.day} className={d.day === v.date ? 'on' : ''} title={`${shortDay(d.day)}: ${d.visitors} visitors, ${d.views} page views`}>
            <span className="vis-n">{d.visitors || ''}</span>
            <i style={{ height: `${Math.max(3, (d.visitors / max) * 100)}%` }} />
            <small>{new Date(`${d.day}T00:00:00Z`).getUTCDate()}</small>
          </div>
        ))}
      </div>
      <div className="vis-foot">
        <span className="muted">Today: {v.today - v.guests_today} signed in · {v.guests_today} guests · {v.mobile_today} on phones</span>
        {v.sources.length > 0 && <span className="vis-src">7 days: {v.sources.map((s) => <span key={s.source} className="chip">{SRC[s.source] || s.source} {Math.round((s.n / total) * 100)}%</span>)}</span>}
      </div>
    </Card>
  );
}

/**
 * One switch for the whole platform: Paid (plans and the free daily limit apply) or Free (every student gets everything
 * self-paced, no limits; live 1-on-1 lessons stay paid). Same setting as Settings → "Require a subscription".
 */
function FreeMode() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const free = user?.access && !user.access.subscription_required;
  if (!canSee(user, '/settings')) return null;
  const flip = async () => {
    try { await api.put('/settings', { require_subscription: free }); await refresh(); toast(free ? 'Paid mode is on: plans and limits apply again' : 'Free mode is on: everything is open for every student'); }
    catch (e) { toast(e.message, 'bad'); } finally { setAsk(false); }
  };
  return (
    <div className={`fm-mode ${free ? 'on' : ''}`}>
      <div>
        <b>{free ? 'Free mode: everything is open' : 'Paid mode'}</b>
        <span className="muted">{free ? 'Every student has all lessons, videos, mocks and practice with no limits. Live 1-on-1 lessons stay paid.' : 'Plans and the free daily limit apply. Switch to make the whole platform free for everyone.'}</span>
      </div>
      <button type="button" role="switch" aria-checked={!!free} className={`fm-switch ${free ? 'on' : ''}`} onClick={() => setAsk(true)}><span /></button>
      {ask && <Confirm danger={false} title={free ? 'Turn paid mode back on?' : 'Make the platform free?'}
        text={free ? 'Plans, the 100-questions-a-day limit for free accounts and weekly lessons apply again. Subscribers keep their plans.' : 'Every student gets all lessons, videos, full mocks and practice without limits, until you switch it back. Payments already made stay as they are.'}
        confirmLabel={free ? 'Turn paid mode on' : 'Make it free'} onClose={() => setAsk(false)} onConfirm={flip} />}
    </div>
  );
}
