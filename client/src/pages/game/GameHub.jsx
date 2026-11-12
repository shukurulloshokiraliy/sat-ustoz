import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Gate, Modal, useAsync } from '../../components/ui.jsx';
import { IconArrow } from '../../components/icons.jsx';
import Character, { CHARACTER_KEYS, CHARACTERS, CHARACTER_SETS, isVipCharacter } from '../../components/Character.jsx';
import { ARENA_THEMES, BOT_LEVELS, THEME_KEY, ZONES, arenaTheme, isVip } from './zones.jsx';

export const hostKey = (code) => `arena-host-${code}`;
export const playerKey = (code) => `arena-${code}`;
/** Small pill buttons used instead of native selects. options: [{ value, label, lock }] */
export function Chips({ value, onChange, options, label, dark }) {
  return (
    <div className={`chips ${dark ? 'dark' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`${value === o.value ? 'on' : ''} ${o.lock ? 'locked' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}{o.lock && <span className="vip">VIP</span>}
        </button>
      ))}
    </div>
  );
}
export const DUEL_KEY = 'arena-duel';
export const HERO_KEY = 'arena-hero';
export const store = {
  get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// one list of games: every game has its own look, so there is no separate "world" step
const GAMES = [
  { id: 'classic', title: 'Classic', text: 'Leaderboard with points and streaks.', mode: 'classic', zone: 'classic', runner: 'owl' },
  { id: 'raid', title: 'Hacking Mode', text: 'Cipher Raid: answer right, open boxes, guess passwords, steal credits.', mode: 'classic', zone: 'classic', raid: true, runner: 'robot' },
  { id: 'race', title: 'Race Track', text: 'Every right answer is a sprint to the finish.', mode: 'classic', zone: 'race', runner: 'fox' },
  { id: 'space', title: 'Space Race', text: 'Fly past the planets to the moon base.', mode: 'classic', zone: 'space', runner: 'robot' },
  { id: 'ocean', title: 'Deep Dive', text: 'Swim through the reef to the sunken treasure.', mode: 'classic', zone: 'ocean', runner: 'axolotl' },
  { id: 'jungle', title: 'Jungle Run', text: 'Swing through the jungle to the golden temple.', mode: 'classic', zone: 'jungle', runner: 'monkey' },
  { id: 'duel', title: 'Duel', text: 'One on one, same questions, same clock.', mode: 'duel', zone: 'classic', runner: 'dragon' },
];

/** Preset chips plus a box to type any number (time up to 60 min, questions up to 100). */
function NumPick({ value, onChange, presets, min, max, unit, label, zero }) {
  const custom = !presets.includes(value);
  return (
    <div className="arena-numpick">
      <Chips label={label} value={value} onChange={onChange} options={presets.map((n) => ({ value: n, label: n === 0 && zero ? zero : `${n >= 1000 ? `${n / 1000}k` : n}${unit}` }))} />
      <label className={`arena-numbox ${custom ? 'on' : ''}`}>
        <input type="number" inputMode="numeric" min={min} max={max} value={custom ? value : ''} placeholder="other" aria-label={`${label}, type a number`}
          onChange={(e) => { const n = Math.round(Number(e.target.value)); if (!e.target.value) onChange(presets[0]); else onChange(Math.min(max, Math.max(min, n || min))); }} />
        <span>{unit.trim()}</span>
      </label>
    </div>
  );
}

/** Word Arena lobby: host a game or join one with a code. */
export default function GameHub() {
  const st = useAsync(() => api.get('/vocab'), []);
  return <div className="page arena-page"><Gate state={st}>{(d) => <Hub d={d} />}</Gate></div>;
}

function Hub({ d }) {
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const sets = d.decks.flatMap((k) => k.sets.filter((s) => s.open));
  const [game, setGame] = useState('classic');
  const G = GAMES.find((g) => g.id === game);
  const mode = G.mode;
  const [chosen, setChosen] = useState(() => new Set(sets.slice(0, 1).map((s) => s.id)));
  const [minutes, setMinutes] = useState(0); // 0 = no time limit (the host ends the game)
  const [goal, setGoal] = useState(0); // 0 = no goal score
  const vip = isVip(user);
  const zone = G.zone;
  const [teams, setTeams] = useState(false);
  const [bots, setBots] = useState(0);
  const [botLevel, setBotLevel] = useState('easy');
  const pickGame = (g) => { const z = ZONES.find((x) => x.id === g.zone); if (z && !z.free && !vip) { nav('/subscribe'); return; } setGame(g.id); setStep(2); };
  const pickLevel = (l) => (l.free || vip ? setBotLevel(l.id) : nav('/subscribe'));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState(false);
  const saved = (() => { try { return JSON.parse(store.get(DUEL_KEY) || '{}'); } catch { return {}; } })();
  const [opp, setOpp] = useState(saved.opp === 'bot' ? 'bot' : 'player');
  const [duelLevel, setDuelLevel] = useState(saved.level && (vip || saved.level === 'easy') ? saved.level : 'easy');
  const levelOpts = BOT_LEVELS.map((l) => ({ value: l.id, label: l.name, lock: !l.free && !vip }));
  const pickDuelLevel = (v) => (BOT_LEVELS.find((l) => l.id === v).free || vip ? setDuelLevel(v) : nav('/subscribe'));
  const quickDuel = async () => {
    setQuick(true);
    store.set(DUEL_KEY, JSON.stringify({ opp, level: duelLevel }));
    try {
      const avatar = CHARACTER_KEYS.includes(store.get(HERO_KEY)) ? store.get(HERO_KEY) : CHARACTER_KEYS[Math.floor(Math.random() * CHARACTER_KEYS.length)];
      const r = await api.post('/game/quick', { name: (user.name || 'Player').split(' ')[0], avatar, set_ids: sets.map((x) => x.id), opponent: opp, level: duelLevel });
      store.set(playerKey(r.code), r.token);
      if (r.host_token) store.set(hostKey(r.code), r.host_token);
      nav(`/play/${r.code}`);
    } catch (e) { toast(e.message, 'bad'); setQuick(false); }
  };
  const toggle = (id) => setChosen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const host = async () => {
    setBusy(true);
    try {
      const r = await api.post('/game/rooms', { mode: mode === 'duel' ? 'duel' : teams ? 'team' : 'classic', minutes, goal, set_ids: [...chosen], zone, raid: !!G.raid, bots: mode === 'duel' ? Math.min(1, bots) : bots, bot_level: botLevel });
      store.set(hostKey(r.code), r.host_token);
      // students and duel hosts play too; a teacher usually just shows the board
      nav(`/play/${r.code}${user.role === 'master' && mode !== 'duel' ? '?screen=1' : ''}`);
    } catch (e) { toast(e.message, 'bad'); setBusy(false); }
  };

  const savedHero = store.get(HERO_KEY);
  const [hero, setHero] = useState(() => (CHARACTER_KEYS.includes(savedHero) && (vip || !isVipCharacter(savedHero)) ? savedHero : 'owl'));
  const [pickHero, setPickHero] = useState(false);
  const [playAfterPick, setPlayAfterPick] = useState(false);
  const [bg, setBg] = useState(() => arenaTheme(user));
  const pickBg = (t) => { if (!t.free && !vip) { nav('/subscribe'); return; } setBg(t.id); store.set(THEME_KEY, t.id); };
  const [hosting, setHosting] = useState(false);
  const [step, setStep] = useState(1);
  const choose = (k) => {
    if (isVipCharacter(k) && !vip) { nav('/subscribe'); return; }
    setHero(k); store.set(HERO_KEY, k); setPickHero(false);
    if (playAfterPick) { setPlayAfterPick(false); setTimeout(() => quickDuel(), 0); }
  };
  // the first time: the student picks a hero before the first game (no random characters)
  const play = () => { if (!CHARACTER_KEYS.includes(store.get(HERO_KEY))) { setPlayAfterPick(true); setPickHero(true); return; } quickDuel(); };
  const rival = opp === 'bot' ? 'robot' : null;

  return (
    <>
      {/* the stage: your hero vs the opponent, one big Play button */}
      <section className="ar-stage">
        <div className="ar-lights" aria-hidden="true"><i /><i /><i /></div>
        <div className="ar-copy">
          <small>WORD ARENA</small>
          <h1>Words are your weapon.</h1>
          <p>Answer word questions faster than your opponent. Right answers move you ahead — first to the finish wins.</p>
        </div>
        <div className="ar-vs">
          <button type="button" className="ar-fighter me" onClick={() => setPickHero(true)} aria-label="Change your hero">
            <span className="ar-ring" style={{ '--c': CHARACTERS[hero]?.body }} />
            <Character kind={hero} size={128} mood="happy" />
            <b>{CHARACTERS[hero]?.name}</b><em>Tap to change</em>
          </button>
          <span className="ar-vs-badge" aria-hidden="true">VS</span>
          <div className={`ar-fighter them ${rival ? '' : 'unknown'}`}>
            <span className="ar-ring" style={{ '--c': rival ? '#5C88FF' : '#8E5CF7' }} />
            {rival ? <Character kind="robot" size={128} /> : <span className="ar-q" aria-hidden="true">?</span>}
            <b>{rival ? `${BOT_LEVELS.find((l) => l.id === duelLevel)?.name} bot` : 'Random player'}</b><em>{rival ? 'Starts right away' : 'Bot joins after 25 s'}</em>
          </div>
        </div>
        <div className="ar-controls">
          <Chips dark label="Opponent" value={opp} onChange={setOpp} options={[{ value: 'player', label: 'Real player' }, { value: 'bot', label: 'Bot' }]} />
          <Chips dark label="Bot level" value={duelLevel} onChange={pickDuelLevel} options={levelOpts} />
          <button className="btn sun xl ar-play" onClick={play} disabled={quick}>{quick ? 'Finding a match…' : 'Play now'} <IconArrow /></button>
        </div>
      </section>

      {/* your look: hero and game background (premium looks come with a subscription) */}
      <section className="ar-look card">
        <div className="ar-look-hero">
          <Character kind={hero} size={56} />
          <div><b>Your hero</b><small>{CHARACTERS[hero]?.name}</small></div>
          <button className="btn soft sm" onClick={() => setPickHero(true)}>Change</button>
        </div>
        <div className="ar-look-bg">
          <b>Game background</b>
          <div className="ar-bgs">
            {ARENA_THEMES.map((t) => (
              <button key={t.id} type="button" className={`ar-bg bg-${t.id} ${bg === t.id ? 'on' : ''}`} onClick={() => pickBg(t)} aria-pressed={bg === t.id} title={t.name}>
                <span>{t.name}</span>{!t.free && !vip && <em className="vip">VIP</em>}
              </button>
            ))}
          </div>
        </div>
        {!vip && <p className="ar-look-note">Plus, Pro, Pro Max and Ultra unlock 7 epic and legendary heroes, all backgrounds, every world and stronger bots. <a href="/subscribe">See plans</a></p>}
      </section>

      {/* two more ways to play */}
      <div className="ar-tiles">
        <form className="ar-tile" onSubmit={(e) => { e.preventDefault(); if (/^\d{6}$/.test(code)) nav(`/play/${code}`); }}>
          <span className="ar-tile-ic join" aria-hidden="true"><Character kind="chick" size={52} /></span>
          <div className="grow"><b>Join a game</b><small>Type the 6-digit code from the teacher's screen.</small>
            <div className="ar-code"><input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="000000" aria-label="Game code" /><button className="btn primary" disabled={code.length !== 6}>Join</button></div>
          </div>
        </form>
        <button type="button" className={`ar-tile host ${hosting ? 'on' : ''}`} onClick={() => { setHosting(true); setStep(1); setTimeout(() => document.getElementById('ar-host')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }}>
          <span className="ar-tile-ic hostc" aria-hidden="true"><Character kind="owl" size={52} /></span>
          <div className="grow"><b>Host a game for your class</b><small>Pick a game (Classic, Cipher Raid, race zones, duel), choose your words, share the code.</small></div>
          <IconArrow />
        </button>
      </div>

      {/* host: two short steps */}
      {hosting && (
        <section className="ar-host card" id="ar-host">
          <ol className="ar-steps" aria-label="Steps">
            {['Choose a game', 'Set up'].map((t, i) => <li key={t} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}><button type="button" onClick={() => setStep(i + 1)}><span>{i + 1}</span>{t}</button></li>)}
          </ol>
          {step === 1 && (
            <div className="ar-worlds">
              {GAMES.map((g) => {
                const z = ZONES.find((x) => x.id === g.zone);
                const locked = z && !z.free && !vip;
                return (
                  <button key={g.id} type="button" className={`ar-world w-${g.raid ? 'raid' : g.id === 'duel' ? 'duel' : g.zone} ${game === g.id ? 'on' : ''} ${locked ? 'locked' : ''}`} onClick={() => pickGame(g)} aria-pressed={game === g.id}>
                    <span className="ar-world-scene" aria-hidden="true"><i /><i /><i /><span className="ar-world-runner"><Character kind={g.runner} size={46} /></span></span>
                    {z && !z.free && <span className="vip">VIP</span>}
                    <b>{g.title}</b><small>{g.text}</small>
                  </button>
                );
              })}
            </div>
          )}
          {step === 2 && (
            <>
              <p className="ar-summary"><b>{G.title}</b> — {G.text}</p>
              <div className="arena-field">
                <b>Words from</b>
                {d.decks.map((k) => { const ss = k.sets.filter((x) => x.open); return ss.length ? (
                  <div key={k.id} className="arena-deck"><small className="muted">{k.title || k.name}</small>
                    <div className="arena-sets">{ss.map((s) => <button key={s.id} type="button" className={chosen.has(s.id) ? 'on' : ''} onClick={() => toggle(s.id)}>{s.title}</button>)}</div></div>) : null; })}
                {!d.full && <small className="muted">Subscribe to play with all sets.</small>}
              </div>
              <div className="arena-nums">
                <div><b>Time</b><NumPick label="Time" value={minutes} onChange={setMinutes} presets={[0, 5, 10, 20, 30]} min={0} max={120} unit=" min" zero="No limit" /></div>
                <div><b>Goal</b><NumPick label="Goal score" value={goal} onChange={setGoal} presets={[0, 2000, 5000, 10000]} min={0} max={1000000} unit="" zero="None" /></div>
                <small className="muted arena-endnote">Questions never run out. The game ends when you press End{minutes ? ', when the time is up' : ''}{goal ? ', or when someone reaches the goal' : ''}. Every right answer opens 3 mystery boxes: Double, Triple, Steal, Swap, Shield, Freeze and more.</small>
                {mode !== 'duel' && <div><b>Play as</b><Chips label="Play as" value={teams} onChange={setTeams} options={[{ value: false, label: 'Solo' }, { value: true, label: 'Two teams' }]} /></div>}
                <div><b>Bots</b><Chips label="Number of bots" value={bots} onChange={setBots} options={(mode === 'duel' ? [0, 1] : [0, 2, 4, 6]).map((n) => ({ value: n, label: n === 0 ? 'None' : String(n) }))} />
                  {bots > 0 && <Chips label="Bot level" value={botLevel} onChange={(v) => pickLevel(BOT_LEVELS.find((l) => l.id === v))} options={levelOpts} />}</div>
              </div>
              <div className="row between"><button className="btn ghost" onClick={() => setStep(1)}>Back</button>
                <button className="btn primary lg" disabled={busy || !chosen.size} onClick={host}>{busy ? 'Creating…' : 'Create game'} <IconArrow /></button></div>
            </>
          )}
        </section>
      )}

      {pickHero && (
        <Modal title={playAfterPick ? 'Choose your hero to start' : 'Choose your hero'} onClose={() => { setPickHero(false); setPlayAfterPick(false); }} wide>
          {CHARACTER_SETS.map((set) => (
            <div key={set} className="ar-heroes-set">
              <small className="muted">{set}</small>
              <div className="ar-heroes">
                {CHARACTER_KEYS.filter((k) => CHARACTERS[k].set === set).map((k) => (
                  <button key={k} type="button" className={`ar-hero r-${CHARACTERS[k].rarity} ${hero === k ? 'on' : ''} ${isVipCharacter(k) && !vip ? 'locked' : ''}`} onClick={() => choose(k)} style={{ '--c': CHARACTERS[k].body }}>
                    {isVipCharacter(k) && <em className="vip">{vip ? CHARACTERS[k].rarity : 'VIP'}</em>}
                    <Character kind={k} size={64} /><span>{CHARACTERS[k].name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
