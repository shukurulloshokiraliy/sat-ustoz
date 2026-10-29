import { useRef, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confirm, Field, Gate, Modal, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import RoadmapMap, { StepDisc, STEP_COLORS } from '../../components/RoadmapMap.jsx';
import { HandoutEditor } from '../../components/Handout.jsx';
import { IconDoc, IconDown, IconEdit, IconPlay, IconPlus, IconQuiz, IconTrash, IconUp } from '../../components/icons.jsx';

const countLabel = (items) => [['lesson', 'lesson', 'lessons'], ['video', 'video', 'videos'], ['quiz', 'quiz', 'quizzes'], ['reading', 'note', 'notes']]
  .map(([k, one, many]) => { const n = items.filter((x) => x.kind === k).length; return n ? `${n} ${n === 1 ? one : many}` : null; })
  .filter(Boolean).join(' · ');
const BLANK = { title: '', subtitle: '', badge: '', color: 'signal', score_from: 200, score_to: 300, pass_pct: 70, description: '', focus: '', items: [] };

export default function RoadmapEditor() {
  const st = useAsync(() => Promise.all([api.get('/roadmap'), api.get('/quizzes')]), []);
  const toast = useToast();
  const fileRef = useRef(null);
  const importModule = async (file) => {
    if (!file) return;
    try {
      const r = await api.post('/roadmap/modules', JSON.parse(await file.text()));
      toast(`${r.created ? 'Module added' : 'Module updated'} · ${r.ready}/${r.lessons} lessons ready`);
      st.reload();
    } catch (e) { toast(e instanceof SyntaxError ? 'This is not a valid JSON file' : e.message, 'bad'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const [edit, setEdit] = useState(null); // { step, insertAt }
  const [del, setDel] = useState(null);
  const [view, setView] = useState('both');

  return (
    <div className="page">
      <PageHeader title="Roadmap" sub="Build the path students follow from 200 to 800. Each step can hold video lessons, study notes and quizzes.">
        <Segmented value={view} onChange={setView} options={[{ value: 'both', label: 'Map + list' }, { value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} />
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import module (JSON)</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importModule(e.target.files[0])} />
        <button className="btn primary" onClick={() => setEdit({ step: BLANK, insertAt: null })}><IconPlus /> New step</button>
      </PageHeader>
      <Gate state={st}>{([{ steps }, quizzes]) => {
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
                <div key={s.id} className="step-li">
                  <div className="ord">
                    <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><IconUp width={14} height={14} /></button>
                    <button aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><IconDown width={14} height={14} /></button>
                  </div>
                  <StepDisc step={s} size={44} />
                  <div style={{ minWidth: 0 }}>
                    <b>{i + 1}. {s.title}</b>
                    <small>{s.score_from}–{s.score_to} · {s.items.length ? countLabel(s.items) : 'no lessons — completes by score'}</small>
                  </div>
                  <div className="acts">
                    <button className="icon-sm" aria-label="Insert a step after" title="Insert a step after" onClick={() => setEdit({ step: { ...BLANK, score_from: s.score_to, score_to: Math.min(800, s.score_to + 50) }, insertAt: i + 1 })}><IconPlus width={16} height={16} /></button>
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
            {edit && <StepModal init={edit.step} insertAt={edit.insertAt} quizzes={quizzes} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); st.reload(); }} onChanged={st.reload} />}
            {del && <Confirm title="Delete step" text={`“${del.title}” and its lessons will be removed from the roadmap. Quizzes stay in the Quizzes page.`}
              onClose={() => setDel(null)} onConfirm={async () => { await api.del('/roadmap/steps/' + del.id); setDel(null); toast('Step deleted'); st.reload(); }} />}
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
        </div>
      </div>
      {!f.items.length && <p className="muted" style={{ fontSize: '.86rem' }}>No lessons — the step then completes when the student's estimated score reaches “Score to”.</p>}
      {f.items.map((it, i) => (
        <div key={it._k} className="item-edit">
          <div className="item-edit-head">
            {it.kind === 'lesson'
              ? <span className="row" style={{ gap: 6 }}><span className="chip primary">{it.lesson?.type === 'vocab' ? `Vocabulary · ${it.lesson.words} words` : it.lesson?.type === 'session' ? `Session check · ${it.lesson.time_minutes} min` : `Lesson ${it.lesson?.order} · from module`}</span>{it.status !== 'ready' && <span className="chip warn">Coming soon</span>}{it.lesson?.check_count > 0 && <span className="chip">Level check {it.lesson.versions.join('/')} × {it.lesson.check_count}</span>}</span>
              : <Segmented value={it.kind} onChange={(kind) => setItem(it._k, { kind, quiz_id: kind === 'quiz' ? it.quiz_id || quizzes[0]?.id : null })}
                  options={[{ value: 'video', label: 'Video' }, { value: 'quiz', label: 'Quiz' }, { value: 'reading', label: 'Notes' }]} />}
            <span className="grow" />
            <button className="icon-sm" type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveItem(i, -1)}><IconUp width={15} height={15} /></button>
            <button className="icon-sm" type="button" aria-label="Move down" disabled={i === f.items.length - 1} onClick={() => moveItem(i, 1)}><IconDown width={15} height={15} /></button>
            <button className="icon-sm danger" type="button" aria-label="Remove" onClick={() => removeItem(it._k)}><IconTrash width={15} height={15} /></button>
          </div>
          <input value={it.title} onChange={(e) => setItem(it._k, { title: e.target.value })} placeholder={it.kind === 'video' ? 'Lesson 1: Commas' : it.kind === 'quiz' ? 'Level check (optional title)' : 'Study notes'} aria-label="Lesson title" />
          {(it.kind === 'video' || it.kind === 'lesson') && <input value={it.url || ''} onChange={(e) => setItem(it._k, { url: e.target.value })} placeholder={it.kind === 'lesson' ? `Video link for this lesson (optional${it.lesson?.video_meta?.length_minutes ? `, planned ${it.lesson.video_meta.length_minutes} min` : ''}) — https://youtu.be/…` : 'https://youtu.be/…  or a Supabase Storage video link'} aria-label="Video link" />}
          {it.kind === 'lesson' && it.lesson?.video_meta?.covers && !it.url && <small className="muted">Video plan: {it.lesson.video_meta.covers}</small>}
          {it.kind === 'quiz' && (
            <select value={it.quiz_id || ''} onChange={(e) => setItem(it._k, { quiz_id: Number(e.target.value) })} aria-label="Quiz">
              {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title} · {q.questions} questions{q.kind !== 'practice' ? ` (${q.kind})` : ''}</option>)}
            </select>
          )}
          {it.kind === 'reading' && <textarea rows={4} value={it.body} onChange={(e) => setItem(it._k, { body: e.target.value })} placeholder="Rules, examples, tips…" aria-label="Notes" />}
        </div>
      ))}
    </Modal>
  );
}
