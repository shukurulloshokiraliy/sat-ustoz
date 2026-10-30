import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confetti, ErrorBox, Spinner } from '../../components/ui.jsx';
import { IconArrow, IconCheck } from '../../components/icons.jsx';
import { BBPracticeRunner } from '../../components/Bluebook.jsx';
import { Passage } from '../../components/Passage.jsx';
import { rich } from '../../components/Rich.jsx';

const L = ['A', 'B', 'C', 'D'];
const LEVEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** One practice set from the Question Bank: answer → check → explanation → next. */
export default function QbankPractice() {
  const { search } = useLocation();
  const nav = useNavigate();
  const [state, setState] = useState({ data: null, err: null });
  useEffect(() => {
    setState({ data: null, err: null });
    api.get('/qbank/questions' + search).then((data) => setState({ data })).catch((err) => setState({ err }));
  }, [search]);

  if (state.err) return (
    <div style={{ padding: 40, maxWidth: 520, margin: '0 auto' }}>
      <ErrorBox error={state.err} />
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn ghost" onClick={() => nav('/question-bank')}>Back to the Question Bank</button>
        {state.err.status === 402 && <button className="btn primary" onClick={() => nav('/subscribe')}>See plans</button>}
      </div>
    </div>
  );
  if (!state.data) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spinner label="Picking your questions…" /></div>;
  if (!state.data.questions.length) return (
    <div style={{ padding: 40, maxWidth: 560, margin: '0 auto', textAlign: 'center', display: 'grid', gap: 14 }}>
      <h2>{state.data.status === 'mistakes' ? 'No mistakes to review here' : 'You have answered every question here'}</h2>
      <p className="muted">{state.data.status === 'mistakes' ? 'Every question you answered in this area is now correct. Try new questions instead.' : 'Choose “All” to practise them again, or pick another skill.'}</p>
      <div className="row" style={{ justifyContent: 'center' }}><Link className="btn primary" to="/question-bank">Back to the Question Bank</Link></div>
    </div>
  );
  return <Runner key={search} questions={state.data.questions} search={search} />;
}

