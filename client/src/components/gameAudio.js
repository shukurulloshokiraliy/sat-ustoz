/**
 * Word Arena music and sound effects, generated with the Web Audio API (no audio files, nothing to license).
 *  - music: a calm, upbeat loop (soft kick, hi-hat, bass and a pentatonic melody) while questions are on screen
 *  - effects: right answer chime, wrong answer thud, last-10-seconds tick, win fanfare
 * Saved per device: localStorage "arena-music" / "arena-sfx" = "off". Browsers start audio only after a tap.
 */
let ctx = null; let master = null; let musicGain = null; let timer = null; let step = 0; let nextAt = 0;
const get = (k) => { try { return localStorage.getItem(k) !== 'off'; } catch { return true; } };
export const musicOn = () => get('arena-music');
export const sfxOn = () => get('arena-sfx');
export const setPref = (k, on) => { try { localStorage.setItem(k, on ? 'on' : 'off'); } catch { /* storage blocked */ } };

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.0001; musicGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function note(dest, freq, t, { dur = 0.18, type = 'triangle', vol = 0.08, to = null, attack = 0.008 } = {}) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dest, t, { dur = 0.04, vol = 0.03, hp = 7000 } = {}) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ctx.createBufferSource(); s.buffer = b;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(dest); s.start(t);
}

// C major pentatonic, 4 chords (C – Am – F – G), 16 steps per bar at ~100 bpm
const BPM = 100; const S = 60 / BPM / 4;
const CHORDS = [[130.81, 261.63, 329.63, 392.0], [110.0, 220.0, 261.63, 329.63], [87.31, 174.61, 220.0, 261.63], [98.0, 196.0, 246.94, 293.66]];
const MEL = [523.25, 587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33];
const PATTERN = [0, null, 2, null, 4, 3, null, 2, 1, null, 3, null, 5, 4, 2, null];
function schedule() {
  if (ctx.state !== 'running') return; // waiting for the first tap
  if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.05; // no burst of missed notes after a pause
  while (nextAt < ctx.currentTime + 0.25) {
    const bar = Math.floor(step / 16) % 4; const s = step % 16; const t = nextAt; const ch = CHORDS[bar];
    if (s % 4 === 0) note(musicGain, 120, t, { type: 'sine', dur: 0.22, vol: 0.32, to: 45, attack: 0.002 }); // kick
    if (s % 4 === 2) noise(musicGain, t, { dur: 0.03, vol: 0.05 }); // hat
    if (s === 4 || s === 12) noise(musicGain, t, { dur: 0.12, vol: 0.06, hp: 1800 }); // snare
    if (s % 8 === 0) note(musicGain, ch[0], t, { type: 'sine', dur: S * 7, vol: 0.16 }); // bass
    if (s % 8 === 0) ch.slice(1).forEach((f) => note(musicGain, f, t, { type: 'sine', dur: S * 7.5, vol: 0.025, attack: 0.08 })); // pad
    const m = PATTERN[(s + bar * 3) % 16];
    if (m != null && (bar !== 3 || s < 12)) note(musicGain, MEL[(m + bar) % MEL.length], t, { dur: S * 1.6, vol: 0.05 });
    nextAt += S; step += 1;
  }
}
export function startMusic() {
  if (!musicOn() || timer) return;
  try {
    audio(); step = 0; nextAt = ctx.currentTime + 0.1;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(0.0001, ctx.currentTime); musicGain.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 1.2);
    timer = setInterval(() => { if (!document.hidden) schedule(); }, 60);
    schedule();
  } catch { /* no audio */ }
}
export function stopMusic() {
  if (!timer) return;
  clearInterval(timer); timer = null;
  try { musicGain.gain.cancelScheduledValues(ctx.currentTime); musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime); musicGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6); } catch { /* ignore */ }
}

const fx = (fn) => { if (!sfxOn()) return; try { audio(); fn(ctx.currentTime); } catch { /* no audio */ } };
export const sfxRight = () => fx((t) => { [659.25, 783.99, 1046.5].forEach((f, i) => note(master, f, t + i * 0.07, { dur: 0.22, vol: 0.12 })); });
export const sfxWrong = () => fx((t) => { note(master, 220, t, { type: 'sawtooth', dur: 0.25, vol: 0.05, to: 140 }); note(master, 110, t, { type: 'sine', dur: 0.3, vol: 0.12 }); });
export const sfxTick = () => fx((t) => note(master, 1320, t, { type: 'square', dur: 0.04, vol: 0.03 }));
export const sfxWin = () => fx((t) => { [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => note(master, f, t + i * 0.12, { dur: i === 5 ? 0.6 : 0.18, vol: 0.12 })); });
export const sfxStart = () => fx((t) => { [392, 523.25].forEach((f, i) => note(master, f, t + i * 0.1, { dur: 0.16, vol: 0.1 })); });
