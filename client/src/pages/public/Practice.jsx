import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Confetti, Ring, Spinner } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconClock, IconFlag, IconRefresh, IconX, Logo } from '../../components/icons.jsx';
import { Passage } from '../../components/Passage.jsx';
import { rich } from '../../components/Rich.jsx';
import { newSeed } from './site.jsx';

const L = ['A', 'B', 'C', 'D'];
const LEVELS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
const LEVEL = Object.fromEntries(LEVELS);

/**
 * Free practice tests (no sign-in): every visit gets a new random 40% slice of the Question Bank,
 * the student filters by domain / skill / level and gets a 27-question timed test with a score estimate.
 */
export default function Practice() {
  const [params] = useSearchParams();
  const [seed, setSeed] = useState(newSeed);
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState('');
  const [skills, setSkills] = useState([]);
  const [levels, setLevels] = useState(() => (params.get('levels') || '').split(',').filter((l) => LEVEL[l]));
  const [test, setTest] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setMeta(null);
    api.get(`/public/practice?seed=${seed}`).then((m) => {
      setMeta(m);
      const d = params.get('domain');
      if (d) setSkills(m.domains.find((x) => x.domain === d)?.skills.map((s) => s.id) || []);
    }).catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);
  useEffect(() => { setLevels((params.get('levels') || '').split(',').filter((l) => LEVEL[l])); }, [params]);

  const count = useMemo(() => {
    if (!meta) return 0;
    let n = 0;
    for (const d of meta.domains) for (const s of d.skills) {
      if (skills.length && !skills.includes(s.id)) continue;
      n += (levels.length ? levels : ['easy', 'medium', 'hard']).reduce((a, l) => a + s.per[l], 0);
    }
    return n;
  }, [meta, skills, levels]);

  const start = async () => {
    setBusy(true);
    try {
      const t = await api.post('/public/practice/start', { seed, skills, levels });
      setResult(null); setTest(t);
      setMeta((m) => (m ? { ...m, quota: t.quota } : m));
    } catch (e) {
      toast(e.message, 'bad');
      if (e.status === 429) api.get(`/public/practice?seed=${seed}`).then(setMeta).catch(() => {});
    } finally { setBusy(false); }
  };
  const again = () => { setTest(null); setResult(null); setSeed(newSeed()); window.scrollTo({ top: 0 }); };

  if (test && !result) return <Runner test={test} onDone={setResult} onQuit={() => setTest(null)} />;
  if (result) return <Result r={result} onAgain={again} />;

  const q = meta?.quota;
  const cap = meta ? Math.min(meta.test_size, q && !q.unlimited ? q.left : Infinity) : 0;
  const size = Math.min(count, cap);
  const blocked = q && !q.unlimited && q.left < 3;
  const toggleSkill = (id) => setSkills((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleDomain = (d) => {
    const ids = d.skills.map((s) => s.id);
    const all = ids.every((id) => skills.includes(id));
    setSkills((s) => (all ? s.filter((x) => !ids.includes(x)) : [...new Set([...s, ...ids])]));
  };

  return (
    <div className="pt-hub">
      <section className="pt-hub-head">
        <div>
          <small className="eyebrow">FREE PRACTICE TEST · NO SIGN-UP</small>
          <h1>Reading &amp; Writing practice test</h1>
          <p className="muted">{meta ? <>{meta.test_size} questions · {meta.minutes} minutes · score estimate. Today you see <b>{meta.visible}</b> fresh questions ({meta.percent}% of the bank) — come back for a new set.</> : 'Picking today’s questions…'}</p>
        </div>
        <button className="btn ghost" onClick={() => setSeed(newSeed())} title="Show a different set of questions"><IconRefresh width={16} height={16} /> New set</button>
      </section>

      {err && <div className="error-box">{err}</div>}
      {!meta ? <Spinner label="Shuffling the question bank…" /> : (
        <div className="pt-grid">
          <div className="stack">
            <div className="pt-box">
              <div className="row between"><h2>Level</h2><small className="muted">none = mixed, like the real test</small></div>
              <div className="row wrap" style={{ gap: 8 }}>
                {LEVELS.map(([v, l]) => (
                  <button key={v} className={`chip-btn chip lvl-${v} ${levels.includes(v) ? 'on' : ''}`} aria-pressed={levels.includes(v)} onClick={() => setLevels((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v]))}>{l}</button>
                ))}
              </div>
            </div>
            {meta.domains.map((d) => {
              const all = d.skills.every((s) => skills.includes(s.id));
              return (
                <div key={d.domain} className="pt-box">
                  <div className="row between">
                    <h2>{d.domain}</h2>
                    <button className="linkish" onClick={() => toggleDomain(d)}>{all ? 'Clear' : 'Select all'}</button>
                  </div>
                  <div className="pt-skills">
                    {d.skills.map((s) => (
                      <button key={s.id} className={`pt-skill ${skills.includes(s.id) ? 'on' : ''}`} aria-pressed={skills.includes(s.id)} onClick={() => toggleSkill(s.id)} disabled={!s.n}>
                        <span className="tick">{skills.includes(s.id) && <IconCheck width={14} height={14} />}</span>
                        <b>{s.name}</b><small>{s.n} today</small>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <aside className="pt-side">
            {q && <Quota q={q} signedIn={meta.signed_in} />}
            {blocked ? <LimitCard q={q} signedIn={meta.signed_in} /> : (
            <div className="pt-start">
              <Ring value={Math.min(100, Math.round((size / meta.test_size) * 100))} size={130} label={`${size}`} sub="questions" />
              <p>{skills.length ? `${skills.length} skill${skills.length > 1 ? 's' : ''}` : 'All 10 skills'} · {levels.length ? levels.map((l) => LEVEL[l]).join(', ') : 'mixed levels'}</p>
              {count < 3 && <p className="bad-text">Not enough questions in today’s set for these filters — add skills or press “New set”.</p>}
              <button className="btn sun lg block" disabled={busy || size < 3} onClick={start}>{busy ? 'Preparing…' : 'Start the test'} <IconArrow /></button>
              <small className="muted">Timer: {Math.max(5, Math.round((meta.minutes * size) / meta.test_size))} min · you can mark questions for review</small>
              {cap < meta.test_size && <small className="muted">A shorter test — {q.left} free questions left today.</small>}
            </div>)}
            {meta.recent?.length > 0 && (
              <div className="pt-box">
                <h2>Your last tests</h2>
                {meta.recent.map((r) => <div key={r.id} className="row between"><span className="muted">{new Date(r.finished_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span><b>{r.score}/{r.total}</b></div>)}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

const untilText = (iso) => {
  if (!iso) return '24 hours';
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return 'a moment';
  const mins = Math.ceil(ms / 60e3);
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
};

/** Free daily allowance: guests and free accounts — N questions per 24 hours; subscribers are unlimited. */
function Quota({ q, signedIn }) {
  if (q.unlimited) return <div className="pt-quota pro">Unlimited practice</div>;
  const pct = Math.min(100, Math.round((q.used / Math.max(1, q.limit)) * 100));
  return (
    <div className="pt-quota">
      <div className="row between"><b>Free today</b><span>{q.left} / {q.limit} questions left</span></div>
      <i><em style={{ width: `${100 - pct}%` }} /></i>
      <small className="muted">Resets {q.used ? `in ${untilText(q.resets_at)}` : '24 hours after your first test'}. {signedIn ? <Link to="/subscribe">Unlimited with a subscription →</Link> : <Link to="/signup">Save your progress →</Link>}</small>
    </div>
  );
}
function LimitCard({ q, signedIn }) {
  return (
    <div className="pt-start">
      <IconClock width={34} height={34} />
      <h2 style={{ color: '#fff' }}>Today’s free questions are used</h2>
      <p>You answered {Math.min(q.used, q.limit)} questions in the last 24 hours — great work! New free questions open in <b>{untilText(q.resets_at)}</b>.</p>
      <Link className="btn sun lg block" to={signedIn ? '/subscribe' : '/signup'}>{signedIn ? 'Get unlimited practice' : 'Start free trial'}</Link>
      <small>{signedIn ? 'Subscribers practise without limits.' : 'Create an account to save your results; subscribers practise without limits.'}</small>
    </div>
  );
}

/** Exam-style runner: one question at a time, navigator, mark for review, countdown. Answers are checked at the end. */
function Runner({ test, onDone, onQuit }) {
  const qs = test.questions;
  const [cur, setCur] = useState(0);
  const [ans, setAns] = useState({});
  const [mark, setMark] = useState({});
  const [left, setLeft] = useState(test.minutes * 60);
  const [grid, setGrid] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);
  const toast = useToast();
  const q = qs[cur];
  const answered = Object.keys(ans).length;

  const submit = async () => {
    if (sent.current) return;
    sent.current = true; setBusy(true);
    try { onDone(await api.post(`/public/practice/${test.id}/submit`, { answers: ans })); }
    catch (e) { sent.current = false; toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (left <= 0) submit(); }); // time is up → finish
  useEffect(() => {
    const f = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea/i.test(e.target.tagName)) return;
      const i = L.indexOf(e.key.toUpperCase());
      if (i >= 0) setAns((a) => ({ ...a, [q.id]: i }));
      else if (e.key === 'ArrowRight' && cur < qs.length - 1) setCur(cur + 1);
      else if (e.key === 'ArrowLeft' && cur > 0) setCur(cur - 1);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });
  useEffect(() => {
    const f = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, []);

  const mm = String(Math.max(0, Math.floor(left / 60))).padStart(2, '0');
  const ss = String(Math.max(0, left % 60)).padStart(2, '0');
  return (
    <div className="pt-run">
      <header className="pt-bar">
        <div className="row" style={{ gap: 12 }}><Logo size={20} /><span className="muted hide-sm">Reading and Writing</span></div>
        <span className={`pt-timer ${left < 300 ? 'low' : ''}`}><IconClock width={16} height={16} /> {mm}:{ss}</span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sun sm" onClick={() => setConfirm(true)} disabled={busy}>Finish</button>
          <button className="icon-btn" onClick={onQuit} aria-label="Leave the test" title="Leave"><IconX /></button>
        </div>
      </header>

      <main className="pt-body" key={q.id}>
        <section className="pt-left">
          {(q.passage || q.table) ? <Passage text={q.passage} table={q.table} /> : <p className="muted">No passage for this question.</p>}
        </section>
        <section className="pt-right">
          <div className="pt-qhead">
            <span className="pt-num">{cur + 1}</span>
            <button className={`pt-mark ${mark[q.id] ? 'on' : ''}`} onClick={() => setMark((m) => ({ ...m, [q.id]: !m[q.id] }))} aria-pressed={!!mark[q.id]}><IconFlag width={15} height={15} /> {mark[q.id] ? 'Marked for review' : 'Mark for review'}</button>
            <span className="chip hide-sm">{q.skill}</span>
          </div>
          <p className="pt-prompt">{rich(q.prompt)}</p>
          <div className="pr-opts" role="radiogroup" aria-label="Answer choices">
            {q.options.map((o, i) => (
              <button key={i} type="button" role="radio" aria-checked={ans[q.id] === i} className={`pr-opt ${ans[q.id] === i ? 'sel' : ''}`} onClick={() => setAns((a) => ({ ...a, [q.id]: i }))}>
                <span className="pt-L">{L[i]}</span><span className="t">{rich(o)}</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      <footer className="pt-foot">
        <button className="btn ghost" disabled={cur === 0} onClick={() => setCur(cur - 1)}>Back</button>
        <button className="pt-qbtn" onClick={() => setGrid(!grid)} aria-expanded={grid}>Question {cur + 1} of {qs.length} ▴</button>
        {cur < qs.length - 1
          ? <button className="btn primary" onClick={() => setCur(cur + 1)}>Next <IconArrow /></button>
          : <button className="btn sun" onClick={() => setConfirm(true)}>Finish</button>}
      </footer>

      {grid && (
        <div className="pt-grid-pop" role="dialog" aria-label="All questions">
          <div className="row between"><b>{answered} of {qs.length} answered</b><button className="icon-btn" onClick={() => setGrid(false)} aria-label="Close"><IconX /></button></div>
          <div className="pt-nums">
            {qs.map((x, i) => <button key={x.id} className={`${ans[x.id] != null ? 'done' : ''} ${mark[x.id] ? 'marked' : ''} ${i === cur ? 'cur' : ''}`} onClick={() => { setCur(i); setGrid(false); }}>{i + 1}</button>)}
          </div>
          <small className="pt-legend"><i className="a" /> answered <i className="m" /> marked <i className="n" /> not answered</small>
        </div>
      )}

      {confirm && (
        <div className="pt-modal" role="dialog" aria-modal="true">
          <div className="pt-modal-card">
            <h2>Finish the test?</h2>
            <p className="muted">{answered < qs.length ? `${qs.length - answered} question(s) are not answered — they will count as wrong.` : 'All questions are answered.'}{Object.values(mark).some(Boolean) ? ' Some are marked for review.' : ''}</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setConfirm(false)}>Keep working</button>
              <button className="btn sun" disabled={busy} onClick={submit}>{busy ? 'Scoring…' : 'Finish and see score'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Result({ r, onAgain }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(() => r.review.findIndex((x) => !x.correct));
  const good = r.percent >= 80;
  return (
    <div className="pt-hub">
      {good && <Confetti />}
      <section className="hero-card pt-res">
        <div>
          <small className="eyebrow">PRACTICE TEST · RESULT</small>
          <h1>{good ? 'Excellent — that is a 700+ pace!' : r.percent >= 55 ? 'Good base. Now fix the misses.' : 'Every mistake here is a lesson.'}</h1>
          <p>You answered <b>{r.score} of {r.total}</b> correctly ({r.percent}%). Estimated Reading &amp; Writing score: <b>{r.estimate}</b>.</p>
          <div className="row wrap" style={{ marginTop: 18 }}>
            <button className="btn primary lg" onClick={onAgain}>New test — new questions <IconArrow /></button>
            {!user && <Link className="btn on-dark lg" to="/signup">Save my progress (free)</Link>}
          </div>
        </div>
        <div className="pt-score"><b>{r.estimate}</b><span>R&amp;W estimate</span><em>200 ····· 800</em></div>
      </section>

      {!user && (
        <div className="pt-nudge">
          <b>Want to know exactly what to study next?</b>
          <span>Create a free account: your results are saved, you get a readiness check and a roadmap to 800.</span>
          <Link className="btn sun" to="/signup">Start free trial</Link>
        </div>
      )}

      <div className="pt-box">
        <h2>By skill</h2>
        <div className="pt-skillbars">
          {r.skills.map((s) => {
            const p = Math.round((s.ok / s.n) * 100);
            return <div key={s.skill}><span>{s.skill}</span><i><em className={p >= 80 ? 'good' : p >= 50 ? 'warn' : 'bad'} style={{ width: `${Math.max(4, p)}%` }} /></i><b>{s.ok}/{s.n}</b></div>;
          })}
        </div>
      </div>

      <div className="pt-box">
        <h2>Review</h2>
        <div className="pt-nums review">
          {r.review.map((x, i) => <button key={x.id} className={`${x.correct ? 'right' : x.choice == null ? 'skip' : 'wrong'} ${open === i ? 'cur' : ''}`} onClick={() => setOpen(i)}>{i + 1}</button>)}
        </div>
        {open >= 0 && r.review[open] && <ReviewItem x={r.review[open]} n={open + 1} />}
      </div>
    </div>
  );
}

function ReviewItem({ x, n }) {
  return (
    <div className="pt-review">
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="q-num">{n}</span><span className="chip domain">{x.skill}</span><span className={`chip lvl-${x.difficulty}`}>{LEVEL[x.difficulty]}</span>
        <span className={`chip ${x.correct ? 'good' : x.choice == null ? 'warn' : 'bad'}`}>{x.correct ? 'Correct' : x.choice == null ? 'Not answered' : 'Wrong'}</span>
      </div>
      {(x.passage || x.table) && <Passage text={x.passage} table={x.table} />}
      <p style={{ fontWeight: 600 }}>{rich(x.prompt)}</p>
      <ul className="qb-opts-review">
        {x.options.map((o, k) => <li key={k} className={k === x.answer ? 'ok' : k === x.choice ? 'bad' : ''}><b>{L[k]})</b> {rich(o)}{k === x.answer ? ' · correct' : k === x.choice ? ' · your answer' : ''}</li>)}
      </ul>
      {x.explanation && <p className="muted">{rich(x.explanation)}</p>}
      {x.tip && <div className="tip"><b>Ustoz tip:</b> {rich(x.tip)}</div>}
    </div>
  );
}
