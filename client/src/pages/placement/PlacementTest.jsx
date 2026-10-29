import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Confirm, ErrorBox, Spinner } from '../../components/ui.jsx';
import { IconArrow, IconX, Logo } from '../../components/icons.jsx';
import { withBlanks } from '../../lib.js';

const L = ['A', 'B', 'C', 'D', 'E'];
const pad = (n) => String(n).padStart(2, '0');
const clock = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
const blank = (i) => <span key={i} className="blank" aria-label="blank" />;
const answered = (v) => v !== undefined && v !== null && String(v).trim() !== '';

/** Placement test runner: Part 1 Grammar (mc + written) → Part 2 SAT, each with its own timer. */
export default function PlacementTest() {
  const nav = useNavigate();
  const [state, setState] = useState({ data: null, err: null });
  useEffect(() => {
    api.post('/placement/start').then((data) => setState({ data, err: null })).catch((err) => setState({ data: null, err }));
  }, []);
  if (state.err) return <div style={{ padding: 40, maxWidth: 520, margin: '0 auto' }}><ErrorBox error={state.err} /><button className="btn ghost" style={{ marginTop: 16 }} onClick={() => nav('/')}>Back</button></div>;
  if (!state.data) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spinner label="Preparing your test…" /></div>;
  return <Runner test={state.data.test} initial={state.data.attempt} />;
}

