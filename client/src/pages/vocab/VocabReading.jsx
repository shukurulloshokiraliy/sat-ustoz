import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Gate, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconBack, IconCheck, IconFlip, IconLock } from '../../components/icons.jsx';
import { rich } from '../../components/Rich.jsx';

/**
 * Unit Reading (400–500 words using the unit's words) and 15 Words in Context questions.
 * Both open after the student finishes one flashcard session of the unit. The teacher pastes both in a form.
 */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Regex that finds the unit words and their forms (adapt → adapts, adapted, adapting). */
export function wordFinder(list) {
  const stems = list.map((w) => w.word.trim().toLowerCase()).filter(Boolean).map((w) => (w.length > 4 ? w.replace(/(e|y)$/, '') : w));
  if (!stems.length) return null;
  return new RegExp(`\\b(${stems.sort((a, b) => b.length - a.length).map(esc).join('|')})[a-z]*\\b`, 'gi');
}
function marked(text, re) {
  if (!re) return text;
  const out = []; let last = 0; let m; re.lastIndex = 0;
  while ((m = re.exec(text))) { out.push(text.slice(last, m.index), <mark key={m.index} className="vr-word">{m[0]}</mark>); last = m.index + m[0].length; }
  out.push(text.slice(last));
  return out;
}
const countWords = (t) => (String(t || '').match(/[A-Za-z’'-]+/g) || []).length;

export function ReadingTab({ u, teacher, onCards, onQuestions }) {
  const st = useAsync(() => api.get(`/vocab/units/${u.id}/reading`), [u.id]);
  return <Gate state={st}>{(r) => (teacher ? <ReadingEditor u={u} r={r} reload={st.reload} /> : <ReadingView u={u} r={r} onCards={onCards} onQuestions={onQuestions} />)}</Gate>;
}

function Locked({ onCards }) {
  return (
    <Card className="vr-locked">
      <span className="vr-lock"><IconLock /></span>
      <div className="grow"><b>Learn the words first</b><p className="muted">Finish one flashcard session of this unit. Then the reading text and the 15 Words in Context questions open.</p></div>
      <button className="btn primary" onClick={onCards}><IconFlip width={18} height={18} /> Start flashcards</button>
    </Card>
  );
}

function ReadingView({ u, r, onCards, onQuestions }) {
  const re = useMemo(() => wordFinder(u.words), [u.words]);
  useEffect(() => { if (r.unlocked && r.has_text) api.post(`/vocab/units/${u.id}/read`).catch(() => {}); }, [u.id, r.unlocked, r.has_text]);
  if (!r.unlocked) return <Locked onCards={onCards} />;
  if (!r.has_text) return <Card className="vr-locked"><div className="grow"><b>The reading for this unit is coming soon</b><p className="muted">Your teacher is adding it. You can already review the words with flashcards.</p></div></Card>;
  return (
    <article className="vr">
      <header className="vr-head">
        <small className="eyebrow-ink">READING · {r.word_count} WORDS</small>
        <h2>{r.title || u.title}</h2>
        <p className="muted">The words you just learned are <mark className="vr-word">highlighted</mark>. Read for meaning: how does each word fit its sentence?</p>
      </header>
      <div className="vr-body">{r.body.split(/\n\s*\n/).map((p, i) => <p key={i}>{marked(p.replace(/\n/g, ' '), re)}</p>)}</div>
      {r.wic.count > 0 && (
        <div className="vr-next">
          <div className="grow"><b>Next: {r.wic.count} Words in Context questions</b><small className="muted">{r.wic.last ? `Last try ${r.wic.last.score}/${r.wic.last.total} · best ${r.wic.best}%` : 'Short SAT-style texts that use this unit\'s words.'}</small></div>
          <button className="btn primary" onClick={onQuestions}>Start questions <IconArrow width={18} height={18} /></button>
        </div>
      )}
    </article>
  );
}

const SAMPLE = `1. Marine biologists once assumed that octopuses were solitary animals, but recent footage of dozens of them sharing dens has led researchers to ______ that view.
Which choice completes the text with the most logical and precise word or phrase?
A) reconsider
B) celebrate
C) imitate
D) overlook
Answer: A
Explanation: The footage contradicts the old view, so researchers rethink it.

2. …`;

function ReadingEditor({ u, r, reload }) {
  const toast = useToast();
  const [f, setF] = useState({ title: r.title, body: r.body || '', questions_raw: r.questions_raw || '' });
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const dirty = f.title !== r.title || f.body !== (r.body || '') || f.questions_raw !== (r.questions_raw || '');
  const used = useMemo(() => {
    const low = f.body.toLowerCase();
    return u.words.map((w) => { const re = wordFinder([w]); return { word: w.word, ok: !!re && re.test(low) }; });
  }, [f.body, u.words]);
  const n = countWords(f.body);
  const runCheck = async () => {
    try { const c = await api.post(`/vocab/units/${u.id}/reading/check`, { questions_raw: f.questions_raw }); setCheck(c); } catch (e) { toast(e.message, 'bad'); }
  };
  useEffect(() => { if (!f.questions_raw.trim()) { setCheck(null); return undefined; } const t = setTimeout(runCheck, 600); return () => clearTimeout(t); }, [f.questions_raw]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    try { const x = await api.put(`/vocab/units/${u.id}/reading`, f); toast(`Saved: ${x.words} words and ${x.questions} questions. Students see them now.`); reload(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <div className="vr-edit">
      <Card className="stack">
        <div className="row between wrap"><h2 style={{ margin: 0 }}>Reading text</h2>
          <span className={`chip ${n >= 400 && n <= 500 ? 'good' : n ? 'warn' : ''}`}>{n} words{n && (n < 400 || n > 500) ? ' · aim for 400–500' : ''}</span></div>
        <label className="field"><span>Title (optional)</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} placeholder={u.title} /></label>
        <label className="field"><span>Text · leave an empty line between paragraphs</span>
          <textarea className="vr-ta" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Paste the 400–500 word text that uses this unit's words…" /></label>
        <div className="vr-used">
          <small className="muted">Unit words in the text: <b>{used.filter((x) => x.ok).length}/{used.length}</b></small>
          <div className="vr-chips">{used.map((x) => <span key={x.word} className={`chip ${x.ok ? 'good' : ''}`}>{x.ok && <IconCheck width={12} height={12} />}{x.word}</span>)}</div>
        </div>
      </Card>

      <Card className="stack">
        <div className="row between wrap"><h2 style={{ margin: 0 }}>Words in Context questions</h2>
          {check && <span className={`chip ${check.problems.length ? 'bad' : check.questions.length === 15 ? 'good' : 'warn'}`}>{check.questions.length} found{check.questions.length !== 15 ? ' · aim for 15' : ''}{check.problems.length ? ` · ${check.problems.length} to fix` : ''}</span>}</div>
        <p className="muted" style={{ margin: 0, fontSize: '.86rem' }}>Paste all 15. Number each question, give choices <b>A)</b> to <b>D)</b>, then <b>Answer: B</b>. <b>Explanation:</b> is optional. Use ______ for the blank. If a question has no "Which choice…?" line, the standard Words in Context question is used.</p>
        <textarea className="vr-ta q" value={f.questions_raw} onChange={(e) => setF({ ...f, questions_raw: e.target.value })} placeholder={SAMPLE} />
        {check?.problems.length > 0 && <ul className="vr-problems">{check.problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}</ul>}
        {check?.questions.length > 0 && !check.problems.length && (
          <details className="vr-parsed"><summary>Preview the {check.questions.length} questions as students see them</summary>
            {check.questions.map((q, i) => (
              <div key={i} className="vr-pq">
                <b>{i + 1}.</b> <span>{rich(q.passage)}</span>
                <small className="muted" style={{ display: 'block' }}>{q.prompt}</small>
                <ol type="A">{q.options.map((o, k) => <li key={k} className={k === q.answer ? 'ok' : ''}>{o}{k === q.answer ? '  ✓' : ''}</li>)}</ol>
              </div>
            ))}
          </details>
        )}
      </Card>

      <div className="vr-save">
        <span className="muted">{dirty ? 'Unsaved changes' : r.updated_at ? `Saved by ${r.updated_by || 'teacher'} · ${fmtDate(r.updated_at)}` : 'Nothing saved yet'}{r.results?.tries ? ` · ${r.results.students} student${r.results.students === 1 ? '' : 's'} took the questions, average ${r.results.avg}%` : ''}</span>
        <span className="grow" />
        <button className="btn primary" disabled={!dirty || busy || !!check?.problems.length} onClick={save}>{busy ? 'Saving…' : 'Save for all students'}</button>
      </div>
    </div>
  );
}

const L = ['A', 'B', 'C', 'D'];
/** 15 Words in Context questions: one at a time, checked on the server, then a review with explanations. */
export function WicTab({ u, teacher, onCards }) {
  const st = useAsync(() => api.get(`/vocab/units/${u.id}/wic`).then((d) => d).catch((e) => (e.status === 403 ? { locked: true } : Promise.reject(e))), [u.id]);
  return <Gate state={st}>{(d) => (d.locked ? <Locked onCards={onCards} /> : !d.questions.length ? <Card><p className="muted" style={{ margin: 0 }}>{teacher ? 'No questions yet. Add them in the Reading tab.' : 'Your teacher is adding the questions for this unit.'}</p></Card> : teacher ? <WicResults u={u} qs={d.questions} /> : <WicRun u={u} qs={d.questions} />)}</Gate>;
}

function WicRun({ u, qs }) {
  const toast = useToast();
  const [i, setI] = useState(0);
  const [pick, setPick] = useState({});
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const q = qs[i];
  const answered = Object.keys(pick).length;
  const submit = async () => {
    if (answered < qs.length && !window.confirm(`${qs.length - answered} question(s) have no answer. Submit anyway?`)) return;
    setBusy(true);
    try { setRes(await api.post(`/vocab/units/${u.id}/wic`, { answers: pick })); window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  if (res) {
    const pct = Math.round((res.score / res.total) * 100);
    return (
      <div className="wic">
        <Card className="wic-score">
          <div><small className="eyebrow-ink">WORDS IN CONTEXT</small><h2>{res.score} / {res.total} correct</h2><p className="muted">{pct >= 80 ? 'Great work: these words are yours.' : pct >= 60 ? 'Good. Look at the ones you missed below.' : 'Review the words with flashcards, then try again.'}</p></div>
          <div className="row wrap" style={{ gap: 8 }}><button className="btn soft" onClick={() => { setRes(null); setPick({}); setI(0); }}>Try again</button></div>
        </Card>
        {qs.map((x, k) => { const rv = res.review[k]; const ok = rv.picked === rv.answer; return (
          <Card key={k} className={`wic-rev ${ok ? 'ok' : 'no'}`}>
            <div className="row between"><b>Question {k + 1}</b><span className={`chip ${ok ? 'good' : 'bad'}`}>{ok ? 'Correct' : rv.picked == null ? 'No answer' : 'Wrong'}</span></div>
            <p className="wic-passage">{rich(x.passage)}</p>
            <ul className="wic-opts static">{x.options.map((o, j) => <li key={j} className={`${j === rv.answer ? 'right' : ''} ${j === rv.picked && !ok ? 'wrong' : ''}`}><span>{L[j]}</span>{o}</li>)}</ul>
            {rv.explanation && <p className="wic-why"><b>Why:</b> {rich(rv.explanation)}</p>}
          </Card>
        ); })}
      </div>
    );
  }
  return (
    <div className="wic">
      <div className="wic-nav" aria-label="Questions">
        {qs.map((_, k) => <button key={k} className={`${k === i ? 'on' : ''} ${pick[k] != null ? 'done' : ''}`} onClick={() => setI(k)} aria-label={`Question ${k + 1}`}>{k + 1}</button>)}
      </div>
      <Card className="wic-q">
        <small className="eyebrow-ink">QUESTION {i + 1} OF {qs.length}</small>
        <p className="wic-passage">{rich(q.passage)}</p>
        <p className="wic-prompt">{q.prompt}</p>
        <ul className="wic-opts">
          {q.options.map((o, j) => (
            <li key={j}><button type="button" className={pick[i] === j ? 'on' : ''} onClick={() => setPick({ ...pick, [i]: j })}><span>{L[j]}</span>{o}</button></li>
          ))}
        </ul>
        <div className="row between wrap" style={{ gap: 8 }}>
          <button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}><IconBack width={18} height={18} /> Back</button>
          {i < qs.length - 1
            ? <button className="btn primary" onClick={() => setI(i + 1)}>Next <IconArrow width={18} height={18} /></button>
            : <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Checking…' : `Submit (${answered}/${qs.length})`}</button>}
        </div>
      </Card>
    </div>
  );
}

function WicResults({ u, qs }) {
  const st = useAsync(() => api.get(`/vocab/units/${u.id}/wic/results`), [u.id]);
  return (
    <div className="wic">
      <Card>
        <h2 style={{ marginTop: 0 }}>Student results</h2>
        <Gate state={st}>{(rows) => (rows.length ? (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Student</th><th>Score</th><th>Date</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}</td><td><span className={`chip ${r.score / r.total >= 0.8 ? 'good' : r.score / r.total >= 0.6 ? 'warn' : 'bad'}`}>{r.score}/{r.total}</span></td><td className="nowrap">{fmtDate(r.created_at)}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="muted" style={{ margin: 0 }}>No student has taken these questions yet.</p>)}</Gate>
      </Card>
      <details className="vr-parsed card" style={{ padding: 16 }}><summary>See the {qs.length} questions with answers</summary>
        {qs.map((q, i) => (
          <div key={i} className="vr-pq"><b>{i + 1}.</b> <span>{rich(q.passage)}</span><small className="muted" style={{ display: 'block' }}>{q.prompt}</small>
            <ol type="A">{q.options.map((o, k) => <li key={k} className={k === q.answer ? 'ok' : ''}>{o}{k === q.answer ? '  ✓' : ''}</li>)}</ol>
            {q.explanation && <small className="muted">Why: {q.explanation}</small>}</div>
        ))}
      </details>
    </div>
  );
}
