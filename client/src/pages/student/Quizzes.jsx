import { useState } from 'react';
import TakeQuizCard from '../mock/TakeQuiz.jsx';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAuth } from '../../context.jsx';
import { Card, Empty, Gate, PageHeader, Segmented, pctTone, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconClock, IconCrown, IconLock, IconQuiz } from '../../components/icons.jsx';

export function PaywallBanner() {
  return (
    <div className="banner">
      <span className="item-ic"><IconCrown /></span>
      <div className="grow"><b>Unlock the full course</b><small>Quizzes, video lessons and mocks need an active subscription.</small></div>
      <Link className="btn primary sm" to="/subscribe">See plans <IconArrow width={16} height={16} /></Link>
    </div>
  );
}

export default function Quizzes() {
  const st = useAsync(() => api.get('/quizzes'), []);
  const { user } = useAuth();
  const locked = (q) => q.kind !== 'diagnostic' && !user.access?.can_practice;
  const [tab, setTab] = useState('all');
  return (
    <div className="page">
      <PageHeader title="Quizzes" sub="Practice sets, mocks and your readiness check." />
      {user.role === 'student' && <TakeQuizCard />}
      {!user.access?.can_practice && <PaywallBanner />}
      <Gate state={st}>{(list) => {
        const shown = list.filter((q) => tab === 'all' || q.status === tab);
        const c = (s) => list.filter((q) => q.status === s).length;
        return (
          <>
            <Segmented value={tab} onChange={setTab} options={[
              { value: 'all', label: "All", count: list.length }, { value: 'new', label: "New", count: c('new') },
              { value: 'in_progress', label: "In progress", count: c('in_progress') }, { value: 'done', label: "Completed", count: c('done') },
            ]} />
            {shown.length === 0 ? (
              <Card><Empty icon={<IconQuiz />} title={"Nothing here yet"} text="New quizzes will appear here soon." /></Card>
            ) : (
              <div className="stack stagger">
                {shown.map((q) => (
                  <Card key={q.id} className="hover quiz-row">
                    <div className={`quiz-ico ${q.status}`}>{q.status === 'done' ? <IconCheck /> : q.status === 'in_progress' ? <IconClock /> : <IconQuiz />}</div>
                    <div className="stack sm">
                      <h3>{q.title}</h3>
                      <div className="quiz-meta">
                        <span className="chip">{q.questions} {"questions"}</span>
                        {q.duration_min > 0 && <span className="chip">{q.duration_min} {"min"}</span>}
                        <span className="chip">{q.section === 'math' ? 'Math' : 'Reading & Writing'}</span>
                        {q.kind === 'diagnostic' && <span className="chip primary">Readiness check</span>}
                        {q.kind === 'mock' && <span className="chip primary">Mock test</span>}
                        {q.status === 'done' && <span className={`chip ${pctTone(q.best)}`}>{"Best"} {q.best}% · {q.tries}x</span>}
                        {q.status === 'in_progress' && <span className="chip warn">{"In progress"}</span>}
                      </div>
                      {q.last && <small className="muted">{"Last attempt:"} {fmtDate(q.last.finished_at)} — {q.last.score}/{q.last.total}</small>}
                    </div>
                    <div className="row wrap">
                      {q.last_attempt_id && <Link className="btn ghost sm" to={`/result/${q.last_attempt_id}`}>{"Analysis"}</Link>}
                      {locked(q)
                        ? <Link className="btn soft sm" to="/subscribe"><IconLock width={15} height={15} /> Unlock</Link>
                        : <Link className="btn primary sm" to={`/quiz/${q.id}`}>{q.status === 'in_progress' ? "Resume" : q.status === 'done' ? "Retake" : "Start"} <IconArrow width={16} height={16} /></Link>}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        );
      }}</Gate>
    </div>
  );
}
