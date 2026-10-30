import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Confirm } from '../../components/ui.jsx';
import { BBPracticeRunner } from '../../components/Bluebook.jsx';
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

  const items = questions.map((x) => ({
    id: x.id,
    passage: x.passage ? <>{withBlanks(x.passage, blank)}</> : null,
    prompt: x.prompt,
    meta: <><span>{x.topic}</span>{domainOf(x.topic) && <span className="chip domain">{domainOf(x.topic)}</span>}{xp > 0 && <span className="chip sun">+{xp} XP</span>}</>,
    options: x.options,
  }));
  return (
    <>
      <BBPracticeRunner
        title={quiz.title} questions={items} cur={cur} setCur={setCur} busy={busy} seconds={secs} countdown={countdown}
        directions={<p>Choose the best answer, then press Check to see if you are right and read the explanation. Checked answers are saved and cannot be changed. Keys: A–D choose, Enter checks.</p>}
        choice={(id) => answers[id]?.choice || null}
        onChoose={(id, k) => { if (!revealed[id]) setAnswers((a) => ({ ...a, [id]: { ...(a[id] || {}), choice: k } })); }}
        reveal={(id) => { const r = revealed[id]; if (!r) return null; const ok = answers[id]?.choice === r.correct; return { correct: r.correct, ok, explanation: r.explanation, tip: r.tip, note: ok ? `+${XP_RIGHT} XP` : `+${XP_TRY} XP for trying` }; }}
        onCheck={(x) => { if (questions[cur].id === x.id) check(); }}
        onExit={() => setExit(true)} onFinish={finish} finishLabel="See my results"
      />
      {exit && <Confirm danger={false} title="Leave practice?" confirmLabel="Leave" onClose={() => setExit(false)}
        onConfirm={() => nav(-1)} text={`Your checked answers are saved, ${user.name.split(' ')[0]}. You can continue “${quiz.title}” later from where you stopped.`} />}
    </>
  );
}
