import { useState } from 'react';
import { api } from '../api.js';
import { useAuth, useToast } from '../context.jsx';
import { IconFlag } from './icons.jsx';

const KINDS = [['key', 'Wrong answer key'], ['typo', 'Typo'], ['unclear', 'Unclear'], ['other', 'Other']];

/**
 * "Report a problem" on a question: wrong key, typo, unclear or other, plus a note.
 * Goes to the teacher's Question reports list (and Telegram when the bot is connected).
 * `qref` is the question id (e.g. "qbank:inf-e-03"), `about` a short human description.
 */
export default function ReportMistake({ about, qref }) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('key');
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user || user.role !== 'student') return null;
  if (sent) return <span className="ask-t done">Thanks: the teacher will check this question.</span>;
  if (!open) return <button type="button" className="ask-t report" onClick={() => setOpen(true)}><IconFlag width={14} height={14} /> Report a problem</button>;
  const ref = qref || String(about || '').match(/question\s+([\w:-]+)/i)?.[1] || '';
  const send = async () => {
    setBusy(true);
    try { await api.post('/question-reports', { kind, ref, about: about || ref, note: text.trim() }); setSent(true); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <div className="ask-box">
      <div className="rp-kinds" role="radiogroup" aria-label="What is wrong?">
        {KINDS.map(([k, label]) => <button type="button" key={k} role="radio" aria-checked={kind === k} className={`chip chip-btn ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{label}</button>)}
      </div>
      <textarea rows={2} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'key' ? 'Which answer do you think is right, and why?' : 'What should the teacher look at?'} maxLength={1000} />
      <div className="row" style={{ gap: 8 }}><button className="btn primary sm" disabled={busy} onClick={send}>Send report</button><button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </div>
  );
}
