import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Avatar, Card, Confirm, Empty, Field, Gate, Modal, PageHeader, Segmented, copyText, pctTone, useAsync } from '../../components/ui.jsx';
import { IconCopy, IconCrown, IconGoogle, IconKey, IconPlus, IconSearch, IconTrash, IconUsers } from '../../components/icons.jsx';

export default function Students() {
  const st = useAsync(() => Promise.all([api.get('/students'), api.get('/groups')]), []);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [add, setAdd] = useState(false);
  const [cred, setCred] = useState(null);
  const [del, setDel] = useState(null);
  const [sub, setSub] = useState(null);
  const [filter, setFilter] = useState('all');
  const nav = useNavigate();
  const toast = useToast();
  const gid = params.get('group') || '';

  const resetPw = async (s) => {
    try { const r = await api.post(`/students/${s.id}/reset-password`); setCred({ title: "New password", rows: [{ name: s.name, login: r.login, password: r.password }] }); }
    catch (e) { toast(e.message, 'err'); }
  };

  return (
    <div className="page">
      <PageHeader title="Students" sub="Students sign up on their own with email or Google and appear here automatically. You can also create accounts yourself.">
        <button className="btn primary" onClick={() => setAdd(true)}><IconPlus /> {"Add student"}</button>
      </PageHeader>
      <Gate state={st}>{([students, groups]) => {
        const week = Date.now() - 7 * 86400e3;
        const FILTERS = { all: () => true, subscribed: (s) => s.sub_active, free: (s) => !s.sub_active, new: (s) => new Date(s.created_at) > week };
        const shown = students.filter((s) => FILTERS[filter](s) && (!gid || String(s.group_id) === gid) && (!q || (s.name + s.login + (s.email || '')).toLowerCase().includes(q.toLowerCase())));
        return (
          <>
            <Segmented value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All', count: students.length },
              { value: 'subscribed', label: 'Subscribed', count: students.filter(FILTERS.subscribed).length },
              { value: 'free', label: 'No subscription', count: students.filter(FILTERS.free).length },
              { value: 'new', label: 'New this week', count: students.filter(FILTERS.new).length },
            ]} />
            <div className="row wrap">
              <div className="search grow" style={{ maxWidth: 340 }}><IconSearch /><input placeholder="Name, email or login…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={"Search"} /></div>
              <select style={{ width: 220 }} value={gid} onChange={(e) => setParams(e.target.value ? { group: e.target.value } : {})} aria-label={"Group"}>
                <option value="">{"All groups"}</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <Card>
              {shown.length === 0 ? <Empty icon={<IconUsers />} title={"No students found"} text={"Add a new student or change the filter."} /> : (
                <div className="table-wrap">
                  <table className="t">
                    <thead><tr><th>Student</th><th>Subscription</th><th>Placement</th><th>R&amp;W estimate</th><th>Accuracy</th><th>Joined</th><th /></tr></thead>
                    <tbody>
                      {shown.map((s) => (
                        <tr key={s.id} className="click" onClick={() => nav(`/students/${s.id}`)}>
                          <td><div className="row"><Avatar name={s.name} src={s.avatar_url} /><div style={{ minWidth: 0 }}><b>{s.name}</b>
                            <div className="muted row" style={{ fontSize: '.78rem', gap: 6 }}>{s.provider === 'google' && <IconGoogle width={12} height={12} />}{s.email || '@' + s.login}{s.group_name && <span className="chip primary" style={{ padding: '0 8px' }}>{s.group_name}</span>}</div></div></div></td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {s.sub_active
                              ? <button className="chip good chip-btn" style={{ borderColor: 'transparent' }} onClick={() => setSub(s)} title="Extend or cancel">Until {fmtDate(s.sub_until, { day: 'numeric', month: 'short' })}</button>
                              : <button className="btn soft sm" onClick={() => setSub(s)}><IconCrown width={15} height={15} /> Activate</button>}
                          </td>
                          <td>{s.cefr ? <span className="row" style={{ gap: 6 }}><span className={`chip ${s.admitted ? 'good' : 'warn'}`}>{s.cefr}</span><b>{s.diagnostic_score}</b></span> : s.diagnostic_score != null ? <b>{s.diagnostic_score}</b> : <span className="muted">Not taken</span>}</td>
                          <td><b>{s.estimates.english ?? '—'}</b></td>
                          <td>{s.attempts ? <span className={`chip ${pctTone(s.accuracy)}`}>{s.accuracy}%</span> : <span className="muted">—</span>}</td>
                          <td className="muted nowrap">{fmtDate(s.created_at)}</td>
                          <td className="actions" onClick={(e) => e.stopPropagation()}>
                            <button className="icon-btn sm" title={"Reset password"} aria-label={"Reset password"} onClick={() => resetPw(s)}><IconKey width={16} height={16} /></button>{' '}
                            <button className="icon-btn sm danger" title={"Delete"} aria-label={"Delete"} onClick={() => setDel(s)}><IconTrash width={16} height={16} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            {add && <AddStudents groups={groups} defaultGroup={gid} onClose={() => setAdd(false)} onDone={(rows) => { setAdd(false); setCred({ title: rows.length > 1 ? `${rows.length} accounts created` : "Account created", rows }); st.reload(); }} />}
            {del && <Confirm title={"Delete student"} text={`${del.name} and all of their results will be deleted. This cannot be undone.`} onClose={() => setDel(null)} onConfirm={async () => { await api.del('/students/' + del.id); setDel(null); toast("Deleted"); st.reload(); }} />}
            {cred && <Credentials {...cred} onClose={() => setCred(null)} />}
            {sub && <SubscriptionModal student={sub} onClose={() => setSub(null)} onDone={() => { setSub(null); st.reload(); }} />}
          </>
        );
      }}</Gate>
    </div>
  );
}

export function Credentials({ title, rows, onClose }) {
  const toast = useToast();
  const text = rows.map((r) => `${r.name}\n${"Login"}: ${r.login}\n${"Password"}: ${r.password}`).join('\n\n');
  const csv = 'name,login,password\n' + rows.map((r) => `"${r.name}",${r.login},${r.password}`).join('\n');
  return (
    <Modal title={title} onClose={onClose} wide={rows.length > 1}
      footer={<>
        {rows.length > 1 && <button className="btn ghost" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'students.csv'; a.click(); }}>{"Download CSV"}</button>}
        <button className="btn primary" onClick={async () => { (await copyText(text)) ? toast("Copied") : toast("Could not copy", 'err'); }}><IconCopy width={16} height={16} /> {"Copy all"}</button>
      </>}>
      <p className="muted">{"The password is only shown now — send it to the student. You can issue a new one later via “Reset password”."}</p>
      {rows.map((r) => <div key={r.login} className="cred"><div><span>{"Name"}</span><span>{r.name}</span></div><div><span>{"Login"}</span><b>{r.login}</b></div><div><span>{"Password"}</span><b>{r.password}</b></div></div>)}
    </Modal>
  );
}

function AddStudents({ groups, defaultGroup, onClose, onDone }) {
  const [mode, setMode] = useState('one');
  const [f, setF] = useState({ name: '', group_id: defaultGroup || '', login: '', password: '' });
  const [bulk, setBulk] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const names = useMemo(() => bulk.split('\n').map((s) => s.trim()).filter(Boolean), [bulk]);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      if (mode === 'one') {
        const r = await api.post('/students', f);
        onDone([r]);
      } else {
        const out = [];
        for (const name of names) out.push(await api.post('/students', { name, group_id: f.group_id }));
        onDone(out);
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={"Add student"} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>{"Cancel"}</button><button className="btn primary" disabled={busy || (mode === 'one' ? !f.name.trim() : !names.length)} onClick={submit}>{busy ? "Creating…" : mode === 'one' ? "Create account" : `Create ${names.length} accounts`}</button></>}>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'one', label: "Single" }, { value: 'bulk', label: "Multiple (list)" }]} />
      {mode === 'one' ? (
        <>
          <Field label={"Full name"}><input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label={"Login"} hint={"Auto-generated if left empty"}><input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} autoCapitalize="none" /></Field>
            <Field label={"Password"} hint={"Auto-generated if left empty"}><input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          </div>
        </>
      ) : (
        <Field label={"Names (one per line)"}><textarea rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Ali Valiyev\nSevara Karimova'} /></Field>
      )}
      <Field label={"Group"}><select value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value })}><option value="">{"No group"}</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}

