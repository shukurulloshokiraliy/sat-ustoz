import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { Card, Confetti, Gate, Segmented, useAsync } from '../../components/ui.jsx';
import { IconArrow } from '../../components/icons.jsx';
import { Passage } from '../../components/Passage.jsx';
import { rich } from '../../components/Rich.jsx';
import AskTeacher from '../../components/AskTeacher.jsx';
import ReportMistake from '../../components/ReportMistake.jsx';

const L = ['A', 'B', 'C', 'D'];

/** Result of a full mock: scaled score with range, both modules, then every question with the key. */
export default function FullMockResult() {
  const { aid } = useParams();
  const st = useAsync(() => api.get(`/full-mocks/attempt/${aid}`), [aid]);
  return <div className="page" style={{ maxWidth: 920, margin: '0 auto', width: '100%' }}><Gate state={st}>{(a) => (a.stage === 'done' ? <Result a={a} /> : <Card><p>This mock is still running. <Link to={`/full-mock/${aid}`}>Continue it</Link>.</p></Card>)}</Gate></div>;
}

function Result({ a }) {
  const r = a.result;
  const [tab, setTab] = useState('wrong');
  const [mod, setMod] = useState(0);
  const sec = a.review[mod];
  const list = (sec?.questions || []).map((q, i) => ({ q, i, ok: a.answers[q.id] === q.answer, skipped: a.answers[q.id] == null }))
    .filter((x) => tab === 'all' || (tab === 'wrong' ? !x.ok : x.ok));
  const total = r.m1_total + r.m2_total;
  return (
    <>
      {r.score >= 700 && <Confetti />}
      <section className="mr-hero ok">
        <div>
          <small className="tq-eyebrow">FULL MOCK · {fmtDate(a.finished_at)}</small>
          <h1>{a.mock.title}</h1>
          <p>{r.m1 + r.m2} of {total} correct. Estimated Reading &amp; Writing score {r.score} (likely {r.low}–{r.high}).
            {r.route ? ` Module 1 sent you to the ${r.route === 'hard' ? 'harder' : 'easier'} Module 2${r.route === 'easy' ? ', which caps the section near 630' : ''}.` : ''}</p>
          <div className="row wrap" style={{ gap: 10, marginTop: 14 }}>
            <Link className="btn sun lg" to="/full-mocks">Full Mocks <IconArrow /></Link>
            <Link className="btn on-dark lg" to="/question-bank">Practise weak skills</Link>
          </div>
        </div>
        <div className="mr-side">
          <div className="mr-acc"><b>{r.score}</b><span>R&amp;W score</span></div>
          <small className="mr-pct">{r.low}–{r.high}</small>
        </div>
      </section>

      <div className="mr-groups">
        <div className="mr-group"><span>Module 1</span><b>{r.m1}/{r.m1_total}</b><i><em style={{ width: `${(r.m1 / (r.m1_total || 1)) * 100}%` }} className={r.m1 / (r.m1_total || 1) >= 0.67 ? 'hi' : 'mid'} /></i></div>
        <div className="mr-group"><span>Module 2{r.route ? ` · ${r.route === 'hard' ? 'harder' : 'easier'}` : ''}</span><b>{r.m2}/{r.m2_total}</b><i><em style={{ width: `${(r.m2 / (r.m2_total || 1)) * 100}%` }} className={r.m2 / (r.m2_total || 1) >= 0.67 ? 'hi' : 'mid'} /></i></div>
      </div>

      <div className="row wrap" style={{ gap: 10 }}>
        <Segmented value={mod} onChange={setMod} options={a.review.map((s, i) => ({ value: i, label: i === 0 ? 'Module 1' : 'Module 2' }))} />
        <Segmented value={tab} onChange={setTab} options={[{ value: 'wrong', label: 'Missed' }, { value: 'right', label: 'Correct' }, { value: 'all', label: 'All' }]} />
      </div>
      <div className="stack">
        {list.map(({ q, i, ok, skipped }) => (
          <Card key={q.id} className={`rq ${skipped ? 'skip' : ok ? 'right' : 'wrong'}`}>
            <div className="row wrap" style={{ gap: 8 }}><span className="q-num">{q.n || i + 1}</span>{q.skill && <span className="chip domain">{q.skill}</span>}{q.difficulty && <span className={`chip lvl-${q.difficulty}`}>{q.difficulty}</span>}{skipped && <span className="chip warn">Not answered</span>}
              {!q.options && <span className="chip">Your answer: {skipped ? '—' : L[a.answers[q.id]]} · Correct: {L[q.answer]}</span>}</div>
            {(q.passage || q.table) && <Passage text={q.passage} table={q.table} />}
            {q.prompt && <p style={{ fontWeight: 600 }}>{rich(q.prompt)}</p>}
            {q.options && (
              <ul className="qb-opts-review">
                {q.options.map((o, k) => <li key={k} className={k === q.answer ? 'ok' : k === a.answers[q.id] ? 'bad' : ''}><b>{L[k]})</b> {rich(o)}{k === q.answer ? ' · correct' : k === a.answers[q.id] ? ' · your answer' : ''}</li>)}
              </ul>
            )}
            {q.explanation && <p className="muted">{rich(q.explanation)}</p>}
            <div className="row wrap" style={{ gap: 8 }}><AskTeacher about={`Full mock “${a.mock.title}”, ${sec.label}, question ${q.n || i + 1}`} /><ReportMistake qref={`fullmock:${q.id}`} about={`Full mock ${a.mock.title}, ${sec.label}, question ${q.n || i + 1} (${q.id})`} /></div>
          </Card>
        ))}
        {!list.length && <Card><p className="muted center">Nothing here.</p></Card>}
      </div>
    </>
  );
}
