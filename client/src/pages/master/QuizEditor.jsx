import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Field, Gate, PageHeader, Segmented, Spinner, useAsync } from '../../components/ui.jsx';
import { IconDownload, IconPlus, IconTrash, IconUpload } from '../../components/icons.jsx';

const blank = () => ({ _k: Math.random().toString(36).slice(2), passage: '', prompt: 'Which choice completes the text so that it conforms to the conventions of Standard English?', opt_a: '', opt_b: '', opt_c: '', opt_d: '', correct: '', explanation: '', tip: '', topic: 'General' });
const problems = (q) => {
  const p = [];
  if (!q.passage.trim()) p.push("no passage");
  const filled = ['a', 'b', 'c', 'd'].filter((l) => q['opt_' + l].trim());
  if (filled.length < 2) p.push("at least 2 options");
  if (!q.correct) p.push("no correct answer");
  else if (!filled.includes(q.correct.toLowerCase())) p.push("correct answer is an empty option");
  return p;
};

export default function QuizEditor() {
  const { id } = useParams();
  const st = useAsync(() => (id ? api.get('/quizzes/' + id) : Promise.resolve(null)).then(async (q) => [q, await api.get('/groups')]), [id]);
  return (
    <div className="page">
      <Gate state={st}>{([quiz, groups]) => <Editor key={id || 'new'} quiz={quiz} groups={groups} />}</Gate>
    </div>
  );
}

