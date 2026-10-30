import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Card, Confetti, Gate, Segmented, useAsync } from '../../components/ui.jsx';
import { IconArrow } from '../../components/icons.jsx';
import { Passage } from '../../components/Passage.jsx';
import { rich } from '../../components/Rich.jsx';

const L = ['A', 'B', 'C', 'D'];
const GROUP = { 'Words in Context': 'Words in Context', 'Text Structure and Purpose': 'Reading', 'Cross-Text Connections': 'Reading', 'Central Ideas and Details': 'Reading',
  'Command of Evidence': 'Reading', Inferences: 'Reading', Boundaries: 'Grammar', 'Form, Structure, and Sense': 'Grammar', Transitions: 'Transitions', 'Rhetorical Synthesis': 'Student notes' };

/** Result of a random module: accuracy, per question type, then every question with the key. */
export default function MockResult() {
  const { id } = useParams();
  const st = useAsync(() => api.get('/qbank/mock/' + id), [id]);
  return <div className="page" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}><Gate state={st}>{(m) => <Result m={m} />}</Gate></div>;
}

function Result({ m }) {
  const [tab, setTab] = useState('wrong');
  if (!m.finished) return <Card><p>This quiz is still running. <Link to="/mock">Continue it</Link>.</p></Card>;
  const pct = Math.round((m.score / m.total) * 100);
  const by = {};
  m.questions.forEach((q) => { const g = GROUP[q.skill] || q.skill; const s = (by[g] ||= { n: 0, ok: 0 }); s.n++; s.ok += m.answers[q.id] === q.answer ? 1 : 0; });
  const list = m.questions.map((q, i) => ({ q, i, ok: m.answers[q.id] === q.answer, skipped: m.answers[q.id] == null }))
    .filter((x) => tab === 'all' || (tab === 'wrong' ? !x.ok : x.ok));
  return (
    <>
      {pct >= 80 && <Confetti />}
      <section className={`mr-hero ${pct >= 80 ? 'ok' : ''}`}>
        <div>
          <small className="tq-eyebrow">RANDOM MODULE · RESULT</small>
          <h1>{pct >= 80 ? 'Test-ready accuracy.' : pct >= 60 ? 'Solid. Fix the misses below.' : 'Every miss here is a lesson.'}</h1>
          <p>{m.score} of {m.total} correct. Every answer was added to your Question Bank progress, so “My mistakes” now includes the ones you missed.</p>
          <div className="row wrap" style={{ gap: 10, marginTop: 14 }}>
            <Link className="btn sun lg" to="/mock">New quiz <IconArrow /></Link>
            <Link className="btn on-dark lg" to="/question-bank">Practise in the Question Bank</Link>
          </div>
        </div>
        <div className="mr-acc"><b>{pct}%</b><span>accuracy</span></div>
      </section>

      <div className="mr-groups">
        {Object.entries(by).map(([g, v]) => {
          const p = Math.round((v.ok / v.n) * 100);
          return <div key={g} className="mr-group"><span>{g}</span><b>{v.ok}/{v.n}</b><i><em style={{ width: `${p}%` }} className={p >= 80 ? 'hi' : p >= 50 ? 'mid' : 'lo'} /></i></div>;
        })}
      </div>

      <Segmented value={tab} onChange={setTab} options={[{ value: 'wrong', label: 'Missed', count: m.total - m.score }, { value: 'right', label: 'Correct', count: m.score }, { value: 'all', label: 'All', count: m.total }]} />
      <div className="stack">
        {list.map(({ q, i, ok, skipped }) => (
          <Card key={q.id} className={`rq ${skipped ? 'skip' : ok ? 'right' : 'wrong'}`}>
            <div className="row wrap" style={{ gap: 8 }}><span className="q-num">{i + 1}</span><span className="chip domain">{q.skill}</span><span className={`chip lvl-${q.difficulty}`}>{q.difficulty}</span>{skipped && <span className="chip warn">Not answered</span>}</div>
            {(q.passage || q.table) && <Passage text={q.passage} table={q.table} />}
            <p style={{ fontWeight: 600 }}>{rich(q.prompt)}</p>
            <ul className="qb-opts-review">
              {q.options.map((o, k) => <li key={k} className={k === q.answer ? 'ok' : k === m.answers[q.id] ? 'bad' : ''}><b>{L[k]})</b> {rich(o)}{k === q.answer ? ' · correct' : k === m.answers[q.id] ? ' · your answer' : ''}</li>)}
            </ul>
            {q.explanation && <p className="muted">{rich(q.explanation)}</p>}
            {q.tip && <div className="tip"><b>Ustoz tip:</b> {rich(q.tip)}</div>}
          </Card>
        ))}
        {!list.length && <p className="muted">Nothing here.</p>}
      </div>
    </>
  );
}
