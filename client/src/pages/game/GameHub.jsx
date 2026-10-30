import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Gate, useAsync } from '../../components/ui.jsx';
import { IconArrow } from '../../components/icons.jsx';
import Character, { CHARACTER_KEYS } from '../../components/Character.jsx';
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
      const avatar = CHARACTER_KEYS[Math.floor(Math.random() * CHARACTER_KEYS.length)];
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

  return (
    <>
      <section className="arena-hero">
        <div className="arena-hero-copy">
          <small>WORD ARENA</small>
          <h1>Battle with words.</h1>
          <p>Host a live vocabulary game for your class or challenge a friend to a duel. Players join from any phone with a 6-digit code.</p>
          <div className="duel-box">
            <b>Quick duel</b>
            <Chips dark label="Opponent" value={opp} onChange={setOpp} options={[{ value: 'player', label: 'Random player' }, { value: 'bot', label: 'Bot' }]} />
            <Chips dark label="Bot level" value={duelLevel} onChange={pickDuelLevel} options={levelOpts} />
            <small>{opp === 'bot' ? 'Starts right away against this bot.' : 'Plays a free student; if nobody comes in 25 s, this bot takes the seat.'}</small>
            <button className="btn sun lg" onClick={quickDuel} disabled={quick}>{quick ? 'Starting…' : 'Play'} <IconArrow /></button>
          </div>
          <form className="arena-join" onSubmit={(e) => { e.preventDefault(); if (/^\d{6}$/.test(code)) nav(`/play/${code}`); }}>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="Game code" aria-label="Game code" />
            <button className="btn on-dark lg" disabled={code.length !== 6}>Join with code</button>
          </form>
        </div>
        <div className="arena-parade" aria-hidden="true">
          {['owl', 'lion', 'axolotl', 'unicorn', 'panda', 'shark', 'fox', 'dragon'].map((k, i) => <span key={k} style={{ animationDelay: `${i * 0.18}s` }}><Character kind={k} size={i % 3 === 0 ? 86 : 64} /></span>)}
        </div>
      </section>

      <section className="arena-host card">
        <h2>Host a game</h2>
        <div className="arena-modes">
          {MODES.map((m) => (
            <button key={m.id} type="button" className={`arena-mode ${mode === m.id ? 'on' : ''}`} onClick={() => setMode(m.id)} aria-pressed={mode === m.id}>
              <span className="arena-mode-chars">{m.chars.map((c) => <Character key={c} kind={c} size={44} />)}</span>
              <b>{m.title}</b><small>{m.text}</small>
            </button>
          ))}
        </div>
        <div className="arena-field">
          <b>Zone</b>
          <div className="arena-zones">
            {ZONES.map((z) => (
              <button key={z.id} type="button" className={`arena-zone z-${z.id} ${zone === z.id ? 'on' : ''} ${!z.free && !vip ? 'locked' : ''}`} onClick={() => pickZone(z)} aria-pressed={zone === z.id}>
                {!z.free && <span className="vip">{vip ? 'VIP' : 'VIP · locked'}</span>}
                <b>{z.name}</b><small>{z.text}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="arena-field">
          <b>Bots</b>
          <div className="arena-bots">
            <Chips label="Number of bots" value={bots} onChange={setBots} options={(mode === 'duel' ? [0, 1] : [0, 1, 2, 3, 4, 6]).map((n) => ({ value: n, label: n === 0 ? 'None' : String(n) }))} />
            {bots > 0 && <div className="arena-lvls">
              {BOT_LEVELS.map((l) => (
                <button key={l.id} type="button" className={`arena-lvl l-${l.id} ${botLevel === l.id ? 'on' : ''} ${!l.free && !vip ? 'locked' : ''}`} onClick={() => pickLevel(l)} aria-pressed={botLevel === l.id}>
                  {!l.free && !vip && <span className="vip">VIP</span>}
                  <b>{l.name}</b><small>{l.text}</small>
                </button>
              ))}
            </div>}
          </div>
          <small className="muted">Bots play alongside real players, so you can practise even when you are alone.{!vip && ' Easy bots and the Classic zone are free; the rest come with VIP.'}</small>
        </div>
        <div className="arena-opts">
          <div>
            <b>Words from</b>
            <div className="arena-sets">
              {sets.map((s) => <button key={s.id} type="button" className={chosen.has(s.id) ? 'on' : ''} onClick={() => toggle(s.id)}>{s.title}</button>)}
            </div>
            {!d.full && <small className="muted">Subscribe to play with all 15 sets.</small>}
          </div>
          <div className="arena-nums">
            <div><b>Questions</b><Chips label="Questions" value={count} onChange={setCount} options={[10, 15, 20, 30].map((n) => ({ value: n, label: String(n) }))} /></div>
            <div><b>Time</b><Chips label="Time" value={minutes} onChange={setMinutes} options={[2, 3, 5, 8].map((n) => ({ value: n, label: `${n} min` }))} /></div>
          </div>
        </div>
        <button className="btn primary lg block" disabled={busy || !chosen.size} onClick={host}>{busy ? 'Creating…' : 'Create game'} <IconArrow /></button>
      </section>
    </>
  );
}
