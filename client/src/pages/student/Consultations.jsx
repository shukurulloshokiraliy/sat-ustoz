import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Card, Empty, Field, Gate, PageHeader, useAsync } from '../../components/ui.jsx';
import { IconConsult, IconLock } from '../../components/icons.jsx';

export const when = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATUS = { requested: ['warn', 'Waiting for the teacher'], scheduled: ['good', 'Booked'], done: ['', 'Done'], cancelled: ['', 'Cancelled'] };

/** Student: book a consultation with the teacher (plan 2 every 2 weeks, plans 3–4 every week) and see past ones. */
export default function Consultations() {
  const { user } = useAuth();
  const toast = useToast();
  const st = useAsync(() => api.get('/consultations'), []);
  const [f, setF] = useState({ preferred: '', note: '' });
  const [busy, setBusy] = useState(false);
  const book = async () => {
    setBusy(true);
    try { await api.post('/consultations', f); toast('Request sent. The teacher will confirm the time.'); setF({ preferred: '', note: '' }); st.reload(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const cancel = async (id) => { try { await api.post(`/consultations/${id}/cancel`); toast('Cancelled'); st.reload(); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
      <PageHeader title="Consultations" sub="A one-to-one call with your teacher: your mistakes, your plan and what to study next." />
      <Gate state={st}>{(c) => {
        if (!c.every_days) return (
          <Card className="consult-lock">
            <span className="item-ic"><IconLock /></span>
            <div className="grow"><b>Consultations come with plan 2 and higher</b>
              <p className="muted">Plan 2 (Roadmap): a 30-minute call every 2 weeks. Plans 3–4: every week. Your plan now: {user.access?.tier?.name || 'Free'}.</p></div>
            <Link className="btn primary" to="/subscribe">See plans</Link>
          </Card>
        );
        const upcoming = c.list.filter((x) => x.status === 'requested' || x.status === 'scheduled');
        const past = c.list.filter((x) => x.status === 'done' || x.status === 'cancelled');
        return (
          <>
            <div className="consult-top">
              <Card className="consult-plan">
                <span className="item-ic"><IconConsult /></span>
                <div><b>{c.minutes} minutes {c.every_days <= 7 ? 'every week' : `every ${Math.round(c.every_days / 7)} weeks`}</b>
                  <p className="muted">{user.access?.tier?.name} plan · {c.next_at ? `next request from ${fmtDate(c.next_at)}` : 'you can book now'}</p></div>
              </Card>
              {upcoming.map((x) => (
                <Card key={x.id} className={`consult-next ${x.status}`}>
                  <small>{STATUS[x.status][1]}</small>
                  <b>{x.status === 'scheduled' && x.scheduled_at ? when(x.scheduled_at) : x.preferred}</b>
                  {x.note && <p className="muted">{x.note}</p>}
                  <div className="row wrap" style={{ gap: 8 }}>
                    {x.link && <a className="btn primary sm" href={x.link} target="_blank" rel="noreferrer">Join the call</a>}
                    <button className="btn ghost sm" onClick={() => cancel(x.id)}>Cancel</button>
                  </div>
                </Card>
              ))}
            </div>
            {!c.next_at && !upcoming.length && (
              <Card className="stack">
                <h3 className="sr-h">Book a consultation</h3>
                <div className="grid g2">
                  <Field label="When suits you?"><input value={f.preferred} onChange={(e) => setF({ ...f, preferred: e.target.value })} placeholder="Saturday after 15:00" /></Field>
                  <Field label="What to discuss" hint="optional"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="My last full mock, Boundaries…" /></Field>
                </div>
                <div><button className="btn primary" disabled={busy || !f.preferred.trim()} onClick={book}>Request a consultation</button></div>
                <small className="muted">The teacher confirms the time and adds a meeting link here. You also see it on this page.</small>
              </Card>
            )}
            <Card>
              <h3 className="sr-h">History</h3>
              {!past.length ? <Empty icon={<IconConsult />} title="No consultations yet" text="Your past calls will appear here." /> : (
                <div className="consult-hist">{past.map((x) => (
                  <div key={x.id}><span>{x.scheduled_at ? when(x.scheduled_at) : fmtDate(x.created_at)}</span><span className="muted">{x.note || x.preferred}</span><span className={`chip ${STATUS[x.status][0]}`}>{STATUS[x.status][1]}</span></div>
                ))}</div>
              )}
            </Card>
          </>
        );
      }}</Gate>
    </div>
  );
}
