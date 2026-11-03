import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getToken } from '../../api.js';
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
    <p>This is a full mock: Module 1, a short break, then Module 2. How you do in Module 1 decides whether Module 2 is harder or easier.</p>
  </>
);

/** Plays a full mock: Module 1 → break → Module 2 → result. Questions in the Bluebook layout, or the PDF with an answer sheet. */
export default function FullMockTaker() {
  const { aid } = useParams();
  const nav = useNavigate();
  const [st, setSt] = useState({ data: null, err: null });
  const load = useCallback(() => api.get(`/full-mocks/attempt/${aid}`).then((data) => {
    if (data.stage === 'done') nav(`/full-mock/result/${aid}`, { replace: true });
    else setSt({ data });
  }).catch((err) => setSt({ err })), [aid, nav]);
  useEffect(() => { load(); }, [load]);
  if (st.err) return <div style={{ padding: 40, maxWidth: 520, margin: '0 auto' }}><ErrorBox error={st.err} /><button className="btn ghost" style={{ marginTop: 16 }} onClick={() => nav('/full-mocks')}>Back to Full Mocks</button></div>;
  if (!st.data) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spinner label="Opening your mock…" /></div>;
  return <Module key={`${st.data.id}-${st.data.stage}`} a={st.data} onNext={(d) => (d.stage === 'done' ? nav(`/full-mock/result/${aid}`, { replace: true }) : setSt({ data: d }))} />;
}

