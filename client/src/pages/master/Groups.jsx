import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confirm, Empty, Field, Gate, Modal, PageHeader, useAsync } from '../../components/ui.jsx';
import { IconEdit, IconLayers, IconPlus, IconQuiz, IconTrash, IconUsers } from '../../components/icons.jsx';

export default function Groups() {
  const st = useAsync(() => api.get('/groups'), []);
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    try {
      if (form.id) await api.put('/groups/' + form.id, { name: form.name }); else await api.post('/groups', { name: form.name });
      setForm(null); toast("Saved"); st.reload();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="page">
      <PageHeader title={"Groups"} sub={"Create a group or class, add students and assign quizzes."}>
        <button className="btn primary" onClick={() => { setErr(''); setForm({ name: '' }); }}><IconPlus /> {"New group"}</button>
      </PageHeader>
      <Gate state={st}>{(list) => list.length === 0 ? (
        <Card><Empty icon={<IconLayers />} title={"No groups yet"} text={"Create your first group."}><button className="btn primary" onClick={() => setForm({ name: '' })}>{"Create group"}</button></Empty></Card>
      ) : (
        <div className="grid g3 stagger">
          {list.map((g) => (
            <Card key={g.id} className="hover stack">
              <div className="row between"><div className="quiz-ico"><IconLayers /></div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="icon-btn sm" onClick={() => { setErr(''); setForm(g); }} aria-label={"Rename"}><IconEdit width={16} height={16} /></button>
                  <button className="icon-btn sm danger" onClick={() => setDel(g)} aria-label={"Delete"}><IconTrash width={16} height={16} /></button>
                </div>
              </div>
              <h3>{g.name}</h3>
              <div className="row wrap"><span className="chip"><IconUsers width={14} height={14} /> {g.students} {"students"}</span><span className="chip"><IconQuiz width={14} height={14} /> {g.quizzes} {"quizzes"}</span></div>
              <Link to={`/students?group=${g.id}`} className="btn soft sm">{"View students"}</Link>
            </Card>
          ))}
        </div>
      )}</Gate>
      {form && (
        <Modal title={form.id ? "Rename group" : "New group"} onClose={() => setForm(null)}
          footer={<><button className="btn ghost" onClick={() => setForm(null)}>{"Cancel"}</button><button className="btn primary" disabled={!form.name.trim()} onClick={submit}>{"Save"}</button></>}>
          <Field label={"Group name"}><input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && form.name.trim() && submit()} /></Field>
          {err && <div className="error-box">{err}</div>}
        </Modal>
      )}
      {del && <Confirm title={"Delete group"} text={`“${del.name}” will be deleted. Students stay in the system without a group.`} onClose={() => setDel(null)} onConfirm={async () => { await api.del('/groups/' + del.id); setDel(null); toast("Deleted"); st.reload(); }} />}
    </div>
  );
}
