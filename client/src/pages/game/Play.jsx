import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context.jsx';
import { Confetti, Spinner } from '../../components/ui.jsx';
import Character, { CHARACTERS, CHARACTER_KEYS } from '../../components/Character.jsx';
import { hostKey, playerKey, store } from './GameHub.jsx';

const L = ['A', 'B', 'C', 'D'];
const ASK = { meaning: 'What does it mean?', word: 'Which word fits this meaning?', blank: 'Fill the gap' };
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Word Arena room: join → lobby → play → podium. Works for guests (no account). */
export default function Play() {
  const { code } = useParams();
  const [sp] = useSearchParams();
  const screen = sp.get('screen') === '1';
  const hostToken = store.get(hostKey(code));
  const [token, setToken] = useState(() => store.get(playerKey(code)));
  const [room, setRoom] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    try { setRoom(await api.get(`/game/${code}?token=${token || hostToken || ''}`)); setErr(null); }
    catch (e) { setErr(e); }
  }, [code, token, hostToken]);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 1500); return () => clearInterval(t); }, [load]);

  if (err && !room) return <Shell><div className="arena-msg"><Character kind="ghost" size={96} mood="sad" /><h2>{err.message}</h2><Link className="btn sun" to="/game">Back to Word Arena</Link></div></Shell>;
  if (!room) return <Shell><Spinner label="Opening the arena…" /></Shell>;

  const isHost = !!hostToken;
  const playing = !!room.me;
  if (!playing && !(isHost && screen) && room.status !== 'finished') {
    return <Shell><Join code={code} room={room} onJoined={(t) => { store.set(playerKey(code), t); setToken(t); }} /></Shell>;
  }
  return (
    <Shell>
      {room.status === 'lobby' && <Lobby room={room} isHost={isHost} hostToken={hostToken} reload={load} />}
      {room.status === 'playing' && (playing && room.me.answered < room.total
        ? <Questions room={room} token={token} reload={load} />
        : <Board room={room} isHost={isHost} hostToken={hostToken} reload={load} />)}
      {room.status === 'finished' && <Podium room={room} />}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="arena">
      <header className="arena-top"><Link to="/game" className="arena-brand"><Character kind="owl" size={34} /> <b>Word Arena</b></Link></header>
      <main className="arena-main">{children}</main>
    </div>
  );
}

function Join({ code, room, onJoined }) {
  const { user } = useAuth() || {};
  const [name, setName] = useState(user?.name?.split(' ')[0] || '');
  const [avatar, setAvatar] = useState(CHARACTER_KEYS[Math.floor(Math.random() * CHARACTER_KEYS.length)]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const join = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api.post(`/game/${code}/join`, { name, avatar }); onJoined(r.token); }
    catch (ex) { setError(ex.message); setBusy(false); }
  };
  return (
    <form className="arena-card arena-joinform" onSubmit={join}>
      <small className="arena-label">GAME {code} · {room.mode === 'team' ? 'TEAM BATTLE' : room.mode === 'duel' ? 'DUEL' : 'CLASSIC'}</small>
      <div className="arena-me"><Character kind={avatar} size={120} mood="win" /><b>{CHARACTERS[avatar].name}</b></div>
      <input value={name} onChange={(e) => setName(e.target.value.slice(0, 18))} placeholder="Your nickname" aria-label="Nickname" required minLength={2} />
      <div className="arena-pick" role="radiogroup" aria-label="Choose your character">
        {CHARACTER_KEYS.map((k) => <button type="button" key={k} role="radio" aria-checked={avatar === k} className={avatar === k ? 'on' : ''} onClick={() => setAvatar(k)}><Character kind={k} size={52} /></button>)}
      </div>
      {error && <p className="arena-err">{error}</p>}
      <button className="btn sun lg block" disabled={busy || name.trim().length < 2}>{busy ? 'Joining…' : 'Enter the arena'}</button>
    </form>
  );
}

