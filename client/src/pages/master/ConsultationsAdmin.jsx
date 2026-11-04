import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Empty, Gate, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import { IconConsult } from '../../components/icons.jsx';
import { when } from '../student/Consultations.jsx';

const PLAN = { t1: 'Plan 1', t2: 'Plan 2', t3: 'Plan 3', t4: 'Plan 4' };

/** Teacher: consultation requests → set the time and a meeting link → mark done. */
export default function ConsultationsAdmin() {
  const toast = useToast();
  const st = useAsync(() => api.get('/consultations'), []);
  const [tab, setTab] = useState('open');
  const [edit, setEdit] = useState({});
  const save = async (c, status) => {
    const e = edit[c.id] || {};
    try { await api.put(`/consultations/${c.id}`, { status, scheduled_at: e.at ? `${e.at}:00+05:00` : undefined, link: e.link ?? undefined }); toast(status === 'scheduled' ? 'Time confirmed — the student sees it on their Consultations page' : status === 'done' ? 'Marked as done' : 'Cancelled'); st.reload(); }
    catch (err) { toast(err.message, 'bad'); }
  };
  return (
    <div className="page">
      <PageHeader title="Consultations" sub="Requests from students on plans 2–4. Set the time and a meeting link (Google Meet, Zoom or Telegram); the student sees it right away." />
      <Gate state={st}>{(list) => {
        const groups = { open: list.filter((c) => c.status === 'requested'), booked: list.filter((c) => c.status === 'scheduled'), past: list.filter((c) => c.status === 'done' || c.status === 'cancelled') };
        const shown = groups[tab];
        return (
          <>
            <Segmented value={tab} onChange={setTab} options={[{ value: 'open', label: 'New requests', count: groups.open.length }, { value: 'booked', label: 'Booked', count: groups.booked.length }, { value: 'past', label: 'History', count: groups.past.length }]} />
            {!shown.length ? <Card><Empty icon={<IconConsult />} title={tab === 'open' ? 'No new requests' : tab === 'booked' ? 'Nothing booked' : 'No history yet'} text="Requests also arrive in your Telegram bot." /></Card> : (
              <div className="stack">{shown.map((c) => (
                <Card key={c.id} className="consult-card">
                  <div className="row between wrap" style={{ gap: 8 }}>
                    <div><Link to={`/students/${c.user_id}`}><b>{c.name}</b></Link> <span className="chip">{PLAN[c.sub_plan] || 'Plan'}</span> <span className="chip">{c.minutes} min</span></div>
                    <small className="muted">Asked {when(c.created_at)}</small>
                  </div>
                  <p><b>Wants:</b> {c.preferred}{c.note ? <> · <span className="muted">{c.note}</span></> : null}</p>
                  {c.status === 'scheduled' && c.scheduled_at && <p className="good-text">Booked for {when(c.scheduled_at)}{c.link ? ' · link sent' : ''}</p>}
                  {(c.status === 'requested' || c.status === 'scheduled') && (
                    <div className="consult-row">
                      <input type="datetime-local" aria-label="Time" value={edit[c.id]?.at ?? (c.scheduled_at ? new Date(new Date(c.scheduled_at).getTime() + 5 * 3600e3).toISOString().slice(0, 16) : '')}
                        onChange={(e) => setEdit({ ...edit, [c.id]: { ...edit[c.id], at: e.target.value } })} />
                      <input placeholder="Meeting link (https://meet.google.com/…)" value={edit[c.id]?.link ?? c.link ?? ''} onChange={(e) => setEdit({ ...edit, [c.id]: { ...edit[c.id], link: e.target.value } })} />
                      <button className="btn primary sm" onClick={() => save(c, 'scheduled')}>{c.status === 'scheduled' ? 'Update' : 'Confirm'}</button>
                      <button className="btn ghost sm" onClick={() => save(c, 'done')}>Done</button>
                      <button className="btn danger-ghost sm" onClick={() => save(c, 'cancelled')}>Cancel</button>
                    </div>
                  )}
                  {(c.status === 'done' || c.status === 'cancelled') && <span className={`chip ${c.status === 'done' ? 'good' : ''}`}>{c.status === 'done' ? 'Done' : 'Cancelled'}</span>}
                </Card>
              ))}</div>
            )}
          </>
        );
      }}</Gate>
    </div>
  );
}
