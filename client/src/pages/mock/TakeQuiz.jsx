import { Link } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAsync } from '../../components/ui.jsx';
import { IconArrow, IconClock, IconTarget } from '../../components/icons.jsx';

const ORDER = ['Words in Context', 'Reading', 'Grammar', 'Transitions', 'Student notes'];

/** "Take a quiz" card: a fresh random SAT-style module every time, with the student's accuracy. */
export default function TakeQuizCard() {
  const st = useAsync(() => api.get('/qbank/mocks'), []);
  const d = st.data;
  const acc = d?.accuracy?.percent;
  const last = d?.mocks?.[0];
  return (
    <section className="tq">
      <div className="tq-main">
        <small className="tq-eyebrow">TAKE A QUIZ</small>
        <h2>A new SAT module every time</h2>
        <p>{d?.questions || 27} random Question Bank questions in real test order. Timed like test day.</p>
        <ol className="tq-order">{ORDER.map((x) => <li key={x}>{x}</li>)}</ol>
        <div className="tq-actions">
          <Link className="btn sun lg" to="/mock">{d?.open ? 'Continue my quiz' : 'Take a quiz'} <IconArrow /></Link>
          <span className="tq-time"><IconClock width={16} height={16} /> {d?.minutes || 32} min</span>
        </div>
      </div>
      <div className="tq-stats">
        <div className="tq-acc">
          <b>{acc == null ? '—' : `${acc}%`}</b>
          <span>accuracy</span>
          <small>{d?.accuracy?.answered ? `${d.accuracy.correct} of ${d.accuracy.answered} Question Bank answers` : 'Take your first quiz'}</small>
        </div>
        {last && (
          <Link className="tq-last" to={`/mock/${last.id}`}>
            <IconTarget width={18} height={18} />
            <span><b>Last quiz: {last.score}/{last.total}</b><small>{fmtDate(last.finished_at, { day: 'numeric', month: 'short' })} · review answers</small></span>
          </Link>
        )}
        {d?.mocks?.length > 1 && (
          <div className="tq-spark" aria-label="Recent quiz scores">
            {[...d.mocks].reverse().map((m) => <i key={m.id} title={`${m.score}/${m.total}`} style={{ height: `${Math.max(8, (m.score / m.total) * 100)}%` }} />)}
          </div>
        )}
      </div>
    </section>
  );
}
