/**
 * Count a page view for the teacher's "Visitors" (every page, the home page included). An anonymous id is kept in the
 * browser so one person counts once a day; where they came from is sent only with their first page.
 */
let first = true;
let last = '';
function visitorId() {
  try {
    let v = localStorage.getItem('vid');
    if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^\w-]/g, ''); localStorage.setItem('vid', v); }
    return v;
  } catch {
    try { let v = sessionStorage.getItem('vid'); if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('vid', v); } return v; } catch { return ''; }
  }
}
export function countVisit(path) {
  if (path === last || navigator.webdriver) return;
  last = path;
  const vid = visitorId();
  if (!vid) return;
  const body = { vid, path };
  if (first) {
    first = false;
    body.ref = document.referrer || '';
    try { body.utm = new URLSearchParams(window.location.search).get('utm_source') || ''; } catch { /* ignore */ }
  }
  let token = ''; try { token = localStorage.getItem('token') || ''; } catch { /* ignore */ }
  fetch('/api/visit', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }).catch(() => {});
}
