import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

/*
 * Exam mode, as close to test day as a browser allows:
 *  - the test runs in full screen; Esc and the Windows/Command keys are locked where the browser supports it
 *  - copy, paste, cut, printing, saving, view-source, developer tools and the right-click menu are blocked
 *  - leaving the test (exiting full screen, switching tab, app or window, minimising) is recorded on the server:
 *    the clock keeps running while away and every exit costs a fixed penalty (Settings, default 30 s)
 * A browser cannot stop a second device or the operating system itself (Alt+Tab still works), but every
 * such exit is detected, costs time and is shown in the results for the student and the teacher.
 */
const fsSupported = () => typeof document !== 'undefined' && !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
const inFs = () => !!document.fullscreenElement;
const BLOCK_KEYS = new Set(['c', 'v', 'x', 'p', 's', 'u', 'a', 'f', 'g', 'h', 'j', 'o', 'n', 't', 'w', 'r']);

export function useProctor(p) {
  const on = !!p?.kind && p?.id != null;
  const [ready, setReady] = useState(() => !on || !fsSupported() || inFs()); // full screen entered (or not possible)
  const [info, setInfo] = useState({ exits: 0, penalty: 0, per: 30, flash: null });
  const away = useRef(false);
  const closing = useRef(false);
  const entered = useRef(false);
  const pref = useRef(p); pref.current = p;

  const send = useCallback((event, reason) => {
    const x = pref.current;
    return api.post('/focus', { kind: x.kind, id: x.id, stage: x.stage || '', event, reason }).then((r) => {
      setInfo((i) => ({ ...i, exits: r.exits ?? i.exits, penalty: r.penalty ?? i.penalty, per: r.per ?? i.per, flash: r.added ? r.added : i.flash }));
      if (r.added) x.onPenalty?.(r.added);
    }).catch(() => {});
  }, []);

  const leave = useCallback((reason) => {
    if (closing.current || away.current) return;
    away.current = true;
    send('leave', reason);
  }, [send]);
  const back = useCallback(() => {
    if (closing.current || !away.current) return;
    if (document.hidden || !document.hasFocus()) return;
    if (fsSupported() && !inFs()) return;
    away.current = false;
    send('return');
  }, [send]);

  const enter = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      try { await navigator.keyboard?.lock?.(['Escape', 'MetaLeft', 'MetaRight', 'Tab', 'F11']); } catch { /* not supported */ }
    } catch { /* refused: the overlay stays */ }
  }, []);

  useEffect(() => {
    if (!on) return undefined;
    closing.current = false;
    const onFs = () => {
      if (inFs()) { entered.current = true; setReady(true); back(); }
      else if (fsSupported()) { setReady(false); if (entered.current) leave('fullscreen'); }
    };
    const onVis = () => (document.hidden ? leave('tab') : setTimeout(back, 50));
    const onBlur = () => setTimeout(() => {
      // a click into the mock's PDF frame moves focus without leaving the test
      if (document.activeElement?.tagName === 'IFRAME' || document.hasFocus()) return;
      if (entered.current || !fsSupported()) leave('window');
    }, 120);
    const onFocus = () => setTimeout(back, 50);
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase();
      const typing = e.target.closest?.('textarea, input');
      if (k === 'f12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k))) { e.preventDefault(); e.stopPropagation(); return; }
      if ((e.ctrlKey || e.metaKey) && BLOCK_KEYS.has(k) && !(typing && k === 'a')) { e.preventDefault(); e.stopPropagation(); }
      if (k === 'printscreen') { try { navigator.clipboard?.writeText(''); } catch { /* ignore */ } }
    };
    const stop = (e) => { if (!(e.type === 'paste' || e.type === 'copy') || !e.target.closest?.('textarea')) e.preventDefault(); };
    const noMenu = (e) => e.preventDefault();
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    ['copy', 'cut', 'paste', 'dragstart', 'drop'].forEach((t) => document.addEventListener(t, stop, true));
    document.addEventListener('contextmenu', noMenu, true);
    document.documentElement.classList.add('exam-lock');
    if (inFs()) entered.current = true;
    return () => {
      closing.current = true;
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      ['copy', 'cut', 'paste', 'dragstart', 'drop'].forEach((t) => document.removeEventListener(t, stop, true));
      document.removeEventListener('contextmenu', noMenu, true);
      document.documentElement.classList.remove('exam-lock');
      try { navigator.keyboard?.unlock?.(); } catch { /* ignore */ }
      if (inFs()) document.exitFullscreen().catch(() => {});
    };
  }, [on, p?.kind, p?.id, p?.stage, leave, back]);

  useEffect(() => { if (!info.flash) return undefined; const t = setTimeout(() => setInfo((i) => ({ ...i, flash: null })), 6000); return () => clearTimeout(t); }, [info.flash]);

  return { on, ready, enter, ...info };
}

/** Full-screen gate over the test while it is not in full screen, plus a note after each exit. */
export function ProctorLayer({ pr }) {
  if (!pr.on) return null;
  return (
    <>
      {!pr.ready && (
        <div className="exam-gate" role="dialog" aria-modal="true" aria-label="Full-screen test">
          <div className="exam-gate-card">
            <h2>{pr.exits ? 'Return to the test' : 'This test runs in full screen'}</h2>
            <p>Like the real SAT, stay in the test window until you finish. Leaving full screen, switching tab or app, or minimising
              costs <b>{pr.per} seconds</b> each time, and the clock keeps running while you are away. Exits are shown in your results.</p>
            {pr.exits > 0 && <p className="exam-gate-stat">You left the test {pr.exits} {pr.exits === 1 ? 'time' : 'times'} · −{pr.penalty} s</p>}
            <button className="btn primary lg" onClick={pr.enter}>{pr.exits ? 'Back to full screen' : 'Start in full screen'}</button>
          </div>
        </div>
      )}
      {pr.flash && pr.ready && <div className="exam-flash" role="alert">You left the test: −{pr.flash} s from your time</div>}
    </>
  );
}

/** "On screen / away / exits" line for result pages. */
export function FocusLine({ f, seconds }) {
  if (!f && seconds == null) return null;
  const mm = (s) => { const n = Math.max(0, Math.round(Number(s) || 0)); return n >= 60 ? `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, '0')}s` : `${n}s`; };
  const away = f?.away || 0;
  return (
    <div className={`focus-line ${f?.exits ? 'warn' : 'ok'}`}>
      {seconds != null && <span><b>{mm(Math.max(0, seconds - away))}</b> on screen</span>}
      <span><b>{f?.exits || 0}</b> {f?.exits === 1 ? 'exit' : 'exits'} from the test</span>
      {away > 0 && <span><b>{mm(away)}</b> away</span>}
      {f?.penalty > 0 && <span><b>−{mm(f.penalty)}</b> penalty</span>}
    </div>
  );
}
