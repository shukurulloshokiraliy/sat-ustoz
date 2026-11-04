import { useState } from 'react';
import { api } from '../api.js';
import { useAuth, useToast } from '../context.jsx';
import { IconFlag } from './icons.jsx';

/** "Report a mistake" under a reviewed question: goes to the teacher's Support inbox (and Telegram). */
export default function ReportMistake({ about }) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  if (!user || user.role !== 'student') return null;
  if (sent) return <span className="ask-t done">Thanks — the teacher will check this question.</span>;
  if (!open) return <button type="button" className="ask-t report" onClick={() => setOpen(true)}><IconFlag width={14} height={14} /> Report a mistake</button>;
  const send = async () => {
    try { await api.post('/chat', { text: text.trim() || 'The answer key looks wrong.', category: 'complaint', report: about }); setSent(true); }
    catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <div className="ask-box">
      <textarea rows={2} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What is wrong? e.g. I think C is correct because…" maxLength={1000} />
      <div className="row" style={{ gap: 8 }}><button className="btn primary sm" onClick={send}>Send report</button><button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </div>
  );
}
