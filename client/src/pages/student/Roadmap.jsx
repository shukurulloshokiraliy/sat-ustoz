import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Gate, Modal, PageHeader, Progress, useAsync } from '../../components/ui.jsx';
import RoadmapMap, { ContinueBar, StepDisc, stepColor } from '../../components/RoadmapMap.jsx';
import { IconArrow, IconCheck, IconDoc, IconLock, IconPlay, IconQuiz } from '../../components/icons.jsx';
import { HandoutRow } from '../../components/Handout.jsx';

export default function Roadmap() {
  const st = useAsync(() => api.get('/roadmap'), []);
  const [open, setOpen] = useState(null); // step id

  return (
    <div className="page">
      <Gate state={st}>{({ steps, estimate }) => {
        const done = steps.filter((s) => s.status === 'done').length;
        const current = steps.find((s) => s.status === 'current');
        const openStep = steps.find((s) => s.id === open);
        return (
          <>
            <PageHeader title="Roadmap" sub="SAT Reading & Writing · from 200 to 800, one step at a time.">
              <div className="row" style={{ gap: 8 }}>
                <span className="chip primary">Estimated score: {estimate ?? '—'}</span>
                <span className="chip">{done}/{steps.length} steps</span>
              </div>
            </PageHeader>
            <RoadmapMap
              steps={steps}
              onSelect={(s) => setOpen(s.id)}
              footer={<ContinueBar step={current} onClick={() => setOpen(current.id)} />}
            />
            {openStep && (
              <StepDrawer step={openStep} index={steps.indexOf(openStep)} prev={steps[steps.indexOf(openStep) - 1]}
                onClose={() => setOpen(null)} onChanged={st.reload} />
            )}
          </>
        );
      }}</Gate>
    </div>
  );
}

const youtubeId = (url) => url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)?.[1];
const isFile = (url) => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url) || /supabase\.co\/storage\//.test(url);

export function VideoPlayer({ url }) {
  const yt = youtubeId(url);
  if (yt) return <div className="video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${yt}`} title="Video lesson" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen /></div>;
  if (isFile(url)) return <div className="video-frame"><video src={url} controls preload="metadata" /></div>;
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{20,})/)?.[1];
  if (drive) return <div className="video-frame"><iframe src={`https://drive.google.com/file/d/${drive}/preview`} title="Video lesson" allow="autoplay; fullscreen" allowFullScreen /></div>;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
  if (vimeo) return <div className="video-frame"><iframe src={`https://player.vimeo.com/video/${vimeo}`} title="Video lesson" allow="fullscreen; picture-in-picture" allowFullScreen /></div>;
  if (/^https?:\/\//.test(url)) return <a className="btn soft" href={url} target="_blank" rel="noreferrer">Open the video</a>;
  return null;
}

