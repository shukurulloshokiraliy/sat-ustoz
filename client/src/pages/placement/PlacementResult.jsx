import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAuth } from '../../context.jsx';
import { Card, Gate, Segmented, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconX } from '../../components/icons.jsx';
import { withBlanks } from '../../lib.js';
import { DataTable } from './PlacementTest.jsx';

const L = ['A', 'B', 'C', 'D', 'E'];
const pct = (v) => ((v - 200) / 600) * 100;
const blank = (i) => <span key={i} className="blank" aria-label="blank" />;

export default function PlacementResult() {
  const { id } = useParams();
  const st = useAsync(() => api.get('/placement/result/' + id), [id]);
  return <div className="page"><Gate state={st}>{(r) => <ResultView r={r} />}</Gate></div>;
}

function ResultView({ r }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('mistakes');
  const isTeacher = user.role === 'master';
  const g = r.grammar;
  const levels = g.bands.map((b) => b.level);
  const minIdx = levels.indexOf(g.admission_minimum_level);
  const lvlIdx = levels.indexOf(g.level);
  const shown = r.review.filter((q) => tab === 'all' || !q.correct);

  return (
    <>
      <section className="hero-card pl-hero">
        <small className="eyebrow">PLACEMENT TEST · {fmtDate(r.finished_at)}{isTeacher ? ` · ${r.student.name}` : ''}</small>
        <div className="pl-hero-top">
          <div>
            <h1>{r.advice.headline}</h1>
            <p>{r.advice.message}</p>
          </div>
          <div className={`pl-verdict ${r.admitted ? 'yes' : 'no'}`}>
            {r.admitted ? <IconCheck /> : <span className="dot" />}
            <span><b>{r.admitted ? 'Ready for the course' : 'Not yet'}</b><small>{r.admitted ? `Grammar level ${g.level}` : `${g.admission_minimum_level} needed · you are ${g.level}`}</small></span>
          </div>
        </div>
        {r.advice.uz && <div className="tip pl-uz"><b>Ustoz maslahati:</b> {r.advice.uz}</div>}
        {!isTeacher && (
          <div className="row wrap" style={{ marginTop: 22 }}>
            {r.admitted
              ? <Link className="btn primary lg" to="/roadmap">Open my roadmap <IconArrow /></Link>
              : <Link className="btn primary lg" to="/placement">Retake later</Link>}
            <Link className="btn ghost lg on-dark" to="/">Go to dashboard</Link>
          </div>
        )}
      </section>

      <div className="grid g3 stagger">
        <Card className="pl-score">
          <small className="muted">Part 1 · Grammar</small>
          <div className="pl-big"><b>{g.level}</b><span>{g.points} / {g.total} points</span></div>
          <div className="cefr" role="img" aria-label={`CEFR level ${g.level}; the course needs ${g.admission_minimum_level}`}>
            {levels.map((l, i) => (
              <div key={l} className={`cefr-seg ${i === lvlIdx ? 'me' : ''} ${i <= lvlIdx ? 'fill' : ''} ${i === minIdx ? 'min' : ''}`}>
                <span>{l}</span>
              </div>
            ))}
          </div>
          <small className="muted">The SAT course starts at {g.admission_minimum_level}.</small>
        </Card>
        <Card className="pl-score">
          <small className="muted">Part 2 · SAT Reading and Writing</small>
          <div className="pl-big"><b>{r.sat.points}<i>/{r.sat.total}</i></b><span>correct</span></div>
          <div className="progress"><span className={r.sat.points / r.sat.total >= 0.6 ? 'good' : ''} style={{ width: `${(r.sat.points / r.sat.total) * 100}%` }} /></div>
          <small className="muted">Short SAT-style questions across all four domains.</small>
        </Card>
        <Card className="pl-score">
          <small className="muted">Estimated SAT R&amp;W score</small>
          <div className="pl-big"><b>{r.estimate.low}–{r.estimate.high}</b><span>now</span></div>
          <div className="range" aria-label={`Now ${r.estimate.low} to ${r.estimate.high}; after the course ${r.projection.low} to ${r.projection.high}`}>
            <div className="range-band now" style={{ left: `${pct(r.estimate.low)}%`, width: `${pct(r.estimate.high) - pct(r.estimate.low)}%` }} />
            <div className="range-band later" style={{ left: `${pct(r.projection.low)}%`, width: `${Math.max(1.5, pct(r.projection.high) - pct(r.projection.low))}%` }} />
            <div className="range-ticks"><span>200</span><span>500</span><span>800</span></div>
          </div>
          <small className="muted"><b style={{ color: 'var(--ink)' }}>{r.projection.low}–{r.projection.high}</b> after finishing every lesson and part exam.</small>
        </Card>
      </div>
      <p className="muted" style={{ fontSize: '.84rem', marginTop: -6 }}>{r.notes.estimate} {r.notes.projection}</p>

      {(r.weak.grammar.length > 0 || r.weak.sat.length > 0) && (
        <div className="grid g2 stagger">
          <Card>
            <div className="card-title"><h2>Grammar to work on</h2></div>
            {r.weak.grammar.length === 0 ? <p className="muted">No weak grammar areas — well done.</p> : (
              <div className="stack sm">
                {r.weak.grammar.map((w) => (
                  <div key={w.key} className="weak-row">
                    <div className="row between"><b>{w.label}</b><span className="chip bad">missed {w.missed}/{w.total}</span></div>
                    <p>{w.advice}</p>
                    {w.course_link && <span className="chip domain">{w.course_link}</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <div className="card-title"><h2>SAT question types to work on</h2></div>
            {r.weak.sat.length === 0 ? <p className="muted">You answered every SAT question correctly.</p> : (
              <div className="stack sm">
                {r.weak.sat.map((w) => (
                  <div key={w.key} className="weak-row">
                    <div className="row between"><b>{w.label}</b></div>
                    {w.course_link && <span className="chip domain">{w.course_link}</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="row between wrap">
        <h2>Review your answers</h2>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'mistakes', label: 'Mistakes', count: r.review.filter((q) => !q.correct).length }, { value: 'all', label: 'All', count: r.review.length }]} />
      </div>
      <div className="stack">
        {shown.length === 0 && <Card><p className="center muted">No mistakes to review.</p></Card>}
        {shown.map((q, n) => (
          <Card key={q.id} className={`rq ${q.given == null || q.given === '' ? 'skip' : q.correct ? 'right' : 'wrong'}`}>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="q-num">{r.review.indexOf(q) + 1}</span>
              <span className="chip">{q.section === 'grammar' ? `Grammar · ${q.level}` : 'SAT'}</span>
              {q.domain && <span className="chip domain">{q.domain}</span>}
              {(q.given == null || q.given === '') && <span className="chip warn">Not answered</span>}
            </div>
            {q.notes?.length > 0 && <div className="pt-notes"><b>Notes</b><ul>{q.notes.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            {q.table && <DataTable table={q.table} />}
            {q.passage && <div className="passage">{withBlanks(q.passage, blank)}</div>}
            <p style={{ fontWeight: 600 }}>{withBlanks(q.prompt, blank)}</p>
            {q.format === 'mc' ? (
              <div className="stack sm">
                {q.options.map((o, i) => {
                  const right = i === q.answer;
                  const mine = q.given === i;
                  return (
                    <div key={i} className={`ropt ${right ? 'correct' : ''} ${mine && !right ? 'mine-wrong' : ''}`}>
                      <span className="L">{L[i]}</span><span>{o}</span>
                      {right && <span className="tagr">{mine ? 'Your answer · correct' : 'Correct answer'}</span>}
                      {mine && !right && <span className="tagr">Your answer</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="stack sm">
                <div className={`ropt ${q.correct ? 'correct' : 'mine-wrong'}`}>{q.correct ? <IconCheck width={18} height={18} /> : <IconX width={18} height={18} />}<span>Your answer: <b>{q.given || '—'}</b></span></div>
                {!q.correct && <div className="ropt correct"><IconCheck width={18} height={18} /><span>Accepted: <b>{q.accepted.join(' / ')}</b></span></div>}
              </div>
            )}
            {q.explanation && <div className="explain"><b>Why?</b><p>{q.explanation}</p></div>}
          </Card>
        ))}
      </div>
    </>
  );
}
