import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Confirm, ErrorBox, Spinner } from '../../components/ui.jsx';
import { BBFooter, BBNavigator, BBOptions, BBQuestionBar, BBReview, BBShell, BBSplit, Highlightable, useElimination } from '../../components/Bluebook.jsx';
import { Passage } from '../../components/Passage.jsx';
import { rich } from '../../components/Rich.jsx';

const L = ['A', 'B', 'C', 'D'];
const DIRECTIONS = (
  <>
    <p>The questions in this section address a number of important reading and writing skills. Each question includes one or more passages, which may include a table or graph. Read each passage and question carefully, and then choose the best answer to the question based on the passage(s).</p>
    <p>All questions in this section are multiple-choice with four answer choices. Each question has a single best answer.</p>
    <p>Questions come in test order: words in context, reading, grammar, transitions and student notes. Every quiz is a new random set from the Question Bank.</p>
  </>
);

/** A timed random module from the Question Bank in the Bluebook layout. */
export default function MockTaker() {
  const nav = useNavigate();
  const [st, setSt] = useState({ data: null, err: null });
  useEffect(() => { api.post('/qbank/mock', {}).then((data) => setSt({ data })).catch((err) => setSt({ err })); }, []);
  if (st.err) return <div style={{ padding: 40, maxWidth: 520, margin: '0 auto' }}><ErrorBox error={st.err} /><button className="btn ghost" style={{ marginTop: 16 }} onClick={() => nav('/quizzes')}>Back to quizzes</button></div>;
  if (!st.data) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spinner label="Building your quiz…" /></div>;
  return <Runner m={st.data} />;
}

function Runner({ m }) {
  const nav = useNavigate();
  const toast = useToast();
  const qs = m.questions;
  const key = `mock-${m.id}`;
  const [ans, setAns] = useState(() => { try { return { ...m.answers, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return m.answers || {}; } });
  const [marked, setMarked] = useState({});
  const [cur, setCur] = useState(0);
  const [view, setView] = useState('q');
  const [nav2, setNav2] = useState(false);
  const [hl, setHl] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [exit, setExit] = useState(false);
  const [left, setLeft] = useState(m.remaining);
  const sent = useRef(false);
  const el = useElimination();
  const q = qs[cur];

  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(ans)); } catch { /* private mode */ } }, [ans, key]);
  useEffect(() => { const t = setTimeout(() => api.put(`/qbank/mock/${m.id}/progress`, { answers: ans }).catch(() => {}), 1500); return () => clearTimeout(t); }, [ans, m.id]);
  const submit = useCallback(async () => {
    if (sent.current) return;
    sent.current = true;
    try {
      await api.post(`/qbank/mock/${m.id}/submit`, { answers: ans });
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      nav(`/mock/${m.id}`, { replace: true });
    } catch (e) { sent.current = false; toast(e.message, 'bad'); }
  }, [ans, m.id, key, nav, toast]);
  useEffect(() => {
    const end = Date.now() + m.remaining * 1000;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [m.remaining]);
  const submitRef = useRef(submit); submitRef.current = submit;
  useEffect(() => { if (left === 0) { toast('Time is up — here is your result'); submitRef.current(); } }, [left, toast]);

  const go = (i) => { setCur(Math.max(0, Math.min(qs.length - 1, i))); setView('q'); setNav2(false); };
  const choose = (k) => setAns((a) => { const i = L.indexOf(k); return { ...a, [q.id]: a[q.id] === i ? undefined : i }; });
  useEffect(() => {
    const f = (e) => {
      if (view !== 'q' || e.metaKey || e.ctrlKey || e.target.closest('input, textarea, [role=dialog]')) return;
      const k = e.key.toUpperCase();
      if (L.includes(k)) choose(k);
      else if (e.key === 'ArrowRight') (cur < qs.length - 1 ? go(cur + 1) : setView('review'));
      else if (e.key === 'ArrowLeft') go(cur - 1);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  const items = qs.map((x) => ({ answered: ans[x.id] != null, marked: !!marked[x.id] }));
  const unanswered = items.filter((x) => !x.answered).length;
  return (
    <>
      <BBShell title="Reading and Writing · Random module" directions={DIRECTIONS} seconds={left} onExit={() => setExit(true)} exitLabel="Exit"
        highlight={hl} onHighlight={view === 'q' && (q.passage || q.table) ? () => setHl((x) => !x) : null}
        footer={(
          <BBFooter cur={cur} total={qs.length} onOpenNav={() => setNav2(true)}>
            {view === 'review'
              ? <button className="bb-btn ghost" onClick={() => go(qs.length - 1)}>Back</button>
              : <>
                {cur > 0 && <button className="bb-btn ghost" onClick={() => go(cur - 1)}>Back</button>}
                <button className="bb-btn" onClick={() => (cur < qs.length - 1 ? go(cur + 1) : setView('review'))}>Next</button>
              </>}
          </BBFooter>
        )}>
        {view === 'q' ? (
          <BBSplit
            left={(q.passage || q.table) ? <Highlightable key={q.id} on={hl}><Passage text={q.passage} table={q.table} /></Highlightable> : null}
            right={(
              <div key={q.id}>
                <BBQuestionBar n={cur + 1} marked={marked[q.id]} onMark={() => setMarked((x) => ({ ...x, [q.id]: !x[q.id] }))} elim={el.elim} onElim={el.toggleElim} />
                <div className="bb-prompt">{rich(q.prompt)}</div>
                <BBOptions options={q.options.map((o, i) => ({ key: L[i], text: rich(o) }))} choice={ans[q.id] == null ? null : L[ans[q.id]]}
                  eliminated={el.eliminated(q.id)} elim={el.elim} onChoose={choose} onEliminate={(k) => el.toggle(q.id, k)} />
              </div>
            )}
          />
        ) : <BBReview title="Reading and Writing · Random module" items={items} onGo={go} onBack={() => go(qs.length - 1)} onSubmit={() => setConfirm(true)} submitLabel="Submit" />}
      </BBShell>
      {nav2 && <BBNavigator title="Reading and Writing · Random module" items={items} cur={view === 'q' ? cur : -1} onGo={go} onClose={() => setNav2(false)} onReview={() => { setNav2(false); setView('review'); }} />}
      {confirm && <Confirm danger={false} title="Submit your answers?" confirmLabel="Yes, submit" onClose={() => setConfirm(false)} onConfirm={submit}
        text={unanswered ? `${unanswered} question${unanswered === 1 ? ' is' : 's are'} unanswered and will count as wrong.` : 'All questions are answered. Ready to see your result?'} />}
      {exit && <Confirm danger={false} title="Leave the quiz?" confirmLabel="Leave" onClose={() => setExit(false)} onConfirm={() => nav('/quizzes')}
        text="Your answers are saved. The timer keeps running; come back before it ends to finish." />}
    </>
  );
}
