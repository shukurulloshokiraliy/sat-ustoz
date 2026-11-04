import { useRef, useState } from 'react';
import VideoUpload from '../../components/VideoUpload.jsx';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confirm, Field, Gate, Modal, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import RoadmapMap, { StepDisc, STEP_COLORS } from '../../components/RoadmapMap.jsx';
import { HandoutEditor } from '../../components/Handout.jsx';
import { StepDrawer } from '../student/Roadmap.jsx';
import { fmtDate } from '../../api.js';
import { IconDoc, IconDown, IconEdit, IconEye, IconPlay, IconPlus, IconQuiz, IconTrash, IconUp } from '../../components/icons.jsx';

const countLabel = (items) => [['lesson', 'lesson', 'lessons'], ['video', 'video', 'videos'], ['quiz', 'quiz', 'quizzes'], ['random', 'final exam', 'final exams'], ['reading', 'note', 'notes']]
  .map(([k, one, many]) => { const n = items.filter((x) => x.kind === k).length; return n ? `${n} ${n === 1 ? one : many}` : null; })
  .filter(Boolean).join(' · ');
/** Problems a teacher should fix before students reach the step. */
const warnings = (s) => {
  const out = [];
  const lessons = s.items.filter((i) => i.kind === 'lesson' && (i.lesson?.type || 'section') === 'section');
  const noVideo = lessons.filter((i) => !i.url).length + s.items.filter((i) => i.kind === 'video' && !i.url).length;
  if (noVideo) out.push(`${noVideo} without video`);
  if (lessons.length && !s.handout) out.push('No rules sheet');
  if (s.items.some((i) => i.kind === 'quiz' && (!i.quiz_title || !Number(i.quiz_questions)))) out.push('Quiz has no questions');
  return out;
};

const BLANK = { title: '', subtitle: '', badge: '', color: 'signal', score_from: 200, score_to: 300, pass_pct: 70, description: '', focus: '', items: [] };

