import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context.jsx';
import { Confetti, Modal, Spinner } from '../../components/ui.jsx';
import Character, { CHARACTERS, CHARACTER_KEYS, CHARACTER_SETS, isVipCharacter } from '../../components/Character.jsx';
import { Chips, DUEL_KEY, hostKey, playerKey, store, HERO_KEY } from './GameHub.jsx';
import { BOT_LEVELS, ZONE, ZoneTrack, arenaTheme, isVip } from './zones.jsx';
import { HitBanner, PasswordPick, RaidPanel } from './Raid.jsx';
import { musicOn, sfxOn, setPref, startMusic, stopMusic, sfxRight, sfxWrong, sfxTick, sfxWin, sfxStart } from '../../components/gameAudio.js';

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
    return <Shell zone={room.zone} raid={room.raid}><Join code={code} room={room} onJoined={(t) => { store.set(playerKey(code), t); setToken(t); }} /></Shell>;
  }
  return (
    <Shell zone={room.zone} raid={room.raid}>
      {room.raid && playing && room.status === 'playing' && <HitBanner hit={room.me.raid?.hit} />}
      {room.status === 'lobby' && <Lobby room={room} isHost={isHost} hostToken={hostToken} reload={load} />}
      {room.status === 'playing' && (playing && room.me.answered < room.total
        ? <Questions room={room} token={token} reload={load} />
        : <Board room={room} isHost={isHost} hostToken={hostToken} reload={load} />)}
      {room.status === 'finished' && <Podium room={room} isHost={isHost} />}
    </Shell>
  );
}

function SoundButtons() {
  const [m, setM] = useState(musicOn());
  const [f, setF] = useState(sfxOn());
  return (
    <div className="arena-sound">
      <button type="button" className={m ? 'on' : ''} aria-pressed={m} onClick={() => { const v = !m; setPref('arena-music', v); setM(v); if (!v) stopMusic(); else window.dispatchEvent(new Event('arena-music')); }} title={m ? 'Music on' : 'Music off'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />{!m && <path d="M3 3l18 18" />}</svg><span>Music</span>
      </button>
      <button type="button" className={f ? 'on' : ''} aria-pressed={f} onClick={() => { const v = !f; setPref('arena-sfx', v); setF(v); }} title={f ? 'Sounds on' : 'Sounds off'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z" />{f ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m22 9-6 6M16 9l6 6" />}</svg><span>Sounds</span>
      </button>
    </div>
  );
}

function Shell({ children, zone = 'classic', raid = false }) {
  const { user } = useAuth();
  return (
    <div className={`arena z-${zone} bg-${arenaTheme(user)} ${raid ? 'is-raid' : ''}`}>
      <header className="arena-top"><Link to="/game" className="arena-brand"><Character kind="owl" size={34} /> <b>Word Arena</b></Link><SoundButtons /></header>
      <main className="arena-main">{children}</main>
    </div>
  );
}

function Join({ code, room, onJoined }) {
  const { user } = useAuth() || {};
  const [name, setName] = useState(user?.name?.split(' ')[0] || '');
  const vipJoin = isVip(user);
  const [avatar, setAvatar] = useState(() => { const h = store.get(HERO_KEY); return CHARACTER_KEYS.includes(h) && (vipJoin || !isVipCharacter(h)) ? h : 'owl'; });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [set, setSet] = useState('All');
  const [picking, setPicking] = useState(false);
  const [pw, setPw] = useState('');
  const join = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api.post(`/game/${code}/join`, { name, avatar, pw: room.raid ? pw : undefined }); onJoined(r.token); }
    catch (ex) { setError(ex.message); setBusy(false); }
  };
  return (
    <form className="arena-card arena-joinform" onSubmit={join}>
      <small className="arena-label">GAME {code} · {room.mode === 'team' ? 'TEAM BATTLE' : room.mode === 'duel' ? 'DUEL' : 'CLASSIC'}{room.raid ? ' · CIPHER RAID' : ''}</small>
      <button type="button" className={`arena-me tap r-${CHARACTERS[avatar].rarity}`} style={{ '--glow': CHARACTERS[avatar].body }} onClick={() => setPicking(true)} aria-label="Change your character">
        <Character key={avatar} kind={avatar} size={104} mood="win" className="pop" />
        <b>{CHARACTERS[avatar].name}</b><span className="arena-rarity">{CHARACTERS[avatar].rarity}</span>
        <em>Tap to change</em>
      </button>
      <input value={name} onChange={(e) => setName(e.target.value.slice(0, 18))} placeholder="Your nickname" aria-label="Nickname" required minLength={2} />
      {picking && (
        <Modal title="Choose your character" onClose={() => setPicking(false)} wide>
          <div className="arena-groups" role="tablist" aria-label="Character groups">
            {['All', ...CHARACTER_SETS].map((x) => <button type="button" key={x} role="tab" aria-selected={set === x} className={set === x ? 'on' : ''} onClick={() => setSet(x)}>{x}</button>)}
          </div>
          <div className="arena-pick sheet" role="radiogroup" aria-label="Choose your character">
            {CHARACTER_KEYS.filter((k) => set === 'All' || CHARACTERS[k].set === set).map((k) => (
              <button type="button" key={k} role="radio" aria-checked={avatar === k} title={CHARACTERS[k].name} className={`r-${CHARACTERS[k].rarity} ${avatar === k ? 'on' : ''} ${isVipCharacter(k) && !vipJoin ? 'locked' : ''}`} onClick={() => { if (isVipCharacter(k) && !vipJoin) return; setAvatar(k); store.set(HERO_KEY, k); setPicking(false); }}>
                <Character kind={k} size={56} />
              </button>
            ))}
          </div>
          <button type="button" className="arena-random" onClick={() => { const pool = CHARACTER_KEYS.filter((k) => vipJoin || !isVipCharacter(k)); setAvatar(pool[Math.floor(Math.random() * pool.length)]); setPicking(false); }}>Surprise me</button>
        </Modal>
      )}
      {room.raid && <PasswordPick code={code} value={pw} onChange={setPw} />}
      {error && <p className="arena-err">{error}</p>}
      <button className="btn sun lg block" disabled={busy || name.trim().length < 2 || (room.raid && pw.length < 3)}>{busy ? 'Joining…' : 'Enter the arena'}</button>
    </form>
  );
}