function Editor({ quiz, groups }) {
  const nav = useNavigate();
  const toast = useToast();
  const fileRef = useRef();
  const [meta, setMeta] = useState({ title: quiz?.title || '', section: quiz?.section || 'english', kind: quiz?.kind || 'practice', is_public: quiz ? !!quiz.is_public : true, duration_min: quiz?.duration_min ?? 0 });
  const [groupIds, setGroupIds] = useState(new Set(quiz?.group_ids || []));
  const [qs, setQs] = useState(() => (quiz?.questions || []).map((q) => ({ ...q, _k: 'q' + q.id })));
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [over, setOver] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const topics = useMemo(() => [...new Set(qs.map((q) => q.topic).filter(Boolean)), 'Boundaries', 'Form, Structure, and Sense', 'Transitions', 'Words in Context', 'Text Structure and Purpose', 'Cross-Text Connections', 'Central Ideas and Details', 'Command of Evidence', 'Inferences', 'Rhetorical Synthesis'].filter((v, i, a) => a.indexOf(v) === i), [qs]);
  const bad = qs.filter((q) => problems(q).length).length;

  const upd = (k, patch) => setQs((l) => l.map((q) => (q._k === k ? { ...q, ...patch } : q)));
  const move = (i, d) => setQs((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const onFile = async (file) => {
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api.upload('/quizzes/parse', fd);
      setQs((l) => [...l, ...r.questions.map((q) => ({ ...blank(), ...q }))]);
      if (!meta.title) setMeta((m) => ({ ...m, title: file.name.replace(/\.[^.]+$/, '') }));
      if (!meta.duration_min) setMeta((m) => ({ ...m, duration_min: Math.ceil((qs.length + r.questions.length) * 0.8) }));
      toast(`${r.questions.length} questions imported — please review them`);
    } catch (e) { toast(e.message, 'err'); } finally { setParsing(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const save = async () => {
    setShowErrors(true);
    if (!meta.title.trim()) return toast("Enter a quiz name", 'err');
    if (!qs.length) return toast("At least 1 question is required", 'err');
    if (bad) return toast(`${bad} questions have errors (marked in red)`, 'err');
    setBusy(true);
    try {
      const body = { ...meta, group_ids: [...groupIds], questions: qs.map(({ _k, ...q }) => q) };
      if (quiz) await api.put('/quizzes/' + quiz.id, body); else await api.post('/quizzes', body);
      toast("Quiz saved"); nav('/quizzes');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title={quiz ? "Edit quiz" : "New quiz"} sub={<><Link to="/quizzes">{"Quizzes"}</Link> / {quiz ? quiz.title : "new"}</>}>
        <button className="btn ghost" onClick={() => api.download('/template.xlsx', 'questions-template.xlsx')}><IconDownload /> {"Excel template"}</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </PageHeader>

      <Card className="stack">
        <div className="form-grid">
          <div className="full"><Field label={"Quiz name"}><input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="Boundaries 1 Fast Quiz" /></Field></div>
          <Field label={"Section"}><select value={meta.section} onChange={(e) => setMeta({ ...meta, section: e.target.value })}><option value="english">Reading & Writing</option><option value="math">Math</option></select></Field>
          <Field label={"Time (minutes)"} hint={"0 = untimed"}><input type="number" min="0" max="300" value={meta.duration_min} onChange={(e) => setMeta({ ...meta, duration_min: e.target.value })} /></Field>
          <div className="full"><Field label="Type">
            <Segmented value={meta.kind} onChange={(kind) => setMeta({ ...meta, kind })} options={[{ value: 'practice', label: 'Practice' }, { value: 'mock', label: 'Mock test' }]} />
          </Field>
          <small className="muted">Practice shows the answer after each question; a mock test shows results at the end.</small></div>
        </div>
        <div><div className="muted" style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: 8 }}>Who can see it</div>
          <label className="row" style={{ marginBottom: 10, cursor: 'pointer' }}><input type="checkbox" checked={meta.is_public} onChange={(e) => setMeta({ ...meta, is_public: e.target.checked })} style={{ width: 18, height: 18 }} /> <span><b>All students</b> <small className="muted">— everyone on the platform (subscribers can start it)</small></span></label>
          {meta.is_public ? null : groups.length === 0 ? <p className="muted">No groups yet. Quizzes linked in the roadmap are visible to everyone.</p> :
            <div className="tag-list">{groups.map((g) => <button key={g.id} type="button" className={`chip chip-btn ${groupIds.has(g.id) ? 'on' : ''}`} onClick={() => setGroupIds((s) => { const n = new Set(s); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })}>{groupIds.has(g.id) ? '✓ ' : ''}{g.name}</button>)}</div>}
        </div>
      </Card>

      <div className={`drop ${over ? 'over' : ''}`} onClick={() => fileRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); }} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}>
        {parsing ? <Spinner label={"Reading file…"} /> : <>
          <IconUpload width={30} height={30} style={{ color: 'var(--primary)' }} />
          <b>{"Drop a PDF or Excel file here"}</b>
          <span className="muted" style={{ fontSize: '.86rem' }}>{".xlsx · .csv · .pdf · .txt — questions are read automatically, then you can edit them"}</span>
        </>}
        <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv,.pdf,.txt" onChange={(e) => onFile(e.target.files[0])} />
      </div>
      <details className="card"><summary style={{ cursor: 'pointer', fontWeight: 600 }}>{"What should the PDF / text format look like?"}</summary>
        <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: 14, borderRadius: 12, fontSize: '.85rem', marginBottom: 0 }}>{`1. Although Marie Curie ... discovered ______ still faced skepticism.
Which choice completes the text so that it conforms to the conventions of Standard English?
A) radium, she
B) radium; she
C) radium, despite she
D) radium, but she
Answer: A
Explanation: Subordinate clause is followed by a comma.
Topic: Boundaries

2. Next question ...`}</pre>
        <p className="muted" style={{ marginTop: 10, fontSize: '.86rem' }}>{"Excel: columns — passage, question, A, B, C, D, correct, explanation, tip, topic (download the template). Practice quizzes show the answer and tip right after each question; mocks and the readiness check show them at the end."}</p>
      </details>

      <div className="card-title" style={{ marginBottom: 0 }}>
        <h2>{"Questions ("}{qs.length}){bad > 0 && <span className="chip bad" style={{ marginLeft: 10 }}>{bad} {"errors"}</span>}</h2>
        <button className="btn soft sm" onClick={() => setQs((l) => [...l, blank()])}><IconPlus width={16} height={16} /> {"Add question"}</button>
      </div>
      <datalist id="topics">{topics.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="stack sm">
        {qs.map((q, i) => {
          const p = problems(q);
          return (
            <details key={q._k} className={`q-edit ${showErrors && p.length ? 'invalid' : ''}`} open={!q.id && !q.passage}>
              <summary>
                <span className="q-num">{i + 1}</span>
                <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.passage || <i className="muted">{"Empty question"}</i>}</span>
                {p.length > 0 && <span className="chip bad">{p[0]}</span>}
                <span className="chip">{q.topic}</span>
                {q.correct && <span className="chip good">{q.correct}</span>}
              </summary>
              <div className="q-body">
                <Field label={"Passage"}><textarea rows={3} value={q.passage} onChange={(e) => upd(q._k, { passage: e.target.value })} /></Field>
                <Field label={"Question"}><input value={q.prompt} onChange={(e) => upd(q._k, { prompt: e.target.value })} /></Field>
                <div className="form-grid">
                  {['a', 'b', 'c', 'd'].map((l) => (
                    <div key={l} className="opt-edit">
                      <label className={`radio ${q.correct === l.toUpperCase() ? 'on' : ''}`} title={"Mark as the correct answer"} onClick={() => upd(q._k, { correct: l.toUpperCase() })}>{l.toUpperCase()}</label>
                      <input value={q['opt_' + l]} onChange={(e) => upd(q._k, { ['opt_' + l]: e.target.value })} placeholder={`Option ${l.toUpperCase()}`} />
                    </div>
                  ))}
                </div>
                <small className="muted">{"Click the correct answer letter (it turns green)."}</small>
                <Field label={"Explanation (why this answer is correct)"}><textarea rows={2} value={q.explanation} onChange={(e) => upd(q._k, { explanation: e.target.value })} /></Field>
                <Field label="Ustoz tip" hint="optional — a short strategy hint shown with the feedback"><input value={q.tip || ''} onChange={(e) => upd(q._k, { tip: e.target.value })} placeholder="Fill the blank with your own word before reading the options." /></Field>
                <div className="row between wrap">
                  <Field label={"Topic"}><input list="topics" value={q.topic} onChange={(e) => upd(q._k, { topic: e.target.value })} /></Field>
                  <div className="row">
                    <button className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                    <button className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === qs.length - 1}>↓</button>
                    <button className="btn danger-ghost sm" onClick={() => setQs((l) => l.filter((x) => x._k !== q._k))}><IconTrash width={16} height={16} /> {"Delete"}</button>
                  </div>
                </div>
              </div>
            </details>
          );
        })}
        {qs.length === 0 && <Card><p className="center muted">{"No questions yet — upload a file or add one manually."}</p></Card>}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary lg" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save quiz"}</button></div>
    </>
  );
}
