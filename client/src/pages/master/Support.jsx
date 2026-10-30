import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Empty, ErrorBox, PageHeader, Segmented, Spinner } from '../../components/ui.jsx';
import { IconSend } from '../../components/icons.jsx';

const CAT = { question: 'Question', idea: 'Suggestion', complaint: 'Complaint', payment: 'Payment problem' };
const STATUS = { open: 'New', answered: 'Answered', closed: 'Closed' };
const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Teacher: questions, suggestions and complaints students sent to the Telegram bot. Answers go back through the bot. */
export default function Support() {
  const [filter, setFilter] = useState('all');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => api.get(`/support${filter === 'all' ? '' : `?status=${filter}`}`).then(setD).catch(setErr);
  useEffect(() => { load(); const t = setInterval(() => !document.hidden && load(), 20000); return () => clearInterval(t); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <ErrorBox error={err} onRetry={load} />;
  if (!d) return <Spinner />;
  const c = d.counts;
  return (
    <div className="stack">
      <PageHeader title="Support" sub="Questions, suggestions and complaints from the website chat and the Telegram bot. Answer here or in Telegram (reply to the message) — the answer goes back where the student wrote." />
      <Segmented value={filter} onChange={(v) => { setFilter(v); setOpen(null); }} options={[
        { value: 'all', label: 'All' }, { value: 'open', label: 'New', count: c.open }, { value: 'answered', label: 'Answered', count: c.answered }, { value: 'closed', label: 'Closed', count: c.closed },
      ]} />
      {!d.list.length ? <Empty title="No messages" text="When a student writes to the bot, the message appears here and in your Telegram." /> : (
        <div className="sp-grid">
          <div className="sp-list">
            {d.list.map((t) => (
              <button key={t.id} className={`sp-item ${open === t.id ? 'on' : ''} ${t.status}`} onClick={() => setOpen(t.id)}>
                <div className="row between"><b>{t.user_name || t.tg_name || 'Student'}</b><small className="muted">{when(t.updated_at)}</small></div>
                <div className="row" style={{ gap: 6 }}><span className={`sp-cat ${t.category}`}>{CAT[t.category] || t.category}</span><span className={`sp-ch ${t.channel}`}>{t.channel === 'web' ? 'Website' : 'Telegram'}</span><span className="muted">№{t.id} · {STATUS[t.status]}</span>{t.rating ? <span className="muted">· {t.rating >= 4 ? 'helpful' : 'not helpful'}</span> : null}</div>
                <p>{t.last_text || '(photo)'}</p>
              </button>
            ))}
          </div>
          {open ? <Thread id={open} onChange={load} /> : <Card className="sp-empty"><p className="muted">Choose a message on the left.</p></Card>}
        </div>
      )}
    </div>
  );
}

function Thread({ id, onChange }) {
  const toast = useToast();
  const [t, setT] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [img, setImg] = useState({});
  const load = () => api.get(`/support/${id}`).then(setT).catch((e) => toast(e.message, 'bad'));
  useEffect(() => { setT(null); setText(''); load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const photo = async (mid) => {
    try {
      const r = await fetch(`/api/support/file/${mid}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!r.ok) throw new Error('Could not load the file');
      const url = URL.createObjectURL(await r.blob());
      setImg((m) => ({ ...m, [mid]: url }));
    } catch (e) { toast(e.message, 'bad'); }
  };
  const reply = async (close = false) => {
    setBusy(true);
    try { await api.post(`/support/${id}/reply`, { text, close }); setText(''); toast(t.channel === 'web' ? 'Sent to the website chat' : 'Sent to the student in Telegram'); await load(); onChange(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const close = async () => { setBusy(true); try { await api.post(`/support/${id}/close`); await load(); onChange(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  if (!t) return <Card><Spinner /></Card>;
  return (
    <Card className="sp-thread">
      <div className="row between wrap">
        <div><b>{t.user_name || t.tg_name || 'Student'}</b> <small className="muted">{t.channel === 'web' ? 'Website chat' : t.tg_username ? `@${t.tg_username}` : 'Telegram'}{t.user_id ? ` · ${t.user_email || 'website account'}` : t.channel === 'web' ? ` · guest${t.contact ? ` · ${t.contact}` : ''}` : ' · no website account'}</small></div>
        <span className={`sp-cat ${t.category}`}>{CAT[t.category]} №{t.id}</span>
      </div>
      <div className="sp-msgs">
        {t.msgs.map((m) => (
          <div key={m.id} className={`sp-msg ${m.author}`}>
            {m.text && <p>{m.text}</p>}
            {m.file_kind && (img[m.id] ? <img src={img[m.id]} alt="Attachment" /> : <button className="linkish" onClick={() => photo(m.id)}>Show {m.file_kind === 'photo' ? 'photo' : 'file'}</button>)}
            <small>{m.author === 'teacher' ? (m.by_name || 'You') : 'Student'} · {when(m.created_at)}</small>
          </div>
        ))}
      </div>
      {(
        <div className="stack sm">
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t.channel === 'web' ? 'Write an answer — the student sees it in the website chat' : 'Write an answer — it goes to the student in Telegram'} />
          <div className="row wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
            {t.status !== 'closed' && <button className="btn ghost" disabled={busy} onClick={close}>Close without answer</button>}
            <button className="btn soft" disabled={busy || !text.trim()} onClick={() => reply(true)}>Answer and close</button>
            <button className="btn primary" disabled={busy || !text.trim()} onClick={() => reply(false)}><IconSend width={16} height={16} /> Send</button>
          </div>
        </div>
      )}
    </Card>
  );
}
