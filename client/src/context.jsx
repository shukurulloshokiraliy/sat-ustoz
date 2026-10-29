import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);
const ThemeCtx = createContext(null);
const ToastCtx = createContext(null);

export const useAuth = () => useContext(AuthCtx);
export const useTheme = () => useContext(ThemeCtx);
export const useToast = () => useContext(ToastCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api.get('/me').then(setUser).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const f = () => setUser(null);
    window.addEventListener('auth:logout', f);
    return () => window.removeEventListener('auth:logout', f);
  }, []);

  const withToken = useCallback(async (r) => {
    setToken(r.token);
    setUser(await api.get('/me'));
  }, []);
  const login = useCallback((loginName, password) => api.post('/auth/login', { login: loginName, password }).then(withToken), [withToken]);
  const register = useCallback((body) => api.post('/auth/register', body).then(withToken), [withToken]);
  const google = useCallback((credential) => api.post('/auth/google', { credential }).then(withToken), [withToken]);
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);
  const refresh = useCallback(async () => setUser(await api.get('/me')), []);

  const value = useMemo(() => ({ user, loading, login, register, google, logout, refresh }), [user, loading, login, register, google, logout, refresh]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0F1331' : '#F5F7F8');
  }, [theme]);
  const value = useMemo(() => ({ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }), [theme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, msg, kind }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
