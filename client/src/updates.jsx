import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * New version check: after a deploy, a tab that stayed open keeps running the old code.
 * Every 5 minutes and when the tab comes back, the page HTML is fetched (no cache) and its main script compared
 * with the one running. If it changed: a small "Refresh" bar, and the update is applied on the next page change —
 * never during a test, check, mock or game (answers in progress must not be lost).
 */
const BUSY = /^\/(quiz|mock|full-mock|lesson\/\d+\/check|exam|placement|game|check)/;
const mainScript = (html) => (html.match(/\/assets\/index-[\w-]+\.js/) || [])[0] || null;

export function UpdateBar() {
  const [ready, setReady] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    const running = mainScript(Array.from(document.scripts).map((s) => s.src).join(' '));
    if (!running) return undefined;
    let stop = false;
    const check = async () => {
      if (stop || document.hidden || !navigator.onLine) return;
      try {
        const r = await fetch('/app', { cache: 'no-store', headers: { accept: 'text/html' } });
        const next = r.ok ? mainScript(await r.text()) : null;
        if (next && next !== running) setReady(true);
      } catch { /* offline: try later */ }
    };
    const t = setInterval(check, 5 * 60e3);
    const onShow = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onShow);
    const first = setTimeout(check, 20e3);
    return () => { stop = true; clearInterval(t); clearTimeout(first); document.removeEventListener('visibilitychange', onShow); };
  }, []);
  // apply on the next page change outside tests
  const [seen, setSeen] = useState(pathname);
  useEffect(() => {
    if (pathname === seen) return;
    setSeen(pathname);
    if (ready && !BUSY.test(pathname)) window.location.reload();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready || BUSY.test(pathname)) return null;
  return (
    <div className="update-bar" role="status">
      <span>A new version of SAT Ustoz is ready.</span>
      <button type="button" className="btn primary sm" onClick={() => window.location.reload()}>Refresh</button>
    </div>
  );
}