function Runner({ questions, search }) {
  const nav = useNavigate();
  const toast = useToast();
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState({});       // id → choice index
  const [rv, setRv] = useState({});         // id → result from the server
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [secs, setSecs] = useState(0);
  useEffect(() => { const t = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const checked = Object.keys(rv).length;

  const check = async (q) => {
    if (sel[q.id] == null || rv[q.id]) return;
    setBusy(true);
    try { const res = await api.post(`/qbank/questions/${encodeURIComponent(q.id)}/check`, { choice: sel[q.id] }); setRv((s) => ({ ...s, [q.id]: res })); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };

  if (done) return <Summary questions={questions} rv={rv} search={search} />;
  const items = questions.map((q) => ({
    id: q.id,
    passage: (q.passage || q.table) ? <Passage text={q.passage} table={q.table} /> : null,
    prompt: rich(q.prompt),
    meta: <><span>{q.skill}</span><span className={`chip lvl-${q.difficulty}`}>{LEVEL[q.difficulty]}</span></>,
    options: q.options.map((o, i) => ({ key: L[i], text: rich(o) })),
  }));
  return (
    <BBPracticeRunner
      title="Question Bank: Reading and Writing" directions={DIRECTIONS}
      questions={items} cur={cur} setCur={setCur} busy={busy} seconds={secs} countdown={false}
      choice={(id) => (sel[id] == null ? null : L[sel[id]])}
      onChoose={(id, k) => !rv[id] && setSel((s) => ({ ...s, [id]: L.indexOf(k) }))}
      reveal={(id) => { const r = rv[id]; return r ? { correct: L[r.answer], ok: r.correct, explanation: r.explanation ? rich(r.explanation) : null, tip: r.tip ? rich(r.tip) : null } : null; }}
      onCheck={(q) => check(questions.find((x) => x.id === q.id))}
      onExit={() => (checked ? setDone(true) : nav('/question-bank'))}
      onFinish={() => setDone(true)} finishLabel="See results"
    />
  );
}

const DIRECTIONS = (
  <>
    <p>The questions in this section address a number of important reading and writing skills. Each question includes one or more passages, which may include a table or graph. Read each passage and question carefully, and then choose the best answer to the question based on the passage(s).</p>
    <p>All questions in this section are multiple-choice with four answer choices. Each question has a single best answer.</p>
    <p>In this practice set you check each answer right away and see the explanation. Keys: A–D choose, Enter checks, arrows move between questions.</p>
  </>
);

function Summary({ questions, rv, search }) {
  const nav = useNavigate();
  const answered = questions.filter((q) => rv[q.id]);
  const right = answered.filter((q) => rv[q.id].correct).length;
  const pct = answered.length ? Math.round((right / answered.length) * 100) : 0;
  const bySkill = {};
  answered.forEach((q) => { const s = (bySkill[q.skill] ||= { n: 0, ok: 0 }); s.n++; s.ok += rv[q.id].correct ? 1 : 0; });
  const again = (status) => { const p = new URLSearchParams(search); p.set('status', status); nav('/question-bank/practice?' + p.toString()); };
  return (
    <div className="page" style={{ maxWidth: 820, margin: '0 auto' }}>
      {pct >= 80 && answered.length >= 5 && <Confetti />}
      <section className={`hero-card lc-hero ${pct >= 80 ? 'ok' : ''}`}>
        <small className="eyebrow">QUESTION BANK · PRACTICE SET</small>
        <div className="pl-hero-top">
          <div>
            <h1>{pct >= 80 ? 'Strong set — keep going.' : pct >= 50 ? 'Good work — review the misses.' : 'Every mistake here is a lesson.'}</h1>
            <p>{answered.length < questions.length ? `You checked ${answered.length} of ${questions.length} questions.` : `You checked all ${questions.length} questions.`} Mistakes are saved, so you can practise them again later.</p>
          </div>
          <div className={`pl-verdict ${pct >= 80 ? 'yes' : 'no'}`}>{pct >= 80 ? <IconCheck /> : <span className="dot" />}<span><b>{right} / {answered.length}</b><small>{pct}% correct</small></span></div>
        </div>
        <div className="row wrap" style={{ marginTop: 20 }}>
          <button className="btn primary lg" onClick={() => again('new')}>New questions <IconArrow /></button>
          {right < answered.length && <button className="btn soft lg" onClick={() => again('mistakes')}>Practise my mistakes</button>}
          <Link className="btn ghost lg" to="/question-bank">Question Bank</Link>
        </div>
      </section>

      {Object.keys(bySkill).length > 1 && (
        <Card style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 10 }}>By skill</h2>
          <div className="qb-sum-skills">{Object.entries(bySkill).map(([k, v]) => <div key={k}><span>{k}</span><b>{v.ok}/{v.n}</b></div>)}</div>
        </Card>
      )}

      <div className="qb-review">
        {questions.map((q, i) => {
          const res = rv[q.id];
          return (
            <Card key={q.id} className={`rq ${!res ? 'skip' : res.correct ? 'right' : 'wrong'}`}>
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="q-num">{i + 1}</span><span className="chip domain">{q.skill}</span><span className={`chip lvl-${q.difficulty}`}>{LEVEL[q.difficulty]}</span>
                {!res && <span className="chip warn">Not checked</span>}
              </div>
              {(q.passage || q.table) && <Passage text={q.passage} table={q.table} />}
              <p style={{ fontWeight: 600 }}>{rich(q.prompt)}</p>
              {res && (
                <>
                  <ul className="qb-opts-review">
                    {q.options.map((o, k) => <li key={k} className={k === res.answer ? 'ok' : k === res.choice ? 'bad' : ''}><b>{L[k]})</b> {rich(o)}{k === res.answer ? ' · correct' : k === res.choice ? ' · your answer' : ''}</li>)}
                  </ul>
                  <p className="muted">{rich(res.explanation)}</p>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
