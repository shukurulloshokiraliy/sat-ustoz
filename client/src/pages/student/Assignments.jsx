import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Card, Confirm, Empty, Field, Gate, Modal, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconClock, IconLock, IconPlus, IconRoad, IconSearch, IconTask, IconTrash, IconUsers } from '../../components/icons.jsx';

const STATUS = {
  new: ['New', 'primary'], in_progress: ['In progress', 'warn'], retake: ['Retake available', 'warn'],
  passed: ['Passed', 'good'], failed: ['No attempts left', 'bad'], locked: ['Locked', ''],
};

export default function Assignments() {
  const { user } = useAuth();
  return user.role === 'master' ? <TeacherAssignments /> : <StudentAssignments />;
}

/** Student: what to do now, what is done, what opens next on the roadmap. */
function StudentAssignments() {
  const st = useAsync(() => api.get('/assignments'), []);
  return (
    <div className="page">
      <PageHeader title="Assignments" sub="Quizzes from your roadmap open step by step; your teacher can add more." />
      <Gate state={st}>{({ items }) => <AssignmentList items={items} />}</Gate>
    </div>
  );
}

export function AssignmentList({ items, teacherView }) {
  const todo = items.filter((a) => ['new', 'in_progress', 'retake'].includes(a.status))
    .sort((a, b) => (a.due_at ? new Date(a.due_at) : 9e15) - (b.due_at ? new Date(b.due_at) : 9e15));
  const done = items.filter((a) => a.status === 'passed' || a.status === 'failed');
  const later = items.filter((a) => a.status === 'locked');
  if (!items.length) return <Card><Empty icon={<IconTask />} title="No assignments yet" text="Quizzes appear here when you reach their roadmap step, or when your teacher assigns one." /></Card>;
  return (
    <div className="as-wrap">
      {todo.length > 0 && <section><h2 className="as-h">To do <span className="badge-n">{todo.length}</span></h2><div className="as-list">{todo.map((a) => <AssignmentCard key={a.key} a={a} teacherView={teacherView} />)}</div></section>}
      {done.length > 0 && <section><h2 className="as-h">Done</h2><div className="as-list">{done.map((a) => <AssignmentCard key={a.key} a={a} teacherView={teacherView} />)}</div></section>}
      {later.length > 0 && <section><h2 className="as-h">Coming next</h2><div className="as-list">{later.map((a) => <AssignmentCard key={a.key} a={a} teacherView={teacherView} />)}</div></section>}
    </div>
  );
}

function AssignmentCard({ a, teacherView }) {
  const [label, tone] = STATUS[a.status] || [a.status, ''];
  const btn = a.status === 'in_progress' ? 'Continue' : a.status === 'retake' ? 'Retake' : a.status === 'passed' ? 'Try again' : 'Start';
  return (
    <article className={`as-card ${a.status} ${a.overdue ? 'overdue' : ''}`}>
      <span className="as-ic">{a.locked ? <IconLock width={20} height={20} /> : a.status === 'passed' ? <IconCheck width={20} height={20} /> : a.source === 'roadmap' ? <IconRoad width={20} height={20} /> : <IconTask width={20} height={20} />}</span>
      <div className="grow">
        <small className="as-src">{a.step ? `Roadmap · step ${a.step.index} · ${a.step.title}` : a.source === 'group' ? 'From your teacher · your group' : 'From your teacher'}</small>
        <h3>{a.title}</h3>
        <div className="as-meta">
          <span className={`chip ${tone}`}>{label}</span>
          {a.questions > 0 && <span>{a.questions} questions{a.minutes ? ` · ${a.minutes} min` : ''}</span>}
          <span>Pass {a.pass_pct}%</span>
          {a.best != null && <span>Best <b>{a.best}%</b>{a.tries ? ` · ${a.tries} ${a.tries === 1 ? 'try' : 'tries'}` : ''}{a.attempts_allowed ? ` of ${a.attempts_allowed}` : ''}</span>}
          {a.due_at && <span className={a.overdue ? 'bad-text' : ''}><IconClock width={13} height={13} /> {a.overdue ? 'Overdue · ' : 'Due '}{fmtDate(a.due_at, { day: 'numeric', month: 'short' })}</span>}
        </div>
        {a.note && <p className="muted as-note">{a.note}</p>}
        {a.locked && <p className="muted as-note">{a.lock_reason}</p>}
      </div>
      {!teacherView && !a.locked && a.status !== 'failed' && <Link className={`btn ${a.status === 'passed' ? 'ghost' : 'primary'} sm`} to={`/quiz/${a.quiz_id}`}>{btn} <IconArrow width={15} height={15} /></Link>}
    </article>
  );
}

