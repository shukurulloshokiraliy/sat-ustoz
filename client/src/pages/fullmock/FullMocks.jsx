import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Card, Empty, Gate, PageHeader, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconClock, IconDoc, IconLock } from '../../components/icons.jsx';

const PLAN = { free: 'Free', month: 'Monthly plan', quarter: '3-month plan' };

/** Official full-length mocks: two Reading & Writing modules (adaptive), weekly limit by plan. */
export default function FullMocks() {
  const st = useAsync(() => api.get('/full-mocks'), []);
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(0);
  const start = async (m) => {
    setBusy(m.id);
    try { const a = await api.post(`/full-mocks/${m.id}/start`); nav(`/full-mock/${a.id}`); }
    catch (e) { toast(e.message, 'bad'); st.reload(); } finally { setBusy(0); }
  };
  return (
    <div className="page">
      <PageHeader title="Full Mocks" sub="Official full-length practice tests: Module 1, then a harder or easier Module 2, as on test day." />
      <Gate state={st}>{({ quota: q, mocks }) => (
        <>
          <div className={`fm-quota ${q.left ? '' : 'out'}`}>
            <div>
              <small>{PLAN[q.plan] || q.plan} · this week</small>
              <b>{q.left} of {q.limit} left</b>
              <span>{q.left ? 'A mock counts when you start it.' : `New mocks open ${fmtDate(q.resets_at)} (Monday).`}</span>
            </div>
            <div className="fm-dots" aria-hidden="true">{Array.from({ length: Math.min(q.limit, 7) }, (_, i) => <i key={i} className={i < q.used ? 'used' : ''} />)}</div>
            {q.plan === 'free' && user.role === 'student' && <Link className="btn sun" to="/subscribe">Get up to 7 a week <IconArrow width={16} height={16} /></Link>}
          </div>
          {!mocks.length ? <Card><Empty icon={<IconDoc />} title="No full mocks yet" text="Your teacher will add official mocks here soon." /></Card> : (
            <div className="fm-list stagger">
              {mocks.map((m) => {
                const open = m.attempts.find((a) => a.stage !== 'done');
                const done = m.attempts.filter((a) => a.stage === 'done');
                const best = done.reduce((b, a) => Math.max(b, a.score || 0), 0);
                return (
                  <Card key={m.id} className="fm-card">
                    <div className="fm-card-top">
                      <span className="fm-ic"><IconDoc width={22} height={22} weight="duotone" /></span>
                      <div className="grow">
                        <h3>{m.title}</h3>
                        <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                          <span className="chip"><IconClock width={13} height={13} /> 2 × {m.minutes} min</span>
                          <span className="chip">Reading &amp; Writing</span>
                          {m.mode === 'pdf' && <span className="chip">PDF + answer sheet</span>}
                        </div>
                        {m.note && <p className="muted" style={{ marginTop: 8 }}>{m.note}</p>}
                      </div>
                      {best > 0 && <div className="fm-best"><b>{best}</b><small>best</small></div>}
                    </div>
                    {done.length > 0 && (
                      <div className="fm-tries">
                        {done.slice(0, 3).map((a) => <Link key={a.id} to={`/full-mock/result/${a.id}`}><span>{fmtDate(a.finished_at)}</span><b>{a.score}</b><IconArrow width={14} height={14} /></Link>)}
                      </div>
                    )}
                    <div className="row" style={{ marginTop: 12 }}>
                      {open ? <button className="btn primary" onClick={() => nav(`/full-mock/${open.id}`)}>Continue <IconArrow width={16} height={16} /></button>
                        : q.left > 0 ? <button className="btn primary" disabled={busy === m.id} onClick={() => start(m)}>{done.length ? 'Take again' : 'Start mock'} <IconArrow width={16} height={16} /></button>
                          : <button className="btn ghost" disabled><IconLock width={16} height={16} /> Weekly limit reached</button>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}</Gate>
    </div>
  );
}