export default function RoadmapEditor() {
  const st = useAsync(() => Promise.all([api.get('/roadmap'), api.get('/quizzes')]), []);
  const toast = useToast();
  const fileRef = useRef(null);
  const [imp, setImp] = useState(null); // { module, preview }
  const importModule = async (file) => {
    if (!file) return;
    try {
      const module = JSON.parse(await file.text());
      setImp({ module, preview: await api.post('/roadmap/modules/preview', module) });
    } catch (e) { toast(e instanceof SyntaxError ? 'This is not a valid JSON file' : e.message, 'bad'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const [edit, setEdit] = useState(null); // { step, insertAt }
  const [del, setDel] = useState(null);
  const [preview, setPreview] = useState(null);
  const [panel, setPanel] = useState(null); // 'trash' | 'history'
  const [spread, setSpread] = useState(false);
  const [drag, setDrag] = useState(null);
  const [view, setView] = useState('both');

  return (
    <div className="page">
      <PageHeader title="Roadmap" sub="Build the path students follow from 200 to 800. Each step can hold video lessons, study notes and quizzes.">
        <Segmented value={view} onChange={setView} options={[{ value: 'both', label: 'Map + list' }, { value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} />
        <button className="btn ghost" onClick={() => setPanel('history')}>History</button>
        <button className="btn ghost" onClick={() => setPanel('trash')}>Trash</button>
        <button className="btn ghost" onClick={() => setSpread(true)}>Spread scores 200–800</button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import module (JSON)</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importModule(e.target.files[0])} />
        <button className="btn primary" onClick={() => setEdit({ step: BLANK, insertAt: null })}><IconPlus /> New step</button>
      </PageHeader>
      <Gate state={st}>{([{ steps }, quizzes]) => {
        const reorder = async (ids) => {
          st.setData([{ steps: ids.map((id) => steps.find((s) => s.id === id)) }, quizzes]);
          try { await api.put('/roadmap/order', { ids }); } catch (e) { toast(e.message, 'bad'); }
          st.reload();
        };
        const dropOn = (i) => {
          if (drag == null || drag === i) return setDrag(null);
          const ids = steps.map((s) => s.id);
          const [m] = ids.splice(drag, 1); ids.splice(i, 0, m);
          setDrag(null); reorder(ids);
        };
        const move = async (i, d) => {
          const ids = steps.map((s) => s.id);
          [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
          st.setData([{ steps: ids.map((id) => steps.find((s) => s.id === id)) }, quizzes]);
          try { await api.put('/roadmap/order', { ids }); } catch (e) { toast(e.message, 'bad'); }
          st.reload();
        };
        const list = (
          <Card>
            <div className="card-title"><h2>Steps · {steps.length}</h2><span className="muted" style={{ fontSize: '.82rem' }}>Step 1 is at the bottom of the map</span></div>
            <div className="step-list stagger">
              {steps.map((s, i) => (
                <div key={s.id} className={`step-li ${drag === i ? 'dragging' : ''}`} draggable
                  onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(i)} onDragEnd={() => setDrag(null)}>
                  <div className="ord">
                    <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><IconUp width={14} height={14} /></button>
                    <button aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><IconDown width={14} height={14} /></button>
                  </div>
                  <StepDisc step={s} size={44} />
                  <div style={{ minWidth: 0 }}>
                    <b>{i + 1}. {s.title}</b>
                    <small>{s.score_from}–{s.score_to} · {s.items.length ? countLabel(s.items) : 'no lessons — completes by score'}</small>
                    {warnings(s).length > 0 && <span className="step-warn">{warnings(s).map((w) => <span key={w} className="chip warn">{w}</span>)}</span>}
                  </div>
                  <div className="acts">
                    <button className="icon-sm" aria-label="Insert a step after" title="Insert a step after" onClick={() => setEdit({ step: { ...BLANK, score_from: s.score_to, score_to: Math.min(800, s.score_to + 50) }, insertAt: i + 1 })}><IconPlus width={16} height={16} /></button>
                    <button className="icon-sm" aria-label="Preview as a student" title="Preview as a student" onClick={() => setPreview({ s: { ...s, total: s.items.length, completed: 0, progress: 0, status: 'current' }, i })}><IconEye width={16} height={16} /></button>
                    <button className="icon-sm" aria-label="Edit" onClick={() => setEdit({ step: s })}><IconEdit width={16} height={16} /></button>
                    <button className="icon-sm danger" aria-label="Delete" onClick={() => setDel(s)}><IconTrash width={16} height={16} /></button>
                  </div>
                </div>
              ))}
              {!steps.length && <p className="muted center">No steps yet — add the first one.</p>}
            </div>
          </Card>
        );
        const map = (
          <div>
            <RoadmapMap steps={steps} editable maxHeight="calc(100vh - 170px)"
              onSelect={(s) => setEdit({ step: s })}
              onAdd={() => setEdit({ step: { ...BLANK, score_from: steps.at(-1)?.score_to ?? 200, score_to: Math.min(800, (steps.at(-1)?.score_to ?? 200) + 50) }, insertAt: null })} />
            <p className="muted center" style={{ fontSize: '.8rem', marginTop: 8 }}>Tap a step on the map to edit it.</p>
          </div>
        );
        return (
          <>
            {view === 'both' ? <div className="rm-editor">{list}{map}</div> : view === 'list' ? list : map}
            {imp && <ImportModal imp={imp} steps={steps} onClose={() => setImp(null)} onDone={(r) => { setImp(null); toast(`${r.created ? 'Module added' : 'Module updated'} · ${r.ready}/${r.lessons} lessons ready`); st.reload(); }} />}
            {edit && <StepModal init={edit.step} insertAt={edit.insertAt} quizzes={quizzes} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); st.reload(); }} onChanged={st.reload} />}
            {del && <Confirm title="Move this step to the Trash?" confirmLabel="Move to Trash" text={`“${del.title}” leaves the roadmap. It stays in the Trash for 30 days with its lessons and student progress — you can restore it.`}
              onClose={() => setDel(null)} onConfirm={async () => { await api.del('/roadmap/steps/' + del.id); setDel(null); toast('Moved to Trash'); st.reload(); }} />}
            {preview && <StepDrawer preview step={preview.s} index={preview.i} prev={steps[preview.i - 1]} onClose={() => setPreview(null)} onChanged={() => {}} />}
            {spread && <Confirm danger={false} title="Spread score ranges evenly?" confirmLabel="Spread" text={`The ${steps.length} steps get ranges from 200 to 800 in equal parts (about ${Math.round(600 / Math.max(1, steps.length))} points each), in their current order.`}
              onClose={() => setSpread(false)} onConfirm={async () => { await api.put('/roadmap/spread', {}); setSpread(false); toast('Score ranges updated'); st.reload(); }} />}
            {panel && <RoadmapPanel kind={panel} onClose={() => setPanel(null)} onChanged={st.reload} />}
          </>
        );
      }}</Gate>
    </div>
  );
}

let tmp = 0;
function StepModal({ init, insertAt, quizzes, onClose, onSaved, onChanged }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({ ...init, items: (init.items || []).map((it) => ({ ...it, _k: 'i' + (it.id || ++tmp) })) }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const setItem = (k, patch) => setF((s) => ({ ...s, items: s.items.map((it) => (it._k === k ? { ...it, ...patch } : it)) }));
  const addItem = (kind) => setF((s) => ({ ...s, items: [...s.items, { _k: 'n' + ++tmp, kind, title: '', url: '', body: '', quiz_id: kind === 'quiz' ? quizzes[0]?.id ?? '' : null }] }));
  const moveItem = (i, d) => setF((s) => { const n = [...s.items]; [n[i], n[i + d]] = [n[i + d], n[i]]; return { ...s, items: n }; });
  const removeItem = (k) => setF((s) => ({ ...s, items: s.items.filter((it) => it._k !== k) }));

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, items: f.items.map(({ _k, ...it }) => it), insert_at: insertAt ?? undefined };
      if (init.id) await api.put('/roadmap/steps/' + init.id, body);
      else await api.post('/roadmap/steps', body);
      toast(init.id ? 'Step saved' : 'Step added');
      onSaved();
    } catch (e) { toast(e.message, 'bad'); }
    finally { setBusy(false); }
  };

  return (
    <Modal wide label="Edit step" onClose={onClose}
      title={<span className="step-head"><StepDisc step={{ ...f, badge: f.badge || f.title.replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '★' }} size={46} />{init.id ? 'Edit step' : 'New step'}</span>}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.title.trim()} onClick={save}>{busy ? 'Saving…' : 'Save step'}</button></>}>
      <div className="grid g2">
        <Field label="Title"><input autoFocus value={f.title} onChange={set('title')} placeholder="Grammar 2: Punctuation" /></Field>
        <Field label="Subtitle" hint="optional"><input value={f.subtitle} onChange={set('subtitle')} placeholder="Standard English Conventions" /></Field>
      </div>
      <div className="grid g2">
        <Field label="Badge" hint="1–3 letters or an emoji"><input maxLength={3} value={f.badge} onChange={set('badge')} placeholder="G2" /></Field>
        <Field label="Color">
          <div className="swatches">
            {Object.entries(STEP_COLORS).map(([k, c]) => <button key={k} type="button" aria-label={c.label} title={c.label} className={`swatch ${f.color === k ? 'on' : ''}`} style={{ background: c.bg }} onClick={() => set('color')(k)} />)}
          </div>
        </Field>
      </div>
      <div className="grid g3">
        <Field label="Score from"><input type="number" min="200" max="800" step="10" value={f.score_from} onChange={set('score_from')} /></Field>
        <Field label="Score to"><input type="number" min="200" max="800" step="10" value={f.score_to} onChange={set('score_to')} /></Field>
        <Field label="Quiz pass mark, %"><input type="number" min="10" max="100" step="5" value={f.pass_pct} onChange={set('pass_pct')} /></Field>
      </div>
      <Field label="Description"><textarea rows={3} value={f.description} onChange={set('description')} placeholder="What students learn in this step" /></Field>
      <Field label="Focus topics" hint="comma separated"><input value={f.focus} onChange={set('focus')} placeholder="Commas, Semicolons, Colons" /></Field>
      {init.id && <HandoutEditor stepId={init.id} h={f.handout} onChange={(handout) => { setF((s) => ({ ...s, handout })); onChanged?.(); }} />}

      <div className="row between wrap">
        <b>Lessons in this step · {f.items.length}</b>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className="btn soft sm" type="button" onClick={() => addItem('video')}><IconPlay width={16} height={16} /> Video</button>
          <button className="btn soft sm" type="button" onClick={() => addItem('quiz')} disabled={!quizzes.length}><IconQuiz width={16} height={16} /> Quiz</button>
          <button className="btn soft sm" type="button" onClick={() => addItem('reading')}><IconDoc width={16} height={16} /> Notes</button>
          <button className="btn soft sm" type="button" onClick={() => addItem('random')}><IconQuiz width={16} height={16} /> Random SAT module</button>
        </div>
      </div>
      {!f.items.length && <p className="muted" style={{ fontSize: '.86rem' }}>No lessons — the step then completes when the student's estimated score reaches “Score to”.</p>}
      {f.items.map((it, i) => (
        <div key={it._k} className="item-edit">
          <div className="item-edit-head">
            {it.kind === 'lesson'
              ? <span className="row" style={{ gap: 6 }}><span className="chip primary">{it.lesson?.type === 'vocab' ? `Vocabulary · ${it.lesson.words} words` : it.lesson?.type === 'session' ? `Session check · ${it.lesson.time_minutes} min` : `Lesson ${it.lesson?.order} · from module`}</span>{it.status !== 'ready' && <span className="chip warn">Coming soon</span>}{it.lesson?.check_count > 0 && <span className="chip">Level check {it.lesson.versions.join('/')} × {it.lesson.check_count}</span>}</span>
              : <Segmented value={it.kind} onChange={(kind) => setItem(it._k, { kind, quiz_id: kind === 'quiz' ? it.quiz_id || quizzes[0]?.id : null })}
                  options={[{ value: 'video', label: 'Video' }, { value: 'quiz', label: 'Quiz' }, { value: 'reading', label: 'Notes' }, { value: 'random', label: 'Random SAT module' }]} />}
            <span className="grow" />
            <button className="icon-sm" type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveItem(i, -1)}><IconUp width={15} height={15} /></button>
            <button className="icon-sm" type="button" aria-label="Move down" disabled={i === f.items.length - 1} onClick={() => moveItem(i, 1)}><IconDown width={15} height={15} /></button>
            <button className="icon-sm danger" type="button" aria-label="Remove" onClick={() => removeItem(it._k)}><IconTrash width={15} height={15} /></button>
          </div>
          <input value={it.title} onChange={(e) => setItem(it._k, { title: e.target.value })} placeholder={it.kind === 'video' ? 'Lesson 1: Commas' : it.kind === 'quiz' ? 'Level check (optional title)' : 'Study notes'} aria-label="Lesson title" />
          {(it.kind === 'video' || it.kind === 'lesson') && <VideoUpload title={it.title || f.title} onDone={(url) => setItem(it._k, { url })} />}
          {(it.kind === 'video' || it.kind === 'lesson') && /^bunny:/.test(it.url || '') && <small className="vup-ok">Uploaded video lesson (Bunny Stream) · <button type="button" className="link-btn" onClick={() => setItem(it._k, { url: '' })}>remove</button></small>}
          {(it.kind === 'video' || it.kind === 'lesson') && !/^bunny:/.test(it.url || '') && <input value={it.url || ''} onChange={(e) => setItem(it._k, { url: e.target.value })} placeholder={it.kind === 'lesson' ? `Video link for this lesson (optional${it.lesson?.video_meta?.length_minutes ? `, planned ${it.lesson.video_meta.length_minutes} min` : ''}) — https://youtu.be/…` : 'https://youtu.be/…  or a Supabase Storage video link'} aria-label="Video link" />}
          {it.kind === 'lesson' && it.lesson?.video_meta?.covers && !it.url && <small className="muted">Video plan: {it.lesson.video_meta.covers}</small>}
          {it.kind === 'quiz' && (
            <select value={it.quiz_id || ''} onChange={(e) => setItem(it._k, { quiz_id: Number(e.target.value) })} aria-label="Quiz">
              {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title} · {q.questions} questions{q.kind !== 'practice' ? ` (${q.kind})` : ''}</option>)}
            </select>
          )}
          {it.kind === 'quiz' && (
            <div className="grid g2">
              <label className="field"><span>Retake quiz (Exam B)</span>
                <select value={it.retake_quiz_id || ''} onChange={(e) => setItem(it._k, { retake_quiz_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">No retake</option>
                  {quizzes.filter((q) => q.id !== Number(it.quiz_id)).map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
                </select></label>
              <label className="field"><span>Wait before retake, hours</span><input type="number" min="0" max="720" value={it.retake_hours ?? 24} onChange={(e) => setItem(it._k, { retake_hours: e.target.value })} disabled={!it.retake_quiz_id} /></label>
            </div>
          )}
          {it.kind === 'random' && <RandomExamFields value={it.body} onChange={(body) => setItem(it._k, { body })} />}
          {it.kind === 'reading' && <textarea rows={4} value={it.body} onChange={(e) => setItem(it._k, { body: e.target.value })} placeholder="Rules, examples, tips…" aria-label="Notes" />}
        </div>
      ))}
    </Modal>
  );
}

