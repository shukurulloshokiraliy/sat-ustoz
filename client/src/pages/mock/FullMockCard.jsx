import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Confirm, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconClock, IconTarget } from '../../components/icons.jsx';
import { fmtMoney } from '../student/Subscribe.jsx';

/**
 * "Full mock" card: 54 Question Bank questions as a real Reading & Writing section —
 * Module 1 with mixed difficulty, then an adaptive Module 2 (harder or easier). Weekly limit by plan.
 */
export default function FullMockCard() {
  const st = useAsync(() => api.get('/full-mocks/random'), []);
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [buy, setBuy] = useState(false);
  const d = st.data;
  const q = d?.quota;
  const start = async (pay = false) => {
    setBusy(true);
    try { const a = await api.post('/full-mocks/random/start', { pay }); nav(`/full-mock/${a.id}`); }
    catch (e) { if (e.data?.code === 'full_mock_limit') setBuy(true); else toast(e.message, 'bad'); st.reload(); }
    finally { setBusy(false); }
  };
  const go = () => (d?.open || !q || q.left > 0 ? start() : setBuy(true));
  return (
    <section className="tq fm-tq">
      <div className="tq-main">
        <small className="tq-eyebrow">FULL MOCK · 54 QUESTIONS</small>
        <h2>A full Reading &amp; Writing section</h2>
        <p>Module 1 mixes easy, medium and hard questions like the real test. Your Module 1 result decides whether Module 2 is harder or easier — then you get an SAT score.</p>
        <ol className="tq-order fm-steps"><li>Module 1 · 27 questions</li><li>Short break</li><li>Adaptive Module 2 · 27 questions</li></ol>
        <div className="tq-actions">
          <button className="btn sun lg" disabled={busy} onClick={go}>{d?.open ? 'Continue my full mock' : 'Start full mock'} <IconArrow /></button>
          <span className="tq-time"><IconClock width={16} height={16} /> 2 × 32 min</span>
        </div>
        {q && !d?.open && (
          <small className="fm-left">{q.left > 0 ? `${q.left} of ${q.limit} free this week (${q.plan_name} plan)` : `This week's ${q.limit} used · one more costs ${fmtMoney(q.extra_price, 'UZS')} from your wallet`}</small>
        )}
      </div>
      <div className="tq-stats">
        <div className="tq-acc">
          <b>{d?.last ? d.last.score : '—'}</b>
          <span>last score{d?.best ? ` · best ${d.best}` : ''}</span>
          <small>{d?.accuracy != null ? `${d.accuracy}% correct · ${d.right} of ${d.total} questions in ${d.taken} mock${d.taken === 1 ? '' : 's'}` : 'Take your first full mock'}</small>
        </div>
        {d?.last && (
          <Link className="tq-last" to={`/full-mock/result/${d.last.id}`}>
            <IconTarget width={18} height={18} />
            <span><b>M1 {d.last.m1_correct}/{d.last.m1_total} · M2 {d.last.m2_correct}/{d.last.m2_total}{d.last.route ? ` (${d.last.route === 'hard' ? 'harder' : 'easier'})` : ''}</b><small>{fmtDate(d.last.finished_at, { day: 'numeric', month: 'short' })} · review answers</small></span>
          </Link>
        )}
        {d?.history?.length > 1 && (
          <div className="tq-spark" aria-label="Recent full mock scores">
            {[...d.history].reverse().map((m) => <i key={m.id} title={String(m.score)} style={{ height: `${Math.max(8, ((m.score - 200) / 600) * 100)}%` }} />)}
          </div>
        )}
      </div>
      {buy && q && (q.balance >= q.extra_price
        ? <Confirm danger={false} title="One more full mock?" confirmLabel={`Pay ${fmtMoney(q.extra_price, 'UZS')}`} onClose={() => setBuy(false)} onConfirm={() => { setBuy(false); return start(true); }}
          text={`You have used ${q.limit} of ${q.limit} this week. ${fmtMoney(q.extra_price, 'UZS')} will be taken from your wallet (${fmtMoney(q.balance, 'UZS')}).`} />
        : <Confirm danger={false} title="Weekly full mocks used" confirmLabel="Top up wallet" onClose={() => setBuy(false)} onConfirm={() => nav('/subscribe')}
          text={`New ones open on Monday. One more now costs ${fmtMoney(q.extra_price, 'UZS')}; your wallet has ${fmtMoney(q.balance, 'UZS')}. A bigger plan gives more full mocks a week.`} />)}
    </section>
  );
}
