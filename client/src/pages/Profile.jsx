import { SatDateSelect } from '../components/ExamDate.jsx';
import { useRef, useState } from 'react';
import { api, setToken } from '../api.js';
import { useAuth, useToast } from '../context.jsx';
import { Avatar, Card, Field, Modal, PageHeader } from '../components/ui.jsx';
import { IconLock } from '../components/icons.jsx';
import StudentCard from '../components/StudentCard.jsx';

export default function Profile() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: user.name, target_english: user.target_english, target_math: user.target_math, exam_date: user.exam_date || '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const student = user.role === 'student';

  const saveProfile = async (e) => {
    e.preventDefault();
    try { await api.put('/me', f); await refresh(); toast("Profile updated"); } catch (ex) { toast(ex.message, 'err'); }
  };
  const savePw = async (e) => {
    e.preventDefault();
    try { const r = await api.put('/me/password', pw); if (r.token) setToken(r.token); setPw({ current: '', next: '' }); toast('Password saved. Other devices were signed out.'); refresh?.(); return true; } catch (ex) { toast(ex.message, 'err'); return false; }
  };
  const logoutAll = async () => {
    try { const r = await api.post('/me/logout-all'); setToken(r.token); toast('Signed out on every other device'); } catch (ex) { toast(ex.message, 'err'); }
  };

  const [pwOpen, setPwOpen] = useState(false);

  const profileCard = (
    <Card className="pf-card">
      <form className="stack" onSubmit={saveProfile}>
        <div className="row wrap pf-who">
          <PhotoPicker user={user} onDone={refresh} />
          <div className="grow" style={{ minWidth: 0 }}><b>{user.name}</b><div className="muted" style={{ fontSize: '.85rem', overflowWrap: 'anywhere' }}>{user.login}{user.group ? ` · ${user.group.name}` : ''}</div></div>
        </div>
        <Field label={"Name"}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        {student && (
          <div className="pf-goals">
            <Field label={"Goal: R&W"}><input type="number" min="200" max="800" step="10" value={f.target_english} onChange={(e) => setF({ ...f, target_english: e.target.value })} /></Field>
            <Field label={"Goal: Math"}><input type="number" min="200" max="800" step="10" value={f.target_math} onChange={(e) => setF({ ...f, target_math: e.target.value })} /></Field>
            <Field label={"SAT date"}><SatDateSelect value={f.exam_date} onChange={(v) => setF({ ...f, exam_date: v })} /></Field>
          </div>
        )}
        <div className="row wrap pf-actions">
          <button className="btn primary">{"Save"}</button>
          <span className="grow" />
          <button type="button" className="btn ghost sm" onClick={() => setPwOpen(true)}><IconLock width={15} height={15} /> {user.has_password ? 'Change password' : 'Set a password'}</button>
          <button type="button" className="btn danger-ghost sm" onClick={logoutAll} title="Ends every other session (lost phone, shared computer)">Sign out everywhere</button>
        </div>
      </form>
    </Card>
  );

  return (
    <div className="page">
      <PageHeader title={"Profile"} sub={student ? "Your wallet card, photo and goals." : "Teacher account."} />
      {student ? (
        <div className="pf-grid">
          <div className="pf-wallet"><StudentCard user={user} history /></div>
          {profileCard}
        </div>
      ) : profileCard}
      {pwOpen && (
        <Modal title={user.has_password ? 'Change password' : 'Set a password'} onClose={() => setPwOpen(false)}>
          <form className="stack" onSubmit={async (e) => { if (await savePw(e)) setPwOpen(false); }}>
            {!user.has_password && <p className="muted" style={{ fontSize: '.88rem' }}>You signed in with Google. Add a password to also sign in with your email ({user.email}).</p>}
            {user.has_password && <Field label={"Current password"}><input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required autoFocus /></Field>}
            <Field label={"New password"} hint={"At least 8 characters, not 12345678 or your name"}><input type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
            <div><button className="btn primary">{"Update password"}</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/** Square-crops and shrinks the chosen photo in the browser (256 px JPEG), then uploads it. */
async function squareJpeg(file, size = 256) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('This file is not a photo')); i.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.86));
  } finally { URL.revokeObjectURL(url); }
}

function PhotoPicker({ user, onDone }) {
  const toast = useToast();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await squareJpeg(file);
      const form = new FormData(); form.append('file', blob, 'avatar.jpg');
      await api.upload('/me/avatar', form); await onDone(); toast('Photo updated');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  const remove = async () => { setBusy(true); try { await api.del('/me/avatar'); await onDone(); toast('Photo removed'); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  return (
    <div className="photo-pick">
      <button type="button" className="photo-btn" onClick={() => ref.current?.click()} disabled={busy} aria-label="Change profile photo">
        <Avatar name={user.name} size={72} src={user.avatar_url} />
        <span className="photo-cam" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg></span>
      </button>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <div className="photo-acts">
        <button type="button" className="linkish" disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Uploading…' : user.avatar_url ? 'Change photo' : 'Add photo'}</button>
        {user.avatar_url && <button type="button" className="linkish muted" disabled={busy} onClick={remove}>Remove</button>}
      </div>
    </div>
  );
}
