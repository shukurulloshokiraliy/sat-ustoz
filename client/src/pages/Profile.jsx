import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth, useToast } from '../context.jsx';
import { Avatar, Card, Field, PageHeader } from '../components/ui.jsx';

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
    try { await api.put('/me/password', pw); setPw({ current: '', next: '' }); toast("Password saved"); refresh?.(); } catch (ex) { toast(ex.message, 'err'); }
  };

  return (
    <div className="page">
      <PageHeader title={"Profile"} sub={student ? "Set your goals." : "Teacher account."} />
      <div className="grid g2">
        <Card>
          <form className="stack" onSubmit={saveProfile}>
            <div className="row wrap">
              <PhotoPicker user={user} onDone={refresh} />
              <div className="grow"><b>{user.name}</b><div className="muted" style={{ fontSize: '.85rem' }}>{"Login:"} {user.login}{user.group ? ` · ${user.group.name}` : ''}</div></div>
            </div>
            <Field label={"Name"}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
            {student && (
              <div className="form-grid">
                <Field label={"Goal: Reading & Writing"} hint="200–800"><input type="number" min="200" max="800" step="10" value={f.target_english} onChange={(e) => setF({ ...f, target_english: e.target.value })} /></Field>
                <Field label={"Goal: Math"} hint="200–800"><input type="number" min="200" max="800" step="10" value={f.target_math} onChange={(e) => setF({ ...f, target_math: e.target.value })} /></Field>
                <Field label={"Exam date"}><input type="date" value={f.exam_date} onChange={(e) => setF({ ...f, exam_date: e.target.value })} /></Field>
              </div>
            )}
            <div><button className="btn primary">{"Save"}</button></div>
          </form>
        </Card>
        <Card>
          <form className="stack" onSubmit={savePw}>
            <h2>{user.has_password ? 'Change password' : 'Set a password'}</h2>
            {!user.has_password && <p className="muted" style={{ fontSize: '.88rem' }}>You signed in with Google. Add a password to also sign in with your email ({user.email}).</p>}
            {user.has_password && <Field label={"Current password"}><input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>}
            <Field label={"New password"} hint={"At least 6 characters"}><input type="password" autoComplete="new-password" minLength={6} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
            <div><button className="btn ghost">{"Update password"}</button></div>
          </form>
        </Card>
      </div>
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
