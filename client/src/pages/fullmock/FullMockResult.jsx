import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { Card, Confetti, Gate, Segmented, useAsync } from '../../components/ui.jsx';
import { IconArrow } from '../../components/icons.jsx';
import { Passage } from '../../components/Passage.jsx';
import { rich } from '../../components/Rich.jsx';
import AskTeacher from '../../components/AskTeacher.jsx';
import ReportMistake from '../../components/ReportMistake.jsx';
import { FocusLine } from '../../components/Proctor.jsx';

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

      {a.focus && <FocusLine f={a.focus} seconds={a.report?.time?.total ?? null} />}
      {a.report && <ScoreReport rep={a.report} />}

      <div className="row wrap" style={{ gap: 10 }}>
        <Segmented value={mod} onChange={setMod} options={a.review.map((s, i) => ({ value: i, label: i === 0 ? 'Module 1' : 'Module 2' }))} />
        <Segmented value={tab} onChange={setTab} options={[{ value: 'wrong', label: 'Missed' }, { value: 'right', label: 'Correct' }, { value: 'all', label: 'All' }]} />
      </div>
      <div className="stack">
        {list.map(({ q, i, ok, skipped }) => (
          <Card key={q.id} className={`rq ${skipped ? 'skip' : ok ? 'right' : 'wrong'}`}>
            <div className="row wrap" style={{ gap: 8 }}><span className="q-num">{q.n || i + 1}</span>{q.skill && <span className="chip domain">{q.skill}</span>}{(q.level || q.difficulty) && <span className={`chip lvl-${q.level || q.difficulty}`}>{q.level || q.difficulty}</span>}{q.pretest && <span className="chip" title="Like on the real SAT, 2 questions per module are not scored: they only measure the question">Unscored</span>}{q.pct != null && <span className="q-pct" title={`${q.answered_by} students answered this question`}>{q.pct}% of students got it right</span>}{skipped && <span className="chip warn">Not answered</span>}{q.seconds != null && <span className="q-time">{fmtSec(q.seconds)}</span>}
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

const fmtSec = (s) => { const n = Math.round(Number(s) || 0); return n >= 60 ? `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, '0')}s` : `${n}s`; };
const tone = (p) => (p >= 80 ? 'var(--good)' : p >= 55 ? 'var(--warn)' : 'var(--bad)');

/** Score report: the four SAT domains, time per question, and what to revisit for the two weakest domains. */
function ScoreReport({ rep }) {
  return (
    <>
      <div className="sr-grid">
        <Card className="sr-dom">
          <h2 style={{ fontSize: '1.05rem' }}>By domain</h2>
          {rep.domains.map((d) => (
            <div key={d.domain} className="sr-row">
              <div className="row"><span>{d.domain}</span><b>{d.correct}/{d.total}</b></div>
              <div className="sr-bar" role="img" aria-label={`${d.domain}: ${d.pct}% correct`}><i style={{ width: `${d.pct}%`, background: tone(d.pct) }} /></div>
            </div>
          ))}
          {!rep.domains.length && <p className="muted">This mock has no domain labels on its questions.</p>}
        </Card>
        {rep.time && (
          <Card>
            <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>Time</h2>
            <div className="sr-time">
              <div><b>{fmtSec(rep.time.avg)}</b><span>per question (test pace ≈ 71s)</span></div>
              <div><b>{fmtSec(rep.time.total)}</b><span>in total</span></div>
            </div>
            {rep.time.slowest.length > 0 && (
              <p className="muted" style={{ marginTop: 12, fontSize: '.9rem' }}>Slowest: {rep.time.slowest.map((x) => `Q${x.n} ${fmtSec(x.seconds)}${x.ok ? '' : ' (missed)'}`).join(' · ')}</p>
            )}
          </Card>
        )}
      </div>
      {rep.weak.length > 0 && (
        <Card style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>What to revisit</h2>
          <div className="sr-weak">
            {rep.weak.map((d) => (
              <div key={d.domain} className="sr-weak-item">
                <div className="row between"><b>{d.domain}</b><span>{d.pct}% correct</span></div>
                <div className="row">
                  {d.lessons.map((l) => <Link key={l.step_id} className="btn soft sm" to={l.lesson_id ? `/lesson/${l.lesson_id}` : '/roadmap'}>{l.title}</Link>)}
                  {d.skills.map((s) => <Link key={s.id} className="btn ghost sm" to={`/question-bank/practice?skill=${s.id}&limit=10`}>Practise {s.name}</Link>)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
