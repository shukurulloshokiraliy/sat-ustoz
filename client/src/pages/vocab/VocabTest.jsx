import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { IconArrow, IconCheck, IconX } from '../../components/icons.jsx';
import Character from '../../components/Character.jsx';
import { highlight } from './Flashcards.jsx';

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const L = ['A', 'B', 'C', 'D'];
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Blank the word (or its forms) in the example sentence; null if it is not there. */
function blankOut(sentence, word) {
  if (!sentence) return null;
  const stem = word.toLowerCase().replace(/(e|ed|ing|s|es|ly)$/, '');
  if (stem.length < 3) return null;
  const re = new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*|${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*)`, 'i');
  return re.test(sentence) ? sentence.replace(re, '______') : null;
}

/** Four kinds of questions: meaning, word from meaning, word in a sentence, spelling from the translation. */
function buildTest(words, count) {
  const pool = words.filter((w) => w.definition);
  return shuffle(pool).slice(0, count).map((w, i) => {
    const others = shuffle(pool.filter((x) => x.id !== w.id)).slice(0, 3);
    const blank = blankOut(w.example, w.word);
    const kinds = ['meaning', 'word', ...(blank ? ['blank'] : []), ...(w.uz && !/\s/.test(w.word) ? ['spell'] : [])];
    const kind = kinds[i % kinds.length];
    if (kind === 'spell') return { w, kind, prompt: w.uz, hint: w.definition };
    const opts = kind === 'meaning' ? [w, ...others].map((x) => x.definition) : [w, ...others].map((x) => x.word);
    const order = shuffle([0, 1, 2, 3].slice(0, opts.length));
    return { w, kind, prompt: kind === 'meaning' ? w.word : kind === 'word' ? w.definition : blank, options: order.map((k) => opts[k]), answer: order.indexOf(0) };
  });
}
const ASK = { meaning: 'What does this word mean?', word: 'Which word matches this meaning?', blank: 'Which word completes the sentence?', spell: 'Type the English word for this translation.' };

export default function VocabTest({ words, unitId, setId, onDone }) {
  const qs = useMemo(() => buildTest(words, Math.min(15, words.length)), [words]);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState(null);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState(false);
  const [results, setResults] = useState([]);
  const q = qs[i];
  const finished = i >= qs.length;

  useEffect(() => {
    if (!finished || !results.length) return;
    api.post('/vocab/tests', { unit_id: unitId, set_id: setId, score: results.filter((r) => r.ok).length, total: results.length, missed: results.filter((r) => !r.ok).map((r) => r.id) }).catch(() => {});
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  if (words.length < 4) return <p className="muted">This unit needs at least 4 words for a test.</p>;
  if (finished) {
    const ok = results.filter((r) => r.ok).length; const pct = Math.round((ok / results.length) * 100);
    return (
      <div className="vt-result">
        <Character kind={pct >= 80 ? 'chick' : pct >= 50 ? 'owl' : 'penguin'} size={100} mood={pct >= 80 ? 'win' : pct >= 50 ? 'happy' : 'sad'} />
        <h2>{ok} / {results.length} · {pct}%</h2>
        <p className="muted">{pct >= 80 ? 'Excellent — these words are yours.' : pct >= 50 ? 'Good progress. The missed words were added to your review.' : 'Keep going. The missed words were added to your review.'}</p>
        {results.some((r) => !r.ok) && <div className="vt-missed">{results.filter((r) => !r.ok).map((r) => <span key={r.id}><b>{r.word}</b> — {r.definition}</span>)}</div>}
        <div className="row wrap" style={{ justifyContent: 'center', gap: 10 }}>
          <button className="btn primary" onClick={() => { setI(0); setResults([]); setPick(null); setChecked(false); setTyped(''); }}>Try again</button>
          <button className="btn ghost" onClick={onDone}>Back</button>
        </div>
      </div>
    );
  }

  const isRight = q.kind === 'spell' ? norm(typed) === norm(q.w.word) : pick === q.answer;
  const check = () => {
    if (checked) return;
    if (q.kind === 'spell' ? !typed.trim() : pick == null) return;
    setChecked(true);
    setResults((r) => [...r, { id: q.w.id, word: q.w.word, definition: q.w.definition, ok: isRight }]);
  };
  const next = () => { setI(i + 1); setPick(null); setTyped(''); setChecked(false); };

  return (
    <div className="vt">
      <div className="fc-progress"><span style={{ width: `${(i / qs.length) * 100}%` }} /><small>{i + 1} of {qs.length}</small></div>
      <div className="vt-card">
        <small className="muted">{ASK[q.kind]}</small>
        <p className={`vt-prompt ${q.kind === 'meaning' ? 'big' : ''}`}>{q.prompt}</p>
        {q.kind === 'spell' ? (
          <div className="stack sm">
            <small className="muted">{q.hint}</small>
            <input autoFocus value={typed} disabled={checked} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (checked ? next() : check())} placeholder="Type the word…" aria-label="Your answer" className={checked ? (isRight ? 'ok' : 'bad') : ''} />
            {checked && !isRight && <p className="vt-fix">Correct: <b>{q.w.word}</b></p>}
          </div>
        ) : (
          <div className="vt-opts">
            {q.options.map((o, k) => {
              const st = checked ? (k === q.answer ? 'right' : k === pick ? 'wrong' : 'dim') : k === pick ? 'sel' : '';
              return (
                <button key={k} className={`vt-opt ${st}`} disabled={checked} onClick={() => setPick(k)}>
                  <span className="L">{L[k]}</span><span>{o}</span>
                  {st === 'right' && <IconCheck width={18} height={18} />}{st === 'wrong' && <IconX width={18} height={18} />}
                </button>
              );
            })}
          </div>
        )}
        {checked && q.w.example && <p className="vt-ex">{highlight(q.w.example, q.w.word)}</p>}
      </div>
      {!checked
        ? <button className="btn primary lg block" disabled={q.kind === 'spell' ? !typed.trim() : pick == null} onClick={check}>Check</button>
        : <button className="btn primary lg block" onClick={next}>{i + 1 >= qs.length ? 'See result' : 'Next'} <IconArrow /></button>}
    </div>
  );
}
