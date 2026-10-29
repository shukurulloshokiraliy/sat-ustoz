import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDuration } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Bars, Card, Confetti, CountUp, Gate, PageHeader, Ring, Segmented, pctTone, useAsync } from '../../components/ui.jsx';
import { domainOf, estimateLabel, readiness, withBlanks } from '../../lib.js';
import { IconBookmark, IconBookmarkFill, IconFlag } from '../../components/icons.jsx';

export function QuestionReview({ item, showSave = true }) {
  const toast = useToast();
  const [saved, setSaved] = useState(!!item.saved);
  const toggle = async () => {
    try {
      if (saved) await api.del('/saved/' + item.id); else await api.post('/saved', { question_id: item.id });
      setSaved(!saved); toast(saved ? "Removed from saved" : "Saved");
    } catch (e) { toast(e.message, 'err'); }
  };
  const skipped = item.choice == null && item.is_correct === false && 'is_correct' in item && item.n != null;
  return (
    <div className="stack">
      {item.n != null && (
        <div className="row between wrap">
          <div className="row wrap">
            <span className="q-num">{item.n}</span><span className="chip primary">{item.topic}</span>{domainOf(item.topic) && <span className="chip domain">{domainOf(item.topic)}</span>}
            {item.marked && <span className="chip bad"><IconFlag width={13} height={13} /> {"Flagged"}</span>}
            {skipped && <span className="chip warn">{"Not answered"}</span>}
          </div>
          {showSave && <button className={`btn sm ${saved ? 'soft' : 'ghost'}`} onClick={toggle}>{saved ? <IconBookmarkFill width={16} height={16} /> : <IconBookmark width={16} height={16} />} {saved ? "Saved" : "Save"}</button>}
        </div>
      )}
      <div className="passage">{withBlanks(item.passage, (i) => <span key={i} className="blank" aria-label="blank" />)}</div>
      <p style={{ fontWeight: 500 }}>{item.prompt}</p>
      <div className="stack sm">
        {item.options.map((o) => {
          const right = o.key === item.correct;
          const mineWrong = item.choice === o.key && !right;
          return (
            <div key={o.key} className={`ropt ${right ? 'correct' : ''} ${mineWrong ? 'mine-wrong' : ''}`}>
              <span className="L">{o.key}</span><span>{o.text}</span>
              {right && <span className="tagr">{item.choice === o.key ? "Your answer · correct" : "Correct answer"}</span>}
              {mineWrong && <span className="tagr">{"Your answer"}</span>}
            </div>
          );
        })}
      </div>
      <div className="explain"><b>Why?</b><p>{item.explanation || 'No explanation provided.'}</p></div>
      {item.tip && <div className="tip"><b>Ustoz tip:</b> {item.tip}</div>}
    </div>
  );
}

export default function Result() {
  const { id } = useParams();
  const { user } = useAuth();
  const st = useAsync(() => api.get('/attempts/' + id + '/result'), [id]);
  const [tab, setTab] = useState('all');

  return (
    <div className="page">
      <Gate state={st}>{(r) => {
        const a = r.attempt;
        const wrong = r.items.filter((i) => i.choice && !i.is_correct);
        const skipped = r.items.filter((i) => !i.choice);
        const marked = r.items.filter((i) => i.marked);
        const filtered = { all: r.items, wrong: [...wrong, ...skipped], marked }[tab];
        const est = estimateLabel(a.score, a.total);
        return (
          <>
            {a.pct >= 80 && <Confetti />}
            <PageHeader title={r.quiz.title} sub={user.role === 'master' ? `${r.student.name} · result analysis` : "Result and mistake analysis"}>
              {user.role === 'master'
                ? <Link className="btn ghost" to={`/students/${r.student.id}`}>{"Student page"}</Link>
                : <><Link className="btn ghost" to="/quizzes">{"Quizzes"}</Link><Link className="btn primary" to={`/quiz/${r.quiz.id}`}>{"Retake"}</Link></>}
            </PageHeader>
            <Card className="hero-result">
              <Ring value={a.pct} size={150} stroke={13} label={`${a.score}/${a.total}`} sub={`${a.pct}%`} color={`var(--${pctTone(a.pct)})`} />
              <div className="stack">
                <div>
                  <h2 style={{ fontSize: '1.4rem' }}>{a.pct >= 80 ? "Strong result — keep this pace." : a.pct >= 55 ? "Good — a little more practice." : "Let’s work through the mistakes."}</h2>
                  <p className="muted">{"Below, each question shows where the mistake was and why."}</p>
                </div>
                <div className="mini-stats">
                  <div><b style={{ color: 'var(--good)' }}><CountUp value={a.score} /></b><span>{"Correct"}</span></div>
                  <div><b style={{ color: 'var(--bad)' }}><CountUp value={wrong.length} /></b><span>{"Wrong"}</span></div>
                  <div><b style={{ color: 'var(--warn)' }}><CountUp value={skipped.length} /></b><span>{"Unanswered"}</span></div>
                  <div><b>{fmtDuration(a.seconds)}</b><span>{"Time"}</span></div>
                  <div><b>~{est}</b><span>{"Estimated score"}</span></div>
                </div>
              </div>
            </Card>

            {r.quiz.kind === 'diagnostic' && user.role === 'student' && (() => {
              const rd = readiness(est);
              return (
                <div className="hero-card">
                  <small style={{ opacity: .8, fontWeight: 700, letterSpacing: '.06em' }}>READINESS CHECK</small>
                  <h1 style={{ marginTop: 6 }}>{rd.title} · ~{est}</h1>
                  <p style={{ marginTop: 8, maxWidth: 640 }}>{rd.text}</p>
                  <div className="ready-meter" style={{ maxWidth: 320 }}>{[1, 2, 3, 4].map((n) => <span key={n} className={n <= rd.level ? 'on' : ''} style={n <= rd.level ? { background: '#fff' } : { background: 'rgba(255,255,255,.25)' }} />)}</div>
                  <div className="row wrap" style={{ marginTop: 20 }}>
                    <Link className="btn primary" to="/roadmap">Open my roadmap</Link>
                    {!user.access?.can_practice && <Link className="btn ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} to="/subscribe">Unlock full access</Link>}
                  </div>
                </div>
              );
            })()}

            <div className="grid g-main">
              <div className="stack">
                <Segmented value={tab} onChange={setTab} options={[
                  { value: 'all', label: "All", count: r.items.length },
                  { value: 'wrong', label: "Mistakes", count: wrong.length + skipped.length },
                  { value: 'marked', label: "Flagged", count: marked.length },
                ]} />
                {filtered.length === 0 && <Card><p className="center muted">{"No questions in this tab."} {tab === 'wrong' ? "No mistakes in this set." : ''}</p></Card>}
                {filtered.map((it) => (
                  <Card key={it.id} className={`rq ${!it.choice ? 'skip' : it.is_correct ? 'right' : 'wrong'}`}>
                    <QuestionReview item={it} showSave={user.role === 'student'} />
                  </Card>
                ))}
              </div>
              <div className="stack" style={{ alignContent: 'start' }}>
                <Card>
                  <div className="card-title"><h2>{"By topic"}</h2></div>
                  <Bars rows={r.topics.map((t) => ({ label: t.topic, value: t.pct, sub: `${t.correct}/${t.total}` }))} />
                </Card>
              </div>
            </div>
          </>
        );
      }}</Gate>
    </div>
  );
}
