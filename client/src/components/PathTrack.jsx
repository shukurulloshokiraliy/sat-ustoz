
const pct = (v) => Math.max(0, Math.min(100, ((v - 200) / 600) * 100));

/** The 200 → 800 road with the student's estimated score and target pinned on it. */
export default function PathTrack({ value, target, label = "You" }) {
  const v = value ?? 200;
  const near = target != null && Math.abs(target - v) < 90; // lift the student's pin so bubbles never overlap
  return (
    <div className="path" style={{ paddingTop: near ? 82 : 48 }} aria-label={`Estimated score ${value ?? '—'}, goal ${target ?? '—'}`}>
      <div className="path-rail">
        {target != null && <div className="pin target" style={{ left: `${pct(target)}%` }}><span className="bubble">{"Goal"} {target}</span></div>}
        <div className="pin" style={{ left: `${pct(v)}%`, '--lift': near ? '34px' : '0px' }}><span className="bubble">{label} {value ?? '—'}</span></div>
        <div className="path-track"><div className="path-fill" style={{ width: `${pct(v)}%` }} /></div>
      </div>
      <div className="path-stops">{[200, 300, 400, 500, 600, 700, 800].map((n) => <span key={n}>{n}</span>)}</div>
    </div>
  );
}
