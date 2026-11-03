import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth, useToast } from '../context.jsx';
import { Card, Modal } from './ui.jsx';
import { IconTarget } from './icons.jsx';
import { SAT_DATES, examStart, upcomingSatDates } from '../../../server/src/satDates.js';

const fmt = (d, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', opts);
const todayKey = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);

/** Registration status of one SAT date, in plain words. */
export function regStatus(d) {
  const t = todayKey();
  if (!d.confirmed) return { tone: 'muted', text: 'Expected date · registration not open yet' };
  if (t <= d.reg) return { tone: 'good', text: `Register by ${fmt(d.reg, { day: 'numeric', month: 'short' })}` };
  if (t <= d.late) return { tone: 'warn', text: `Late registration until ${fmt(d.late, { day: 'numeric', month: 'short' })}` };
  return { tone: 'bad', text: 'Registration closed · only if you are already registered' };
}

/** Select of official SAT dates (Profile, teacher form). Keeps an older non-official value visible. */
export function SatDateSelect({ value, onChange, ...rest }) {
  const list = upcomingSatDates();
  const extra = value && !list.some((d) => d.date === value) ? [{ date: value, old: true }] : [];
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      <option value="" disabled>Choose your SAT date</option>
      {[...extra, ...list].map((d) => <option key={d.date} value={d.date}>{fmt(d.date)}{d.old ? ' (old date)' : d.confirmed ? '' : ' (expected)'}</option>)}
    </select>
  );
}

/** Pick the real SAT date. `required` = cannot be closed until a date is saved. */
export function ExamPicker({ value, required, onClose }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const [pick, setPick] = useState(value || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!pick) return;
    setBusy(true);
    try { await api.put('/me', { exam_date: pick }); await refresh(); toast('Exam date saved'); onClose?.(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal title="When is your SAT?" onClose={required ? null : onClose}
      footer={<button className="btn primary" disabled={!pick || busy} onClick={save}>{busy ? 'Saving…' : 'Save my exam date'}</button>}>
      <p className="muted" style={{ marginTop: -4 }}>Choose the official SAT date you registered for (or plan to). Your countdown and study plan use it. Dates are the same for students in Uzbekistan.</p>
      <div className="exam-dates">
        {upcomingSatDates().map((d) => {
          const st = regStatus(d);
          return (
            <button key={d.date} type="button" className={`exam-date ${pick === d.date ? 'on' : ''}`} onClick={() => setPick(d.date)}>
              <b>{fmt(d.date, { day: 'numeric', month: 'short' })}</b>
              <span>{new Date(d.date + 'T12:00:00').getFullYear()} · Saturday</span>
              <small className={st.tone}>{st.text}</small>
            </button>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: '.8rem' }}>Source: College Board SAT dates and deadlines. Register at satsuite.collegeboard.org.</p>
    </Modal>
  );
}

const pad = (n) => String(n).padStart(2, '0');

/** Live countdown to the student's SAT (08:00 Tashkent on test day). */
export function ExamCountdown({ date, onChange }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, examStart(date).getTime() - now);
  const d = Math.floor(ms / 86400e3), h = Math.floor(ms / 3600e3) % 24, m = Math.floor(ms / 60e3) % 60, s = Math.floor(ms / 1000) % 60;
  const info = SAT_DATES.find((x) => x.date === date);
  const st = info ? regStatus(info) : null;
  return (
    <Card className="exam-cd">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div><small className="muted" style={{ fontWeight: 700 }}>Your SAT</small><b className="exam-cd-date">{fmt(date)}</b></div>
        <button className="link-btn" onClick={onChange}>Change</button>
      </div>
      <div className="exam-cd-grid" aria-label={`${d} days ${h} hours ${m} minutes left`}>
        <div><b>{d}</b><span>days</span></div><div><b>{pad(h)}</b><span>hours</span></div><div><b>{pad(m)}</b><span>min</span></div><div><b>{pad(s)}</b><span>sec</span></div>
      </div>
      {st && <small className={`exam-cd-reg ${st.tone}`}><IconTarget width={13} height={13} /> {st.text}</small>}
    </Card>
  );
}