function Module({ a, onNext }) {
  const nav = useNavigate();
  const toast = useToast();
  const qs = a.questions;
  const pdf = a.mock.mode === 'pdf';
  const key = `fm-${a.id}-${a.stage}`;
  const [intro, setIntro] = useState(a.stage === 'm2');
  const [ans, setAns] = useState(() => { try { return { ...a.answers, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return a.answers || {}; } });
  const [marked, setMarked] = useState({});
  const [cur, setCur] = useState(0);
  const [view, setView] = useState('q');
  const [nav2, setNav2] = useState(false);
  const [hl, setHl] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [exit, setExit] = useState(false);
  const [left, setLeft] = useState(a.remaining);
  const sent = useRef(false);
  const el = useElimination();
  const q = qs[cur];
  const title = `Reading and Writing · ${a.stage === 'm1' ? 'Module 1' : 'Module 2'}`;

  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(ans)); } catch { /* private mode */ } }, [ans, key]);
  useEffect(() => { const t = setTimeout(() => api.put(`/full-mocks/attempt/${a.id}`, { answers: ans }).catch(() => {}), 1500); return () => clearTimeout(t); }, [ans, a.id]);
  const finish = useCallback(async () => {
    if (sent.current) return;
    sent.current = true;
    try {
      const d = await api.post(`/full-mocks/attempt/${a.id}/next`, { answers: ans });
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      onNext(d);
    } catch (e) { sent.current = false; toast(e.message, 'bad'); }
  }, [ans, a.id, key, onNext, toast]);
  useEffect(() => {
    if (intro) return undefined;
    const end = Date.now() + left * 1000;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [intro]); // eslint-disable-line react-hooks/exhaustive-deps
  const finishRef = useRef(finish); finishRef.current = finish;
  useEffect(() => { if (left === 0 && !intro) { toast('Time is up for this module'); finishRef.current(); } }, [left, intro, toast]);

  const go = (i) => { setCur(Math.max(0, Math.min(qs.length - 1, i))); setView('q'); setNav2(false); };
  const choose = (qid, k) => setAns((x) => { const i = L.indexOf(k); return { ...x, [qid]: x[qid] === i ? undefined : i }; });
  useEffect(() => {
    if (pdf) return undefined;
    const f = (e) => {
      if (view !== 'q' || intro || e.metaKey || e.ctrlKey || e.target.closest('input, textarea, [role=dialog]')) return;
      const k = e.key.toUpperCase();
      if (L.includes(k)) choose(q.id, k);
      else if (e.key === 'ArrowRight') (cur < qs.length - 1 ? go(cur + 1) : setView('review'));
      else if (e.key === 'ArrowLeft') go(cur - 1);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  if (intro) return (
    <div className="fm-break">
      <small>MODULE 1 COMPLETE</small>
      <h1>Ready for Module 2?</h1>
      <p>Module 2 has {qs.length} questions and {a.mock.minutes} minutes. The timer starts when you press Start. On test day you would have a short break here.</p>
      <button className="btn sun lg" onClick={() => setIntro(false)}>Start Module 2</button>
    </div>
  );

  const items = qs.map((x) => ({ answered: ans[x.id] != null, marked: !!marked[x.id] }));
  const unanswered = items.filter((x) => !x.answered).length;
  const nextLabel = a.stage === 'm1' ? 'Submit Module 1' : 'Submit test';
  return (
    <>
      <BBShell title={`${a.mock.title} · ${a.stage === 'm1' ? 'Module 1' : 'Module 2'}`} directions={DIRECTIONS} seconds={left} onExit={() => setExit(true)} exitLabel="Exit"
        highlight={!pdf && hl} onHighlight={!pdf && view === 'q' && q?.passage ? () => setHl((x) => !x) : null}
        footer={pdf ? (
          <footer className="bb-foot"><span className="muted">{qs.length - unanswered} of {qs.length} answered</span><button className="bb-btn" onClick={() => setConfirm(true)}>{nextLabel}</button></footer>
        ) : (
          <BBFooter cur={cur} total={qs.length} onOpenNav={() => setNav2(true)}>
            {view === 'review'
              ? <button className="bb-btn ghost" onClick={() => go(qs.length - 1)}>Back</button>
              : <>
                {cur > 0 && <button className="bb-btn ghost" onClick={() => go(cur - 1)}>Back</button>}
                <button className="bb-btn" onClick={() => (cur < qs.length - 1 ? go(cur + 1) : setView('review'))}>Next</button>
              </>}
          </BBFooter>
        )}>
        {pdf ? (
          <BBSplit
            left={<MockPdf id={a.mock.id} />}
            right={(
              <div className="fm-sheet">
                <h3>Answer sheet · {a.stage === 'm1' ? 'Module 1' : 'Module 2'}</h3>
                <p className="muted">Find the questions for this module in the PDF and mark your answers here.</p>
                {qs.map((x) => (
                  <div key={x.id} className="fm-row"><span>{x.n}</span>
                    {L.map((k, i) => <button key={k} type="button" className={ans[x.id] === i ? 'on' : ''} onClick={() => choose(x.id, k)} aria-label={`Question ${x.n}: ${k}`}>{k}</button>)}
                  </div>
                ))}
              </div>
            )} />
        ) : view === 'q' ? (
          <BBSplit
            left={q.passage ? <Highlightable key={q.id} on={hl}><Passage text={q.passage} /></Highlightable> : null}
            right={(
              <div key={q.id}>
                <BBQuestionBar n={cur + 1} marked={marked[q.id]} onMark={() => setMarked((x) => ({ ...x, [q.id]: !x[q.id] }))} elim={el.elim} onElim={el.toggleElim} />
                <div className="bb-prompt">{rich(q.prompt)}</div>
                <BBOptions options={q.options.map((o, i) => ({ key: L[i], text: rich(o) }))} choice={ans[q.id] == null ? null : L[ans[q.id]]}
                  eliminated={el.eliminated(q.id)} elim={el.elim} onChoose={(k) => choose(q.id, k)} onEliminate={(k) => el.toggle(q.id, k)} />
              </div>
            )}
          />
        ) : <BBReview title={title} items={items} onGo={go} onBack={() => go(qs.length - 1)} onSubmit={() => setConfirm(true)} submitLabel={nextLabel} />}
      </BBShell>
      {nav2 && <BBNavigator title={title} items={items} cur={view === 'q' ? cur : -1} onGo={go} onClose={() => setNav2(false)} onReview={() => { setNav2(false); setView('review'); }} />}
      {confirm && <Confirm danger={false} title={a.stage === 'm1' ? 'Submit Module 1?' : 'Submit the test?'} confirmLabel="Yes, submit" onClose={() => setConfirm(false)} onConfirm={finish}
        text={`${unanswered ? `${unanswered} question${unanswered === 1 ? ' is' : 's are'} unanswered and will count as wrong. ` : ''}You cannot come back to this module.`} />}
      {exit && <Confirm danger={false} title="Leave the mock?" confirmLabel="Leave" onClose={() => setExit(false)} onConfirm={() => nav('/full-mocks')}
        text="Your answers are saved, but the module timer keeps running. Come back before it ends." />}
    </>
  );
}

/** The mock's PDF (fetched with the sign-in token, shown from a blob URL). */
function MockPdf({ id }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let u;
    fetch(`/api/full-mocks/${id}/pdf`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Could not open the PDF'))))
      .then((b) => { u = URL.createObjectURL(b); setUrl(u); }).catch((e) => setErr(e.message));
    return () => u && URL.revokeObjectURL(u);
  }, [id]);
  if (err) return <p className="error-box">{err}</p>;
  if (!url) return <Spinner label="Loading the PDF…" />;
  return (
    <div className="fm-pdf-wrap">
      <iframe className="fm-pdf" title="Mock PDF" src={`${url}#view=FitH`} />
      <a className="link-btn" href={url} target="_blank" rel="noreferrer">Open the PDF in a new tab</a>
    </div>
  );
}
