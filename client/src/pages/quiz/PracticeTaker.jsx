import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Confirm } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconX, Logo } from '../../components/icons.jsx';
import { domainOf, withBlanks } from '../../lib.js';

const pad = (n) => String(n).padStart(2, '0');
const clock = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
const blank = (i) => <span key={i} className="blank" aria-label="blank" />;
const XP_RIGHT = 10;
const XP_TRY = 5;

/**
 * Practice mode (brand spec “State: answer selected” → “State: feedback + explanation”):
 * one question at a time, Check answer → instant feedback, explanation and an Ustoz tip.
 * Checked answers are stored on the server and cannot be changed.
 */
export default function PracticeTaker({ initial }) {
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { questions, attempt, quiz } = initial;
  const [answers, setAnswers] = useState(() => initial.progress?.answers || {});
  const [revealed, setRevealed] = useState(() => initial.checked || {});
  const [cur, setCur] = useState(() => {
    const firstOpen = questions.findIndex((q) => !initial.checked?.[q.id]);
    return firstOpen === -1 ? questions.length - 1 : firstOpen;
  });
  const [busy, setBusy] = useState(false);
  const [exit, setExit] = useState(false);
  const [secs, setSecs] = useState(() => (initial.remaining != null ? initial.remaining : initial.elapsed || 0));
  const finishing = useRef(false);
  const countdown = initial.remaining != null;

  const q = questions[cur];
  const sel = answers[q.id]?.choice || null;
  const rv = revealed[q.id];
  const done = Object.keys(revealed).length;
  const xp = useMemo(() => questions.reduce((s, x) => {
    const r = revealed[x.id];
    return r ? s + (answers[x.id]?.choice === r.correct ? XP_RIGHT : XP_TRY) : s;
  }, 0), [questions, revealed, answers]);
  const domain = domainOf(q.topic);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const r = await api.post(`/attempts/${attempt.id}/finish`, { progress: { answers } });
      nav(`/result/${r.id}`, { replace: true });
    } catch (e) { finishing.current = false; toast(e.message, 'bad'); }
  }, [attempt.id, answers, nav, toast]);

  // timer: counts down for timed sets, up otherwise (one interval for the whole session)
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (countdown ? Math.max(0, s - 1) : s + 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);
  useEffect(() => {
    if (countdown && secs === 0) { toast('Time is up — here are your results'); finishRef.current(); }
  }, [countdown, secs, toast]);

  const choose = (key) => { if (!rv) setAnswers((a) => ({ ...a, [q.id]: { ...(a[q.id] || {}), choice: key } })); };
  const check = async () => {
    if (!sel || rv || busy) return;
    setBusy(true);
    try {
      const r = await api.post(`/attempts/${attempt.id}/check`, { question_id: q.id, choice: sel });
      setRevealed((m) => ({ ...m, [q.id]: { correct: r.correct, explanation: r.explanation, tip: r.tip } }));
      setAnswers((a) => ({ ...a, [q.id]: { choice: r.choice, checked: true } }));
    } catch (e) { toast(e.message, 'bad'); }
    finally { setBusy(false); }
  };
  const next = () => {
    if (cur < questions.length - 1) { setCur(cur + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else finish();
  };

  // keyboard: A–D choose · Enter check / next
  useEffect(() => {
    const f = (e) => {
      if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || exit) return;
      const k = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(k) && q.options.some((o) => o.key === k)) choose(k);
      else if (e.key === 'Enter') { e.preventDefault(); rv ? next() : check(); }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  const isRight = rv && sel === rv.correct;
  const last = cur === questions.length - 1;

  return (
    <div className="pr">
      <header className="pr-top">
        <Logo size={22} />
        <div className="row" style={{ gap: 8 }}>
          {xp > 0 && <span className="chip sun" title="XP earned in this set">+{xp} XP</span>}
          <span className={`timer-chip ${countdown && secs < 60 ? 'low' : ''}`} aria-label={countdown ? 'Time left' : 'Time spent'}>{clock(secs)}</span>
          <button className="icon-btn" onClick={() => setExit(true)} aria-label="Leave practice"><IconX /></button>
        </div>
      </header>

      <main className="pr-card" key={q.id}>
        <div className="pr-meta">
          <span>{q.topic} · {cur + 1} / {questions.length}</span>
          {domain && <span className="chip domain">{domain}</span>}
        </div>
        <div className="progress" aria-label={`${done} of ${questions.length} checked`}><span style={{ width: `${(done / questions.length) * 100}%` }} /></div>

        {rv && (
          <div className={`pr-verdict ${isRight ? 'right' : 'wrong'}`} role="status">
            <h2>{isRight ? 'Correct — nice work!' : 'Not quite — almost!'}</h2>
            <span className="chip sun">{isRight ? `+${XP_RIGHT} XP` : `+${XP_TRY} XP for trying`}</span>
          </div>
        )}

        {q.passage && <div className="pr-passage">{withBlanks(q.passage, blank)}</div>}
        <p className="pr-prompt">{q.prompt}</p>

        <div className="pr-opts" role="radiogroup" aria-label="Answer choices">
          {q.options.map((o) => {
            const mine = sel === o.key;
            const state = rv ? (o.key === rv.correct ? 'correct' : mine ? 'wrong' : 'dim') : mine ? 'sel' : '';
            return (
              <button key={o.key} type="button" role="radio" aria-checked={mine} disabled={!!rv} className={`pr-opt ${state}`} onClick={() => choose(o.key)}>
                <span className="L">{o.key})</span>
                <span className="t">{o.text}</span>
                {state === 'wrong' && <span className="tag">· your answer</span>}
                {state === 'correct' && <span className="tag">{mine ? '· your answer · correct' : '· correct'}</span>}
                {state === 'correct' && <IconCheck className="ok" width={18} height={18} />}
              </button>
            );
          })}
        </div>

        {rv && (
          <div className="pr-explain">
            {rv.explanation && <p>{rv.explanation}</p>}
            {rv.tip && <div className="tip"><b>Ustoz tip:</b> {rv.tip}</div>}
          </div>
        )}

        {!rv
          ? <button className="btn primary lg block" disabled={!sel || busy} onClick={check}>{busy ? 'Checking…' : 'Check answer'}</button>
          : <button className="btn primary lg block" onClick={next}>{last ? 'See my results' : 'Next question'} <IconArrow /></button>}
        <p className="pr-hint">{!rv ? (sel ? 'Press Enter to check' : 'Choose an answer — keys A–D work too') : 'Press Enter to continue'}</p>
      </main>

      <nav className="pr-dots" aria-label="Questions">
        {questions.map((x, i) => {
          const r = revealed[x.id];
          const st = r ? (answers[x.id]?.choice === r.correct ? 'right' : 'wrong') : '';
          return <button key={x.id} className={`${st} ${i === cur ? 'cur' : ''}`} onClick={() => setCur(i)} aria-label={`Question ${i + 1}${st ? ` (${st})` : ''}`}>{i + 1}</button>;
        })}
        {done === questions.length && cur !== questions.length - 1 && <button className="btn sun sm" onClick={finish}>Finish</button>}
      </nav>

      {exit && <Confirm danger={false} title="Leave practice?" confirmLabel="Leave" onClose={() => setExit(false)}
        onConfirm={() => nav(-1)} text={`Your checked answers are saved, ${user.name.split(' ')[0]}. You can continue “${quiz.title}” later from where you stopped.`} />}
    </div>
  );
}
