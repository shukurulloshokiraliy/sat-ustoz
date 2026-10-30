import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons.jsx';

/* ---------- data hook ---------- */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const alive = useRef(true);
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    return fn()
      .then((data) => alive.current && setState({ data, error: null, loading: false }))
      .catch((error) => alive.current && setState({ data: null, error, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    alive.current = true;
    run();
    return () => { alive.current = false; };
  }, [run]);
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

/* ---------- layout bits ---------- */
export const PageHeader = ({ title, sub, children }) => (
  <header className="page-head">
    <div>
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
    </div>
    {children && <div className="page-actions">{children}</div>}
  </header>
);

export const Card = ({ className = '', children, style, ...rest }) => (
  <section className={`card ${className}`} style={style} {...rest}>{children}</section>
);

export const Spinner = ({ label = "Loading…" }) => (
  <div className="loading" role="status"><span className="spinner" /> <span>{label}</span></div>
);

export const ErrorBox = ({ error, onRetry }) => (
  <div className="error-box">
    <p>{error?.message || "Error"}</p>
    {onRetry && <button className="btn ghost sm" onClick={onRetry}>{"Try again"}</button>}
  </div>
);

export const Empty = ({ icon, title, text, children }) => (
  <div className="empty">
    {icon && <div className="empty-icon">{icon}</div>}
    <h3>{title}</h3>
    {text && <p className="muted">{text}</p>}
    {children}
  </div>
);

export function Gate({ state, children }) {
  if (state.loading && !state.data) return <Spinner />;
  if (state.error) return <ErrorBox error={state.error} onRetry={state.reload} />;
  return children(state.data);
}

export function Modal({ title, label, onClose, children, wide, footer }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', f);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  // rendered into <body> so no animated/transformed parent can trap or clip it
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : label}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label={"Close"}><IconX /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ title, text, confirmLabel = "Yes, delete", onConfirm, onClose, danger = true }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>{"Cancel"}</button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{confirmLabel}</button>
      </>}>
      <p>{text}</p>
    </Modal>
  );
}

export const Segmented = ({ value, onChange, options }) => (
  <div className="segmented" role="tablist">
    {options.map((o) => (
      <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
        {o.label}{o.count != null && <span className="count">{o.count}</span>}
      </button>
    ))}
  </div>
);

/* ---------- number / progress ---------- */
export function CountUp({ value, duration = 900, suffix = '', decimals = 0 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (value == null || Number.isNaN(+value)) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(+value); return; }
    let raf; const t0 = performance.now(); const to = +value;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  if (value == null) return <>—</>;
  return <>{v.toFixed(decimals)}{suffix}</>;
}

export function Ring({ value, size = 120, stroke = 10, label, sub, color = 'var(--primary)' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [p, setP] = useState(0);
  useEffect(() => { const t = setTimeout(() => setP(Math.max(0, Math.min(100, value || 0))), 80); return () => clearTimeout(t); }, [value]);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * p) / 100} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div className="ring-in">
        <strong>{label ?? `${Math.round(value || 0)}%`}</strong>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

export const Progress = ({ value, tone = 'primary' }) => (
  <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin="0" aria-valuemax="100">
    <span className={tone} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
  </div>
);

export const pctTone = (p) => (p >= 80 ? 'good' : p >= 55 ? 'warn' : 'bad');

/* ---------- charts (dependency-free SVG) ---------- */
export function LineChart({ points, min = 200, max = 800, target, height = 220, yTicks = [200, 400, 600, 800] }) {
  const W = 640, H = height, padL = 38, padR = 14, padT = 14, padB = 26;
  const gid = useMemo(() => 'g' + Math.random().toString(36).slice(2, 7), []);
  if (!points.length) return <div className="chart-empty muted">{"No data yet — take your first quiz"}</div>;
  const x = (i) => padL + (points.length === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (points.length - 1));
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${d} L${x(points.length - 1)},${H - padB} L${x(0)},${H - padB} Z`;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={"Score trend"}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity=".28" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="3 5" />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="tick">{t}</text>
        </g>
      ))}
      {target != null && (
        <g>
          <line x1={padL} x2={W - padR} y1={y(target)} y2={y(target)} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="6 5" />
          <text x={W - padR} y={y(target) - 6} textAnchor="end" className="tick accent">{"Goal"} {target}</text>
        </g>
      )}
      <path d={area} fill={`url(#${gid})`} className="chart-area" />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="chart-line" pathLength="1" />
      {points.map((p, i) => (
        <g key={i} className="chart-dot" style={{ animationDelay: `${0.5 + i * 0.06}s` }}>
          <circle cx={x(i)} cy={y(p.value)} r="5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />
          <title>{`${p.label}: ${p.value}`}</title>
        </g>
      ))}
      {points.length <= 12 && points.map((p, i) => (
        <text key={'l' + i} x={x(i)} y={H - 6} textAnchor="middle" className="tick">{p.short ?? i + 1}</text>
      ))}
    </svg>
  );
}

export function Bars({ rows, onClick }) {
  if (!rows.length) return <p className="muted">{"No data yet"}</p>;
  return (
    <ul className="bars">
      {rows.map((r, i) => (
        <li key={r.label} onClick={onClick ? () => onClick(r) : undefined} style={{ '--i': i }}>
          <div className="bars-top"><span>{r.label}</span><b>{r.value}%</b></div>
          <Progress value={r.value} tone={pctTone(r.value)} />
          {r.sub && <small className="muted">{r.sub}</small>}
        </li>
      ))}
    </ul>
  );
}

export function ActivityDots({ days }) {
  const set = new Set(days);
  const cells = [];
  const today = new Date(Date.now() + 5 * 3600e3);
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400e3).toISOString().slice(0, 10);
    cells.push({ d, on: set.has(d) });
  }
  return (
    <div className="dots" aria-label={"Activity over the last 28 days"}>
      {cells.map((c, i) => <span key={c.d} className={c.on ? 'on' : ''} style={{ '--i': i }} title={c.d} />)}
    </div>
  );
}

export function Confetti({ count = 44 }) {
  const items = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.6, dur: 1.8 + Math.random() * 1.6,
    rot: Math.random() * 360, color: ['#6d5df6', '#2dd4a7', '#ffb84d', '#ff6b8b', '#4cc9f0'][i % 5], w: 6 + Math.random() * 6,
  })), [count]);
  return (
    <div className="confetti" aria-hidden="true">
      {items.map((p, i) => (
        <i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, background: p.color, width: p.w, height: p.w * 1.6, transform: `rotate(${p.rot}deg)` }} />
      ))}
    </div>
  );
}

export const Avatar = ({ name, size = 36, src }) => {
  if (src) return <img className="avatar" src={src} alt="" referrerPolicy="no-referrer" style={{ width: size, height: size, objectFit: 'cover' }} />;
  const initials = (name || '?').split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  let h = 0; for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) % 360;
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${h} 70% 62%), hsl(${(h + 40) % 360} 70% 52%))` }}>{initials}</span>;
};

export const Field = ({ label, children, hint }) => (
  <label className="field"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>
);

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
