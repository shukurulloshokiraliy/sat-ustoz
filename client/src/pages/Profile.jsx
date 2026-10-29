import { useState } from 'react';
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
            <div className="row"><Avatar name={user.name} size={56} /><div><b>{user.name}</b><div className="muted" style={{ fontSize: '.85rem' }}>{"Login:"} {user.login}{user.group ? ` · ${user.group.name}` : ''}</div></div></div>
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