/** Quick duel: wait for a random opponent; after a while a bot can take the seat (automatically at 25 s). */
function Searching({ room, isHost, hostToken, reload }) {
  const { user } = useAuth() || {};
  const vip = isVip(user);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const level = (() => { try { const l = JSON.parse(store.get(DUEL_KEY) || '{}').level; return l && (vip || l === 'easy') ? l : 'easy'; } catch { return 'easy'; } })();
  const levelName = BOT_LEVELS.find((l) => l.id === level)?.name;
  const me = room.players.find((p) => p.me) || room.players[0];
  const bot = useCallback(async () => {
    if (busy || !isHost) return;
    setBusy(true);
    try { await api.post(`/game/${room.code}/bot`, { host_token: hostToken, level }); } catch { /* an opponent may have just joined */ }
    reload();
  }, [busy, isHost, room.code, hostToken, reload, level]);
  useEffect(() => { const t = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (secs === 25) bot(); }, [secs, bot]);
  return (
    <div className="arena-search">
      <div className="arena-vs">
        {me && <div className="arena-vs-side"><Character kind={me.avatar} size={120} mood="win" /><b>{me.name}</b></div>}
        <span className="arena-vs-mid">VS</span>
        <div className="arena-vs-side unknown"><span className="arena-radar" aria-hidden="true"><i /><i /><i /></span><b>Searching…</b></div>
      </div>
      <h2>Looking for an opponent</h2>
      <p>{secs < 25 ? `Waiting for a free student. In ${25 - secs} s the ${levelName} bot takes the seat.` : 'Calling the bot…'}</p>
      <div className="arena-actions">
        {isHost && <button className="btn sun lg" onClick={bot} disabled={busy}>Play the {levelName} bot now</button>}
        <Link className="btn on-dark lg" to="/game">Cancel</Link>
      </div>
    </div>
  );
}

function Lobby(props) {
  const { room } = props;
  if (room.quick && room.mode === 'duel' && room.players.length < 2) return <Searching {...props} />;
  return <RoomLobby {...props} />;
}

/** Host: add a bot (Easy is free, the others are VIP). */
function BotAdder({ room, hostToken, reload, onError }) {
  const { user } = useAuth() || {};
  const vip = isVip(user);
  const add = async (level) => {
    try { await api.post(`/game/${room.code}/bot`, { host_token: hostToken, level }); reload(); }
    catch (e) { onError(e.message); }
  };
  return (
    <div className="arena-lobby-bots">
      <span>Add a bot</span>
      <Chips dark label="Add a bot" value={null} onChange={add} options={BOT_LEVELS.filter((l) => l.free || vip).map((l) => ({ value: l.id, label: `+ ${l.name}` }))} />
    </div>
  );
}

