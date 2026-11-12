import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import Character from '../../components/Character.jsx';
import { sfxRight, sfxWrong } from '../../components/gameAudio.js';

/** Cipher Raid: the player's secret password, mystery boxes after a right answer, and the hack itself. */

/** Join step: pick one of five random passwords or type your own. */
export function PasswordPick({ code, value, onChange }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let live = true;
    api.get(`/game/${code}/passwords`).then((r) => { if (live) { setList(r.passwords); if (!value) onChange(r.passwords[0]); } }).catch(() => {});
    return () => { live = false; };
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="raid-pw">
      <small className="arena-label">YOUR SECRET PASSWORD</small>
      <p className="raid-hint">Others try to guess it to steal your credits. Remember it.</p>
      <div className="raid-pw-list" role="radiogroup" aria-label="Choose a password">
        {list.map((p) => <button type="button" key={p} role="radio" aria-checked={value === p} className={value === p ? 'on' : ''} onClick={() => onChange(p)}>{p}</button>)}
      </div>
      <input value={list.includes(value) ? '' : value} onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24))} placeholder="or type your own" aria-label="Your own password" maxLength={24} />
    </div>
  );
}

/** Three boxes, then either credits or a hack. Calls onDone(score) when the player may move on. */
export function RaidPanel({ code, token, init, onDone }) {
  const [stage, setStage] = useState(init?.stage || 'boxes');
  const [boxes, setBoxes] = useState(['', '', '']);
  const [pick, setPick] = useState(-1);
  const [res, setRes] = useState(init?.stage === 'hack' ? { kind: 'hack', victim: init.victim, options: init.options, hint: init.hint } : null);
  const [out, setOut] = useState(null);
  const [now, setNow] = useState(0);
  const t0 = useRef(Date.now());
  const busy = useRef(false);
  const score = useRef(null);

  useEffect(() => { if (stage !== 'hack' || out) return undefined; t0.current = Date.now(); const t = setInterval(() => setNow(Date.now() - t0.current), 200); return () => clearInterval(t); }, [stage, out]);
  const finish = (ms) => setTimeout(() => onDone(score.current), ms);

  const open = async (i) => {
    if (busy.current || pick >= 0) return;
    busy.current = true; setPick(i);
    try {
      const r = await api.post(`/game/${code}/box`, { token, i });
      setBoxes(r.boxes || boxes);
      if (r.kind === 'hack') { setRes(r); setStage('hack'); busy.current = false; }
      else { setRes(r); score.current = r.score; sfxRight(); setStage('gift'); finish(1700); }
    } catch { onDone(null); }
  };
  const hack = async (k) => {
    if (busy.current || out) return;
    busy.current = true;
    try {
      const r = await api.post(`/game/${code}/hack`, { token, choice: k });
      setOut({ ...r, pick: k }); score.current = r.score; (r.found && r.amt ? sfxRight : sfxWrong)(); finish(2200);
    } catch { onDone(null); }
  };

  const sec = now / 1000;
  const live = sec <= 6 ? 60 - 10 * (sec / 6) : sec <= 20 ? 50 - 30 * ((sec - 6) / 14) : 20;
  const label = (t) => (t === 'hack' ? 'Hack' : t === 'jackpot' ? 'Jackpot' : t === 'bonus' ? 'Credits' : '');

  return (
    <div className="raid-layer" role="dialog" aria-modal="true" aria-label="Cipher Raid">
      <div className="raid-card">
        {(stage === 'boxes' || stage === 'gift') && (
          <>
            <small className="raid-tag">ACCESS GRANTED</small>
            <h3>{stage === 'boxes' ? 'Pick a box' : res?.kind === 'jackpot' ? 'Jackpot' : 'Credits received'}</h3>
            <div className="raid-boxes">
              {boxes.map((b, i) => (
                <button key={i} type="button" className={`raid-box ${pick === i ? 'on' : ''} ${b ? `t-${b}` : ''}`} onClick={() => open(i)} disabled={pick >= 0} aria-label={`Box ${i + 1}`}>
                  <span className="raid-lock" aria-hidden="true" />
                  <b>{b ? label(b) : `Box ${i + 1}`}</b>
                </button>
              ))}
            </div>
            {stage === 'gift' && <p className="raid-gain">+{res.amt} credits</p>}
          </>
        )}
        {stage === 'hack' && res && (
          <>
            <small className="raid-tag hot">HACK</small>
            <div className="raid-target"><Character kind={res.victim.avatar} size={54} /><div><b>{res.victim.name}</b><small>Which one is their password? It starts with “{res.hint}”.</small></div></div>
            <div className="raid-opts">
              {res.options.map((o, k) => (
                <button key={o} type="button" className={`raid-opt ${out ? (out.pick === k ? (out.found ? 'right' : 'wrong') : 'dim') : ''}`} onClick={() => hack(k)} disabled={!!out}>{o}</button>
              ))}
            </div>
            {!out && <p className="raid-meter">Steal now: <b>{Math.round(live)}%</b> of their credits <small>(drops the longer you wait)</small></p>}
            {out && <p className={`raid-gain ${out.found && out.amt ? '' : 'miss'}`}>{out.found ? (out.amt ? `Access! You took ${out.amt} credits (${out.pct}%) in ${out.seconds}s` : 'Access, but they had nothing left') : 'Wrong password. Nothing stolen.'}</p>}
          </>
        )}
      </div>
    </div>
  );
}

/** Slides in when someone has just stolen from the player. */
export function HitBanner({ hit }) {
  const [shown, setShown] = useState(null);
  const seen = useRef(hit?.seq || 0);
  useEffect(() => {
    if (!hit || hit.seq <= seen.current) return undefined;
    seen.current = hit.seq; setShown(hit);
    const t = setTimeout(() => setShown(null), 4200);
    return () => clearTimeout(t);
  }, [hit?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  return <div className="raid-hit" role="status"><b>{shown.by}</b> hacked you and took <b>{shown.amt}</b> credits</div>;
}
