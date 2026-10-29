import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confirm, Gate, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import { IconEye, IconEyeOff, IconSearch, IconTrash, IconUpload } from '../../components/icons.jsx';
import { Passage } from '../../components/Passage.jsx';
import { rich } from '../../components/Rich.jsx';

const L = ['A', 'B', 'C', 'D'];
const LEVEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** Teacher: every Question Bank question with its key, explanation and class results. */
export default function QbankAdmin() {
  const st = useAsync(() => api.get('/qbank/admin'), []);
  const toast = useToast();
  const fileRef = useRef(null);
  const importFile = async (file) => {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    try { const r = await api.upload('/qbank/import', form); toast(`${r.imported} questions imported into ${r.skill}`); st.reload(); }
    catch (e) { toast(e.message, 'bad'); } finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  return (
    <div className="page">
      <PageHeader title="Question Bank" sub="Original SAT Reading and Writing questions. Students see easy questions for free; medium and hard need a subscription.">
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn ghost" to="/question-bank">Student view</Link>
          <button className="btn primary" onClick={() => fileRef.current?.click()}><IconUpload width={16} height={16} /> Import questions (JSON)</button>
        </div>
      </PageHeader>
      <Gate state={st}>{(rows) => <List rows={rows} reload={st.reload} />}</Gate>
    </div>
  );
}

function List({ rows, reload }) {
  const toast = useToast();
  const [skill, setSkill] = useState('all');
  const [level, setLevel] = useState('all');
  const [q, setQ] = useState('');
  const [del, setDel] = useState(null);
  const skills = useMemo(() => [...new Map(rows.map((r) => [r.skill_id, r.skill])).entries()], [rows]);
  const shown = rows.filter((r) => (skill === 'all' || r.skill_id === skill) && (level === 'all' || r.difficulty === level)
    && (!q || `${r.id} ${r.passage} ${r.prompt} ${r.options.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  const toggle = async (r) => {
    try { await api.put(`/qbank/admin/${encodeURIComponent(r.id)}`, { active: !r.active }); toast(r.active ? 'Hidden from students' : 'Visible to students'); reload(); }
    catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <>
      <Card className="qb-filters">
        <select value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Skill">
          <option value="all">All skills · {rows.length}</option>
          {skills.map(([id, name]) => <option key={id} value={id}>{name} · {rows.filter((r) => r.skill_id === id).length}</option>)}
        </select>
        <Segmented value={level} onChange={setLevel} options={[{ value: 'all', label: 'All' }, { value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]} />
        <label className="qb-search"><IconSearch width={16} height={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search text or id" /></label>
      </Card>
      <p className="muted" style={{ margin: '10px 2px' }}>{shown.length} questions</p>
      <div className="qb-review">
        {shown.map((r) => (
          <Card key={r.id} className={`rq ${r.active ? '' : 'hidden-q'}`}>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="chip">{r.id}</span><span className="chip domain">{r.skill}</span><span className={`chip lvl-${r.difficulty}`}>{LEVEL[r.difficulty]}</span>
              {r.src === 'upload' && <span className="chip sun">Imported</span>}
              {!r.active && <span className="chip warn">Hidden</span>}
              <span className="grow" />
              <small className="muted">{r.answered ? `${r.answered} students · ${Math.round((r.first_correct / r.answered) * 100)}% right first time` : 'Not answered yet'}</small>
              <button className="icon-sm" title={r.active ? 'Hide from students' : 'Show to students'} aria-label={r.active ? 'Hide' : 'Show'} onClick={() => toggle(r)}>{r.active ? <IconEyeOff width={15} height={15} /> : <IconEye width={15} height={15} />}</button>
              {r.src === 'upload' && <button className="icon-sm danger" aria-label="Delete" onClick={() => setDel(r)}><IconTrash width={15} height={15} /></button>}
            </div>
            {(r.passage || r.table) && <Passage text={r.passage} table={r.table} />}
            <p style={{ fontWeight: 600 }}>{rich(r.prompt)}</p>
            <ul className="qb-opts-review">{r.options.map((o, k) => <li key={k} className={k === r.answer ? 'ok' : ''}><b>{L[k]})</b> {rich(o)}{k === r.answer ? ' · correct' : ''}</li>)}</ul>
            <details className="qb-why"><summary>Explanation and tip</summary><p>{rich(r.explanation)}</p>{r.tip && <div className="tip"><b>Ustoz tip:</b> {rich(r.tip)}</div>}</details>
          </Card>
        ))}
      </div>
      {del && <Confirm title="Delete question" text={`“${del.id}” will be removed from the Question Bank, together with students' answers to it.`}
        onClose={() => setDel(null)} onConfirm={async () => { await api.del(`/qbank/admin/${encodeURIComponent(del.id)}`); setDel(null); toast('Question deleted'); reload(); }} />}
    </>
  );
}
