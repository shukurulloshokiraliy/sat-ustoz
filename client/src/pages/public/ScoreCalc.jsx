import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mathFromModules, rwFromModules } from '../../../../server/src/scoring.js';
import { IconArrow } from '../../components/icons.jsx';

function Slider({ label, value, max, onChange }) {
  return (
    <label className="sc-slider">
      <span className="row between"><span>{label}</span><span><b>{value}</b>/{max} correct</span></span>
      <input type="range" min="0" max={max} value={value} onChange={(e) => onChange(+e.target.value)} style={{ '--p': `${(value / max) * 100}%` }} aria-label={`${label}: correct answers`} />
    </label>
  );
}

const Route = ({ hard }) => <span className={`calc-route ${hard ? 'hard' : ''}`}>{hard ? 'Harder Module 2' : 'Easier Module 2'}</span>;

/** SAT score calculator: correct answers per module → estimated section and total scores (adaptive routing included). */
export default function ScoreCalc() {
  const [v, setV] = useState({ r1: 20, r2: 18, m1: 15, m2: 14 });
  const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));
  const rw = useMemo(() => rwFromModules(v.r1, v.r2), [v.r1, v.r2]);
  const ma = useMemo(() => mathFromModules(v.m1, v.m2), [v.m1, v.m2]);
  const range = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
  const low = rw.low + ma.low; const high = rw.high + ma.high;
  const notes = [
    rw.route === 'easy' && 'Reading & Writing: with fewer than 18 right in Module 1 you get the easier Module 2, and the section stops near 630.',
    ma.route === 'easy' && 'Math: with fewer than 15 right in Module 1 the section stops near 650.',
    rw.score >= 480 ? 'R&W is at or above the college-readiness benchmark (480).' : 'R&W benchmark for college readiness: 480.',
    ma.score >= 530 ? 'Math is at or above the college-readiness benchmark (530).' : 'Math benchmark for college readiness: 530.',
  ].filter(Boolean);
  return (
    <section className="pub-wrap calc" id="calculator">
      <div className="calc-head">
        <small className="eyebrow">HOW THE DIGITAL SAT IS SCORED</small>
        <h2 className="pub-h2" style={{ textAlign: 'left', margin: '6px 0 8px' }}>SAT score calculator</h2>
        <p className="muted">Move the sliders to the number of questions you got (or want to get) right in each module. Module 1 decides whether Module 2 is harder or easier, and harder questions count more.</p>
      </div>
      <div className="calc-grid">
        <div className="calc-in">
          <div className="row between"><h3>Reading &amp; Writing</h3><Route hard={rw.route === 'hard'} /></div>
          <Slider label="Module 1" value={v.r1} max={27} onChange={set('r1')} />
          <Slider label="Module 2" value={v.r2} max={27} onChange={set('r2')} />
          <div className="row between" style={{ marginTop: 10 }}><h3>Math</h3><Route hard={ma.route === 'hard'} /></div>
          <Slider label="Module 1" value={v.m1} max={22} onChange={set('m1')} />
          <Slider label="Module 2" value={v.m2} max={22} onChange={set('m2')} />
        </div>
        <div className="calc-out">
          <small>Estimated total</small>
          <b className="calc-total">{range(low, high)}</b>
          <span className="calc-of">out of 1600</span>
          <div className="calc-secs">
            <div><small>Reading &amp; Writing</small><b>{range(rw.low, rw.high)}</b></div>
            <div><small>Math</small><b>{range(ma.low, ma.high)}</b></div>
          </div>
          <ul className="calc-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <p className="calc-fine">An estimate, not an official score: College Board's exact tables are not public and differ a little on every test. Take a full practice test for a real number.</p>
          <Link className="btn sun lg block" to="/practice">Take a free practice test <IconArrow /></Link>
        </div>
      </div>
    </section>
  );
}
