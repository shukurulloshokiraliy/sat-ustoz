import { useState } from 'react';
import { api, daysUntil, fmtDate } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Avatar, Card, Confirm, CountUp, Empty, Field, Gate, Modal, PageHeader, Progress, useAsync } from '../../components/ui.jsx';
import PathTrack from '../../components/PathTrack.jsx';
import { IconAward, IconBolt, IconBriefcase, IconEdit, IconFlame, IconLink, IconPlus, IconPrint, IconQuiz, IconTarget, IconTrash } from '../../components/icons.jsx';

const CATS = ['Achievement', 'Goal', 'Essay', 'Project', 'Certificate', 'Activity'];

export function computeBadges(a) {
  const best = a.history.reduce((m, h) => Math.max(m, h.pct), 0);
  return [
    { icon: IconQuiz, title: "First step", text: "Finished the first quiz", on: a.totals.attempts >= 1 },
    { icon: IconFlame, title: "3-day streak", text: "Practiced 3 days in a row", on: a.streak >= 3 },
    { icon: IconBolt, title: "7-day streak", text: "Practiced 7 days in a row", on: a.streak >= 7 },
    { icon: IconAward, title: '80%+', text: "Scored 80% or higher on a quiz", on: best >= 80 },
    { icon: IconAward, title: "Perfect", text: "Scored 100% on a quiz", on: best === 100 },
    { icon: IconQuiz, title: "10 quizzes", text: "Finished 10 quizzes", on: a.totals.attempts >= 10 },
    { icon: IconTarget, title: "100 questions", text: "Answered 100 questions", on: a.totals.answered >= 100 },
  ];
}

/** Shared portfolio body — used by the student (editable) and by the master (read-only). */
export function PortfolioView({ data, editable, onChange }) {
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const { user, items, analytics: a } = data;
  const badges = computeBadges(a);
  const left = daysUntil(user.exam_date);

  const save = async (form) => {
    try {
      if (form.id) await api.put('/portfolio/' + form.id, form); else await api.post('/portfolio', form);
      setEdit(null); toast("Saved"); onChange();
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <div className="stack">
      <Card className="pf-hero">
        <Avatar name={user.name} size={72} />
        <div className="stack sm">
          <h2 style={{ fontSize: '1.4rem' }}>{user.name}</h2>
          <div className="row wrap">
            <span className="chip primary">{"Goal:"} {user.target_english + user.target_math}</span>
            <span className="chip">R&W {user.target_english}</span><span className="chip">Math {user.target_math}</span>
            {user.exam_date && <span className="chip warn">{"Exam:"} {fmtDate(user.exam_date)}{left > 0 ? ` · ${left} days` : ''}</span>}
          </div>
        </div>
        <div className="mini-stats">
          <div><b><CountUp value={a.estimates.english} /></b><span>{"R&W estimate"}</span></div>
          <div><b><CountUp value={a.totals.accuracy} suffix="%" /></b><span>{"Accuracy"}</span></div>
          <div><b>{a.level}</b><span>Level</span></div>
        </div>
      </Card>

      <Card><div className="card-title"><h2>{"Progress"}</h2></div><PathTrack value={a.estimates.english} target={user.target_english} /></Card>

      <Card>
        <div className="card-title"><h2>{"Achievements (automatic)"}</h2><span className="chip good">{badges.filter((b) => b.on).length}/{badges.length}</span></div>
        <div className="badges stagger">
          {badges.map((b) => (
            <div key={b.title} className={`badge ${b.on ? '' : 'locked'}`}><span className="ico"><b.icon /></span><b>{b.title}</b><small>{b.text}</small></div>
          ))}
        </div>
      </Card>

      <div className="card-title" style={{ marginBottom: 0 }}>
        <h2>{"Portfolio entries"}</h2>
        {editable && <button className="btn primary sm no-print" onClick={() => setEdit({ title: '', category: 'Achievement', description: '', date: new Date().toISOString().slice(0, 10), link: '' })}><IconPlus width={16} height={16} /> {"Add"}</button>}
      </div>
      {items.length === 0 ? (
        <Card><Empty icon={<IconBriefcase />} title={"Portfolio is empty"} text={editable ? "Add essays, certificates, projects or achievements — a foundation for your college applications." : "The student has not added any entries yet."} /></Card>
      ) : (
        <div className="grid g2 stagger">
          {items.map((it) => (
            <Card key={it.id} className="pf-item">
              <div className="meta"><span className="chip primary">{it.category}</span>{it.date && <small className="muted">{fmtDate(it.date)}</small>}</div>
              <h3>{it.title}</h3>
              {it.description && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{it.description}</p>}
              {it.link && <a href={/^https?:/.test(it.link) ? it.link : `https://${it.link}`} target="_blank" rel="noreferrer noopener" className="row" style={{ gap: 6 }}><IconLink width={16} height={16} /> {it.link}</a>}
              {editable && (
                <div className="row no-print" style={{ marginTop: 6 }}>
                  <button className="icon-btn sm" onClick={() => setEdit(it)} aria-label={"Edit"}><IconEdit width={16} height={16} /></button>
                  <button className="icon-btn sm danger" onClick={() => setDel(it)} aria-label={"Delete"}><IconTrash width={16} height={16} /></button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {edit && <ItemForm item={edit} onClose={() => setEdit(null)} onSave={save} />}
      {del && <Confirm title={"Delete entry"} text={`Delete “${del.title}”?`} onClose={() => setDel(null)} onConfirm={async () => { await api.del('/portfolio/' + del.id); setDel(null); onChange(); }} />}
    </div>
  );
}

function ItemForm({ item, onClose, onSave }) {
  const [f, setF] = useState(item);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={f.id ? "Edit entry" : "New entry"} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>{"Cancel"}</button><button className="btn primary" onClick={() => onSave(f)} disabled={!f.title.trim()}>{"Save"}</button></>}>
      <Field label={"Title"}><input autoFocus value={f.title} onChange={set('title')} placeholder={"E.g. SAT mock — 1380"} /></Field>
      <div className="form-grid">
        <Field label={"Category"}><select value={f.category} onChange={set('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label={"Date"}><input type="date" value={f.date || ''} onChange={set('date')} /></Field>
      </div>
      <Field label={"Description"}><textarea value={f.description} onChange={set('description')} /></Field>
      <Field label={"Link (optional)"}><input value={f.link} onChange={set('link')} placeholder="https://…" /></Field>
    </Modal>
  );
}

export default function Portfolio() {
  const st = useAsync(() => api.get('/portfolio'), []);
  return (
    <div className="page">
      <PageHeader title="Portfolio" sub={"Your achievements, goals and results — on one page."}>
        <button className="btn ghost" onClick={() => window.print()}><IconPrint /> {"PDF / Print"}</button>
      </PageHeader>
      <Gate state={st}>{(d) => <PortfolioView data={d} editable onChange={st.reload} />}</Gate>
    </div>
  );
}