function StepDrawer({ step, index, prev, onClose, onChanged }) {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [expanded, setExpanded] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  const locked = step.status === 'locked';
  const canPractice = user.access?.can_practice;

  const toggle = (id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const mark = async (it, value) => {
    setBusy(it.id);
    try { await api.post(`/roadmap/items/${it.id}/done`, { done: value }); onChanged(); if (value) toast('Nice — marked as done'); }
    catch (e) { toast(e.message, 'bad'); }
    finally { setBusy(null); }
  };

  return (
    <Modal wide onClose={onClose} label={step.title} title={<span className="step-head"><StepDisc step={step} size={52} state={locked ? 'locked' : ''} /><span><small className="muted" style={{ display: 'block', fontSize: '.75rem', fontWeight: 600 }}>STEP {index + 1} · {step.score_from}–{step.score_to}</small>{step.title}</span></span>}>
      {step.subtitle && <p className="muted" style={{ marginTop: -6 }}>{step.subtitle}</p>}
      {locked && (
        <div className="error-box" style={{ justifyContent: 'flex-start', gap: 8, padding: 12, background: 'var(--surface-2)', color: 'var(--muted)', borderColor: 'var(--line)' }}>
          <IconLock width={16} height={16} /> Finish “{prev?.title || 'the previous step'}” to unlock this step.
        </div>
      )}
      {step.description && <p>{step.description}</p>}
      {step.handout && <HandoutRow stepId={step.id} h={step.handout} locked={user.role === 'student' && !canPractice && !step.items.some((x) => x.lesson?.free)} />}
      {step.focus && <div className="tag-list">{step.focus.split(',').filter(Boolean).map((f) => <span key={f} className="chip">{f.trim()}</span>)}</div>}

      {step.total > 0 ? (
        <>
          <div className="row between" style={{ fontSize: '.86rem' }}>
            <b>Lessons</b><span className="muted">{step.completed}/{step.total} done · {step.items.some((x) => x.kind === 'lesson') ? `level checks need ${step.items.find((x) => x.kind === 'lesson')?.lesson?.pass_percent ?? 80}%` : `quizzes need ${step.pass_pct}%`}</span>
          </div>
          <Progress value={step.progress} tone={step.status === 'done' ? 'good' : 'primary'} />
          <div className="item-list">
            {step.items.map((it) => {
              const Ic = it.kind === 'video' ? IconPlay : it.kind === 'quiz' ? IconQuiz : IconDoc;
              if (it.kind === 'lesson') {
                const soon = it.status !== 'ready';
                const t = it.lesson?.type || 'section';
                const meta = t === 'vocab' ? `${it.lesson.words} SAT words · flashcards`
                  : t === 'session' ? `${it.lesson.check_count} questions · ${it.lesson.time_minutes} min · opens after all lessons`
                  : [it.url ? 'Video' : 'Video soon', it.lesson?.has_notes && 'Notes', it.lesson?.check_count && `Level check · ${it.lesson.check_count} q`].filter(Boolean).join(' · ');
                return (
                  <div key={it.id} className={`item-row ${it.done ? 'done' : ''} ${soon ? 'soon' : ''}`}>
                    <span className="item-ic lesson">{it.done ? <IconCheck /> : soon || it.locked ? <IconLock /> : (t === 'section' ? <span className="n">{it.lesson?.order}</span> : t === 'vocab' ? <IconDoc /> : <IconQuiz />)}</span>
                    <div style={{ minWidth: 0 }}>
                      <b>{it.title}</b>
                      <small>{soon ? 'Coming soon' : meta}{it.best != null && !soon ? ` · best ${it.best}%` : ''}{it.lesson?.free && !soon ? ' · free' : ''}</small>
                    </div>
                    <div className="item-act row" style={{ gap: 6 }}>
                      {!soon && (!canPractice && !it.lesson?.free && user.role === 'student'
                        ? <Link className="btn soft sm" to="/subscribe"><IconLock width={15} height={15} /> Subscribe</Link>
                        : <button className={`btn sm ${it.done ? 'ghost' : 'primary'}`} disabled={locked || it.locked} onClick={() => nav(`/lesson/${it.id}`)}>{it.done ? 'Review' : 'Open'} <IconArrow width={15} height={15} /></button>)}
                    </div>
                  </div>
                );
              }
              const isOpen = expanded.has(it.id);
              const needsSub = it.kind === 'quiz' && it.quiz_kind !== 'diagnostic' && !canPractice;
              return (
                <div key={it.id} className={`item-row ${it.done ? 'done' : ''}`}>
                  <span className={`item-ic ${it.kind}`}>{it.done ? <IconCheck /> : <Ic />}</span>
                  <div style={{ minWidth: 0 }}>
                    <b>{it.title}</b>
                    <small>
                      {it.kind === 'quiz' && <>{it.quiz_questions} questions{it.quiz_minutes ? ` · ${it.quiz_minutes} min` : ''}{it.best != null ? ` · best ${it.best}%` : ''}</>}
                      {it.kind === 'video' && 'Video lesson'}
                      {it.kind === 'reading' && 'Study notes'}
                    </small>
                  </div>
                  <div className="item-act row" style={{ gap: 6 }}>
                    {it.kind === 'quiz' && (needsSub
                      ? <Link className="btn soft sm" to="/subscribe"><IconLock width={15} height={15} /> Subscribe</Link>
                      : <button className="btn primary sm" disabled={locked} onClick={() => nav(`/quiz/${it.quiz_id}`)}>{it.best != null ? 'Retake' : 'Start'} <IconArrow width={15} height={15} /></button>)}
                    {it.kind !== 'quiz' && <button className="btn ghost sm" disabled={locked} onClick={() => toggle(it.id)}>{isOpen ? 'Hide' : it.kind === 'video' ? 'Watch' : 'Read'}</button>}
                    {it.kind !== 'quiz' && (
                      <button className={`btn sm ${it.done ? 'ghost' : 'soft'}`} disabled={locked || busy === it.id} onClick={() => mark(it, !it.done)}>
                        {it.done ? 'Undo' : <><IconCheck width={15} height={15} /> Done</>}
                      </button>
                    )}
                  </div>
                  {isOpen && it.kind === 'reading' && <div className="item-body">{it.body}</div>}
                  {isOpen && it.kind === 'video' && (
                    <>
                      <VideoPlayer url={it.url} />
                      <a className="muted" style={{ gridColumn: '1 / -1', fontSize: '.84rem' }} href={it.url} target="_blank" rel="noreferrer">Open the video in a new tab ↗</a>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="item-row" style={{ gridTemplateColumns: '1fr' }}>
          <small>This step completes automatically when your estimated score reaches <b style={{ color: 'var(--ink)' }}>{step.score_to}</b>. Keep practising quizzes.</small>
        </div>
      )}
      
    </Modal>
  );
}
