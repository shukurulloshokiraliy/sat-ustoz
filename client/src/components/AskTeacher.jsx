import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, useToast } from '../context.jsx';
import { IconChats, IconLock } from './icons.jsx';

/** "Ask the teacher about this question" (plan 3 and higher). The answer arrives in the Ask Ustoz chat. */
export default function AskTeacher({ about }) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (user?.role !== 'student') return null;
  if (!user.access?.ask) return <Link className="ask-t locked" to="/subscribe"><IconLock width={14} height={14} /> Ask the teacher · plan 3</Link>;
  if (sent) return <span className="ask-t done">Sent. The answer will come in the Ask Ustoz chat.</span>;
  if (!open) return <button type="button" className="ask-t" onClick={() => setOpen(true)}><IconChats width={15} height={15} /> Ask the teacher</button>;
  const send = async () => {
    setBusy(true);
    try { await api.post('/chat', { text, category: 'question', about }); setSent(true); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <div className="ask-box">
      <textarea rows={2} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What is unclear? e.g. Why is B wrong here?" maxLength={1500} />
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary sm" disabled={busy || !text.trim()} onClick={send}>Send</button>
        <button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
