import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confetti, Confirm, ErrorBox, Gate, Segmented, Spinner, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconX, Logo } from '../../components/icons.jsx';
import { rich } from '../../components/Rich.jsx';

const L = ['A', 'B', 'C', 'D', 'E'];

/** Level check runner: 15 questions of one version, scored at the end. */
export default function LevelCheck() {
  const { id } = useParams();
  const nav = useNavigate();
  const [state, setState] = useState({ data: null, err: null });
  useEffect(() => { api.post(`/lessons/${id}/check`).then((data) => setState({ data })).catch((err) => setState({ err })); }, [id]);
  if (state.err) return (
    <div style={{ padding: 40, maxWidth: 520, margin: '0 auto' }}>
      <ErrorBox error={state.err} />
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn ghost" onClick={() => nav(`/lesson/${id}`)}>Back to the lesson</button>
        {state.err.status === 402 && <button className="btn primary" onClick={() => nav('/subscribe')}>See plans</button>}
      </div>
    </div>
  );
  if (!state.data) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spinner label="Preparing your level check…" /></div>;
  return <Runner c={state.data} />;
}

function Runner({ c }) {
  const nav = useNavigate();
  const toast = useToast();
  const [answers, setAnswers] = useState(c.answers || {});
  const [cur, setCur] = useState(() => Math.max(0, c.questions.findIndex((q) => answers[q.id] == null)));
  const [confirm, setConfirm] = useState(false);
  const [exit, setExit] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const q = c.questions[cur];
  const done = c.questions.filter((x) => answers[x.id] != null).length;
  const last = cur === c.questions.length - 1;
  const isSession = c.type === 'session';
  // timed checks (session check): countdown from the server's remaining seconds, auto-submit at 0
  const [left, setLeft] = useState(c.time_limit ? c.remaining : null);
  const endAt = useRef(c.time_limit ? Date.now() + c.remaining * 1000 : null);
  const autoSent = useRef(false);

  const save = useCallback(() => { dirty.current = false; return api.put(`/lesson-checks/${c.id}`, { answers }).catch(() => { dirty.current = true; }); }, [c.id, answers]);
  useEffect(() => { if (!dirty.current) return; const t = setTimeout(save, 500); return () => clearTimeout(t); }, [answers, save]);

  const pick = (i) => { dirty.current = true; setAnswers((a) => ({ ...a, [q.id]: i })); };
  const go = (i) => { if (i >= 0 && i < c.questions.length) { setCur(i); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
  const submit = async () => {
    setBusy(true);
    try { await api.post(`/lesson-checks/${c.id}/submit`, { answers }); nav(`/lesson-check/${c.id}`, { replace: true }); }
    catch (e) { toast(e.message, 'bad'); setBusy(false); }
  };

  useEffect(() => {
    if (!endAt.current) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((endAt.current - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left === 0 && !autoSent.current) { autoSent.current = true; toast('Time is up — your answers were submitted'); submit(); }
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const f = (e) => {
      if (confirm || exit || e.metaKey || e.ctrlKey) return;
      const i = L.indexOf(e.key.toUpperCase());
      if (i >= 0 && i < q.options.length) pick(i);
      else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); last ? setConfirm(true) : go(cur + 1); }
      else if (e.key === 'ArrowLeft') go(cur - 1);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  return (
    <div className="pr">
      <header className="pr-top">
        <Logo size={22} />
        <div className="row" style={{ gap: 8 }}>
          {left != null && <span className={`timer-chip ${left <= 300 ? 'low' : ''}`} aria-live="off">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
          <span className="timer-chip">Version {c.version}</span>
          <button className="icon-btn" onClick={() => setExit(true)} aria-label="Save and leave"><IconX /></button>
        </div>
      </header>
      <main className="pr-card" key={q.id}>
        <div className="pr-meta"><span>{isSession ? 'Session check' : `Level check · ${c.lesson.title.replace(/^Lesson (\d+):.*/, 'Lesson $1')}`}</span><span>{cur + 1} / {c.questions.length}</span></div>
        <div className="progress"><span style={{ width: `${(done / c.questions.length) * 100}%` }} /></div>
        {q.kind === 'sat' && <span className="chip domain" style={{ justifySelf: 'start' }}>SAT question</span>}
        {q.kind === 'vocab' && <span className="chip sun" style={{ justifySelf: 'start' }}>Vocabulary</span>}
        {q.kind === 'sat' && q.passage && <div className="pr-passage">{rich(q.passage)}</div>}
        <p className={q.kind === 'sat' ? 'pr-prompt' : 'pt-prompt'}>{rich(q.prompt)}</p>
        {q.kind !== 'sat' && q.passage && <div className="pr-passage drill">{rich(q.passage)}</div>}
        <div className="pr-opts" role="radiogroup" aria-label="Answer choices">
          {q.options.map((o, i) => (
            <button key={i} type="button" role="radio" aria-checked={answers[q.id] === i} className={`pr-opt ${answers[q.id] === i ? 'sel' : ''}`} onClick={() => pick(i)}>
              <span className="L">{L[i]})</span><span className="t">{rich(o)}</span>
            </button>
          ))}
        </div>
        <div className="row between">
          <button className="btn ghost lg" disabled={cur === 0} onClick={() => go(cur - 1)}>Back</button>
          {!last ? <button className="btn primary lg" onClick={() => go(cur + 1)}>Next <IconArrow /></button>
            : <button className="btn sun lg" disabled={busy} onClick={() => setConfirm(true)}>Check my answers</button>}
        </div>
      </main>
      <nav className="pr-dots">{c.questions.map((x, i) => <button key={x.id} className={`${answers[x.id] != null ? 'ans' : ''} ${i === cur ? 'cur' : ''}`} onClick={() => go(i)} aria-label={`Question ${i + 1}`}>{i + 1}</button>)}</nav>
      {confirm && <Confirm danger={false} title="Check your answers?" confirmLabel="Yes, check" onClose={() => setConfirm(false)} onConfirm={submit}
        text={c.questions.length - done ? `${c.questions.length - done} question(s) are unanswered and will count as wrong. You need ${c.pass_percent}% to pass.` : `All questions are answered. You need ${c.pass_percent}% to pass.`} />}
      {exit && <Confirm danger={false} title="Leave the level check?" confirmLabel="Save and leave" onClose={() => setExit(false)}
        onConfirm={async () => { await save(); nav(`/lesson/${c.lesson.id}`); }} text="Your answers are saved. You will continue with the same version." />}
    </div>
  );
}

/** Result of one level check with a full review. */
export function LevelCheckResult() {
  const { id } = useParams();
  const st = useAsync(() => api.get('/lesson-checks/' + id), [id]);
  const [tab, setTab] = useState('wrong');
  return (
    <div className="page">
      <Gate state={st}>{(r) => {
        const pct = Math.round((r.score / r.total) * 100);
        const wrong = r.review.filter((q) => q.given !== q.answer);
        const shown = tab === 'wrong' ? wrong : r.review;
        return (
          <>
            {r.passed && <Confetti />}
            <section className={`hero-card lc-hero ${r.passed ? 'ok' : ''}`}>
              <small className="eyebrow">{r.type === 'session' ? 'SESSION CHECK' : 'LEVEL CHECK'} · VERSION {r.version} · {r.lesson.title.toUpperCase()}</small>
              <div className="pl-hero-top">
                <div>
                  <h1>{r.passed ? 'Passed — well done.' : 'Not yet — almost there.'}</h1>
                  <p>{r.passed ? (r.type === 'session' ? 'This part of the course is complete. The next roadmap step is open.' : r.next_lesson ? `“${r.next_lesson.title.replace(/^Lesson \d+:\s*/, '')}” is now open.` : 'You finished every lesson that is ready in this part.') : `You need ${r.pass_percent}% to pass. Review the mistakes below, then try version ${r.next_version}.`}</p>
                </div>
                <div className={`pl-verdict ${r.passed ? 'yes' : 'no'}`}>{r.passed ? <IconCheck /> : <span className="dot" />}<span><b>{r.score} / {r.total}</b><small>{pct}% · pass {r.pass_percent}%</small></span></div>
              </div>
              <div className="row wrap" style={{ marginTop: 20 }}>
                {r.passed && r.type === 'session' ? <Link className="btn primary lg" to="/roadmap">Back to the roadmap <IconArrow /></Link>
                  : r.passed && r.next_lesson ? <Link className="btn primary lg" to={`/lesson/${r.next_lesson.id}`}>Next <IconArrow /></Link>
                  : !r.passed ? <Link className="btn primary lg" to={`/lesson/${r.lesson.id}/check`}>Try version {r.next_version} <IconArrow /></Link> : null}
                <Link className="btn ghost lg on-dark" to={`/lesson/${r.lesson.id}`}>Back to the lesson</Link>
              </div>
            </section>
            <div className="row between wrap">
              <h2>Review</h2>
              <Segmented value={tab} onChange={setTab} options={[{ value: 'wrong', label: 'Mistakes', count: wrong.length }, { value: 'all', label: 'All', count: r.review.length }]} />
            </div>
            <div className="stack">
              {shown.length === 0 && <Card><p className="center muted">No mistakes in this check.</p></Card>}
              {shown.map((q) => (
                <Card key={q.id} className={`rq ${q.given == null ? 'skip' : q.given === q.answer ? 'right' : 'wrong'}`}>
                  <div className="row wrap" style={{ gap: 8 }}><span className="q-num">{r.review.indexOf(q) + 1}</span>{q.kind === 'sat' && <span className="chip domain">SAT question</span>}{q.kind === 'vocab' && <span className="chip sun">Vocabulary</span>}{q.given == null && <span className="chip warn">Not answered</span>}</div>
                  {q.source && <small className="q-source">Source: {q.source}</small>}
                  <p style={{ fontWeight: 600 }}>{rich(q.prompt)}</p>
                  {q.passage && <div className="passage">{rich(q.passage)}</div>}
                  <div className="stack sm">
                    {q.options.map((o, i) => {
                      const right = i === q.answer; const mine = q.given === i;
                      return (
                        <div key={i} className={`ropt ${right ? 'correct' : ''} ${mine && !right ? 'mine-wrong' : ''}`}>
                          <span className="L">{L[i]}</span><span>{rich(o)}</span>
                          {right && <span className="tagr">{mine ? 'Your answer · correct' : 'Correct answer'}</span>}
                          {mine && !right && <span className="tagr">Your answer</span>}
                        </div>
                      );
                    })}
                  </div>
                  {q.explanation && <div className="explain"><b>Why?</b><p>{rich(q.explanation)}</p></div>}
                </Card>
              ))}
            </div>
          </>
        );
      }}</Gate>
    </div>
  );
}
