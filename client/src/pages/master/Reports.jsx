import { useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Empty, Gate, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import { IconCheck, IconFlag, IconRefresh } from '../../components/icons.jsx';

const SRC = { qbank: 'Question Bank', quiz: 'Quiz', lesson: 'Level check', fullmock: 'Full mock' };
const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Teacher: "Report a problem" from students (wrong key, typo, unclear), with the question id. */
export default function Reports() {
  const [status, setStatus] = useState('open');
  const st = useAsync(() => api.get('/question-reports?status=' + status), [status]);
  const toast = useToast();
  const set = async (r, to) => {
    try { await api.put('/question-reports/' + r.id, { status: to }); toast(to === 'resolved' ? 'Marked as fixed' : 'Reopened'); st.reload(); }
    catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <div className="page">
      <PageHeader title="Question reports" sub="Problems students reported on a question: a wrong answer key, a typo or an unclear question. Fix the question, then mark the report as fixed." />
      <Gate state={st}>{(d) => (
        <>
          <Segmented value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open', count: d.open }, { value: 'resolved', label: 'Fixed' }, { value: 'all', label: 'All', count: d.total }]} />
          {!d.reports.length ? <Card style={{ marginTop: 14 }}><Empty icon={<IconFlag />} title={status === 'open' ? 'No open reports' : 'Nothing here'} text="When a student presses “Report a problem” under a question, it appears here and in your Telegram." /></Card> : (
            <div className="stack stagger" style={{ marginTop: 14 }}>
              {d.reports.map((r) => {
                const [src, ...rest] = String(r.ref || '').split(':');
                return (
                  <Card key={r.id} className={`rp-card ${r.status}`}>
                    <div className="row between wrap" style={{ gap: 8 }}>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <span className={`chip ${r.kind === 'key' ? 'bad' : r.kind === 'typo' ? 'warn' : ''}`}>{r.kind_label}</span>
                        {SRC[src] && <span className="chip domain">{SRC[src]}</span>}
                        {rest.length > 0 && <code className="rp-ref">{rest.join(':')}</code>}
                        <small className="muted">№{r.id} · {r.student || 'Student'} · {when(r.created_at)}</small>
                      </div>
                      {r.status === 'open'
                        ? <button className="btn soft sm" onClick={() => set(r, 'resolved')}><IconCheck width={16} height={16} /> Mark as fixed</button>
                        : <button className="btn ghost sm" onClick={() => set(r, 'open')}><IconRefresh width={16} height={16} /> Reopen</button>}
                    </div>
                    <p style={{ marginTop: 8 }}><b>{r.about}</b></p>
                    {r.note && <p className="muted">“{r.note}”</p>}
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
