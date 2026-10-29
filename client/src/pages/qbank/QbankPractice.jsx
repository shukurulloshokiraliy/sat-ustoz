import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confetti, ErrorBox, Spinner } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconX, Logo } from '../../components/icons.jsx';
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
  const [sel, setSel] = useState({});       // id → choice
  const [rv, setRv] = useState({});         // id → result from the server
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const q = questions[cur];
  const r = rv[q.id];
  const last = cur === questions.length - 1;
  const checked = Object.keys(rv).length;

  const check = async () => {
    if (sel[q.id] == null || r) return;
    setBusy(true);
    try { const res = await api.post(`/qbank/questions/${encodeURIComponent(q.id)}/check`, { choice: sel[q.id] }); setRv((s) => ({ ...s, [q.id]: res })); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const next = () => { if (last) setDone(true); else { setCur(cur + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); } };

  useEffect(() => {
    if (done) return undefined;
    const f = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea/i.test(e.target.tagName)) return;
      const i = L.indexOf(e.key.toUpperCase());
      if (i >= 0 && !r) setSel((s) => ({ ...s, [q.id]: i }));
      else if (e.key === 'Enter') { e.preventDefault(); r ? next() : check(); }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  if (done) return <Summary questions={questions} rv={rv} search={search} />;

  return (
    <div className="pr">
      <header className="pr-top">
        <Logo size={22} />
        <div className="row" style={{ gap: 8 }}>
          <span className="timer-chip">{checked} / {questions.length}</span>
          <button className="icon-btn" onClick={() => (checked ? setDone(true) : nav('/question-bank'))} aria-label={checked ? 'Finish and see results' : 'Leave practice'} title={checked ? 'Finish and see results' : 'Leave'}><IconX /></button>
        </div>
      </header>

      <main className="pr-card" key={q.id}>
        <div className="pr-meta">
          <span>{q.skill} · {cur + 1} / {questions.length}</span>
          <span className={`chip lvl-${q.difficulty}`}>{LEVEL[q.difficulty]}</span>
        </div>
        <div className="progress"><span style={{ width: `${(checked / questions.length) * 100}%` }} /></div>

        {r && (
          <div className={`pr-verdict ${r.correct ? 'right' : 'wrong'}`} role="status">
            <h2>{r.correct ? 'Correct — nice work!' : 'Not quite — look at the explanation.'}</h2>
          </div>
        )}

        {(q.passage || q.table) && <Passage text={q.passage} table={q.table} />}
        <p className="pr-prompt">{rich(q.prompt)}</p>

        <div className="pr-opts" role="radiogroup" aria-label="Answer choices">
          {q.options.map((o, i) => {
            const mine = sel[q.id] === i;
            const st = r ? (i === r.answer ? 'correct' : mine ? 'wrong' : 'dim') : mine ? 'sel' : '';
            return (
              <button key={i} type="button" role="radio" aria-checked={mine} disabled={!!r} className={`pr-opt ${st}`} onClick={() => setSel((s) => ({ ...s, [q.id]: i }))}>
                <span className="L">{L[i]})</span>
                <span className="t">{rich(o)}</span>
                {st === 'wrong' && <span className="tag">· your answer</span>}
                {st === 'correct' && <span className="tag">{mine ? '· your answer · correct' : '· correct'}</span>}
                {st === 'correct' && <IconCheck className="ok" width={18} height={18} />}
              </button>
            );
          })}
        </div>

        {r && (
          <div className="pr-explain">
            {r.explanation && <p>{rich(r.explanation)}</p>}
            {r.tip && <div className="tip"><b>Ustoz tip:</b> {rich(r.tip)}</div>}
          </div>
        )}

        {!r
          ? <button className="btn primary lg block" disabled={sel[q.id] == null || busy} onClick={check}>{busy ? 'Checking…' : 'Check answer'}</button>
          : <button className="btn primary lg block" onClick={next}>{last ? 'See my results' : 'Next question'} <IconArrow /></button>}
        <p className="pr-hint">{!r ? (sel[q.id] != null ? 'Press Enter to check' : 'Choose an answer — keys A–D work too') : 'Press Enter to continue'}</p>
      </main>

      <nav className="pr-dots" aria-label="Questions">
        {questions.map((x, i) => {
          const res = rv[x.id];
          const st = res ? (res.correct ? 'right' : 'wrong') : '';
          return <button key={x.id} className={`${st} ${i === cur ? 'cur' : ''}`} onClick={() => setCur(i)} aria-label={`Question ${i + 1}`}>{i + 1}</button>;
        })}
        {checked > 0 && <button className="btn sun sm" onClick={() => setDone(true)}>Finish</button>}
      </nav>
    </div>
  );
}

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
