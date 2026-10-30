import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Gate, useAsync } from '../../components/ui.jsx';
import { IconArrow } from '../../components/icons.jsx';
import Character, { CHARACTER_KEYS } from '../../components/Character.jsx';

export const hostKey = (code) => `arena-host-${code}`;
export const playerKey = (code) => `arena-${code}`;
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
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setChosen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const host = async () => {
    setBusy(true);
    try {
      const r = await api.post('/game/rooms', { mode, questions: count, minutes, set_ids: [...chosen] });
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
          <form className="arena-join" onSubmit={(e) => { e.preventDefault(); if (/^\d{6}$/.test(code)) nav(`/play/${code}`); }}>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="Game code" aria-label="Game code" />
            <button className="btn sun lg" disabled={code.length !== 6}>Join <IconArrow /></button>
          </form>
        </div>
        <div className="arena-parade" aria-hidden="true">
          {CHARACTER_KEYS.slice(0, 8).map((k, i) => <span key={k} style={{ animationDelay: `${i * 0.18}s` }}><Character kind={k} size={i % 3 === 0 ? 86 : 64} /></span>)}
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
        <div className="arena-opts">
          <div>
            <b>Words from</b>
            <div className="arena-sets">
              {sets.map((s) => <button key={s.id} type="button" className={chosen.has(s.id) ? 'on' : ''} onClick={() => toggle(s.id)}>{s.title}</button>)}
            </div>
            {!d.full && <small className="muted">Subscribe to play with all 15 sets.</small>}
          </div>
          <div className="arena-nums">
            <label>Questions<select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[10, 15, 20, 30].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label>Time<select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>{[2, 3, 5, 8].map((n) => <option key={n} value={n}>{n} min</option>)}</select></label>
          </div>
        </div>
        <button className="btn primary lg block" disabled={busy || !chosen.size} onClick={host}>{busy ? 'Creating…' : 'Create game'} <IconArrow /></button>
      </section>
    </>
  );
}
