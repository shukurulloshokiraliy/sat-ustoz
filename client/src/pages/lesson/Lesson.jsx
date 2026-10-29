import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Card, Gate, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconCrown, IconLock, IconPlay } from '../../components/icons.jsx';
import { Rich, rich } from '../../components/Rich.jsx';
import { VideoPlayer } from '../student/Roadmap.jsx';
import { HandoutRow } from '../../components/Handout.jsx';

const shortTitle = (t) => t.replace(/^Lesson (\d+):.*/, 'Lesson $1').replace(/^(Vocabulary|Session check):.*/, '$1');

export default function Lesson() {
  const { id } = useParams();
  const st = useAsync(() => api.get('/lessons/' + id), [id]);
  return <div className="page lesson-page"><Gate state={st}>{(l) => <LessonView l={l} reload={st.reload} />}</Gate></div>;
}

function LessonView({ l, reload }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const isTeacher = user.role === 'master';
  const lessonName = l.title.replace(/^Lesson \d+:\s*/, '');
  const eyebrow = l.type === 'vocab' ? 'VOCABULARY' : l.type === 'session' ? 'FINAL CHECK OF THIS PART' : `LESSON ${l.order} OF ${l.sections ?? l.count}`;

  return (
    <>
      <header className="lesson-head">
        <Link to="/roadmap" className="crumb">← {l.module.title}</Link>
        <small className="eyebrow-ink">{eyebrow}{l.free ? ' · FREE PREVIEW' : ''}</small>
        <h1>{lessonName}</h1>
        {l.module.subtitle && <span className="chip domain">{l.module.subtitle}</span>}
      </header>

      {l.locked && l.locked !== 'subscription' && (
        <Card className="lesson-locked">
          <IconLock />
          <div>
            <b>{l.locked === 'soon' ? 'This lesson is coming soon' : 'This lesson is locked'}</b>
            <p className="muted">{l.locked === 'soon' ? 'Your teacher is preparing it. You will see it here as soon as it is ready.' : l.locked === 'step' ? 'Finish the previous roadmap step first.' : l.locked === 'lessons' ? `Pass the level check of every lesson to open the session check — ${l.session?.lessons_passed ?? 0} of ${l.session?.lessons_total ?? 0} passed.` : 'Pass the level check of the previous lesson to open this one.'}</p>
          </div>
          {l.prev && <Link className="btn ghost" to={`/lesson/${l.prev.id}`}>Previous lesson</Link>}
        </Card>
      )}
      {l.locked === 'subscription' && (
        <div className="banner"><span className="item-ic"><IconCrown /></span><div className="grow"><b>Subscribe to continue</b><small>The first lessons are free. Subscribe to open every lesson, level check, vocabulary and the session check.</small></div><Link className="btn primary sm" to="/subscribe">See plans <IconArrow width={16} height={16} /></Link></div>
      )}

      {l.type === 'session' && l.session && (
        <Card className="session-info">
          <div className="si-grid">
            <div><b>{l.check?.count}</b><span>questions</span></div>
            <div><b>{l.session.time_minutes}</b><span>minutes</span></div>
            <div><b>{l.check?.pass_percent}%</b><span>to pass</span></div>
            <div><b>{l.session.lessons_passed}/{l.session.lessons_total}</b><span>lessons passed</span></div>
          </div>
          {l.session.makeup && <p className="muted">{l.session.makeup}. The timer starts when you begin and keeps running if you leave.</p>}
        </Card>
      )}

      {!l.locked && l.type === 'vocab' && <Vocab l={l} reload={reload} />}

      {!l.locked && l.type !== 'vocab' && (
        <>
          {l.type === 'section' && <section className="lesson-video">
            {l.video_url ? <VideoPlayer url={l.video_url} /> : (
              <div className="video-soon">
                <span className="vs-ic"><IconPlay /></span>
                <div>
                  <b>Video lesson — coming soon</b>
                  {l.video?.length_minutes && <small>{l.video.length_minutes} min</small>}
                  {l.video?.covers && <p>Covers: {l.video.covers}</p>}
                  {isTeacher && <p className="muted">Add the video link in Roadmap → edit this step.</p>}
                </div>
              </div>
            )}
          </section>}

          {l.type === 'section' && l.module.handout && <HandoutRow stepId={l.module.step_id} h={l.module.handout} />}

          {l.written.length > 0 && (
            <article className="notes">
              {l.written.map((b, i) => <Block key={i} b={b} />)}
              {l.sources?.length > 0 && <div className="n-sources"><b>Sources</b><ul>{l.sources.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
            </article>
          )}

          {l.check && (
            <Card className={`check-card ${l.passed ? 'passed' : ''}`}>
              <div className="row between wrap">
                <div>
                  <small className="muted">{l.type === 'session' ? 'SESSION CHECK' : 'LEVEL CHECK'}</small>
                  <h2>{l.type === 'session' ? (l.passed ? 'Passed — this part is complete' : `Pass with ${l.check.pass_percent}% to complete this part`) : l.passed ? 'Passed — the next lesson is open' : `Pass with ${l.check.pass_percent}% to open the next lesson`}</h2>
                  <p className="muted" style={{ marginTop: 4 }}>{l.check.count} questions{l.check.time_minutes ? ` · ${l.check.time_minutes} min` : ''} · {l.check.versions.length} versions ({l.check.versions.join(' → ')}) · each try uses the next version</p>
                </div>
                {!isTeacher && (
                  <button className={`btn lg ${l.passed ? 'outline' : 'primary'}`} onClick={() => nav(`/lesson/${l.id}/check`)}>
                    {l.check.open_id ? `Continue version ${l.check.next_version}` : l.passed ? `Practise again · version ${l.check.next_version}` : `Start version ${l.check.next_version}`} <IconArrow />
                  </button>
                )}
              </div>
              {l.history.length > 0 && (
                <div className="tries">
                  {l.history.map((h) => (
                    <Link key={h.id} to={`/lesson-check/${h.id}`} className={`try ${h.passed ? 'ok' : ''}`}>
                      <b>{h.version}</b><span>{h.score}/{h.total}</span>{h.passed && <IconCheck width={14} height={14} />}<small>{fmtDate(h.finished_at, { day: 'numeric', month: 'short' })}</small>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}

      <nav className="lesson-nav">
        {l.prev ? <Link className="btn ghost" to={`/lesson/${l.prev.id}`}>← {shortTitle(l.prev.title)}</Link> : <span />}
        {l.next && <Link className={`btn ${l.next.locked && !isTeacher ? 'ghost' : 'soft'}`} to={`/lesson/${l.next.id}`}>{l.next.locked && !isTeacher && <IconLock width={15} height={15} />} {shortTitle(l.next.title)} →</Link>}
      </nav>
    </>
  );
}

/** Module vocabulary: flip cards (word → meaning, Uzbek, example), then mark the set as learned. */
function Vocab({ l, reload }) {
  const toast = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(() => new Set());
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const flip = (i) => setOpen((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const mark = async (value) => {
    setBusy(true);
    try { await api.post(`/roadmap/items/${l.id}/done`, { done: value }); toast(value ? 'Words marked as learned' : 'Marked as not learned'); reload(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="row between wrap">
        <p className="muted">{l.words.length} words · tap a card to see its meaning{l.tested_in ? ` · tested in the ${l.tested_in}` : ''}</p>
        <button className="btn ghost sm" onClick={() => setAll((x) => !x)}>{all ? 'Hide all meanings' : 'Show all meanings'}</button>
      </div>
      <div className="vocab-grid">
        {l.words.map((w, i) => {
          const shown = all || open.has(i);
          return (
            <button key={w.word} type="button" className={`vcard ${shown ? 'open' : ''}`} onClick={() => flip(i)} aria-expanded={shown}>
              <span className="vw">{w.word}</span>
              <span className="vp">{w.pos}</span>
              {shown && (
                <span className="vback">
                  <span className="vd">{w.definition}</span>
                  {w.uz && <span className="vu">{w.uz}</span>}
                  {w.example && <span className="ve">“{w.example}”</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {user.role === 'student' && (
        <Card className={`check-card ${l.done ? 'passed' : ''}`}>
          <div className="row between wrap">
            <div><small className="muted">VOCABULARY</small><h2>{l.done ? 'Learned — well done' : 'Know these words? Mark the set as learned.'}</h2></div>
            <button className={`btn lg ${l.done ? 'outline' : 'primary'}`} disabled={busy} onClick={() => mark(!l.done)}>{l.done ? 'Undo' : <><IconCheck /> I’ve learned them</>}</button>
          </div>
        </Card>
      )}
    </>
  );
}

/** One content block from the module JSON. */
function Block({ b }) {
  switch (b.type) {
    case 'h': return <h2 className="n-h">{rich(b.text)}</h2>;
    case 'p': return <p className="n-p">{rich(b.text)}</p>;
    case 'list': return <ul className="n-list">{b.items.map((x, i) => <li key={i}>{rich(x)}</li>)}</ul>;
    case 'steps': return <ol className="n-steps">{b.items.map((x, i) => <li key={i}><span>{i + 1}</span><div>{rich(x)}</div></li>)}</ol>;
    case 'table': return (
      <div className="n-table"><table>
        <thead><tr>{b.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{rich(c)}</td>)}</tr>)}</tbody>
      </table></div>
    );
    case 'examples': return (
      <div className="n-examples">{b.rows.map(([ex, note], i) => (
        <div key={i} className="n-ex"><p>{rich(ex)}</p><small>{rich(note)}</small></div>
      ))}</div>
    );
    case 'trap': return <aside className="n-trap"><b>{rich(b.title || 'SAT trap')}</b><p>{rich(b.text)}</p></aside>;
    case 'tip': return <aside className="n-tip"><b>Ustoz tip</b><p>{rich(b.text)}</p></aside>;
    case 'source': return <p className="n-source">{rich(b.text)}</p>;
    case 'uz': return <aside className="tip n-uz"><b>Ustoz maslahati:</b> <Rich text={b.text} /></aside>;
    default: return b.text ? <p className="n-p">{rich(b.text)}</p> : null;
  }
}
