import { useEffect, useState } from 'react';
import { useAuth, useTheme } from '../context.jsx';
import { getConfig } from '../config.js';
import GoogleButton from '../components/GoogleButton.jsx';
import { IconMoon, IconSun, Logo } from '../components/icons.jsx';
import { Segmented } from '../components/ui.jsx';

export default function Login() {
  const { login, register, google: googleLogin } = useAuth();
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState(() => (window.location.pathname === '/signup' ? 'signup' : 'signin'));
  const [form, setForm] = useState({ name: '', login: '', password: '' });
  const [err, setErr] = useState(() => sessionStorage.getItem('auth_error') || '');
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState(null);

  useEffect(() => { getConfig().then(setCfg); sessionStorage.removeItem('auth_error'); }, []);
  useEffect(() => { window.history.replaceState(null, '', mode === 'signup' ? '/signup' : '/login'); setErr(''); }, [mode]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (mode === 'signup') await register({ name: form.name.trim(), email: form.login.trim(), password: form.password });
      else await login(form.login.trim(), form.password);
      window.history.replaceState(null, '', '/');
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };
  const google = async (credential) => {
    setErr(''); setBusy(true);
    try { await googleLogin(credential); window.history.replaceState(null, '', '/'); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <div className="login-hero">
        <Logo size={40} tone="white" />
        <div className="hero-copy">
          <h2>Every student needs an <em>ustoz.</em></h2>
          <p>SAT Reading &amp; Writing from 200 to 800: a step-by-step roadmap, video lessons, practice with instant feedback and timed mock tests.</p>
        </div>
      </div>
      <div className="login-form">
        <div className="login-top row" style={{ gap: 8 }}><button className="icon-btn" onClick={toggle} aria-label="Toggle theme">{theme === 'dark' ? <IconSun /> : <IconMoon />}</button></div>
        <form className="login-card" onSubmit={submit}>
          <div className="login-mark"><Logo size={30} /></div>
          <div>
            <h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
            <p className="muted" style={{ marginTop: 6 }}>{mode === 'signup' ? 'Start with a short readiness check, then follow your roadmap to 800.' : 'Sign in to continue your SAT prep.'}</p>
          </div>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} />
          {cfg?.google && (
            <>
              <GoogleButton clientId={cfg.googleClientId} mode={mode} theme={theme} onCredential={google} onError={setErr} />
              <div className="or"><span>or</span></div>
            </>
          )}
          {mode === 'signup' && <label className="field"><span>Full name</span><input autoComplete="name" value={form.name} onChange={set('name')} required minLength={2} /></label>}
          <label className="field"><span>{mode === 'signup' ? 'Email' : 'Email or login'}</span>
            <input autoFocus type={mode === 'signup' ? 'email' : 'text'} autoComplete={mode === 'signup' ? 'email' : 'username'} autoCapitalize="none" value={form.login} onChange={set('login')} required /></label>
          <label className="field"><span>Password</span>
            <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} required minLength={mode === 'signup' ? 6 : undefined} />
            {mode === 'signup' && <small className="muted">At least 6 characters</small>}</label>
          {err && <div className="error-box" role="alert">{err}</div>}
          <button className="btn primary lg" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          <p className="muted center" style={{ fontSize: '.82rem' }}>
            {mode === 'signup'
              ? <>Already have an account? <a href="/login" onClick={(e) => { e.preventDefault(); setMode('signin'); }}>Sign in</a></>
              : <>New here? <a href="/signup" onClick={(e) => { e.preventDefault(); setMode('signup'); }}>Create an account</a></>}
          </p>
        </form>
      </div>
    </div>
  );
}
