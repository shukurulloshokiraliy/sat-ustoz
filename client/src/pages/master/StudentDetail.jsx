import { SatDateSelect } from '../../components/ExamDate.jsx';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Avatar, Card, Confirm, Field, Gate, Modal, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import AnalyticsView from '../../components/AnalyticsView.jsx';
import { PortfolioView } from '../student/Portfolio.jsx';
import { Credentials, SubscriptionModal } from './Students.jsx';
import StudentReport from './StudentReport.jsx';
import { AssignmentList, AssignModal } from '../student/Assignments.jsx';
import { IconCrown, IconEdit, IconKey, IconTrash } from '../../components/icons.jsx';

const PLAN_NAME = { t1: 'Plan 1', t2: 'Plan 2', t3: 'Plan 3', t4: 'Plan 4', month: 'Old plan', quarter: 'Old plan' };

/** Student balance: the teacher adds money after a card payment (or corrects it); every change is logged. */
function Balance({ id }) {
  const toast = useToast();
  const st = useAsync(() => api.get(`/students/${id}/balance`), [id]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const save = async (sign) => {
    try { await api.post(`/students/${id}/balance`, { amount: sign * Number(amount), note }); toast(sign > 0 ? 'Balance topped up' : 'Balance corrected'); setOpen(false); setAmount(''); setNote(''); st.reload(); }
    catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Card>
      <small className="muted">Balance</small>
      <b style={{ display: 'block' }}>{st.data ? `${Number(st.data.balance).toLocaleString('en-US').replace(/,/g, ' ')} so'm` : '…'}</b>
      <button className="link-btn" onClick={() => setOpen(true)}>Top up or correct →</button>
      {open && (
        <Modal title="Balance" onClose={() => setOpen(false)}
          footer={<><button className="btn danger-ghost" disabled={!Number(amount)} onClick={() => save(-1)}>Subtract</button><span className="grow" /><button className="btn primary" disabled={!Number(amount)} onClick={() => save(1)}>Add to balance</button></>}>
          <Field label="Amount (so'm)"><input inputMode="numeric" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="20000" /></Field>
          <Field label="Note" hint="e.g. card payment, receipt #12"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {st.data?.history?.length > 0 && (
            <div className="table-wrap"><table className="t"><tbody>{st.data.history.slice(0, 8).map((h, i) => <tr key={i}><td className="nowrap">{fmtDate(h.created_at)}</td><td>{h.reason}{h.note ? ` · ${h.note}` : ''}</td><td>{h.amount > 0 ? '+' : ''}{h.amount}</td></tr>)}</tbody></table></div>
          )}
        </Modal>
      )}
    </Card>
  );
}

export default function StudentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const st = useAsync(() => Promise.all([api.get('/students/' + id), api.get('/students/' + id + '/analytics'), api.get('/portfolio?user_id=' + id), api.get('/groups'), api.get('/placement?user_id=' + id), api.get('/students/' + id + '/report')]), [id]);
  const [tab, setTab] = useState('report');
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [cred, setCred] = useState(null);
  const [resetAsk, setResetAsk] = useState(false);
  const [sub, setSub] = useState(false);

  return (
    <div className="page">
      <Gate state={st}>{([s, a, pf, groups, pl, rep]) => (
        <>
          <PageHeader title={s.name} sub={<><Link to="/students">Students</Link> / {s.email || '@' + s.login}{s.group_name ? ` · ${s.group_name}` : ''}</>}>
            <button className={`btn ${s.sub_active ? 'soft' : 'primary'}`} onClick={() => setSub(true)}><IconCrown width={16} height={16} /> {s.sub_active ? 'Extend subscription' : 'Activate subscription'}</button>
            <button className="btn ghost" onClick={() => setEdit(true)}><IconEdit width={16} height={16} /> {"Edit"}</button>
            {s.provider !== 'google' && <button className="btn ghost" onClick={() => setResetAsk(true)}><IconKey width={16} height={16} /> {"Reset password"}</button>}
            <button className="btn danger-ghost" onClick={() => setDel(true)}><IconTrash width={16} height={16} /> {"Delete"}</button>
          </PageHeader>
          <div className="grid g4 keep2 stagger">
            <Card><small className="muted">Signed up</small><b style={{ display: 'block' }}>{fmtDate(s.created_at)}</b><small className="muted">{s.provider === 'google' ? 'with Google' : s.provider === 'email' ? 'with email' : 'by teacher'}</small></Card>
            <Card><small className="muted">Placement test</small>
              {pl.results[0]
                ? <Link to={`/placement/result/${pl.results[0].id}`} style={{ display: 'block', fontWeight: 700 }}>{pl.results[0].cefr} · {pl.results[0].midpoint - 30}–{pl.results[0].midpoint + 30} →</Link>
                : <b style={{ display: 'block' }}>{pl.open ? 'In progress' : 'Not taken'}</b>}
              {pl.results[0] && <small className={pl.results[0].admitted ? 'muted' : 'muted'}>{pl.results[0].admitted ? 'Ready for the course' : 'Below the course level'}</small>}</Card>
            <Card className={`sub-card ${s.sub_active ? 'on' : 'off'}`}><small className="muted">Subscription</small>
              <b style={{ display: 'block', color: s.sub_active ? 'var(--good)' : 'var(--bad)' }}>{s.sub_active ? `${PLAN_NAME[s.sub_plan] || 'Plan'} · until ${fmtDate(s.sub_until)}` : 'Free (no plan)'}</b>
              <button className="link-btn" onClick={() => setSub(true)}>{s.sub_active ? 'Extend or cancel' : 'Activate now'} →</button></Card>
            <Balance id={s.id} />
          </div>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'report', label: 'Full report' }, { value: 'tasks', label: 'Assignments' }, { value: 'analytics', label: 'Quiz analysis' }, { value: 'portfolio', label: 'Portfolio' }, { value: 'payments', label: 'Payments', count: s.payments.length }]} />
          {tab === 'report' ? <StudentReport r={rep} /> : tab === 'tasks' ? <StudentTasks id={s.id} /> : tab === 'analytics' ? <AnalyticsView a={a} /> : tab === 'portfolio' ? <PortfolioView data={pf} editable={false} onChange={() => {}} /> : (
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
          {resetAsk && <Confirm title="Reset this student's password?" confirmLabel="Yes, make a new password" onClose={() => setResetAsk(false)}
            onConfirm={async () => { setResetAsk(false); try { const r = await api.post(`/students/${s.id}/reset-password`, { confirm: true }); setCred({ title: "New password", rows: [{ name: s.name, login: r.login, password: r.password }] }); } catch (e) { toast(e.message, 'bad'); } }}
            text={`${s.name}'s current password will stop working and they will be signed out everywhere. Do this only if the student forgot their password — passwords are stored encrypted, so nobody (not even you) can see the old one.`} />}
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
        <Field label={"SAT date"}><SatDateSelect value={f.exam_date} onChange={(v) => setF({ ...f, exam_date: v })} /></Field>
      </div>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}

/** One student's assignments (roadmap + teacher), and "Assign a quiz" for just this student. */
function StudentTasks({ id }) {
  const st = useAsync(() => Promise.all([api.get(`/students/${id}/assignments`), api.get('/quizzes')]), [id]);
  const [give, setGive] = useState(false);
  return (
    <Gate state={st}>{([d, quizzes]) => (
      <div className="stack">
        <div><button className="btn primary sm" onClick={() => setGive(true)}>Assign a quiz to this student</button></div>
        <AssignmentList items={d.items} teacherView />
        {give && <AssignModal quizzes={quizzes} studentId={id} onClose={() => setGive(false)} onDone={() => { setGive(false); st.reload(); }} />}
      </div>
    )}</Gate>
  );
}
