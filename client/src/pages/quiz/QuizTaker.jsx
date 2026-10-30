import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Confirm, Spinner, ErrorBox } from '../../components/ui.jsx';
import { BBFooter, BBNavigator, BBOptions, BBQuestionBar, BBReview, BBShell, BBSplit, Highlightable } from '../../components/Bluebook.jsx';
import PracticeTaker from './PracticeTaker.jsx';
import { withBlanks } from '../../lib.js';


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
  const toast = useToast();

  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [answers, setAnswers] = useState({});
  const [cur, setCur] = useState(0);
  const [view, setView] = useState('question'); // question | review
  const [navOpen, setNavOpen] = useState(false);
  const [hl, setHl] = useState(false);
  const [elimOn, setElimOn] = useState(false);
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

  const items = questions.map((x) => ({ answered: !!answers[x.id]?.choice, marked: !!answers[x.id]?.marked }));
  return (
    <>
      <BBShell title={data.quiz.title} seconds={left} countdown onExit={() => setConfirmExit(true)} exitLabel="Exit"
        directions={DIRECTIONS}
        highlight={hl} onHighlight={view === 'question' && q.passage ? () => setHl((x) => !x) : null}
        tools={<span className={`bb-sync ${sync}`} title="Your answers are saved as you go">{sync === 'synced' ? 'Saved' : sync === 'saving' ? 'Saving…' : 'Offline'}</span>}
        footer={(
          <BBFooter cur={cur} total={questions.length} onOpenNav={() => setNavOpen(true)}>
            {view === 'review'
              ? <button className="bb-btn ghost" onClick={() => go(questions.length - 1)}>Back</button>
              : <>
                {cur > 0 && <button className="bb-btn ghost" onClick={() => go(cur - 1)}>Back</button>}
                <button className="bb-btn" onClick={() => (last ? setView('review') : go(cur + 1))}>Next</button>
              </>}
          </BBFooter>
        )}>
        {view === 'question' ? (
          <BBSplit
            left={q.passage ? <Highlightable key={q.id} on={hl}>{withBlanks(q.passage, (i) => <span key={i} className="blank" aria-label="blank" />)}</Highlightable> : null}
            right={(
              <div key={q.id}>
                <BBQuestionBar n={cur + 1} marked={a.marked} onMark={mark} elim={elimOn} onElim={() => setElimOn((x) => !x)} />
                <div className="bb-prompt">{q.prompt}</div>
                <BBOptions options={q.options} choice={a.choice} eliminated={a.eliminated || []} elim={elimOn} onChoose={choose} onEliminate={eliminate} />
              </div>
            )}
          />
        ) : (
          <BBReview title={data.quiz.title} items={items} onGo={go} onBack={() => go(questions.length - 1)} onSubmit={() => setConfirmSubmit(true)} submitLabel="Submit" />
        )}
      </BBShell>

      {navOpen && <BBNavigator title={data.quiz.title} items={items} cur={view === 'question' ? cur : -1} onGo={go} onClose={() => setNavOpen(false)} onReview={() => { setNavOpen(false); setView('review'); }} />}
      {confirmSubmit && (
        <Confirm danger={false} title="Submit your answers?" confirmLabel="Yes, submit" onClose={() => setConfirmSubmit(false)} onConfirm={finish}
          text={stats.unanswered ? `${stats.unanswered} questions are unanswered. If you submit, they will count as wrong.` : 'All questions are answered. Ready to see your result?'} />
      )}
      {confirmExit && (
        <Confirm danger={false} title="Leave the test?" confirmLabel="Yes, exit" onClose={() => setConfirmExit(false)}
          onConfirm={async () => { await save(); nav('/quizzes'); }} text="Your answers are saved. You can continue from here later (the timer keeps running)." />
      )}
    </>
  );
}

const DIRECTIONS = (
  <>
    <p>The questions in this section address a number of important reading and writing skills. Each question includes one or more passages, which may include a table or graph. Read each passage and question carefully, and then choose the best answer to the question based on the passage(s).</p>
    <p>All questions in this section are multiple-choice with four answer choices. Each question has a single best answer.</p>
    <p>Tools: Highlight marks text in the passage, ABC lets you cross out choices, and Mark for Review flags a question for later. Keys: A–D choose, arrows move between questions.</p>
  </>
);