function Lobby({ room, isHost, hostToken, reload }) {
  const [error, setError] = useState('');
  const start = async () => { try { await api.post(`/game/${room.code}/start`, { host_token: hostToken }); reload(); } catch (e) { setError(e.message); } };
  const url = `${window.location.host}/play/${room.code}`;
  const group = (team) => room.players.filter((p) => !team || p.team === team);
  return (
    <div className="arena-lobby">
      <div className="arena-code">
        <small>Join at <b>{url.replace(/\/play\/\d+$/, '/game')}</b> with code</small>
        <strong>{room.code.slice(0, 3)} {room.code.slice(3)}</strong>
        <small>{room.total} questions · {room.minutes} min · {room.mode === 'team' ? 'Team battle' : room.mode === 'duel' ? 'Duel' : 'Classic'}</small>
      </div>
      {room.mode === 'team' ? (
        <div className="arena-teams">
          {room.teams.map((t) => (
            <div key={t.name} className={`arena-team ${t.name.toLowerCase()}`}>
              <h3>Team {t.name}</h3>
              <div className="arena-crowd">{group(t.name).map((p) => <Player key={p.id} p={p} />)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="arena-crowd big">{group().map((p) => <Player key={p.id} p={p} />)}{!room.players.length && <p className="muted">Waiting for players…</p>}</div>
      )}
      <div className="arena-actions">
        <span className="arena-count">{room.players.length} player{room.players.length === 1 ? '' : 's'}{room.mode === 'duel' ? ' / 2' : ''}</span>
        {isHost ? <button className="btn sun lg" onClick={start}>Start the game</button> : <span className="arena-wait">Waiting for the host to start…</span>}
      </div>
      {error && <p className="arena-err">{error}</p>}
    </div>
  );
}

function Player({ p, score }) {
  return (
    <div className={`arena-player ${p.me ? 'me' : ''}`}>
      <Character kind={p.avatar} size={56} />
      <b>{p.name}</b>
      {score && <small>{p.score}</small>}
    </div>
  );
}

function Questions({ room, token, reload }) {
  const [qi, setQi] = useState(room.me.answered);
  const [fb, setFb] = useState(null);
  const [me, setMe] = useState(room.me);
  const busy = useRef(false);
  const q = room.questions[qi];
  useEffect(() => { if (!fb && room.me.answered > qi) setQi(room.me.answered); }, [room.me.answered]); // eslint-disable-line react-hooks/exhaustive-deps
  const answer = async (k) => {
    if (busy.current || fb) return;
    busy.current = true;
    try {
      const r = await api.post(`/game/${room.code}/answer`, { token, qi, choice: k });
      setFb({ pick: k, ...r });
      setMe((m) => ({ ...m, score: r.score, streak: r.streak }));
      setTimeout(() => { setFb(null); setQi((i) => i + 1); busy.current = false; if (r.done) reload(); }, r.correct ? 700 : 1400);
    } catch { busy.current = false; reload(); }
  };
  useEffect(() => {
    const f = (e) => { const k = ['1', '2', '3', '4'].indexOf(e.key); if (k >= 0 && q) answer(k); };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  });
  if (!q) return <Spinner label="Counting your points…" />;
  return (
    <div className="arena-play">
      <div className="arena-hud">
        <span className="arena-time">{clock(room.seconds_left)}</span>
        <span className="arena-progress">{qi + 1} / {room.total}</span>
        <span className={`arena-streak ${me.streak >= 2 ? 'hot' : ''}`}>{me.streak >= 2 ? `${me.streak} in a row` : 'Streak 0'}</span>
        <span className="arena-score"><Character kind={me.avatar} size={30} /> {me.score}</span>
      </div>
      <div className={`arena-q ${fb ? (fb.correct ? 'ok' : 'no') : ''}`} key={qi}>
        <small>{ASK[q.kind]}</small>
        <p className={q.kind === 'meaning' ? 'word' : ''}>{q.prompt}</p>
        {q.uz && q.kind !== 'meaning' && <small className="arena-uz">{q.uz}</small>}
      </div>
      <div className="arena-opts">
        {q.options.map((o, k) => {
          const st = fb ? (k === fb.answer ? 'right' : k === fb.pick ? 'wrong' : 'dim') : '';
          return <button key={k} className={`arena-opt c${k} ${st}`} onClick={() => answer(k)} disabled={!!fb}><span>{L[k]}</span>{o}</button>;
        })}
      </div>
      {fb && <div className={`arena-pop ${fb.correct ? 'ok' : 'no'}`}>{fb.correct ? `+${fb.gain}` : 'Missed'}</div>}
    </div>
  );
}

function Board({ room, isHost, hostToken, reload }) {
  const end = async () => { try { await api.post(`/game/${room.code}/end`, { host_token: hostToken }); reload(); } catch { /* ignore */ } };
  const max = Math.max(1, ...room.players.map((p) => p.score));
  return (
    <div className="arena-board">
      <div className="arena-hud center">
        <span className="arena-time big">{clock(room.seconds_left)}</span>
        {room.me && <span className="arena-wait">You finished — watch the board!</span>}
      </div>
      {room.mode === 'team' && (
        <div className="arena-teambars">
          {room.teams.map((t) => {
            const top = Math.max(1, ...room.teams.map((x) => x.score));
            return <div key={t.name} className={`arena-tb ${t.name.toLowerCase()}`}><b>Team {t.name}</b><span><i style={{ width: `${(t.score / top) * 100}%` }} /></span><strong>{t.score}</strong></div>;
          })}
        </div>
      )}
      <ol className="arena-rank">
        {room.players.map((p, i) => (
          <li key={p.id} className={p.me ? 'me' : ''}>
            <span className="pos">{i + 1}</span><Character kind={p.avatar} size={40} />
            <b>{p.name}</b>{p.team && <span className={`arena-tag ${p.team.toLowerCase()}`}>{p.team}</span>}
            <span className="bar"><i style={{ width: `${(p.score / max) * 100}%` }} /></span>
            <small>{p.answered}/{room.total}</small><strong>{p.score}</strong>
          </li>
        ))}
      </ol>
      {isHost && <button className="btn ghost" onClick={end}>End the game now</button>}
    </div>
  );
}

function Podium({ room }) {
  const top = room.players.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const winTeam = room.mode === 'team' ? [...room.teams].sort((a, b) => b.score - a.score)[0] : null;
  const me = room.players.find((p) => p.me);
  const teamTie = winTeam && room.teams.every((t) => t.score === winTeam.score);
  const playerTie = top[1] && top[0].score === top[1].score;
  const title = winTeam ? (teamTie ? 'It’s a draw!' : `Team ${winTeam.name} wins!`) : top[0] ? (playerTie ? 'It’s a tie!' : `${top[0].name} wins!`) : 'Game over';
  return (
    <div className="arena-end">
      <Confetti />
      <h1>{title}</h1>
      {me && <p className="arena-mine">You: place {room.players.indexOf(me) + 1} · {me.score} points · {me.correct}/{room.total} correct · best streak {me.best_streak}</p>}
      <div className="arena-podium">
        {order.map((p) => {
          const place = top.indexOf(p) + 1;
          return (
            <div key={p.id} className={`arena-step s${place}`}>
              <Character kind={p.avatar} size={place === 1 ? 110 : 84} mood="win" />
              <b>{p.name}</b><small>{p.score} pts</small>
              <div className="arena-block">{place}</div>
            </div>
          );
        })}
      </div>
      {room.review && (
        <details className="arena-review">
          <summary>See the answers</summary>
          <ol>{room.review.map((r, i) => <li key={i}><b>{r.word}</b> — {r.kind === 'meaning' ? r.answer : r.prompt.replace('______', `[${r.answer}]`)}</li>)}</ol>
        </details>
      )}
      <Link className="btn sun lg" to="/game">Play again</Link>
    </div>
  );
}

/** Guests: type the game code (sat-ustoz…/game). */
export function JoinCode() {
  const [code, setCode] = useState('');
  return (
    <Shell>
      <form className="arena-card arena-joinform" onSubmit={(e) => { e.preventDefault(); if (/^\d{6}$/.test(code)) window.location.assign(`/play/${code}`); }}>
        <div className="arena-me"><Character kind="owl" size={110} mood="win" /></div>
        <h2 style={{ textAlign: 'center' }}>Enter the game code</h2>
        <input className="arena-codein" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoFocus placeholder="123 456" aria-label="Game code" />
        <button className="btn sun lg block" disabled={code.length !== 6}>Join</button>
      </form>
    </Shell>
  );
}
