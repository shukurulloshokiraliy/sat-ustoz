import { createElement, useEffect, useState } from 'react';

/**
 * Lost connection on mobile data (prompt 12): tests keep their answers on the phone and send them again
 * when the connection comes back, so nothing chosen is lost.
 */
export function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true); const down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const onlineAgain = () => new Promise((resolve) => {
  if (navigator.onLine) { setTimeout(resolve, 3000); return; } // "online" but the request failed: try again shortly
  const f = () => { window.removeEventListener('online', f); resolve(); };
  window.addEventListener('online', f);
});

/**
 * Runs a request; on a network error it waits for the connection and tries again (up to ~10 minutes).
 * `onWait` is called once, when the first try fails, so the page can say "we'll send it when you're back online".
 * Server errors (4xx/5xx) are not retried.
 */
export async function sendWhenOnline(fn, { onWait, tries = 60 } = {}) {
  let told = false;
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (!e?.offline || i >= tries) throw e;
      if (!told) { told = true; onWait?.(); }
      await Promise.race([onlineAgain(), wait(10000)]);
    }
  }
}

/** Call `fn` whenever the connection comes back (e.g. to re-save answers that failed to save). */
export function useOnReconnect(fn) {
  useEffect(() => {
    window.addEventListener('online', fn);
    return () => window.removeEventListener('online', fn);
  }, [fn]);
}

/** A thin bar at the top while the phone is offline. */
export function OfflineBar() {
  const on = useOnline();
  if (on) return null;
  return createElement('div', { className: 'offline-bar', role: 'status' }, 'You are offline. Your answers stay on this phone and are sent when the connection is back.');
}