const EXAM_SKILLS = [['words-in-context', 'Words in Context'], ['text-structure', 'Text Structure'], ['cross-text', 'Cross-Text'], ['central-ideas', 'Central Ideas'],
  ['command-of-evidence', 'Command of Evidence'], ['inferences', 'Inferences'], ['boundaries', 'Boundaries'], ['form-structure-sense', 'Form, Structure, Sense'],
  ['transitions', 'Transitions'], ['rhetorical-synthesis', 'Rhetorical Synthesis']];

/** Settings of a "Random SAT module" final exam: every student gets their own set from the Question Bank. */
function RandomExamFields({ value, onChange }) {
  let c = {};
  try { c = typeof value === 'string' ? JSON.parse(value || '{}') : value || {}; } catch { c = {}; }
  const cfg = { count: c.count ?? 27, minutes: c.minutes ?? 32, pass_pct: c.pass_pct ?? 80, mix: { easy: c.mix?.easy ?? 0, medium: c.mix?.medium ?? 30, hard: c.mix?.hard ?? 70 }, skills: c.skills?.length ? c.skills : EXAM_SKILLS.map(([id]) => id) };
  const put = (patch) => onChange(JSON.stringify({ ...cfg, ...patch }));
  const num = (k) => (e) => put({ [k]: e.target.value === '' ? '' : Number(e.target.value) });
  const mix = (k) => (e) => put({ mix: { ...cfg.mix, [k]: Number(e.target.value) || 0 } });
  const tog = (id) => put({ skills: cfg.skills.includes(id) ? cfg.skills.filter((x) => x !== id) : [...cfg.skills, id] });
  return (
    <div className="rx">
      <div className="grid g3">
        <label className="field"><span>Questions</span><input type="number" min="5" max="54" value={cfg.count} onChange={num('count')} /></label>
        <label className="field"><span>Time, min</span><input type="number" min="5" max="120" value={cfg.minutes} onChange={num('minutes')} /></label>
        <label className="field"><span>Pass mark, %</span><input type="number" min="10" max="100" value={cfg.pass_pct} onChange={num('pass_pct')} /></label>
      </div>
      <div className="grid g3">
        <label className="field"><span>Easy, %</span><input type="number" min="0" max="100" value={cfg.mix.easy} onChange={mix('easy')} /></label>
        <label className="field"><span>Medium, %</span><input type="number" min="0" max="100" value={cfg.mix.medium} onChange={mix('medium')} /></label>
        <label className="field"><span>Hard, %</span><input type="number" min="0" max="100" value={cfg.mix.hard} onChange={mix('hard')} /></label>
      </div>
      <div className="rx-skills">{EXAM_SKILLS.map(([id, name]) => <button key={id} type="button" className={`chip ${cfg.skills.includes(id) ? 'primary' : ''}`} onClick={() => tog(id)}>{name}</button>)}</div>
      <small className="muted">Skills follow the real SAT module order and blueprint, scaled to the number of questions. Each student gets a new set (questions they have not answered first, never reserved exam or lesson questions); a retry builds a new set.</small>
    </div>
  );
}

