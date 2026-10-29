import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconArrow, IconCheck, IconFlag, IconLock, IconPlus } from './icons.jsx';

/** Brand step colours (Mint/Coral are reserved for feedback). text = readable label colour on that fill. */
export const STEP_COLORS = {
  signal: { bg: '#2A55E5', text: '#fff', label: 'Signal Blue' },
  sky: { bg: '#3B82F6', text: '#fff', label: 'Sky' },
  sun: { bg: '#FFCB3D', text: '#161B3D', label: 'Sun' },
  night: { bg: '#161B3D', text: '#fff', label: 'Night Ink' },
  white: { bg: '#FFFFFF', text: '#161B3D', label: 'White' },
};
export const stepColor = (k) => STEP_COLORS[k] || STEP_COLORS.signal;
const XS = [0.36, 0.66, 0.4, 0.7, 0.33, 0.62, 0.44, 0.68, 0.35, 0.6];
const STEP_H = 200;
const TOP = 210;
const BOTTOM = 210;

/** The round badge used for a step — on the map, in drawers, in the editor. */
export function StepDisc({ step, size = 72, state }) {
  const c = stepColor(step.color);
  const badge = step.badge || '★';
  return (
    <span className={`rm-disc c-${step.color || 'signal'} ${state || ''}`} style={{ '--c': c.bg, '--t': c.text, width: size, height: size, fontSize: size * (badge.length > 2 ? 0.28 : badge.length > 1 ? 0.34 : 0.42) }}>
      <span>{badge}</span>
    </span>
  );
}

/**
 * A winding, bottom-to-top map of the roadmap steps.
 * steps: [{ id, title, subtitle, status: 'done'|'current'|'locked', ... }]
 */
export default function RoadmapMap({ steps, onSelect, onAdd, footer, editable = false, maxHeight }) {
  const wrapRef = useRef(null);
  const scrollRef = useRef(null);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const H = TOP + BOTTOM + Math.max(0, steps.length - 1) * STEP_H + (editable ? 40 : 0);
  const pts = useMemo(() => steps.map((s, i) => {
    let fx = XS[i % XS.length];
    if (w < 520) fx = 0.5 + (fx - 0.5) * 0.75; // keep labels on narrow screens
    return { x: Math.round(w * fx), y: H - BOTTOM - i * STEP_H };
  }), [steps, w, H]);

  // scroll so the current step is in view
  const currentIdx = steps.findIndex((s) => s.status === 'current');
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || !w || !steps.length) return;
    const idx = currentIdx >= 0 ? currentIdx : steps.every((s) => s.status === 'done') ? steps.length - 1 : 0;
    const y = pts[idx]?.y ?? H;
    sc.scrollTop = Math.max(0, y - sc.clientHeight * 0.55);
  }, [w, steps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const seg = (a, b) => `M ${a.x} ${a.y} C ${a.x} ${a.y - STEP_H * 0.55}, ${b.x} ${b.y + STEP_H * 0.55}, ${b.x} ${b.y}`;
  const kind = (next) => (editable ? 'edit' : next?.status === 'done' ? 'done' : next?.status === 'current' ? 'active' : 'locked');
  const goal = { x: Math.round(w / 2), y: 92 };
  const allDone = steps.length > 0 && steps.every((s) => s.status === 'done');

  const paths = [];
  if (pts.length && w) {
    paths.push({ d: `M ${pts[0].x} ${H + 10} C ${pts[0].x} ${H - 40}, ${pts[0].x} ${pts[0].y + 60}, ${pts[0].x} ${pts[0].y}`, k: kind(steps[0]) });
    for (let i = 0; i < pts.length - 1; i++) paths.push({ d: seg(pts[i], pts[i + 1]), k: kind(steps[i + 1]) });
    const last = pts[pts.length - 1];
    paths.push({ d: `M ${last.x} ${last.y} C ${last.x} ${last.y - 90}, ${goal.x} ${goal.y + 90}, ${goal.x} ${goal.y + 30}`, k: editable ? 'edit' : allDone ? 'done' : 'locked' });
  }

  return (
    <div className="rm-scroll" ref={scrollRef} style={maxHeight ? { maxHeight } : undefined}>
      <div className="rm-map" ref={wrapRef} style={{ height: H }}>
        <div className="rm-watermark" aria-hidden>SAT 800</div>
        {w > 0 && (
          <svg className="rm-svg" width={w} height={H} aria-hidden>
            {paths.map((p, i) => <path key={'r' + i} d={p.d} className="rm-road" />)}
            {paths.map((p, i) => <path key={'p' + i} d={p.d} className={`rm-path ${p.k}`} />)}
          </svg>
        )}

        <div className={`rm-goal ${allDone ? 'reached' : ''}`} style={{ left: goal.x, top: goal.y }}>
          <span className="rm-goal-icon"><IconFlag width={18} height={18} /></span>
          <span><b>800</b><small>Goal</small></span>
        </div>

        {w > 0 && steps.map((s, i) => {
          const p = pts[i];
          const state = editable ? 'edit' : s.status;
          return (
            <button key={s.id} type="button" className={`rm-node ${state}`} style={{ left: p.x, top: p.y, animationDelay: `${Math.min(i, 10) * 50}ms` }}
              onClick={() => onSelect?.(s, i)} aria-label={`Step ${i + 1}: ${s.title}${s.status ? ` (${s.status})` : ''}`}>
              {state === 'current' && <span className="rm-halo" />}
              <StepDisc step={s} state={state} />
              <span className={`rm-num ${state}`}>{i + 1}</span>
              {state === 'done' && <span className="rm-state good"><IconCheck width={13} height={13} /></span>}
              {state === 'locked' && <span className="rm-state"><IconLock width={12} height={12} /></span>}
              <span className="rm-label">
                <b>{s.title}</b>
                {s.subtitle && <small>{s.subtitle}</small>}
                {state === 'current' && s.total > 0 && (
                  <span className="rm-mini"><i style={{ width: `${s.progress}%` }} /></span>
                )}
              </span>
            </button>
          );
        })}

        {editable && onAdd && w > 0 && (
          <button type="button" className="rm-add" style={{ left: goal.x, top: TOP - 34 }} onClick={() => onAdd(steps.length)}>
            <IconPlus width={16} height={16} /> Add step
          </button>
        )}
        {!steps.length && <div className="rm-empty">No steps yet.</div>}
      </div>
      {footer}
    </div>
  );
}

export function ContinueBar({ step, onClick, label = 'Continue' }) {
  if (!step) return null;
  return (
    <div className="rm-continue">
      <StepDisc step={step} size={40} />
      <div className="grow">
        <b>{step.title}</b>
        <small>{step.total ? `${step.completed}/${step.total} done` : step.subtitle || `${step.score_from}–${step.score_to}`}</small>
      </div>
      <button className="rm-cta" onClick={onClick}>{label} <IconArrow width={16} height={16} /></button>
    </div>
  );
}
