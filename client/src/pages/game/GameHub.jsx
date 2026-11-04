import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Gate, Modal, useAsync } from '../../components/ui.jsx';
import { IconArrow } from '../../components/icons.jsx';
import Character, { CHARACTER_KEYS, CHARACTERS, CHARACTER_SETS } from '../../components/Character.jsx';
import { BOT_LEVELS, ZONES, isVip } from './zones.jsx';

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

const MODES = [
  { id: 'classic', title: 'Classic', text: 'Everyone for themselves. Fastest correct answers climb the board.', chars: ['fox', 'cat', 'frog'] },
  { id: 'team', title: 'Team battle', text: 'Players are split into Team Blue and Team Sun. Every point counts for the team.', chars: ['owl', 'chick', 'robot'] },
  { id: 'duel', title: 'Duel', text: 'One on one. Same questions, same clock — who knows more words?', chars: ['dragon', 'penguin'] },
];

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
  const [mode, setMode] = useState('classic');
  const [chosen, setChosen] = useState(() => new Set(sets.slice(0, 1).map((s) => s.id)));
  const [count, setCount] = useState(15);
  const [minutes, setMinutes] = useState(3);
  const vip = isVip(user);
  const [zone, setZone] = useState('classic');
  const [bots, setBots] = useState(0);
  const [botLevel, setBotLevel] = useState('easy');
  const pickZone = (z) => (z.free || vip ? setZone(z.id) : nav('/subscribe'));
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
      const r = await api.post('/game/rooms', { mode, questions: count, minutes, set_ids: [...chosen], zone, bots: mode === 'duel' ? Math.min(1, bots) : bots, bot_level: botLevel });
      store.set(hostKey(r.code), r.host_token);
      // students and duel hosts play too; a teacher usually just shows the board
      nav(`/play/${r.code}${user.role === 'master' && mode !== 'duel' ? '?screen=1' : ''}`);
    } catch (e) { toast(e.message, 'bad'); setBusy(false); }
  };

  const [hero, setHero] = useState(() => (CHARACTER_KEYS.includes(store.get(HERO_KEY)) ? store.get(HERO_KEY) : 'owl'));
  const [pickHero, setPickHero] = useState(false);
  const [hosting, setHosting] = useState(false);
  const [step, setStep] = useState(1);
  const choose = (k) => { setHero(k); store.set(HERO_KEY, k); setPickHero(false); };
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
          <button className="btn sun xl ar-play" onClick={quickDuel} disabled={quick}>{quick ? 'Finding a match…' : 'Play now'} <IconArrow /></button>
        </div>
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
          <div className="grow"><b>Host a game for your class</b><small>Classic, team battle or duel · themed zones · bots · your word sets.</small></div>
          <IconArrow />
        </button>
      </div>

      {/* host: three short steps */}
      {hosting && (
        <section className="ar-host card" id="ar-host">
          <ol className="ar-steps" aria-label="Steps">
            {['Game type', 'World', 'Words'].map((t, i) => <li key={t} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}><button type="button" onClick={() => setStep(i + 1)}><span>{i + 1}</span>{t}</button></li>)}
          </ol>
          {step === 1 && (
            <div className="arena-modes">
              {MODES.map((m) => (
                <button key={m.id} type="button" className={`arena-mode ${mode === m.id ? 'on' : ''}`} onClick={() => { setMode(m.id); setStep(2); }} aria-pressed={mode === m.id}>
                  <span className="arena-mode-chars">{m.chars.map((c) => <Character key={c} kind={c} size={52} />)}</span>
                  <b>{m.title}</b><small>{m.text}</small>
                </button>
              ))}
            </div>
          )}
          {step === 2 && (
            <>
              <div className="ar-worlds">
                {ZONES.map((z) => (
                  <button key={z.id} type="button" className={`ar-world w-${z.id} ${zone === z.id ? 'on' : ''} ${!z.free && !vip ? 'locked' : ''}`} onClick={() => pickZone(z)} aria-pressed={zone === z.id}>
                    <span className="ar-world-scene" aria-hidden="true"><i /><i /><i /><span className="ar-world-runner"><Character kind={z.id === 'ocean' ? 'axolotl' : z.id === 'space' ? 'robot' : z.id === 'jungle' ? 'monkey' : z.id === 'race' ? 'fox' : 'owl'} size={46} /></span></span>
                    {!z.free && <span className="vip">{vip ? 'VIP' : 'VIP · locked'}</span>}
                    <b>{z.name}</b><small>{z.text}</small>
                  </button>
                ))}
              </div>
              <div className="arena-field">
                <b>Add bots <small className="muted">(they play with your class, so a game works even with few players)</small></b>
                <Chips label="Number of bots" value={bots} onChange={setBots} options={(mode === 'duel' ? [0, 1] : [0, 1, 2, 3, 4, 6]).map((n) => ({ value: n, label: n === 0 ? 'No bots' : String(n) }))} />
                {bots > 0 && <Chips label="Bot level" value={botLevel} onChange={(v) => pickLevel(BOT_LEVELS.find((l) => l.id === v))} options={levelOpts} />}
              </div>
              <div className="row between"><button className="btn ghost" onClick={() => setStep(1)}>Back</button><button className="btn primary" onClick={() => setStep(3)}>Next <IconArrow width={16} height={16} /></button></div>
            </>
          )}
          {step === 3 && (
            <>
              <div className="arena-field">
                <b>Words from</b>
                <div className="arena-sets">{sets.map((s) => <button key={s.id} type="button" className={chosen.has(s.id) ? 'on' : ''} onClick={() => toggle(s.id)}>{s.title}</button>)}</div>
                {!d.full && <small className="muted">Subscribe to play with all sets.</small>}
              </div>
              <div className="arena-nums">
                <div><b>Questions</b><Chips label="Questions" value={count} onChange={setCount} options={[10, 15, 20, 30].map((n) => ({ value: n, label: String(n) }))} /></div>
                <div><b>Time</b><Chips label="Time" value={minutes} onChange={setMinutes} options={[2, 3, 5, 8].map((n) => ({ value: n, label: `${n} min` }))} /></div>
              </div>
              <p className="ar-summary">{MODES.find((m) => m.id === mode)?.title} · {ZONES.find((z) => z.id === zone)?.name}{bots ? ` · ${bots} ${BOT_LEVELS.find((l) => l.id === botLevel)?.name.toLowerCase()} bot${bots > 1 ? 's' : ''}` : ''} · {count} questions · {minutes} min</p>
              <div className="row between"><button className="btn ghost" onClick={() => setStep(2)}>Back</button>
                <button className="btn primary lg" disabled={busy || !chosen.size} onClick={host}>{busy ? 'Creating…' : 'Create game'} <IconArrow /></button></div>
            </>
          )}
        </section>
      )}

      {pickHero && (
        <Modal title="Choose your hero" onClose={() => setPickHero(false)} wide>
          {CHARACTER_SETS.map((set) => (
            <div key={set} className="ar-heroes-set">
              <small className="muted">{set}</small>
              <div className="ar-heroes">
                {CHARACTER_KEYS.filter((k) => CHARACTERS[k].set === set).map((k) => (
                  <button key={k} type="button" className={`ar-hero r-${CHARACTERS[k].rarity} ${hero === k ? 'on' : ''}`} onClick={() => choose(k)} style={{ '--c': CHARACTERS[k].body }}>
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
