import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import { IconSend, IconX } from './icons.jsx';

const GUEST_KEY = 'sat-ustoz-chat';
const CATS = [['question', 'Question'], ['payment', 'Payment'], ['idea', 'Suggestion'], ['complaint', 'Complaint']];
const readGuest = () => { try { return localStorage.getItem(GUEST_KEY) || ''; } catch { return ''; } };
const saveGuest = (g) => { try { localStorage.setItem(GUEST_KEY, g); } catch { /* private mode: the chat lasts this visit */ } };
const time = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const IconChat = (p) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" /><path d="M8.5 11h7M8.5 14.5h4.5" />
  </svg>
);

/**
 * Website support chat: a floating button on the public site and in the student app.
 * Messages land in the teacher's Support page and Telegram; answers show up here.
 */
export default function SupportChat() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const focus = /^\/(vocab\/(unit|review)|play|game|quiz\/|placement\/test|question-bank)|\/check$/.test(pathname);
  const [open, setOpen] = useState(false);
  const [guest, setGuest] = useState(readGuest);
  const [d, setD] = useState({ ticket: null, msgs: [], unread: 0 });
  const [text, setText] = useState('');
  const [cat, setCat] = useState('question');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef(null);
  const known = !!user || !!guest;
  const q = !user && guest ? `?guest=${guest}` : '';

  const load = useCallback(async () => {
    if (!known) return;
    try { setD(await api.get('/chat' + q)); } catch { /* offline: keep what we have */ }
  }, [known, q]);

  useEffect(() => { load(); }, [load, user?.id]);
  // poll: often while open, rarely while closed (only to show the unread dot)
  useEffect(() => {
    if (!known || (!open && !d.ticket)) return undefined;
    const t = setInterval(() => { if (!document.hidden) load(); }, open ? 8000 : 45000);
    return () => clearInterval(t);
  }, [known, open, d.ticket, load]);
  useEffect(() => {
    if (open && d.unread) api.post('/chat/seen', guest && !user ? { guest } : {}).then(() => setD((x) => ({ ...x, unread: 0 }))).catch(() => {});
  }, [open, d.unread]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'end' }); }, [open, d.msgs.length]);

  if (user?.role === 'master') return null; // the teacher answers from Support

  const active = d.ticket && d.ticket.status !== 'closed';
  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setErr('');
    try {
      const r = await api.post('/chat', { text, category: cat, name, contact, guest: user ? undefined : guest || undefined });
      if (r.guest) { saveGuest(r.guest); setGuest(r.guest); }
      setD(r); setText('');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <>
      {open && (
        <section className={`sc-panel ${d.msgs.length ? 'has-msgs' : ''}`} role="dialog" aria-label="Support chat">
          <header className="sc-head">
            <div>
              <b>Ask the teacher</b>
              <small>Usually answers within a few hours</small>
            </div>
            <button className="sc-x" onClick={() => setOpen(false)} aria-label="Close chat"><IconX width={18} height={18} /></button>
          </header>

          <div className="sc-body">
            {!d.msgs.length && <p className="sc-hello">Hi! Write about lessons, payment or your account, and the answer will appear right here.{!user && ' Leave a phone or Telegram so we can reach you too.'}</p>}
            {d.msgs.map((m) => (
              <div key={m.id} className={`sc-msg ${m.author}`}>
                <p>{m.text}</p>
                <small>{m.author === 'teacher' ? m.by : 'You'} · {time(m.at)}</small>
              </div>
            ))}
            {d.msgs.length > 0 && d.msgs[d.msgs.length - 1].author === 'user' && active && <p className="sc-wait">Sent. You will see the answer here.</p>}
            {d.ticket?.status === 'closed' && <p className="sc-wait">This conversation is closed. Write again to start a new one.</p>}
            <div ref={endRef} />
          </div>

          <form className="sc-form" onSubmit={send}>
            {!user && !active && (
              <div className="sc-guest">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={80} />
                <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone, Telegram or email" aria-label="Phone, Telegram or email" maxLength={120} />
              </div>
            )}
            {!active && (
              <label className="sc-topic">Topic
                <select value={cat} onChange={(e) => setCat(e.target.value)}>{CATS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
              </label>
            )}
            <div className="sc-row">
              <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" aria-label="Message" maxLength={2000}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }} />
              <button className="btn primary sc-send" disabled={busy || !text.trim()} aria-label="Send"><IconSend width={18} height={18} /></button>
            </div>
            {err && <p className="sc-err">{err}</p>}
          </form>
        </section>
      )}
      <button className={`sc-fab ${open ? 'on' : ''} ${focus ? 'focus' : ''}`} onClick={() => setOpen((x) => !x)} aria-label={open ? 'Close support chat' : 'Open support chat'}>
        {open ? <IconX width={22} height={22} /> : <IconChat />}
        {!open && d.unread > 0 && <span className="sc-dot">{d.unread}</span>}
        {!open && <span className="sc-label">Support</span>}
      </button>
    </>
  );
}