function RoomLobby({ room, isHost, hostToken, reload }) {
  const [error, setError] = useState('');
  const start = async () => { try { await api.post(`/game/${room.code}/start`, { host_token: hostToken }); reload(); } catch (e) { setError(e.message); } };
  const url = `${window.location.host}/play/${room.code}`;
  const rm = async (p) => { try { await api.post(`/game/${room.code}/bot/remove`, { host_token: hostToken, id: p.id }); reload(); } catch (e) { setError(e.message); } };
  const group = (team) => room.players.filter((p) => !team || p.team === team);
  return (
    <div className="arena-lobby">
      <div className="arena-code">
        <small>Join at <b>{url.replace(/\/play\/\d+$/, '/game')}</b> with code</small>
        <strong>{room.code.slice(0, 3)} {room.code.slice(3)}</strong>
        <small>{room.total} questions · {room.minutes} min · {room.mode === 'team' ? 'Team battle' : room.mode === 'duel' ? 'Duel' : 'Classic'}{room.zone && room.zone !== 'classic' ? ` · ${ZONE[room.zone]?.name}` : ''}{room.raid ? ' · Cipher Raid' : ''}</small>
        {room.raid && room.me?.pw && <small className="raid-mypw">Your password: <b>{room.me.pw}</b></small>}
      </div>
      {room.zone !== 'classic' && room.players.length > 0 && <ZoneTrack room={room} />}
      {room.mode === 'team' ? (
        <div className="arena-teams">
          {room.teams.map((t) => (
            <div key={t.name} className={`arena-team ${t.name.toLowerCase()}`}>
              <h3>Team {t.name}</h3>
              <div className="arena-crowd">{group(t.name).map((p) => <Player key={p.id} p={p} onRemove={isHost && p.is_bot ? rm : null} />)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="arena-crowd big">{group().map((p) => <Player key={p.id} p={p} onRemove={isHost && p.is_bot ? rm : null} />)}{!room.players.length && <p className="muted">Waiting for players…</p>}</div>
      )}
      <div className="arena-actions">
        <span className="arena-count">{room.players.length} player{room.players.length === 1 ? '' : 's'}{room.mode === 'duel' ? ' / 2' : ''}</span>
        {isHost ? <button className="btn sun lg" onClick={start}>Start the game</button> : <span className="arena-wait">Waiting for the host to start…</span>}
      </div>
      {isHost && !(room.mode === 'duel' && room.players.length >= 2) && <BotAdder room={room} hostToken={hostToken} reload={reload} onError={setError} />}
      {error && <p className="arena-err">{error}</p>}
    </div>
  );
}

function Player({ p, score, onRemove }) {
  return (
    <div className={`arena-player ${p.me ? 'me' : ''}`}>
      {onRemove && <button className="rm" onClick={() => onRemove(p)} aria-label={`Remove ${p.name}`}>×</button>}
      <Character kind={p.avatar} size={56} />
      <b>{p.name}</b>
      {p.is_bot && <span className="bot">BOT</span>}
      {score && <small>{p.score}</small>}
    </div>
  );
}

function Questions({ room, token, reload }) {
  const [qi, setQi] = useState(room.me.answered);
  const [fb, setFb] = useState(null);
  const [me, setMe] = useState(room.me);
  const busy = useRef(false);
  const [raid, setRaid] = useState(() => (room.raid && room.me.raid?.stage ? room.me.raid : null));
  const lastLocal = useRef(0);
  const q = room.questions[qi];
  // hits from other players change the score on the server
  useEffect(() => { if (room.raid && !fb && !raid && Date.now() - lastLocal.current > 3000) setMe((m) => ({ ...m, score: room.me.score })); }, [room.me.score]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!fb && room.me.answered > qi) setQi(room.me.answered); }, [room.me.answered]); // eslint-disable-line react-hooks/exhaustive-deps
  // music while the questions are on screen (browsers allow sound only after a tap: the first tap starts it)
  useEffect(() => {
    sfxStart(); startMusic();
    const kick = () => startMusic();
    window.addEventListener('pointerdown', kick); window.addEventListener('arena-music', kick);
    return () => { window.removeEventListener('pointerdown', kick); window.removeEventListener('arena-music', kick); stopMusic(); };
  }, []);
  useEffect(() => { if (room.seconds_left > 0 && room.seconds_left <= 10) sfxTick(); }, [room.seconds_left]);
  const answer = async (k) => {
    if (busy.current || fb) return;
    busy.current = true;
    try {
      const r = await api.post(`/game/${room.code}/answer`, { token, qi, choice: k });
      setFb({ pick: k, ...r });
      (r.correct ? sfxRight : sfxWrong)();
      setMe((m) => ({ ...m, score: r.score, streak: r.streak, correct: (m.correct || 0) + (r.correct ? 1 : 0) })); lastLocal.current = Date.now();
      if (r.raid) { setTimeout(() => setRaid({ stage: 'boxes' }), 650); return; }
      setTimeout(() => { setFb(null); setQi((i) => i + 1); busy.current = false; if (r.done) reload(); }, r.correct ? 700 : 3000);
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
      {room.zone !== 'classic' && <ZoneTrack room={{ ...room, players: room.players.map((p) => (p.me ? { ...p, correct: Math.max(me.correct || 0, p.correct) } : p)) }} limit={5} compact />}
      {room.mode === 'duel' && room.zone === 'classic' && (() => {
        const opp = room.players.find((p) => !p.me);
        if (!opp) return null;
        const max = Math.max(1, me.score, opp.score);
        return (
          <div className="arena-duelbar" aria-label={`You ${me.score}, ${opp.name} ${opp.score}`}>
            <span className="you"><b>You</b><i style={{ width: `${(me.score / max) * 100}%` }} /><em>{me.score}</em></span>
            <span className="them"><Character kind={opp.avatar} size={28} /><b>{opp.name}</b><i style={{ width: `${(opp.score / max) * 100}%` }} /><em>{opp.score} · {opp.answered}/{room.total}</em></span>
          </div>
        );
      })()}
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
      {raid && <RaidPanel code={room.code} token={token} init={raid} onDone={(sc) => { setRaid(null); if (sc != null) { setMe((m) => ({ ...m, score: sc })); lastLocal.current = Date.now(); } setFb(null); setQi((i) => i + 1); busy.current = false; }} />}
      {fb && !raid && <div className={`arena-pop ${fb.correct ? 'ok' : 'no'}`}>{fb.correct ? `+${fb.gain}` : 'Missed'}</div>}
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
      {room.zone !== 'classic' && <ZoneTrack room={room} />}
      <ol className={`arena-rank ${room.zone !== 'classic' ? 'slim' : ''}`}>
        {room.players.map((p, i) => (
          <li key={p.id} className={p.me ? 'me' : ''}>
            <span className="pos">{i + 1}</span><Character kind={p.avatar} size={40} />
            <b>{p.name}</b>{p.team && <span className={`arena-tag ${p.team.toLowerCase()}`}>{p.team}</span>}
            <span className="bar"><i style={{ width: `${(p.score / max) * 100}%` }} /></span>
            <small>{room.raid && p.hacks ? `${p.hacks} hack${p.hacks > 1 ? 's' : ''} · ` : ''}{p.answered}/{room.total}</small><strong>{p.score}</strong>
          </li>
        ))}
      </ol>
      {isHost && <button className="btn ghost" onClick={end}>End the game now</button>}
    </div>
  );
}

/** Full results after the game: accuracy, right and wrong answers and credits for every player. */
function Results({ room, isHost }) {
  // The teacher sees everyone; a student only sees their own result.
  const rows = isHost ? room.players : room.players.filter((p) => p.me);
  if (!rows.length) return null;
  return (
    <section className="arena-results" aria-label="Results">
      <h2>{isHost ? 'Results' : 'Your result'}</h2>
      <ol>
        {rows.map((p, i) => {
          const wrong = Math.max(0, p.answered - p.correct);
          const pct = p.answered ? Math.round((p.correct / p.answered) * 100) : 0;
          const tone = pct >= 80 ? 'good' : pct >= 60 ? 'mid' : 'low';
          return (
            <li key={p.id} className={p.me ? 'me' : ''}>
              <span className="pos">{i + 1}</span>
              <Character kind={p.avatar} size={38} />
              <b className="nm">{p.name}{p.team && <span className={`arena-tag ${p.team.toLowerCase()}`}>{p.team}</span>}</b>
              <span className={`ring ${tone}`} style={{ '--p': pct }}><i>{pct}%</i></span>
              <strong className="cr">{p.score}<small>credits</small></strong>
              <span className="split" aria-label={`${p.correct} right, ${wrong} wrong`}>
                {p.answered > 0 ? (<>
                  <span className="ok" style={{ flexGrow: p.correct || 0.001 }}>{p.correct > 0 ? `✓ ${p.correct}` : ''}</span>
                  <span className="no" style={{ flexGrow: wrong || 0.001 }}>{wrong > 0 ? `✗ ${wrong}` : ''}</span>
                </>) : <span className="none">no answers</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Podium({ room, isHost }) {
  useEffect(() => { stopMusic(); sfxWin(); }, []);
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
      {me && <p className="arena-mine">You: place {room.players.indexOf(me) + 1} · {me.score} points · {me.correct}/{room.total} correct · best streak {me.best_streak}{room.raid ? ` · ${me.hacks || 0} hacks, ${me.stolen || 0} credits stolen` : ''}</p>}
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
      <Results room={room} isHost={isHost} />
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
