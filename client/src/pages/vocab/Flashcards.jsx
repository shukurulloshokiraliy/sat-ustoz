import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { IconFlip, IconVolume } from '../../components/icons.jsx';
import Character from '../../components/Character.jsx';

const RATINGS = [
  { r: 1, label: 'Again', cls: 'again' },
  { r: 2, label: 'Hard', cls: 'hard' },
  { r: 3, label: 'Good', cls: 'good' },
  { r: 4, label: 'Easy', cls: 'easy' },
];
const NEW_PER_SESSION = 20;

export function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.9;
    const v = window.speechSynthesis.getVoices().find((x) => /en[-_]US/i.test(x.lang));
    if (v) u.voice = v;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  } catch { /* no speech on this device */ }
}
/** Bold the word (or its forms) inside the example sentence. */
export function highlight(sentence, word) {
  if (!sentence) return null;
  const stem = word.toLowerCase().replace(/(e|ed|ing|s|es|ly)$/, '');
  const re = new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*|${stem.length >= 3 ? stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w*' : '(?!)'})`, 'i');
  const m = sentence.match(re);
  if (!m) return sentence;
  return <>{sentence.slice(0, m.index)}<b>{m[0]}</b>{sentence.slice(m.index + m[0].length)}</>;
}

/**
 * Spaced-repetition session: due cards first, then up to 20 new ones.
 * Space / tap flips the card; 1–4 rate it. "Again" and learning cards come back later in the same session.
 */
export default function Flashcards({ words, onDone, title }) {
  const toast = useToast();
  const initial = useMemo(() => {
    const now = Date.now();
    const due = words.filter((w) => w.state !== 'new' && w.due_at && new Date(w.due_at).getTime() <= now + 60e3);
    const fresh = words.filter((w) => w.state === 'new').slice(0, NEW_PER_SESSION);
    return [...due, ...fresh];
  }, [words]);
  const [queue, setQueue] = useState(initial);
  const [states, setStates] = useState(() => Object.fromEntries(words.map((w) => [w.id, w.state])));
  const [previews, setPreviews] = useState(() => Object.fromEntries(words.map((w) => [w.id, w.previews])));
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const started = useRef(initial.length);
  const card = queue[0];

  const counts = useMemo(() => {
    const ids = new Set(queue.map((w) => w.id));
    let n = 0; let l = 0; let r = 0;
    for (const id of ids) { const s = states[id]; if (s === 'new') n++; else if (s === 'learning') l++; else r++; }
    return { n, l, r };
  }, [queue, states]);

  const rate = useCallback(async (rating) => {
    if (!card || !flipped || busy) return;
    setBusy(true);
    try {
      const res = await api.post('/vocab/review', { word_id: card.id, rating });
      setStates((s) => ({ ...s, [card.id]: res.state }));
      setPreviews((p) => ({ ...p, [card.id]: res.previews }));
      const soon = new Date(res.due_at).getTime() - Date.now() < 15 * 60e3;
      setQueue((q) => {
        const rest = q.slice(1);
        if (!soon) return rest;
        const at = Math.min(rest.length, rating === 1 ? 3 : 6);
        return [...rest.slice(0, at), { ...card, state: res.state }, ...rest.slice(at)];
      });
      if (!soon) setDone((n) => n + 1);
      setFlipped(false);
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }, [card, flipped, busy, toast]);

  useEffect(() => {
    const f = (e) => {
      if (/input|textarea/i.test(e.target.tagName)) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((x) => !x); }
      if (['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key));
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [rate]);
  useEffect(() => { if (card && !flipped) { /* front side: nothing to say yet */ } }, [card, flipped]);

  if (!initial.length) return (
    <div className="fc-empty">
      <Character kind="owl" size={96} mood="win" />
      <h2>Nothing to review right now</h2>
      <p className="muted">Every word here is scheduled for later. Come back tomorrow, or take the test.</p>
      <button className="btn primary" onClick={onDone}>Back</button>
    </div>
  );
  if (!card) return (
    <div className="fc-empty">
      <Character kind="chick" size={96} mood="win" />
      <h2>Session complete</h2>
      <p className="muted">You went through {started.current} card{started.current === 1 ? '' : 's'}. The words will come back right before you would forget them.</p>
      <button className="btn primary" onClick={onDone}>Done</button>
    </div>
  );

  const pv = previews[card.id] || [];
  const progress = Math.min(1, done / Math.max(1, started.current));
  return (
    <div className="fc">
      {title && <p className="fc-title">{title}</p>}
      <div className="fc-progress"><span style={{ width: `${progress * 100}%` }} /><small>{done} of {started.current}</small></div>
      <div className="fc-card-wrap">
        <div className="fc-counts"><span className="n">{counts.n} New</span><span className="l">{counts.l} Learning</span><span className="r">{counts.r} To review</span></div>
        <div className={`fc-card ${flipped ? 'back' : ''}`} onClick={() => !flipped && setFlipped(true)} role="button" tabIndex={0} aria-label={flipped ? 'Card back' : 'Tap to reveal'}>
          {!flipped ? (
            <div className="fc-front">
              <div className="fc-word">{card.word}<button className="fc-say" onClick={(e) => { e.stopPropagation(); speak(card.word); }} aria-label="Listen"><IconVolume /></button></div>
              <span className="fc-tap"><IconFlip width={15} height={15} /> Tap or press Space to reveal</span>
            </div>
          ) : (
            <div className="fc-backside">
              {card.image_url && <img src={card.image_url} alt="" className="fc-img" />}
              <div>
                <div className="fc-word sm">{card.word}<button className="fc-say" onClick={(e) => { e.stopPropagation(); speak(card.word); }} aria-label="Listen"><IconVolume /></button></div>
                <h4>Definition</h4>
                <p>{card.definition}</p>
                {(card.uz || card.ru) && <p className="fc-tr">{card.uz && <span><i>UZ</i> {card.uz}</span>}{card.ru && <span><i>RU</i> {card.ru}</span>}</p>}
                {card.example && <><h4>Example</h4><p className="fc-ex">{highlight(card.example, card.word)}</p></>}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={`fc-rate ${flipped ? '' : 'wait'}`}>
        {RATINGS.map((b, i) => (
          <button key={b.r} className={`fc-btn ${b.cls}`} disabled={!flipped || busy} onClick={() => rate(b.r)}>
            <b>{b.label}</b><small>{pv[i] || ''}</small><kbd>{b.r}</kbd>
          </button>
        ))}
      </div>
      <p className="fc-hint">{flipped ? 'Rate honestly — the app picks when you see this word again.' : 'Try to remember the meaning first, then reveal.'}</p>
    </div>
  );
}
