import { useState } from 'react';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Empty, Gate, PageHeader, useAsync } from '../../components/ui.jsx';
import { IconBookmark, IconTrash } from '../../components/icons.jsx';
import { QuestionReview } from '../quiz/Result.jsx';

export default function Saved() {
  const st = useAsync(() => api.get('/saved'), []);
  const toast = useToast();
  const [q, setQ] = useState('');

  const remove = async (id) => { await api.del('/saved/' + id); toast("Removed"); st.reload(); };
  const saveNote = async (id, note) => { await api.post('/saved', { question_id: id, note }); toast("Note saved"); };

  return (
    <div className="page">
      <PageHeader title={"Saved questions"} sub={"Questions you want to revisit, with your personal notes."}>
        <input style={{ width: 240 }} placeholder={"Search…"} value={q} onChange={(e) => setQ(e.target.value)} aria-label={"Search"} />
      </PageHeader>
      <Gate state={st}>{(list) => {
        const shown = list.filter((x) => !q || (x.passage + x.prompt + x.topic + x.note).toLowerCase().includes(q.toLowerCase()));
        if (!list.length) return <Card><Empty icon={<IconBookmark />} title={"No saved questions yet"} text={"On the result page, press the “Save” button next to a question."} /></Card>;
        return (
          <div className="stack stagger">
            {shown.map((x) => (
              <Card key={x.id}>
                <div className="row between wrap" style={{ marginBottom: 10 }}>
                  <div className="row wrap"><span className="chip primary">{x.topic}</span><span className="chip">{x.quiz_title}</span><small className="muted">{fmtDate(x.saved_at)}</small></div>
                  <button className="btn danger-ghost sm" onClick={() => remove(x.id)}><IconTrash width={16} height={16} /> {"Remove"}</button>
                </div>
                <QuestionReview item={{ ...x, choice: null }} showSave={false} startOpen />
                <NoteBox initial={x.note} onSave={(n) => saveNote(x.id, n)} />
              </Card>
            ))}
            {!shown.length && <p className="muted center">{"Nothing found."}</p>}
          </div>
        );
      }}</Gate>
    </div>
  );
}

function NoteBox({ initial, onSave }) {
  const [v, setV] = useState(initial || '');
  const [dirty, setDirty] = useState(false);
  return (
    <div className="stack sm" style={{ marginTop: 12 }}>
      <textarea placeholder={"Personal note: why did I get this wrong?"} value={v} onChange={(e) => { setV(e.target.value); setDirty(true); }} />
      {dirty && <div><button className="btn soft sm" onClick={() => { onSave(v); setDirty(false); }}>{"Save note"}</button></div>}
    </div>
  );
}
