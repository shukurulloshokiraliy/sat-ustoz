import { useEffect, useRef, useState } from 'react';
import { useAuth, useTheme } from '../context.jsx';
import { Modal } from './ui.jsx';
import { IconBookmark, IconBookmarkFill, IconChevron, IconCheck, IconEye, IconEyeOff, IconFlag, IconMoon, IconSun, IconX } from './icons.jsx';

/*
 * Digital-SAT style test player (the layout students see on test day):
 *  header  — section title + directions · timer with Hide · highlight, theme, exit
 *  body    — passage on the left, question on the right, a draggable divider between
 *  footer  — student name · "Question N of M" navigator · Back / Next
 * Used by quizzes, practice sets, the Question Bank, the placement test and level checks.
 */

const pad = (n) => String(n).padStart(2, '0');
export const fmtClock = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`);

export function BBShell({ title, directions, seconds, countdown = true, tools, onExit, exitLabel = 'Exit', footer, children, highlight, onHighlight }) {
  const { theme, toggle } = useTheme();
  const [hide, setHide] = useState(false);
  const [dir, setDir] = useState(false);
  return (
    <div className="bb">
      <header className="bb-head">
        <div className="bb-title">
          <b>{title}</b>
          {directions && <button className="bb-dir" onClick={() => setDir(true)}>Directions <IconChevron width={14} height={14} /></button>}
        </div>
        <div className="bb-timer">
          {seconds != null && (
            <>
              <span className={`bb-clock ${countdown && seconds < 300 ? 'low' : ''} ${hide ? 'hid' : ''}`} aria-live="off">{hide ? <IconClockIcon /> : fmtClock(seconds)}</span>
              <button className="bb-hide" onClick={() => setHide((h) => !h)}>{hide ? 'Show' : 'Hide'}</button>
            </>
          )}
        </div>
        <div className="bb-tools">
          {onHighlight && (
            <button className={`bb-tool ${highlight ? 'on' : ''}`} onClick={onHighlight} aria-pressed={!!highlight} title="Select text in the passage to highlight it">
              <HighlighterIcon /><span>Highlight</span>
            </button>
          )}
          {tools}
          <button className="bb-tool" onClick={toggle} aria-label="Switch light or dark">{theme === 'dark' ? <IconSun width={20} height={20} /> : <IconMoon width={20} height={20} />}<span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
          {onExit && <button className="bb-tool" onClick={onExit}><IconX width={20} height={20} /><span>{exitLabel}</span></button>}
        </div>
      </header>
      <div className="bb-rule" aria-hidden="true" />
      <main className="bb-main">{children}</main>
      {footer}
      {dir && (
        <Modal title="Directions" onClose={() => setDir(false)} footer={<button className="btn primary" onClick={() => setDir(false)}>Close</button>}>
          <div className="bb-directions">{directions}</div>
        </Modal>
      )}
    </div>
  );
}

const IconClockIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Time hidden"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" strokeLinecap="round" /></svg>;
const HighlighterIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="m14 4 6 6-8.5 8.5H6v-5.5z" /><path d="M4 21h8" strokeLinecap="round" /></svg>;

/** Passage | question with a draggable divider. With no passage the question sits in the centre. */
export function BBSplit({ left, right }) {
  const [w, setW] = useState(() => { try { return Number(localStorage.getItem('bb-split')) || 50; } catch { return 50; } });
  const box = useRef(null);
  const drag = (e) => {
    e.preventDefault();
    const rect = box.current.getBoundingClientRect();
    const move = (ev) => {
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      setW(Math.min(72, Math.max(28, (x / rect.width) * 100)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setW((v) => { try { localStorage.setItem('bb-split', String(Math.round(v))); } catch { /* ignore */ } return v; });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  if (!left) return <div className="bb-single"><div className="bb-pane bb-right">{right}</div></div>;
  return (
    <div className="bb-split" ref={box} style={{ '--bb-left': `${w}%` }}>
      <section className="bb-pane bb-left" aria-label="Passage">{left}</section>
      <div className="bb-divider" onPointerDown={drag} role="separator" aria-orientation="vertical" aria-label="Drag to resize"><span /></div>
      <section className="bb-pane bb-right" aria-label="Question">{right}</section>
    </div>
  );
}

/**
 * Highlights in the passage: in highlight mode, selecting text wraps it in a yellow mark;
 * clicking a mark removes it. Highlights last while the question is on screen (mount it with key={question id}).
 */
export function Highlightable({ on, children }) {
  const ref = useRef(null);
  const keep = () => {};
  const onUp = () => {
    if (!on) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !ref.current?.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    try {
      const mark = document.createElement('mark');
      mark.className = 'bb-hl';
      range.surroundContents(mark);
    } catch {
      // selection crosses paragraphs: highlight each text node inside it
      const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) if (range.intersectsNode(walker.currentNode) && walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
      nodes.forEach((n) => {
        const r = document.createRange();
        r.selectNodeContents(n);
        if (n === range.startContainer) r.setStart(n, range.startOffset);
        if (n === range.endContainer) r.setEnd(n, range.endOffset);
        const m = document.createElement('mark'); m.className = 'bb-hl';
        try { r.surroundContents(m); } catch { /* skip odd nodes */ }
      });
    }
    sel.removeAllRanges();
    keep();
  };
  const onClick = (e) => {
    const m = e.target.closest('mark.bb-hl');
    if (!m) return;
    m.replaceWith(...m.childNodes);
    keep();
  };
  return <div ref={ref} className={`bb-passage ${on ? 'hl-on' : ''}`} onMouseUp={onUp} onTouchEnd={onUp} onClick={onClick}>{children}</div>;
}

/** The dark question bar: number · Mark for Review · answer-elimination switch. */
export function BBQuestionBar({ n, marked, onMark, elim, onElim, extra }) {
  return (
    <div className="bb-qbar">
      <span className="bb-qn">{n}</span>
      {onMark && (
        <button className={`bb-mark ${marked ? 'on' : ''}`} onClick={onMark} aria-pressed={!!marked}>
          {marked ? <IconBookmarkFill width={18} height={18} /> : <IconBookmark width={18} height={18} />} Mark for Review
        </button>
      )}
      <span className="grow" />
      {extra}
      {onElim && (
        <button className={`bb-abc ${elim ? 'on' : ''}`} onClick={onElim} aria-pressed={!!elim} title="Cross out answer choices">
          <span>ABC</span>
        </button>
      )}
    </div>
  );
}

/**
 * Answer choices. `reveal` = { correct } turns on right/wrong colours (practice mode).
 * In elimination mode each choice gets a cross-out button; crossed-out choices can be undone.
 */
export function BBOptions({ options, choice, eliminated = [], elim, onChoose, onEliminate, reveal, disabled }) {
  return (
    <div className="bb-opts" role="radiogroup" aria-label="Answer choices">
      {options.map((o) => {
        const out = !reveal && eliminated.includes(o.key);
        const mine = choice === o.key;
        const st = reveal ? (o.key === reveal.correct ? 'right' : mine ? 'wrong' : 'dim') : mine ? 'sel' : '';
        return (
          <div key={o.key} className={`bb-opt ${st} ${out ? 'out' : ''}`}>
            <button type="button" role="radio" aria-checked={mine} className="bb-opt-main" disabled={disabled || !!reveal} onClick={() => onChoose(o.key)}>
              <span className="bb-L">{o.key}</span>
              <span className="bb-t">{o.text}</span>
              {reveal && o.key === reveal.correct && <IconCheck className="bb-ok" width={20} height={20} />}
              {reveal && mine && o.key !== reveal.correct && <IconX className="bb-no" width={20} height={20} />}
            </button>
            {elim && !reveal && (
              out
                ? <button type="button" className="bb-undo" onClick={() => onEliminate(o.key)}>Undo</button>
                : <button type="button" className="bb-x" onClick={() => onEliminate(o.key)} aria-label={`Cross out ${o.key}`}><span>{o.key}</span></button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Footer: name · Question N of M (opens the navigator) · Back / Next (or custom buttons). */
export function BBFooter({ cur, total, onOpenNav, children }) {
  const { user } = useAuth();
  return (
    <footer className="bb-foot">
      <div className="bb-who">{user?.name || 'Guest'}</div>
      <button className="bb-navbtn" onClick={onOpenNav}>Question {cur + 1} of {total} <IconChevron width={16} height={16} /></button>
      <div className="bb-btns">{children}</div>
    </footer>
  );
}

/**
 * Question navigator. items: [{ answered, marked, state: 'right'|'wrong' }].
 */
export function BBNavigator({ title, items, cur, onGo, onClose, onReview }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="bb-legend">
        <span><i className="cur" /> Current</span>
        <span><i /> Unanswered</span>
        <span><i className="ans" /> Answered</span>
        <span><IconFlag width={14} height={14} className="flag" /> For Review</span>
      </div>
      <div className="bb-grid">
        {items.map((it, i) => (
          <button key={i} className={`bb-cell ${it.answered ? 'ans' : ''} ${it.state || ''} ${i === cur ? 'cur' : ''}`} onClick={() => onGo(i)} aria-label={`Question ${i + 1}`}>
            {i + 1}{it.marked && <IconFlag className="flag" width={13} height={13} />}
          </button>
        ))}
      </div>
      {onReview && <div className="center" style={{ marginTop: 14 }}><button className="btn ghost" onClick={onReview}>Go to Review Page</button></div>}
    </Modal>
  );
}

/** Review page grid (before submitting a timed test). */
export function BBReview({ title, items, onGo, onBack, onSubmit, submitLabel = 'Submit' }) {
  const answered = items.filter((x) => x.answered).length;
  const marked = items.filter((x) => x.marked).length;
  return (
    <div className="bb-review">
      <h1>Check Your Work</h1>
      <p className="muted">On test day, you won’t be able to move on to the next module until time expires. For these practice questions, you can submit when you’re ready.</p>
      <div className="bb-review-card">
        <div className="row between wrap"><b>{title}</b><span className="muted">{answered} of {items.length} answered{marked ? ` · ${marked} for review` : ''}</span></div>
        <div className="bb-legend">
          <span><i /> Unanswered</span><span><i className="ans" /> Answered</span><span><IconFlag width={14} height={14} className="flag" /> For Review</span>
        </div>
        <div className="bb-grid big">
          {items.map((it, i) => (
            <button key={i} className={`bb-cell ${it.answered ? 'ans' : ''}`} onClick={() => onGo(i)} aria-label={`Question ${i + 1}`}>
              {i + 1}{it.marked && <IconFlag className="flag" width={13} height={13} />}
            </button>
          ))}
        </div>
      </div>
      <div className="row between wrap">
        <button className="btn ghost" onClick={onBack}>Back</button>
        <button className="btn primary lg" onClick={onSubmit}>{submitLabel}</button>
      </div>
    </div>
  );
}

/** Hook: answer-elimination mode + per-question eliminated keys (local only). */
export function useElimination() {
  const [elim, setElim] = useState(false);
  const [out, setOut] = useState({});
  const toggle = (qid, key) => setOut((m) => { const s = new Set(m[qid] || []); s.has(key) ? s.delete(key) : s.add(key); return { ...m, [qid]: [...s] }; });
  return { elim, toggleElim: () => setElim((x) => !x), eliminated: (qid) => out[qid] || [], toggle };
}

/**
 * Practice runner: the Bluebook screen with instant checking.
 * questions: [{ id, passage?, prompt, options: [{ key, text }], meta? }] (passage / prompt / text may be React nodes)
 * reveal(id) → null | { correct, ok, explanation?, tip?, note? } once the answer is checked.
 */
export function BBPracticeRunner({ title, directions, questions, cur, setCur, choice, onChoose, reveal, onCheck, busy, seconds, countdown, onExit, onFinish, finishLabel = 'Finish' }) {
  const [hl, setHl] = useState(false);
  const [nav, setNav] = useState(false);
  const [marked, setMarked] = useState({});
  const el = useElimination();
  const q = questions[cur];
  const mine = choice(q.id);
  const rv = reveal(q.id);
  const last = cur === questions.length - 1;
  const checkedCount = questions.filter((x) => reveal(x.id)).length;
  const go = (i) => { setCur(Math.max(0, Math.min(questions.length - 1, i))); setNav(false); };
  const next = () => (last ? onFinish() : go(cur + 1));

  useEffect(() => {
    const f = (e) => {
      if (e.target.closest('input, textarea, select, [role=dialog]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (!rv && ['A', 'B', 'C', 'D'].includes(k) && q.options.some((o) => o.key === k)) onChoose(q.id, k);
      else if (e.key === 'Enter') { e.preventDefault(); if (rv) next(); else if (mine) onCheck(q); }
      else if (e.key === 'ArrowRight') go(cur + 1);
      else if (e.key === 'ArrowLeft') go(cur - 1);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  const question = (
    <div key={q.id}>
      <BBQuestionBar n={cur + 1} marked={marked[q.id]} onMark={() => setMarked((m) => ({ ...m, [q.id]: !m[q.id] }))} elim={el.elim} onElim={rv ? null : el.toggleElim} />
      {q.meta && <div className="bb-meta">{q.meta}</div>}
      <div className="bb-prompt">{q.prompt}</div>
      <BBOptions options={q.options} choice={mine} eliminated={el.eliminated(q.id)} elim={el.elim}
        onChoose={(k) => onChoose(q.id, k)} onEliminate={(k) => el.toggle(q.id, k)} reveal={rv ? { correct: rv.correct } : null} />
      {rv && (
        <div className={`bb-feedback ${rv.ok ? 'ok' : 'no'}`} role="status">
          <h3>{rv.ok ? 'Correct' : `Not quite. The answer is ${rv.correct}.`}{rv.note ? <span className="muted" style={{ fontWeight: 600 }}> · {rv.note}</span> : null}</h3>
          {rv.explanation && <p>{rv.explanation}</p>}
          {rv.tip && <div className="tip"><b>Ustoz tip:</b> {rv.tip}</div>}
        </div>
      )}
    </div>
  );

  return (
    <BBShell title={title} directions={directions} seconds={seconds} countdown={countdown} onExit={onExit} exitLabel="Exit"
      highlight={hl} onHighlight={q.passage ? () => setHl((x) => !x) : null}
      footer={(
        <BBFooter cur={cur} total={questions.length} onOpenNav={() => setNav(true)}>
          {cur > 0 && <button className="bb-btn ghost" onClick={() => go(cur - 1)}>Back</button>}
          {rv
            ? <button className="bb-btn" onClick={next}>{last ? finishLabel : 'Next'}</button>
            : <button className="bb-btn" disabled={!mine || busy} onClick={() => onCheck(q)}>{busy ? 'Checking…' : 'Check'}</button>}
          {!rv && checkedCount > 0 && last && <button className="bb-btn sun" onClick={onFinish}>{finishLabel}</button>}
        </BBFooter>
      )}>
      <BBSplit left={q.passage ? <Highlightable key={q.id} on={hl}>{q.passage}</Highlightable> : null} right={question} />
      {nav && (
        <BBNavigator title={title} cur={cur} onGo={go} onClose={() => setNav(false)}
          items={questions.map((x) => { const r = reveal(x.id); return { answered: !!choice(x.id), marked: marked[x.id], state: r ? (r.ok ? 'right' : 'wrong') : '' }; })} />
      )}
    </BBShell>
  );
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
/**
 * One exam screen (answers revealed later): passage | question, tools, navigator, Back / Next.
 * options: array of nodes (chosen by index) — or pass `input` for a typed answer.
 * items: [{ answered, marked }] for the navigator.
 */
export function BBExam({ title, directions, seconds, countdown = true, onExit, exitLabel = 'Exit', qid, n, total, passage, prompt, before, options, input, choice, onChoose, marked, onMark, items, onGo, onBack, onNext, nextLabel = 'Next', tools }) {
  const [hl, setHl] = useState(false);
  const [nav, setNav] = useState(false);
  const el = useElimination();
  const opts = options?.map((text, i) => ({ key: LETTERS[i], text }));
  return (
    <BBShell title={title} directions={directions} seconds={seconds} countdown={countdown} onExit={onExit} exitLabel={exitLabel} tools={tools}
      highlight={hl} onHighlight={passage ? () => setHl((x) => !x) : null}
      footer={(
        <BBFooter cur={n - 1} total={total} onOpenNav={() => setNav(true)}>
          {n > 1 && <button className="bb-btn ghost" onClick={onBack}>Back</button>}
          <button className="bb-btn" onClick={onNext}>{nextLabel}</button>
        </BBFooter>
      )}>
      <BBSplit
        left={passage ? <Highlightable key={qid} on={hl}>{passage}</Highlightable> : null}
        right={(
          <div key={qid}>
            <BBQuestionBar n={n} marked={marked} onMark={onMark} elim={el.elim} onElim={opts ? el.toggleElim : null} />
            {before}
            <div className="bb-prompt">{prompt}</div>
            {opts
              ? <BBOptions options={opts} choice={choice == null ? null : LETTERS[choice]} eliminated={el.eliminated(qid)} elim={el.elim}
                onChoose={(k) => onChoose(LETTERS.indexOf(k))} onEliminate={(k) => el.toggle(qid, k)} />
              : input}
          </div>
        )}
      />
      {nav && <BBNavigator title={title} items={items} cur={n - 1} onGo={(i) => { setNav(false); onGo(i); }} onClose={() => setNav(false)} />}
    </BBShell>
  );
}

export { IconEye, IconEyeOff };