/** Module import: what changes, update the existing step or add a new one, and where. */
function ImportModal({ imp, steps, onClose, onDone }) {
  const toast = useToast();
  const p = imp.preview;
  const [mode, setMode] = useState(p.exists ? 'update' : 'new');
  const [after, setAfter] = useState(steps.length ? String(steps[steps.length - 1].id) : '');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { onDone(await api.post('/roadmap/modules', { module: imp.module, mode, after_step_id: after === 'start' ? 0 : after ? Number(after) : null })); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const List = ({ title, items, tone }) => (items.length ? <div><b className={tone}>{title} · {items.length}</b><ul className="imp-list">{items.slice(0, 12).map((x) => <li key={x}>{x}</li>)}{items.length > 12 && <li>… and {items.length - 12} more</li>}</ul></div> : null);
  return (
    <Modal wide title={`Import “${p.title || p.id}”`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={go}>{mode === 'update' ? 'Update step' : 'Add step'}</button></>}>
      <div className="stack">
        {p.exists ? (
          <>
            <div className="banner"><div className="grow"><b>This module is already step {p.exists.position + 1}: {p.exists.title}</b><small>Updating keeps uploaded videos, the rules sheet, the step position, score range and student progress (lessons match by section id).</small></div></div>
            <Segmented value={mode} onChange={setMode} options={[{ value: 'update', label: 'Update existing step' }, { value: 'new', label: 'Import as a new step' }]} />
          </>
        ) : <p className="muted">A new step with {p.sections} lessons.</p>}
        {mode === 'update' && p.exists ? (
          <div className="imp-sum">
            <List title="Sections added" items={p.added} tone="good-text" />
            <List title="Sections changed" items={p.changed} tone="warn-text" />
            <List title="Sections removed" items={p.removed} tone="bad-text" />
            <p className="muted">{p.questions_changed} check question{p.questions_changed === 1 ? '' : 's'} new or changed{!p.added.length && !p.changed.length && !p.removed.length ? ' · nothing else changes' : ''}.</p>
          </div>
        ) : (
          <label className="field"><span>Put the new step</span>
            <select value={after} onChange={(e) => setAfter(e.target.value)}>
              <option value="start">At the start</option>
              {steps.map((s, i) => <option key={s.id} value={s.id}>After step {i + 1}: {s.title}</option>)}
            </select>
          </label>
        )}
      </div>
    </Modal>
  );
}

/** Trash (30 days) and version history, each with Restore. */
function RoadmapPanel({ kind, onClose, onChanged }) {
  const toast = useToast();
  const st = useAsync(() => api.get(kind === 'trash' ? '/roadmap/trash' : '/roadmap/versions'), [kind]);
  const [busy, setBusy] = useState(0);
  const restore = async (id) => {
    setBusy(id);
    try {
      await api.post(kind === 'trash' ? `/roadmap/steps/${id}/restore` : `/roadmap/versions/${id}/restore`, {});
      toast(kind === 'trash' ? 'Step restored' : 'Roadmap restored to that version'); onChanged(); st.reload();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(0); }
  };
  return (
    <Modal wide title={kind === 'trash' ? 'Trash · kept for 30 days' : 'Roadmap history'} onClose={onClose}>
      <Gate state={st}>{(rows) => (!rows.length ? <p className="muted center">{kind === 'trash' ? 'The Trash is empty.' : 'No changes recorded yet.'}</p> : (
        <div className="rm-hist">
          {rows.map((r, i) => (
            <div key={r.id} className="rm-hist-row">
              <div className="grow">
                <b>{kind === 'trash' ? r.title : r.action}</b>
                <small>{kind === 'trash' ? `${r.items} lessons · deleted ${fmtDate(r.deleted_at)}${r.deleted_by_name ? ` by ${r.deleted_by_name}` : ''}` : `${r.user_name || 'Teacher'} · ${new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${i === 0 ? ' · current' : ''}`}</small>
              </div>
              {(kind === 'trash' || i > 0) && <button className="btn soft sm" disabled={busy === r.id} onClick={() => restore(r.id)}>{kind === 'trash' ? 'Restore' : 'Restore this version'}</button>}
            </div>
          ))}
        </div>
      ))}</Gate>
    </Modal>
  );
}