function Runner({ test, initial }) {
  const nav = useNavigate();
  const toast = useToast();
  const { refresh } = useAuth();
  const [att, setAtt] = useState(initial);
  const [answers, setAnswers] = useState(() => {
    try { return { ...JSON.parse(localStorage.getItem('placement:' + initial.id) || '{}'), ...initial.answers }; } catch { return initial.answers || {}; }
  });
  const [cur, setCur] = useState(initial.current || 0);
  const [left, setLeft] = useState(initial.remaining);
  const [phase, setPhase] = useState('questions'); // questions | between
  const [confirm, setConfirm] = useState(false);
  const [exit, setExit] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const deadline = useRef(initial.remaining != null ? Date.now() + initial.remaining * 1000 : null);

  const secIndex = test.sections.findIndex((s) => s.id === att.section);
  const section = test.sections[secIndex];
  const nextSection = test.sections[secIndex + 1];
  const items = section.items;
  const it = items[Math.min(cur, items.length - 1)];
  const done = useMemo(() => items.filter((x) => answered(answers[x.id])).length, [items, answers]);

  // autosave (debounced) + local backup
  const save = useCallback(() => {
    dirty.current = false;
    return api.put(`/placement/${att.id}/progress`, { answers, current: cur }).catch(() => { dirty.current = true; });
  }, [att.id, answers, cur]);
  useEffect(() => {
    try { localStorage.setItem('placement:' + att.id, JSON.stringify(answers)); } catch { /* ignore */ }
    if (!dirty.current) return;
    const t = setTimeout(save, 600);
    return () => clearTimeout(t);
  }, [answers, cur, att.id, save]);

  const advance = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.post(`/placement/${att.id}/next`, { answers });
      if (r.done) {
        try { localStorage.removeItem('placement:' + att.id); } catch { /* ignore */ }
        await refresh().catch(() => {});
        nav(`/placement/result/${r.id}`, { replace: true });
        return;
      }
      setAtt(r.attempt);
      setCur(0);
      deadline.current = r.attempt.remaining != null ? Date.now() + r.attempt.remaining * 1000 : null;
      setLeft(r.attempt.remaining);
      setPhase('questions');
      window.scrollTo({ top: 0 });
    } catch (e) { toast(e.message, 'bad'); }
    finally { setBusy(false); }
  }, [att.id, answers, nav, refresh, toast]);

  const endPart = useCallback(async () => {
    setConfirm(false);
    if (nextSection) { await save(); setPhase('between'); }
    else advance();
  }, [nextSection, save, advance]);

  // timer for the running part
  const endRef = useRef(endPart);
  endRef.current = endPart;
  useEffect(() => {
    if (deadline.current == null || phase !== 'questions') return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) { clearInterval(t); toast(`Time is up for ${section.title.split('·')[0].trim()}`); endRef.current(); }
    }, 500);
    return () => clearInterval(t);
  }, [att.section, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (v) => { dirty.current = true; setAnswers((a) => ({ ...a, [it.id]: v })); };
  const go = (i) => { if (i >= 0 && i < items.length) { dirty.current = true; setCur(i); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
  const last = cur === items.length - 1;

  useEffect(() => {
    const f = (e) => {
      if (phase !== 'questions' || confirm || exit || e.metaKey || e.ctrlKey) return;
      const typing = e.target.closest('input, textarea');
      if (!typing && it.format === 'mc') {
        const i = L.indexOf(e.key.toUpperCase());
        if (i >= 0 && i < it.options.length) { set(i); return; }
      }
      if (e.key === 'Enter') { e.preventDefault(); last ? setConfirm(true) : go(cur + 1); }
      if (!typing && e.key === 'ArrowRight') go(cur + 1);
      if (!typing && e.key === 'ArrowLeft') go(cur - 1);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  if (phase === 'between') {
    return (
      <div className="pr">
        <header className="pr-top"><Logo size={22} /></header>
        <main className="pr-card pt-between">
          <span className="chip good">Part {secIndex + 1} complete</span>
          <h1>{nextSection.title}</h1>
          <p className="pt-desc">{nextSection.description}</p>
          <div className="facts dark">
            <span>{nextSection.count} questions</span>
            {nextSection.time_limit_minutes > 0 && <span>{nextSection.time_limit_minutes} minutes</span>}
          </div>
          <p className="muted" style={{ fontSize: '.9rem' }}>The timer starts when you press the button. Take a short breath first.</p>
          <button className="btn primary lg block" disabled={busy} onClick={advance}>{busy ? 'Starting…' : `Start Part ${secIndex + 2}`} <IconArrow /></button>
        </main>
      </div>
    );
  }

  return (
    <div className="pr">
      <header className="pr-top">
        <Logo size={22} />
        <div className="row" style={{ gap: 8 }}>
          {left != null && <span className={`timer-chip ${left < 60 ? 'low' : ''}`} aria-label="Time left in this part">{clock(left)}</span>}
          <button className="icon-btn" onClick={() => setExit(true)} aria-label="Save and leave"><IconX /></button>
        </div>
      </header>

      <main className="pr-card" key={it.id}>
        <div className="pr-meta">
          <span>{section.title}</span>
          <span>Question {cur + 1} of {items.length}</span>
        </div>
        <div className="progress" aria-label={`${done} of ${items.length} answered`}><span style={{ width: `${(done / items.length) * 100}%` }} /></div>

        {it.notes?.length > 0 && (
          <div className="pt-notes"><b>Notes</b><ul>{it.notes.map((n) => <li key={n}>{n}</li>)}</ul></div>
        )}
        {it.table && <DataTable table={it.table} />}
        {it.passage && <div className="pr-passage">{withBlanks(it.passage, blank)}</div>}
        <p className={it.section === 'grammar' || !it.passage ? 'pt-prompt' : 'pr-prompt'}>{withBlanks(it.prompt, blank)}</p>

        {it.format === 'mc' ? (
          <div className="pr-opts" role="radiogroup" aria-label="Answer choices">
            {it.options.map((o, i) => (
              <button key={i} type="button" role="radio" aria-checked={answers[it.id] === i} className={`pr-opt ${answers[it.id] === i ? 'sel' : ''}`} onClick={() => set(i)}>
                <span className="L">{L[i]})</span><span className="t">{o}</span>
              </button>
            ))}
          </div>
        ) : (
          <label className="field">
            <span>Your answer</span>
            <input className="pt-input" autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} value={answers[it.id] ?? ''} onChange={(e) => set(e.target.value)} placeholder="Type the missing words" />
            <small className="muted">Spelling counts. Capital letters and extra spaces don’t.</small>
          </label>
        )}

        <div className="row between">
          <button className="btn ghost lg" disabled={cur === 0} onClick={() => go(cur - 1)}>Back</button>
          {!last
            ? <button className="btn primary lg" onClick={() => go(cur + 1)}>Next <IconArrow /></button>
            : <button className="btn sun lg" onClick={() => setConfirm(true)}>{nextSection ? `Finish Part ${secIndex + 1}` : 'Finish test'}</button>}
        </div>
      </main>

      <nav className="pr-dots" aria-label="Questions">
        {items.map((x, i) => (
          <button key={x.id} className={`${answered(answers[x.id]) ? 'ans' : ''} ${i === cur ? 'cur' : ''}`} onClick={() => go(i)} aria-label={`Question ${i + 1}${answered(answers[x.id]) ? ' (answered)' : ''}`}>{i + 1}</button>
        ))}
      </nav>

      {confirm && (
        <Confirm danger={false} title={nextSection ? `Finish ${section.title.split('·')[0].trim()}?` : 'Finish the test?'} confirmLabel={nextSection ? 'Yes, go on' : 'Yes, see my result'}
          onClose={() => setConfirm(false)} onConfirm={endPart}
          text={items.length - done ? `${items.length - done} question${items.length - done === 1 ? ' is' : 's are'} unanswered. You can’t come back to this part later.` : 'All questions are answered. You can’t come back to this part later.'} />
      )}
      {exit && (
        <Confirm danger={false} title="Leave the test?" confirmLabel="Save and leave" onClose={() => setExit(false)}
          onConfirm={async () => { await save(); nav('/placement'); }}
          text="Your answers are saved. The timer keeps running while you are away." />
      )}
    </div>
  );
}

export function DataTable({ table }) {
  return (
    <figure className="pt-table">
      {table.title && <figcaption>{table.title}</figcaption>}
      <table>
        <thead><tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}
