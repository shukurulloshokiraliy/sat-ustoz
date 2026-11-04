/**
 * Soft UI sounds for buttons and check boxes, made with the Web Audio API (no audio files).
 * One short "tick" for buttons, a rising "pop" for ticking a box, a lower one for unticking.
 * Turned off with localStorage "ui-sound" = "off" (toggle in the menu); silent when the tab is hidden.
 */
let ctx = null;
const KEY = 'ui-sound';
export const soundOn = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
export const setSound = (on) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ } };

function tone(freq, { dur = 0.05, type = 'sine', vol = 0.06, to = null } = {}) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch { /* no audio */ }
}
export const click = () => tone(880, { dur: 0.045, type: 'triangle', vol: 0.045, to: 660 });
export const tickOn = () => tone(620, { dur: 0.08, vol: 0.06, to: 1040 });
export const tickOff = () => tone(520, { dur: 0.07, vol: 0.045, to: 360 });

export function installUiSound() {
  if (typeof window === 'undefined') return;
  document.addEventListener('pointerdown', (e) => {
    if (!soundOn() || document.hidden || e.button > 0) return;
    const el = e.target.closest?.('button, .btn, [role="button"], .chip-btn, .bb-opt, .fm-row button, a.ask-t');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    if (el.closest('input[type="checkbox"], label:has(input[type="checkbox"])')) return;
    click();
  }, { passive: true, capture: true });
  document.addEventListener('change', (e) => {
    if (!soundOn()) return;
    const t = e.target;
    if (t?.type === 'checkbox' || t?.type === 'radio') (t.checked ? tickOn : tickOff)();
  }, { capture: true });
}
