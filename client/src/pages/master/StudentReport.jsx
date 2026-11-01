import { Link } from 'react-router-dom';
import { fmtDate } from '../../api.js';
import { Card } from '../../components/ui.jsx';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const tone = (p) => (p == null ? '' : p >= 80 ? 'hi' : p >= 50 ? 'mid' : 'lo');
const when = (d) => (d ? fmtDate(d, { day: 'numeric', month: 'short' }) : '—');

/** Everything a student did: activity, lessons, Question Bank, quizzes, vocabulary, Word Arena. */
export default function StudentReport({ r }) {
  const qbP = pct(r.qbank.correct, r.qbank.answered);
  const mockAvg = r.mocks.length ? pct(r.mocks.reduce((s, m) => s + m.score, 0), r.mocks.reduce((s, m) => s + m.total, 0)) : null;
  const lessonP = pct(r.lessons.done, r.lessons.total);
  const byDay = new Map(r.days.map((d) => [d.day, d.n]));
  const today = new Date();
  const cells = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - 27 + i);
    const key = d.toISOString().slice(0, 10);
    return { key, n: byDay.get(key) || 0 };
  });
  const activeDays = cells.filter((c) => c.n).length;
  const weak = [...r.qbank.skills].filter((s) => s.answered >= 3).sort((a, b) => a.correct / a.answered - b.correct / b.answered).slice(0, 3);

  return (
    <div className="stack">
      <div className="sr-kpis">
        <Kpi label="Question Bank accuracy" value={qbP == null ? '—' : `${qbP}%`} sub={`${r.qbank.correct}/${r.qbank.answered} answers`} t={tone(qbP)} />
        <Kpi label="Take a quiz average" value={mockAvg == null ? '—' : `${mockAvg}%`} sub={`${r.mocks.length} quizzes`} t={tone(mockAvg)} />
        <Kpi label="Lessons done" value={lessonP == null ? '—' : `${lessonP}%`} sub={`${r.lessons.done}/${r.lessons.total} steps`} t={tone(lessonP)} />
        <Kpi label="Words learned" value={r.vocab.learned} sub={`${r.vocab.learning} learning · ${r.vocab.due} due`} />
        <Kpi label="Word Arena" value={r.arena.games} sub={r.arena.games ? `games · best ${r.arena.best} pts` : 'games'} />
        <Kpi label="Active days (28)" value={activeDays} sub={`last: ${when([r.qbank.last, r.vocab.last, r.arena.last, r.lessons.last].filter(Boolean).sort().pop())}`} t={activeDays >= 12 ? 'hi' : activeDays >= 5 ? 'mid' : 'lo'} />
      </div>

      <Card>
        <h3 className="sr-h">Activity · last 4 weeks</h3>
        <div className="sr-heat" aria-label={`${activeDays} active days out of 28`}>
          {cells.map((c) => <i key={c.key} title={`${c.key}: ${c.n} actions`} className={c.n === 0 ? '' : c.n < 5 ? 'l1' : c.n < 15 ? 'l2' : 'l3'} />)}
        </div>
      </Card>

      <div className="grid g2">
        <Card>
          <h3 className="sr-h">Question Bank by skill</h3>
          {!r.qbank.skills.length ? <p className="muted">No Question Bank answers yet.</p> : (
            <div className="sr-skills">
              {r.qbank.skills.map((s) => {
                const p = pct(s.correct, s.answered);
                return <div key={s.skill}><span>{s.skill}</span><b>{s.correct}/{s.answered}</b><i><em className={tone(p)} style={{ width: `${p}%` }} /></i></div>;
              })}
            </div>
          )}
          {weak.length > 0 && <p className="sr-note"><b>Needs work:</b> {weak.map((w) => w.skill).join(', ')}</p>}
        </Card>
        <Card>
          <h3 className="sr-h">Take a quiz (random modules)</h3>
          {!r.mocks.length ? <p className="muted">No random quizzes yet.</p> : (
            <>
              <div className="sr-bars">{[...r.mocks].reverse().map((m) => <i key={m.id} title={`${when(m.finished_at)}: ${m.score}/${m.total}`} className={tone(pct(m.score, m.total))} style={{ height: `${Math.max(6, pct(m.score, m.total))}%` }} />)}</div>
              <List rows={r.mocks.slice(0, 6).map((m) => [when(m.finished_at), 'Random module', `${m.score}/${m.total}`, pct(m.score, m.total)])} />
            </>
          )}
        </Card>
      </div>

      <div className="grid g2">
        <Card>
          <h3 className="sr-h">Teacher quizzes</h3>
          {!r.quizzes.length ? <p className="muted">No quizzes finished yet.</p> : <List rows={r.quizzes.slice(0, 8).map((q) => [when(q.finished_at), <Link key={q.id} to={`/result/${q.id}`}>{q.title}</Link>, q.total ? `${q.score}/${q.total}` : `${q.score}%`, q.total ? pct(q.score, q.total) : q.score])} />}
        </Card>
        <Card>
          <h3 className="sr-h">Lesson level checks</h3>
          {!r.lessons.checks.length ? <p className="muted">No level checks yet.</p> : <List rows={r.lessons.checks.slice(0, 8).map((c) => [when(c.finished_at), c.title, `${c.score}/${c.total}${c.passed ? ' · passed' : ''}`, pct(c.score, c.total)])} />}
        </Card>
      </div>

      <div className="grid g2">
        <Card>
          <h3 className="sr-h">Vocabulary tests</h3>
          {!r.vocab.tests.length ? <p className="muted">No vocabulary tests yet.</p> : <List rows={r.vocab.tests.slice(0, 8).map((t) => [when(t.created_at), t.title ? `Unit ${t.n}: ${t.title}` : 'Review', `${t.score}/${t.total}`, pct(t.score, t.total)])} />}
        </Card>
        <Card>
          <h3 className="sr-h">Word Arena</h3>
          {!r.arena.games ? <p className="muted">Has not played yet.</p> : (
            <div className="sr-arena">
              <div><b>{r.arena.games}</b><span>games</span></div>
              <div><b>{pct(r.arena.correct, r.arena.answered) ?? '—'}%</b><span>right answers</span></div>
              <div><b>{r.arena.best}</b><span>best score</span></div>
              <div><b>{when(r.arena.last)}</b><span>last game</span></div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const Kpi = ({ label, value, sub, t = '' }) => <div className={`sr-kpi ${t}`}><small>{label}</small><b>{value}</b><span>{sub}</span></div>;
const List = ({ rows }) => (
  <ul className="sr-list">
    {rows.map(([d, name, score, p], i) => <li key={i}><span className="d">{d}</span><span className="n">{name}</span><b className={tone(p)}>{score}</b></li>)}
  </ul>
);
