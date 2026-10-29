
const TOKEN_KEY = 'token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(method, url, body, isForm) {
  const headers = {};
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch('/api' + url, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  } catch {
    throw Object.assign(new Error("Network error. Check your internet connection."), { offline: true });
  }
  if (res.status === 401 && !url.startsWith('/auth/')) {
    setToken(null);
    window.dispatchEvent(new Event('auth:logout'));
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : null;
  if (!res.ok) throw Object.assign(new Error(data?.error ? data.error : "Something went wrong"), { status: res.status });
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  put: (u, b) => request('PUT', u, b ?? {}),
  del: (u) => request('DELETE', u),
  upload: (u, form) => request('POST', u, form, true),
  async download(u, filename) {
    const res = await fetch('/api' + u, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

export const fmtDate = (iso, opts) => {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') || iso.includes('Z') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' });
};
export const fmtDuration = (s) => {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`;
};
export const daysUntil = (iso) => (iso ? Math.ceil((new Date(iso + 'T00:00:00') - new Date()) / 86400e3) : null);
