import { useState } from 'react';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confirm, Field, Gate, Modal, PageHeader, useAsync } from '../../components/ui.jsx';
import { IconCopy, IconKey, IconPlus } from '../../components/icons.jsx';

/**
 * Admin accounts (main teacher only): who helps run the platform, which sections each one can use, and what they did.
 * Sections: Students, Content, Finance, Support, Settings. Admins sign in with the login and password made here.
 */
const HELP = {
  students: 'Students, groups, progress, assignments, consultations, live lesson board',
  content: 'Roadmap and lessons, Question Bank, reports, quality, quizzes, full mocks, Word Vault, website',
  finance: 'Finance, payment receipts (approve / reject), wallets, refunds',
  support: 'Support chats with students',
  settings: 'Settings, plans and prices, Telegram bot, free / paid mode',
};
const when = (d) => (d ? fmtDate(d, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function Admins() {
  const st = useAsync(() => api.get('/admins'), []);
  const [edit, setEdit] = useState(null); // {} = new
  const [shown, setShown] = useState(null); // { login, password } right after creating / resetting
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageHeader title="Admins" sub="People who help you run SAT Ustoz. Each admin sees only the sections you tick; everything they change is listed below.">
        <button className="btn primary" onClick={() => setEdit({})}><IconPlus /> New admin</button>
      </PageHeader>
      <Gate state={st}>{(d) => (
        <>
          {!d.admins.length ? (
            <Card className="adm-empty"><span className="item-ic"><IconKey /></span><div><b>No admins yet</b><p className="muted">Create an account for a helper: choose what they can open, then send them the login and password.</p></div></Card>
          ) : (
            <div className="adm-list">
              {d.admins.map((a) => (
                <Card key={a.id} className={`adm-row ${a.disabled ? 'off' : ''}`}>
                  <div className="adm-main">
                    <div className="row wrap" style={{ gap: 8 }}><b>{a.name}</b><small className="muted">@{a.login}</small>{a.disabled && <span className="chip">Turned off</span>}</div>
                    <div className="row wrap" style={{ gap: 4 }}>{a.perms.map((p) => <span key={p} className="chip domain">{d.sections.find((s) => s.id === p)?.label || p}</span>)}</div>
                    <small className="muted">Last sign-in {when(a.last_login_at)}{a.last_action ? ` · last change: ${a.last_action.target} (${when(a.last_action.at)})` : ''}</small>
                  </div>
                  <button className="btn ghost sm" onClick={() => setEdit(a)}>Edit</button>
                </Card>
              ))}
            </div>
          )}
          <Activity admins={d.admins} />
          {edit && <AdminForm a={edit} sections={d.sections} onClose={() => setEdit(null)} onDone={(r) => { setEdit(null); if (r?.password) setShown(r); st.reload(); }} />}
          {shown && <Credentials c={shown} onClose={() => setShown(null)} />}
        </>
      )}</Gate>
    </div>
  );
}

function AdminForm({ a, sections, onClose, onDone }) {
  const toast = useToast();
  const isNew = !a.id;
  const [f, setF] = useState({ name: a.name || '', login: a.login || '', password: '', perms: a.perms || ['students', 'content'], disabled: !!a.disabled });
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const toggle = (id) => setF({ ...f, perms: f.perms.includes(id) ? f.perms.filter((x) => x !== id) : [...f.perms, id] });
  const save = async () => {
    setBusy(true);
    try {
      if (isNew) { const r = await api.post('/admins', f); onDone({ ...r, name: f.name }); }
      else { await api.put(`/admins/${a.id}`, { name: f.name, perms: f.perms, disabled: f.disabled }); toast('Saved. The admin is signed out and sees the new sections at the next sign-in.'); onDone(); }
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const newPassword = async () => {
    try { const r = await api.post(`/admins/${a.id}/password`); onDone({ login: a.login, name: a.name, password: r.password }); } catch (e) { toast(e.message, 'bad'); } finally { setReset(false); }
  };
  return (
    <Modal title={isNew ? 'New admin' : `Edit ${a.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.perms.length || !f.name.trim() || (isNew && !f.login.trim())} onClick={save}>{busy ? 'Saving…' : isNew ? 'Create admin' : 'Save'}</button></>}>
      <div className="stack">
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Dilnoza Karimova" /></Field>
        {isNew ? (
          <div className="grid g2" style={{ gap: 12 }}>
            <Field label="Login" hint="letters, numbers, dots"><input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value.toLowerCase().replace(/\s/g, '') })} placeholder="dilnoza" autoCapitalize="none" /></Field>
            <Field label="Password" hint="empty = we make one"><input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="at least 8 characters" autoComplete="new-password" /></Field>
          </div>
        ) : <small className="muted">Login: @{a.login}</small>}
        <div className="adm-perms">
          <b>Can open</b>
          {sections.map((s) => (
            <label key={s.id} className={`adm-perm ${f.perms.includes(s.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={f.perms.includes(s.id)} onChange={() => toggle(s.id)} />
              <span><b>{s.label}</b><small>{HELP[s.id]}</small></span>
            </label>
          ))}
          <small className="muted">Every admin can see the Overview and change their own password. Only you can manage admins.</small>
        </div>
        {!isNew && (
          <div className="row wrap" style={{ gap: 8, justifyContent: 'space-between' }}>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={f.disabled} onChange={(e) => setF({ ...f, disabled: e.target.checked })} /> Turn this account off</label>
            <button type="button" className="btn ghost sm" onClick={() => setReset(true)}><IconKey width={16} height={16} /> New password</button>
          </div>
        )}
      </div>
      {reset && <Confirm title="Make a new password?" text={`${a.name} is signed out everywhere and needs the new password to sign in.`} confirmLabel="Make new password" onClose={() => setReset(false)} onConfirm={newPassword} />}
    </Modal>
  );
}

function Credentials({ c, onClose }) {
  const toast = useToast();
  const text = `SAT Ustoz admin\nSite: ${window.location.origin}\nLogin: ${c.login}\nPassword: ${c.password}`;
  return (
    <Modal title="Send these to the admin" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Done</button><button className="btn primary" onClick={() => { navigator.clipboard?.writeText(text).then(() => toast('Copied')).catch(() => {}); }}><IconCopy width={16} height={16} /> Copy</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>The password is shown only now. Send it privately (e.g. in Telegram); they can change it in Profile.</p>
      <pre className="adm-cred">{text}</pre>
    </Modal>
  );
}

function Activity({ admins }) {
  const [who, setWho] = useState('');
  const st = useAsync(() => api.get(`/admins/activity${who ? `?admin=${who}` : ''}`), [who]);
  if (!admins.length) return null;
  return (
    <Card className="adm-act">
      <div className="row between wrap" style={{ gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Activity</h2>
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Admin"><option value="">All admins</option>{admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </div>
      {!st.data ? <p className="muted">Loading…</p> : !st.data.rows.length ? <p className="muted">Nothing changed yet.</p> : (
        <ul className="adm-log">
          {st.data.rows.map((r) => <li key={r.id}><span className="muted">{when(r.at)}</span><b>{r.actor}</b><span>{r.what}</span></li>)}
        </ul>
      )}
    </Card>
  );
}