/** Teacher activates / extends / cancels a subscription (the Telegram bot will write to the same place). */
export function SubscriptionModal({ student, onClose, onDone }) {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const grant = async () => {
    setBusy(true);
    try { await api.post(`/students/${student.id}/subscription`, { days, amount: Number(amount) || 0, note }); toast('Subscription activated'); onDone(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true);
    try { await api.del(`/students/${student.id}/subscription`); toast('Subscription cancelled'); onDone(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Subscription · ${student.name}`} onClose={onClose}
      footer={<>
        {student.sub_active && <button className="btn danger-ghost" disabled={busy} onClick={cancel}>Cancel subscription</button>}
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Close</button>
        <button className="btn primary" disabled={busy} onClick={grant}>{student.sub_active ? `Extend by ${days} days` : `Activate ${days} days`}</button>
      </>}>
      <p className="muted">{student.sub_active ? `Active until ${fmtDate(student.sub_until)}. Extending adds days to the current end date.` : 'No active subscription. Activate access after the student has paid.'}</p>
      <Segmented value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '1 month' }, { value: 90, label: '3 months' }, { value: 365, label: '1 year' }]} />
      <div className="form-grid">
        <Field label="Amount paid" hint="optional"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="149000" /></Field>
        <Field label="Note" hint="optional"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paid by card, Click…" /></Field>
      </div>
    </Modal>
  );
}
