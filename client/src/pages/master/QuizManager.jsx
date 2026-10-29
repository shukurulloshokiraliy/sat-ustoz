import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confirm, Empty, Gate, Modal, PageHeader, pctTone, useAsync } from '../../components/ui.jsx';
import { IconDownload, IconEdit, IconLayers, IconPlus, IconQuiz, IconTrash, IconChart } from '../../components/icons.jsx';

export default function QuizManager() {
  const st = useAsync(() => Promise.all([api.get('/quizzes'), api.get('/groups')]), []);
  const toast = useToast();
  const [assign, setAssign] = useState(null);
  const [stats, setStats] = useState(null);
  const [del, setDel] = useState(null);

  return (
    <div className="page">
      <PageHeader title="Quizzes" sub="Upload questions from PDF or Excel, then open them to all students, to groups, or link them in the roadmap.">
        <button className="btn ghost" onClick={() => api.download('/template.xlsx', 'questions-template.xlsx').catch((e) => toast(e.message, 'err'))}><IconDownload /> {"Excel template"}</button>
        <Link className="btn primary" to="/quizzes/new"><IconPlus /> {"New quiz"}</Link>
      </PageHeader>
      <Gate state={st}>{([quizzes, groups]) => quizzes.length === 0 ? (
        <Card><Empty icon={<IconQuiz />} title={"No quizzes yet"} text={"Upload an Excel or PDF file to create your first quiz."}><Link className="btn primary" to="/quizzes/new">{"Create quiz"}</Link></Empty></Card>
      ) : (
        <div className="stack stagger">
          {quizzes.map((q) => (
            <Card key={q.id} className="hover quiz-row">
              <div className="quiz-ico"><IconQuiz /></div>
              <div className="stack sm">
                <h3>{q.title}</h3>
                <div className="quiz-meta">
                  <span className="chip">{q.questions} {"questions"}</span>
                  <span className="chip">{q.duration_min ? `${q.duration_min} min` : "Untimed"}</span>
                  <span className="chip">{q.section === 'math' ? 'Math' : 'R&W'}</span>
                  {q.kind !== 'practice' && <span className="chip primary">{q.kind === 'diagnostic' ? 'Readiness check' : 'Mock test'}</span>}
                  <span className="chip">{q.attempts} {"attempts"}</span>
                  <span className="muted" style={{ fontSize: '.78rem' }}>{fmtDate(q.created_at)}</span>
                </div>
                <div className="tag-list">
                  {q.is_public || q.kind === 'diagnostic' ? <span className="chip good">All students</span> : null}
                  {q.roadmap && <span className="chip primary">In roadmap</span>}
                  {q.groups.map((g) => <span key={g.id} className="chip primary">{g.name}</span>)}
                  {!q.is_public && q.kind !== 'diagnostic' && !q.roadmap && !q.groups.length && <span className="chip warn">Not visible to anyone</span>}
                </div>
              </div>
              <div className="row wrap">
                <button className="btn soft sm" onClick={() => setAssign(q)}><IconLayers width={16} height={16} /> {"Assign"}</button>
                <button className="icon-btn" title={"Statistics"} aria-label={"Statistics"} onClick={() => setStats(q)}><IconChart width={18} height={18} /></button>
                <Link className="icon-btn" to={`/quizzes/${q.id}/edit`} aria-label={"Edit"}><IconEdit width={18} height={18} /></Link>
                <button className="icon-btn danger" onClick={() => setDel(q)} aria-label={"Delete"}><IconTrash width={18} height={18} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}</Gate>
      {assign && <AssignModal quiz={assign} groups={st.data?.[1] || []} onClose={() => setAssign(null)} onSaved={() => { setAssign(null); toast("Saved"); st.reload(); }} />}
      {stats && <StatsModal quiz={stats} onClose={() => setStats(null)} />}
      {del && <Confirm title={"Delete quiz"} text={`“${del.title}” and all results that belong to it will be deleted.`} onClose={() => setDel(null)} onConfirm={async () => { await api.del('/quizzes/' + del.id); setDel(null); toast("Deleted"); st.reload(); }} />}
    </div>
  );
}

function AssignModal({ quiz, groups, onClose, onSaved }) {
  const [sel, setSel] = useState(new Set(quiz.groups.map((g) => g.id)));
  const [pub, setPub] = useState(!!quiz.is_public);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Modal title={`“${quiz.title}” — who can see it?`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>{"Cancel"}</button><button className="btn primary" onClick={async () => { await api.put(`/quizzes/${quiz.id}/groups`, { group_ids: [...sel], is_public: pub }); onSaved(); }}>{"Save"}</button></>}>
      <label className="row" style={{ cursor: 'pointer' }}><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} style={{ width: 18, height: 18 }} /> <span><b>All students</b> <small className="muted">— everyone who signed up</small></span></label>
      <div className="muted" style={{ fontSize: '.82rem', fontWeight: 600 }}>Or only these groups</div>
      {groups.length === 0 ? <p className="muted">No groups yet — create one in Groups.</p> : (
        <div className="tag-list">{groups.map((g) => <button key={g.id} className={`chip chip-btn ${sel.has(g.id) ? 'on' : ''}`} onClick={() => toggle(g.id)}>{sel.has(g.id) ? '✓ ' : ''}{g.name} · {g.students}</button>)}</div>
      )}
    </Modal>
  );
}

function StatsModal({ quiz, onClose }) {
  const st = useAsync(() => api.get(`/quizzes/${quiz.id}/stats`), [quiz.id]);
  return (
    <Modal title={`${quiz.title} — statistics`} onClose={onClose} wide>
      <Gate state={st}>{(d) => (
        <div className="grid g2">
          <div className="stack sm"><h3>{"Students (best result)"}</h3>
            {d.students.length === 0 ? <p className="muted">{"No attempts yet."}</p> : d.students.map((s) => <Link key={s.student_id} to={`/students/${s.student_id}`} className="row between" onClick={onClose} style={{ color: 'inherit' }}><span>{s.name}</span><span className={`chip ${pctTone(s.best)}`}>{s.best}% · {s.tries}x</span></Link>)}
          </div>
          <div className="stack sm"><h3>{"Hardest questions"}</h3>
            {d.hardest.length === 0 ? <p className="muted">{"No data yet."}</p> : d.hardest.map((h) => <div key={h.id} className="row between"><span>#{h.position + 1} · {h.topic}</span><span className={`chip ${pctTone(h.pct)}`}>{h.pct}{"% correct"}</span></div>)}
          </div>
        </div>
      )}</Gate>
    </Modal>
  );
}