/** Teacher: everything assigned outside the roadmap, with who passed. */
function TeacherAssignments() {
  const st = useAsync(() => Promise.all([api.get('/master/assignments'), api.get('/quizzes')]), []);
  const toast = useToast();
  const [assign, setAssign] = useState(false);
  const [del, setDel] = useState(null);
  const [open, setOpen] = useState(null);
  return (
    <div className="page">
      <PageHeader title="Assignments" sub="Roadmap quizzes open for each student as they reach the step. Here you give extra quizzes to a student or a group — retakes, homework, deadlines.">
        <button className="btn primary" onClick={() => setAssign(true)}><IconPlus width={16} height={16} /> Assign a quiz</button>
      </PageHeader>
      <Gate state={st}>{([rows, quizzes]) => (
        <>
          {!rows.length ? <Card><Empty icon={<IconTask />} title="Nothing assigned yet" text="Press “Assign a quiz” to give a quiz to one student or a whole group." /></Card> : (
            <div className="as-list">
              {rows.map((a) => (
                <article key={a.id} className="as-card t">
                  <span className="as-ic">{a.group_id ? <IconUsers width={20} height={20} /> : <IconTask width={20} height={20} />}</span>
                  <div className="grow">
                    <small className="as-src">{a.group_id ? `Group · ${a.group_name}` : `Student · ${a.user_name}`} · given {fmtDate(a.created_at, { day: 'numeric', month: 'short' })}</small>
                    <h3>{a.title}</h3>
                    <div className="as-meta">
                      <span className="chip good">{a.passed} of {a.total} passed</span>
                      <span>{a.started} started</span>
                      <span>Pass {a.pass_pct}%{a.attempts_allowed ? ` · ${a.attempts_allowed} attempts` : ''}</span>
                      {a.due_at && <span><IconClock width={13} height={13} /> Due {fmtDate(a.due_at, { day: 'numeric', month: 'short' })}</span>}
                    </div>
                    {open === a.id && (
                      <div className="as-people">
                        {a.students.map((s) => <Link key={s.id} to={`/students/${s.id}`} className={`as-person ${s.status}`}><b>{s.name}</b><span>{STATUS[s.status]?.[0] || s.status}{s.best != null ? ` · ${s.best}%` : ''}</span></Link>)}
                      </div>
                    )}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn ghost sm" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Hide' : 'Students'}</button>
                    <button className="icon-sm danger" aria-label="Remove assignment" onClick={() => setDel(a)}><IconTrash width={15} height={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {assign && <AssignModal quizzes={quizzes} onClose={() => setAssign(false)} onDone={() => { setAssign(false); st.reload(); }} />}
          {del && <Confirm title="Remove this assignment?" text={`Students keep their results, but “${del.title}” leaves their Assignments.`} confirmLabel="Remove" onClose={() => setDel(null)}
            onConfirm={async () => { try { await api.del(`/assignments/${del.id}`); toast('Removed'); setDel(null); st.reload(); } catch (e) { toast(e.message, 'bad'); } }} />}
        </>
      )}</Gate>
    </div>
  );
}

/** "Assign to…": one quiz → students and/or a group, optional due date, attempts and pass mark. */
export function AssignModal({ quizzes, quizId, studentId, onClose, onDone }) {
  const toast = useToast();
  const st = useAsync(() => Promise.all([api.get('/students'), api.get('/groups')]), []);
  const [f, setF] = useState({ quiz_id: quizId || '', mode: studentId ? 'students' : 'group', group_id: '', due_at: '', attempts_allowed: '', pass_pct: 70, note: '' });
  const [picked, setPicked] = useState(() => new Set(studentId ? [studentId] : []));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/assignments', { quiz_id: f.quiz_id, group_id: f.mode === 'group' ? f.group_id : null, user_ids: f.mode === 'students' ? [...picked] : [],
        due_at: f.due_at ? new Date(f.due_at + 'T23:59:00+05:00').toISOString() : null, attempts_allowed: f.attempts_allowed, pass_pct: f.pass_pct, note: f.note });
      toast('Assigned'); onDone();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const ready = f.quiz_id && (f.mode === 'group' ? f.group_id : picked.size);
  return (
    <Modal wide title="Assign a quiz" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!ready || busy} onClick={save}>Assign</button></>}>
      <Gate state={st}>{([students, groups]) => (
        <AssignForm {...{ f, set, setF, quizzes, students, groups, picked, setPicked, q, setQ, quizId }} />
      )}</Gate>
    </Modal>
  );
}

function AssignForm({ f, set, setF, quizzes, students, groups, picked, setPicked, q, setQ, quizId }) {
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return students.filter((s) => !k || `${s.name} ${s.email || ''} ${s.login || ''}`.toLowerCase().includes(k)).slice(0, 80);
  }, [q, students]);
  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="stack">
      {!quizId && (
        <Field label="Quiz">
          <select value={f.quiz_id} onChange={set('quiz_id')}>
            <option value="">Choose a quiz…</option>
            {quizzes.map((x) => <option key={x.id} value={x.id}>{x.title}{x.roadmap ? ' (in roadmap)' : ''}</option>)}
          </select>
        </Field>
      )}
      <Segmented value={f.mode} onChange={(v) => setF({ ...f, mode: v })} options={[{ value: 'group', label: 'A group' }, { value: 'students', label: `Students${picked.size ? ` (${picked.size})` : ''}` }]} />
      {f.mode === 'group' ? (
        <Field label="Group">
          <select value={f.group_id} onChange={set('group_id')}>
            <option value="">Choose a group…</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.students ?? ''} students</option>)}
          </select>
        </Field>
      ) : (
        <div className="as-pick">
          <label className="fin-search"><IconSearch width={16} height={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a student" /></label>
          <div className="as-pick-list">
            {list.map((s) => (
              <label key={s.id} className={`as-pick-row ${picked.has(s.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                <span><b>{s.name}</b><small>{s.group_name || s.email || s.login}</small></span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="grid g3">
        <Field label="Due date" hint="optional"><input type="date" value={f.due_at} onChange={set('due_at')} /></Field>
        <Field label="Attempts" hint="empty = unlimited"><input type="number" min="0" max="20" value={f.attempts_allowed} onChange={set('attempts_allowed')} placeholder="∞" /></Field>
        <Field label="Pass mark, %" hint="usually 70"><input type="number" min="10" max="100" value={f.pass_pct} onChange={set('pass_pct')} /></Field>
      </div>
      <Field label="Note for students" hint="optional"><input value={f.note} onChange={set('note')} maxLength={300} placeholder="Retake after our lesson on Tuesday" /></Field>
      <small className="muted">Students who linked the Telegram bot get a message.</small>
    </div>
  );
}
