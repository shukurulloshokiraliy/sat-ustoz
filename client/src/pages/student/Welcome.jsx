import { Link } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAuth } from '../../context.jsx';
import { Card, Gate, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconClock, IconQuiz } from '../../components/icons.jsx';

/** Placement test home: first stop for every new student, and the place to see past results. */
export default function Welcome() {
  const { user, logout } = useAuth();
  const st = useAsync(() => api.get('/placement'), []);
  const first = user.name.split(' ')[0];
  return (
    <div className="page" style={{ maxWidth: 920, margin: '0 auto' }}>
      <Gate state={st}>{({ test, open, results }) => {
        const isNew = !results.length;
        const minutes = test.sections.reduce((s, x) => s + (x.time_limit_minutes || 0), 0);
        return (
          <>
            <section className="hero-card">
              <small className="eyebrow">{isNew ? 'BEFORE YOU START' : 'PLACEMENT TEST'}</small>
              <h1 style={{ marginTop: 6 }}>{isNew ? `Welcome, ${first}. Let’s find your level.` : 'Placement test'}</h1>
              <p style={{ marginTop: 10, maxWidth: 640 }}>
                The SAT course is built for {test.admission_minimum_level}-level English. This test checks your grammar and your SAT reading skills,
                estimates your current SAT Reading and Writing score and shows what to work on first.
              </p>
              <div className="facts">
                <span><IconQuiz width={16} height={16} /> {test.sections.reduce((s, x) => s + x.count, 0)} questions</span>
                <span><IconClock width={16} height={16} /> about {minutes} minutes</span>
                <span>Two parts, separate timers</span>
              </div>
              <Link className="btn primary lg" to="/placement/test">{open ? 'Continue the test' : isNew ? 'Start the placement test' : 'Retake the test'} <IconArrow /></Link>
            </section>

            <div className="grid g2 stagger">
              {test.sections.map((s, i) => (
                <Card key={s.id} className="pl-part">
                  <span className="pl-num">{i + 1}</span>
                  <div>
                    <b>{s.title}</b>
                    <p className="muted" style={{ marginTop: 4, fontSize: '.92rem' }}>{s.description}</p>
                    <div className="row" style={{ gap: 6, marginTop: 10 }}>
                      <span className="chip">{s.count} questions</span>
                      {s.time_limit_minutes > 0 && <span className="chip">{s.time_limit_minutes} min</span>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {!isNew && (
              <Card>
                <div className="card-title"><h2>Your results</h2></div>
                <div className="stack sm">
                  {results.map((r) => (
                    <Link key={r.id} to={`/placement/result/${r.id}`} className="pl-row">
                      <span className="pl-lvl">{r.cefr}</span>
                      <span className="grow"><b>{r.midpoint - 30}–{r.midpoint + 30}</b> <span className="muted">estimated R&amp;W · grammar {r.grammar_points}/40 · SAT {r.sat_points}/10</span></span>
                      <span className={`chip ${r.admitted ? 'good' : 'warn'}`}>{r.admitted ? <><IconCheck width={13} height={13} /> Ready</> : 'Not yet'}</span>
                      <span className="muted nowrap" style={{ fontSize: '.84rem' }}>{fmtDate(r.finished_at)}</span>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {isNew && (
              <p className="muted center" style={{ fontSize: '.85rem' }}>
                Your answers are saved as you go. · Not you? <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>Log out</a>
              </p>
            )}
          </>
        );
      }}</Gate>
    </div>
  );
}
