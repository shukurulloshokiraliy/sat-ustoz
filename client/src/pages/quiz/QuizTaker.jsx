import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useTheme, useToast } from '../../context.jsx';
import { Confirm, Modal, Spinner, ErrorBox } from '../../components/ui.jsx';
import PracticeTaker from './PracticeTaker.jsx';
import { withBlanks } from '../../lib.js';
import { IconArrow, IconBookmark, IconBookmarkFill, IconChevron, IconEye, IconEyeOff, IconFlag, IconMoon, IconStrike, IconSun, IconX, Logo } from '../../components/icons.jsx';

const pad = (n) => String(n).padStart(2, '0');
const fmtClock = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`.replace(/^00:/, '');

/** Loads (or resumes) the attempt, then shows the exam layout or the practice layout. */
export default function QuizTaker() {
  const { id } = useParams();
  const nav = useNavigate();
  const [state, setState] = useState({ data: null, err: null });
  useEffect(() => {
    let alive = true;
    setState({ data: null, err: null });
    api.post(`/quizzes/${id}/start`).then((data) => alive && setState({ data, err: null })).catch((err) => alive && setState({ data: null, err }));
    return () => { alive = false; };
  }, [id]);
  const { data, err } = state;
  if (err) return (
    <div style={{ padding: 40, maxWidth: 520, margin: '0 auto' }}>
      <ErrorBox error={err} />
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn ghost" onClick={() => nav('/quizzes')}>Back to quizzes</button>
        {err.status === 402 && <button className="btn primary" onClick={() => nav('/subscribe')}>See subscription plans</button>}
      </div>
    </div>
  );
  if (!data) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spinner /></div>;
  return data.mode === 'practice' ? <PracticeTaker key={data.attempt.id} initial={data} /> : <ExamTaker key={data.attempt.id} initial={data} />;
}

/** Exam mode (mocks, readiness check): Bluebook-style, answers revealed only at the end. */
function ExamTaker({ initial }) {
  const nav = useNavigate();
  const { user, refresh } = useAuth();
  const { theme, toggle } = useTheme();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [answers, setAnswers] = useState({});
  const [cur, setCur] = useState(0);
  const [view, setView] = useState('question'); // question | review
  const [navOpen, setNavOpen] = useState(false);
  const [hideTime, setHideTime] = useState(false);
  const [sync, setSync] = useState('synced');
  const [left, setLeft] = useState(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const endAt = useRef(null);
  const finishing = useRef(false);
  const dirty = useRef(false);

  // start / resume
  useEffect(() => {
    let alive = true;
    Promise.resolve(initial).then((d) => {
      if (!alive) return;
      let a = d.progress?.answers || {};
      if (!Object.keys(a).length) {
        try { a = JSON.parse(localStorage.getItem('draft:' + d.attempt.id) || '{}').answers || {}; } catch { /* ignore */ }
      }
      setAnswers(a);
      setCur(Math.min(d.attempt.current || 0, d.questions.length - 1));
      endAt.current = d.remaining != null ? Date.now() + d.remaining * 1000 : null;
      setLeft(d.remaining);
      setData(d);
    }).catch((e) => alive && setErr(e));
    return () => { alive = false; };
  }, [initial]);

  const questions = data?.questions || [];
  const q = questions[cur];
  const attemptId = data?.attempt.id;

  // autosave (debounced) + local backup
  const save = useCallback(async () => {
    if (!attemptId || finishing.current) return;
    setSync('saving');
    try {
      await api.put(`/attempts/${attemptId}/progress`, { progress: { answers }, current: cur });
      dirty.current = false;
      setSync('synced');
    } catch (e) { setSync(e.offline ? 'off' : 'synced'); }
  }, [attemptId, answers, cur]);
  useEffect(() => {
    if (!attemptId) return;
    try { localStorage.setItem('draft:' + attemptId, JSON.stringify({ answers })); } catch { /* ignore */ }
    if (!dirty.current) return;
    setSync('saving');
    const t = setTimeout(save, 500);
    return () => clearTimeout(t);
  }, [answers, cur, attemptId, save]);
  useEffect(() => {
    const f = () => document.visibilityState === 'hidden' && dirty.current && save();
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [save]);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const r = await api.post(`/attempts/${attemptId}/finish`, { progress: { answers } });
      try { localStorage.removeItem('draft:' + attemptId); } catch { /* ignore */ }
      if (data?.quiz?.kind === 'diagnostic') await refresh().catch(() => {});
      nav(`/result/${r.id}`, { replace: true });
    } catch (e) { finishing.current = false; toast(e.message, 'err'); }
  }, [attemptId, answers, nav, toast, data, refresh]);

  // timer
  useEffect(() => {
    if (endAt.current == null) return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) { clearInterval(t); toast("Time is up — calculating your result"); finish(); }
    }, 500);
    return () => clearInterval(t);
  }, [data, finish, toast]);

  const patch = (qid, fn) => { dirty.current = true; setAnswers((a) => ({ ...a, [qid]: fn(a[qid] || {}) })); };
  const choose = (key) => q && patch(q.id, (x) => ({ ...x, choice: x.choice === key ? null : key, eliminated: (x.eliminated || []).filter((k) => k !== key) }));
  const eliminate = (key) => q && patch(q.id, (x) => {
    const el = new Set(x.eliminated || []); el.has(key) ? el.delete(key) : el.add(key);
    return { ...x, eliminated: [...el], choice: x.choice === key ? null : x.choice };
  });
  const mark = () => q && patch(q.id, (x) => ({ ...x, marked: !x.marked }));
  const go = (i) => { dirty.current = true; setCur(Math.max(0, Math.min(questions.length - 1, i))); setView('question'); setNavOpen(false); };

  // keyboard
  useEffect(() => {
    const f = (e) => {
      if (/input|textarea|select/i.test(e.target.tagName) || e.metaKey || e.ctrlKey) return;
      const k = e.key.toUpperCase();
      if (view === 'question' && ['A', 'B', 'C', 'D', '1', '2', '3', '4'].includes(k)) {
        const key = 'ABCD'['ABCD1234'.indexOf(k) % 4];
        if (q?.options.some((o) => o.key === key)) choose(key);
      } else if (e.key === 'ArrowRight' && view === 'question') cur < questions.length - 1 ? go(cur + 1) : setView('review');
      else if (e.key === 'ArrowLeft' && view === 'question') go(cur - 1);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  const stats = useMemo(() => {
    const answered = questions.filter((x) => answers[x.id]?.choice).length;
    return { answered, unanswered: questions.length - answered, marked: questions.filter((x) => answers[x.id]?.marked).length };
  }, [questions, answers]);

  if (err) return (
    <div style={{ padding: 40, maxWidth: 520, margin: '0 auto' }}>
      <ErrorBox error={err} />
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn ghost" onClick={() => nav('/quizzes')}>Back to quizzes</button>
        {err.status === 402 && <button className="btn primary" onClick={() => nav('/subscribe')}>See subscription plans</button>}
      </div>
    </div>
  );
  if (!data) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spinner /></div>;

  const a = answers[q.id] || {};
  const last = cur === questions.length - 1;

  return (
    <div className="qz">
      <header className="qz-head">
        <div className="qz-title"><Logo size={20} /><span>{data.quiz.title}</span></div>
        <div className="qz-timer">
          {left != null ? (
            <div className="time-wrap">
              <span className={`time ${left < 60 ? 'low' : ''}`}>{hideTime ? "Time hidden" : fmtClock(left)}
                <button onClick={() => setHideTime((h) => !h)} aria-label={hideTime ? "Show time" : "Hide time"}>{hideTime ? <IconEye width={18} height={18} /> : <IconEyeOff width={18} height={18} />}</button>
              </span>
              <div><span className={`sync ${sync === 'synced' ? '' : sync === 'saving' ? 'saving' : 'off'}`}>{sync === 'synced' ? 'Synced' : sync === 'saving' ? 'Saving…' : 'Offline'}</span></div>
            </div>
          ) : <span className={`sync ${sync === 'synced' ? '' : sync === 'saving' ? 'saving' : 'off'}`}>{sync === 'synced' ? 'Synced' : sync === 'saving' ? 'Saving…' : 'Offline'}</span>}
        </div>
        <div className="qz-actions">
          <button className="icon-btn" onClick={toggle} aria-label={"Toggle theme"}>{theme === 'dark' ? <IconSun /> : <IconMoon />}</button>
          <button className="btn ghost sm" onClick={() => setConfirmExit(true)}><IconX width={16} height={16} /> {"Exit quiz"}</button>
        </div>
      </header>

      {view === 'question' ? (
        <div className="qz-body" key={q.id}>
          <div className="qz-left"><p style={{ whiteSpace: 'pre-line' }}>{withBlanks(q.passage, (i) => <span key={i} className="blank" aria-label="blank" />)}</p></div>
          <div className="qz-right">
            <div className="qz-tag">
              <span className="n">{cur + 1}</span>
              <button className={a.marked ? 'on' : ''} onClick={mark} aria-pressed={!!a.marked}>
                {a.marked ? <IconBookmarkFill /> : <IconBookmark />} Mark for review
              </button>
            </div>
            <p className="qz-prompt">{q.prompt}</p>
            <div className="opts">
              {q.options.map((o) => {
                const el = (a.eliminated || []).includes(o.key);
                return (
                  <div key={o.key} className={`opt ${el ? 'elim' : ''}`}>
                    <button className={`opt-main ${a.choice === o.key ? 'sel' : ''}`} onClick={() => choose(o.key)} aria-pressed={a.choice === o.key}>
                      <span className="L">{o.key}</span><span>{o.text}</span>
                    </button>
                    <button className={`elim-btn ${el ? 'on' : ''}`} onClick={() => eliminate(o.key)} aria-label={`Eliminate option ${o.key}`} title={"Eliminate"}><IconStrike /></button>
                  </div>
                );
              })}
            </div>
            <small className="muted">{"Keys:"} <span className="kbd">A</span>–<span className="kbd">D</span> {"select ·"} <span className="kbd">←</span> <span className="kbd">→</span> {"navigate"}</small>
          </div>
        </div>
      ) : (
        <div style={{ overflow: 'auto', padding: '24px clamp(12px, 3vw, 40px)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 16 }} className="page">
            <div><h1>{"Check your answers"}</h1><p className="muted">{stats.answered}/{questions.length} {"answered"}{stats.marked ? ` · ${stats.marked} flagged` : ''}.</p></div>
            <div className="review-grid">
              {questions.map((x, i) => {
                const an = answers[x.id] || {};
                return (
                  <button key={x.id} className="review-row" onClick={() => go(i)}>
                    <span className="q-num">{i + 1}</span>
                    <span className="snip">{x.passage}</span>
                    <span className="row" style={{ gap: 6 }}>
                      {an.marked && <span className="chip bad"><IconFlag width={13} height={13} /> Review</span>}
                      <span className={`chip ${an.choice ? 'good' : 'warn'}`}>{an.choice ? `Answer: ${an.choice}` : "Unanswered"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="row between wrap">
              <button className="btn ghost" onClick={() => go(questions.length - 1)}>{"Back to questions"}</button>
              <button className="btn primary lg" onClick={() => setConfirmSubmit(true)}>{"Finish and see results"} <IconArrow /></button>
            </div>
          </div>
        </div>
      )}

      <footer className="qz-foot">
        <div className="who">{user.name}</div>
        <button className="pill-dark qz-nav" onClick={() => setNavOpen(true)}>Question {cur + 1} of {questions.length} <IconChevron width={16} height={16} /></button>
        <div className="qz-btns">
          <button className="btn soft" onClick={() => (view === 'review' ? go(questions.length - 1) : go(cur - 1))} disabled={view === 'question' && cur === 0}>Back</button>
          {view === 'question' && (last
            ? <button className="btn primary" onClick={() => setView('review')}>Review</button>
            : <button className="btn primary" onClick={() => go(cur + 1)}>Next</button>)}
        </div>
      </footer>

      {navOpen && (
        <Modal title={data.quiz.title} onClose={() => setNavOpen(false)}>
          <div className="legend"><span>⬤ Current</span><span><i /> Unanswered</span><span><i className="a" /> Answered</span><span><IconFlag width={14} height={14} style={{ color: 'var(--bad)' }} /> For Review</span></div>
          <div className="nav-grid">
            {questions.map((x, i) => {
              const an = answers[x.id] || {};
              return (
                <button key={x.id} className={`nbtn ${an.choice ? 'answered' : ''} ${i === cur && view === 'question' ? 'current' : ''}`} onClick={() => go(i)} aria-label={`Question ${i + 1}`}>
                  {i + 1}{an.marked && <IconFlag className="flag" />}
                </button>
              );
            })}
          </div>
          <div className="center"><button className="btn ghost" onClick={() => { setNavOpen(false); setView('review'); }}>Go to review page</button></div>
        </Modal>
      )}
      {confirmSubmit && (
        <Confirm danger={false} title={"Finish the quiz?"} confirmLabel={"Yes, finish"} onClose={() => setConfirmSubmit(false)} onConfirm={finish}
          text={stats.unanswered ? `${stats.unanswered} questions are unanswered. If you finish, they will count as wrong.` : "All questions are answered. Ready to see your result?"} />
      )}
      {confirmExit && (
        <Confirm danger={false} title={"Leave the quiz?"} confirmLabel={"Yes, exit"} onClose={() => setConfirmExit(false)}
          onConfirm={async () => { await save(); nav('/quizzes'); }} text={"Your answers are saved. You can continue from here later (the timer keeps running)."} />
      )}
    </div>
  );
}
