import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Card, Gate, Modal, Segmented, useAsync } from '../../components/ui.jsx';
import { Passage } from '../../components/Passage.jsx';
import { IconArrow, IconCheck, IconCrown, IconLock, IconPlay } from '../../components/icons.jsx';
import { Rich, rich } from '../../components/Rich.jsx';
import { VideoLocked, VideoPlayer } from '../student/Roadmap.jsx';
import { HandoutRow } from '../../components/Handout.jsx';
import LessonEditor from './LessonEditor.jsx';
import { IconEdit } from '../../components/icons.jsx';

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
  const [editing, setEditing] = useState(false);
  const canEdit = isTeacher && l.type !== 'vocab';
  const lessonName = l.title.replace(/^Lesson \d+:\s*/, '');
  const eyebrow = l.type === 'vocab' ? 'VOCABULARY' : l.type === 'session' ? 'FINAL CHECK OF THIS PART' : `LESSON ${l.order} OF ${l.sections ?? l.count}`;

  return (
    <>
      <header className="lesson-head">
        <Link to="/roadmap" className="crumb">← {l.module.title}</Link>
        <small className="eyebrow-ink">{eyebrow}{l.free ? ' · FREE PREVIEW' : ''}</small>
        <h1>{lessonName}</h1>
        {l.module.subtitle && <span className="chip domain">{l.module.subtitle}</span>}
        {canEdit && !editing && (
          <div className="le-open">
            <button type="button" className="btn primary sm" onClick={() => setEditing(true)}><IconEdit width={16} height={16} /> Edit lesson text</button>
            <small className="muted">{l.edited ? `Edited by ${l.edited.by || 'teacher'} · ${fmtDate(l.edited.at, { day: 'numeric', month: 'short' })}` : 'Text, tables, lists and spelling: students see your changes as soon as you save.'}</small>
          </div>
        )}
      </header>

      {l.locked === 'wait' && l.wait && <WaitCard l={l} reload={reload} />}
      {l.locked && l.locked !== 'subscription' && l.locked !== 'wait' && (
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
        <div className="banner"><span className="item-ic"><IconCrown /></span><div className="grow"><b>Roadmap lessons come with plan 2 and higher</b><small>The first lessons are free. Plan 2 (Roadmap) opens every lesson, level check and session check; plan 3 adds the video lessons.</small></div><Link className="btn primary sm" to="/subscribe">See plans <IconArrow width={16} height={16} /></Link></div>
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
            {l.video_locked ? <VideoLocked /> : l.video_url ? <VideoPlayer url={l.video_url} /> : (
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

          {editing && <LessonEditor l={l} Block={Block} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
          {!editing && l.written.length > 0 && (
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
                {isTeacher && <TryCheck lessonId={l.id} />}
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
      {user.role === 'student' && <p className="course-words-note">These words are in your <Link to="/vocab">Course words</Link> deck. Reviews come back after 1, 3, 7, 14 and 30 days, and you can also play them in Word Arena.</p>}
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

/** Teacher: play the level check as a student would — answers are checked here and nothing is saved. */
function TryCheck({ lessonId }) {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState('');
  const st = useAsync(() => (open ? api.get(`/lessons/${lessonId}/preview-check${version ? `?version=${version}` : ''}`) : Promise.resolve(null)), [open, version, lessonId]);
  const [pick, setPick] = useState({});
  const L = ['A', 'B', 'C', 'D', 'E'];
  return (
    <>
      <button className="btn lg outline" onClick={() => setOpen(true)}>Try it as a student (not saved) <IconArrow /></button>
      {open && (
        <Modal wide title="Level check · teacher preview" onClose={() => { setOpen(false); setPick({}); }}>
          <Gate state={st}>{(d) => {
            if (!d) return null;
            const done = d.questions.filter((q) => pick[q.id] != null);
            const right = done.filter((q) => pick[q.id] === q.answer).length;
            return (
              <div className="stack">
                <div className="row between wrap">
                  <Segmented value={d.version} onChange={(v) => { setVersion(v); setPick({}); }} options={d.versions.map((v) => ({ value: v, label: `Version ${v}` }))} />
                  <b>{right}/{d.questions.length} correct{done.length === d.questions.length ? ` · ${Math.round((right / d.questions.length) * 100)}% (pass ${d.pass_percent}%)` : ''}</b>
                </div>
                {d.questions.map((q, i) => (
                  <div key={q.id} className="card tc-q">
                    <small className="muted">Question {i + 1}</small>
                    {q.passage && <Passage text={q.passage} />}
                    <p><b>{rich(q.prompt)}</b></p>
                    <div className="tc-opts">
                      {q.options.map((o, k) => {
                        const chosen = pick[q.id] === k; const shown = pick[q.id] != null;
                        return <button key={k} type="button" disabled={shown} className={`tc-opt ${shown && k === q.answer ? 'right' : ''} ${chosen && k !== q.answer ? 'wrong' : ''}`} onClick={() => setPick((p) => ({ ...p, [q.id]: k }))}><b>{L[k]}</b> {rich(o)}</button>;
                      })}
                    </div>
                    {pick[q.id] != null && q.explanation && <p className="muted">{rich(q.explanation)}</p>}
                  </div>
                ))}
              </div>
            );
          }}</Gate>
        </Modal>
      )}
    </>
  );
}

/** Free students: this lesson opens a week after the previous one was passed. Countdown, ways to open it now, things to do meanwhile. */
function WaitCard({ l, reload }) {
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, new Date(l.wait.until).getTime() - now);
  useEffect(() => { if (left === 0) reload(); }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const parts = [[Math.floor(left / 86400e3), 'days'], [Math.floor((left % 86400e3) / 3600e3), 'hours'], [Math.floor((left % 3600e3) / 60e3), 'min'], [Math.floor((left % 60e3) / 1000), 'sec']];
  const price = l.wait.price ? `${l.wait.price.toLocaleString('en-US').replace(/,/g, ' ')} so'm` : '';
  const openNow = async () => {
    setBusy(true);
    try { await api.post(`/lessons/${l.id}/unlock-now`); toast('Lesson opened. Enjoy!'); setConfirm(false); refresh?.(); reload(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const linkBot = async () => {
    const w = window.open('', '_blank');
    try { const r = await api.get('/telegram/link'); if (w) w.location.href = r.url; else window.location.href = r.url; } catch (e) { w?.close(); toast(e.message, 'bad'); }
  };
  return (
    <div className="wait">
      <Card className="wait-main">
        <small className="eyebrow-ink">THIS LESSON OPENS IN</small>
        <div className="wait-cd" aria-label={`${parts[0][0]} days ${parts[1][0]} hours left`}>
          {parts.map(([v, k]) => <div key={k}><b>{String(v).padStart(2, '0')}</b><span>{k}</span></div>)}
        </div>
        <p className="muted">On the free plan a new lesson opens {l.wait.days} days after you pass the previous one: <b>{new Date(l.wait.until).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</b>.{user.tg_chat_id ? ' Our Telegram bot will message you when it opens.' : ''}</p>
        <div className="wait-acts">
          {price && <button className="btn primary" onClick={() => setConfirm(true)}>Open now · {price}</button>}
          <Link className="btn soft" to="/subscribe">Get a plan: every lesson opens at once</Link>
          {!user.tg_chat_id && <button className="btn ghost" onClick={linkBot}>Tell me in Telegram</button>}
        </div>
      </Card>
      <Card className="wait-meanwhile">
        <b>While you wait</b>
        <div className="wait-list">
          {l.prev && <Link to={`/lesson/${l.prev.id}`}><span>Review the last lesson</span><small>{l.prev.title}</small></Link>}
          <Link to="/vocab/review"><span>Review words</span><small>Flashcards that are due today</small></Link>
          <Link to="/mistakes"><span>My mistakes</span><small>Fix questions you got wrong</small></Link>
          <Link to="/practice"><span>Practice questions</span><small>Keep your streak going</small></Link>
        </div>
      </Card>
      {confirm && (
        <Modal title="Open this lesson now?" onClose={() => setConfirm(false)}
          footer={<><button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={openNow}>{busy ? 'Opening…' : `Pay ${price}`}</button></>}>
          <p style={{ marginTop: 0 }}><b>{price}</b> will be taken from your SAT Ustoz card and <b>{l.title.replace(/^Lesson \d+:\s*/, '')}</b> opens right away. The next lessons keep the weekly schedule.</p>
          <p className="muted" style={{ marginBottom: 0 }}>Not enough on the card? Top it up on your profile, or get a plan to open every lesson.</p>
        </Modal>
      )}
    </div>
  );
}
