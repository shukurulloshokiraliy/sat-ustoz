import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Avatar, Card, Confirm, Field, Gate, Modal, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import AnalyticsView from '../../components/AnalyticsView.jsx';
import { PortfolioView } from '../student/Portfolio.jsx';
import { Credentials, SubscriptionModal } from './Students.jsx';
import { IconCrown, IconEdit, IconKey, IconTrash } from '../../components/icons.jsx';

export default function StudentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const st = useAsync(() => Promise.all([api.get('/students/' + id), api.get('/students/' + id + '/analytics'), api.get('/portfolio?user_id=' + id), api.get('/groups'), api.get('/placement?user_id=' + id)]), [id]);
  const [tab, setTab] = useState('analytics');
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [cred, setCred] = useState(null);
  const [sub, setSub] = useState(false);

  return (
    <div className="page">
      <Gate state={st}>{([s, a, pf, groups, pl]) => (
        <>
          <PageHeader title={s.name} sub={<><Link to="/students">Students</Link> / {s.email || '@' + s.login}{s.group_name ? ` · ${s.group_name}` : ''}</>}>
            <button className="btn soft" onClick={() => setSub(true)}><IconCrown width={16} height={16} /> Subscription</button>
            <button className="btn ghost" onClick={() => setEdit(true)}><IconEdit width={16} height={16} /> {"Edit"}</button>
            <button className="btn ghost" onClick={async () => { const r = await api.post(`/students/${s.id}/reset-password`); setCred({ title: "New password", rows: [{ name: s.name, login: r.login, password: r.password }] }); }}><IconKey width={16} height={16} /> {"Reset password"}</button>
            <button className="btn danger-ghost" onClick={() => setDel(true)}><IconTrash width={16} height={16} /> {"Delete"}</button>
          </PageHeader>
          <div className="grid g4 keep2 stagger">
            <Card><small className="muted">Signed up</small><b style={{ display: 'block' }}>{fmtDate(s.created_at)}</b><small className="muted">{s.provider === 'google' ? 'with Google' : s.provider === 'email' ? 'with email' : 'by teacher'}</small></Card>
            <Card><small className="muted">Placement test</small>
              {pl.results[0]
                ? <Link to={`/placement/result/${pl.results[0].id}`} style={{ display: 'block', fontWeight: 700 }}>{pl.results[0].cefr} · {pl.results[0].midpoint - 30}–{pl.results[0].midpoint + 30} →</Link>
                : <b style={{ display: 'block' }}>{pl.open ? 'In progress' : 'Not taken'}</b>}
              {pl.results[0] && <small className={pl.results[0].admitted ? 'muted' : 'muted'}>{pl.results[0].admitted ? 'Ready for the course' : 'Below the course level'}</small>}</Card>
            <Card><small className="muted">Subscription</small><b style={{ display: 'block', color: s.sub_active ? 'var(--good)' : undefined }}>{s.sub_active ? `Until ${fmtDate(s.sub_until)}` : 'None'}</b></Card>
            <Card><small className="muted">Last sign-in</small><b style={{ display: 'block' }}>{s.last_login_at ? fmtDate(s.last_login_at) : '—'}</b></Card>
          </div>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'analytics', label: "Analysis" }, { value: 'portfolio', label: 'Portfolio' }, { value: 'payments', label: 'Payments', count: s.payments.length }]} />
          {tab === 'analytics' ? <AnalyticsView a={a} /> : tab === 'portfolio' ? <PortfolioView data={pf} editable={false} onChange={() => {}} /> : (
            <Card>
              {s.payments.length === 0 ? <p className="muted center">No payments yet.</p> : (
                <div className="table-wrap"><table className="t">
                  <thead><tr><th>Date</th><th>Plan</th><th>Days</th><th>Amount</th><th>Source</th><th>Note</th></tr></thead>
                  <tbody>{s.payments.map((p) => <tr key={p.id}><td className="nowrap">{fmtDate(p.created_at)}</td><td>{p.plan}</td><td>{p.days}</td><td className="nowrap">{p.amount ? `${p.amount.toLocaleString('en-US')} ${p.currency}` : '—'}</td><td><span className="chip">{p.provider}</span></td><td className="muted">{p.note}</td></tr>)}</tbody>
                </table></div>
              )}
            </Card>
          )}
          {sub && <SubscriptionModal student={s} onClose={() => setSub(false)} onDone={() => { setSub(false); st.reload(); }} />}
          {edit && <EditStudent s={s} groups={groups} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); toast("Saved"); st.reload(); }} />}
          {del && <Confirm title={"Delete student"} text={`${s.name} and all of their results will be deleted.`} onClose={() => setDel(false)} onConfirm={async () => { await api.del('/students/' + s.id); toast("Deleted"); nav('/students'); }} />}
          {cred && <Credentials {...cred} onClose={() => setCred(null)} />}
        </>
      )}</Gate>
    </div>
  );
}

function EditStudent({ s, groups, onClose, onSaved }) {
  const [f, setF] = useState({ name: s.name, group_id: s.group_id || '', target_english: s.target_english, target_math: s.target_math, exam_date: s.exam_date || '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={"Edit student"} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>{"Cancel"}</button><button className="btn primary" onClick={async () => { try { await api.put('/students/' + s.id, f); onSaved(); } catch (e) { setErr(e.message); } }}>{"Save"}</button></>}>
      <Field label={"Name"}><input value={f.name} onChange={set('name')} /></Field>
      <Field label={"Group"}><select value={f.group_id} onChange={set('group_id')}><option value="">{"No group"}</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
      <div className="form-grid">
        <Field label={"Goal R&W"}><input type="number" min="200" max="800" step="10" value={f.target_english} onChange={set('target_english')} /></Field>
        <Field label={"Goal Math"}><input type="number" min="200" max="800" step="10" value={f.target_math} onChange={set('target_math')} /></Field>
        <Field label={"Exam date"}><input type="date" value={f.exam_date} onChange={set('exam_date')} /></Field>
      </div>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}
