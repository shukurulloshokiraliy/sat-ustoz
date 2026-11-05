import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Confirm, Field, Gate, Modal, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconCrown, IconEdit, IconGame, IconLock, IconPlay, IconPlus, IconTrash, IconUpload } from '../../components/icons.jsx';
import { VideoPlayer } from '../student/Roadmap.jsx';
import ImportWords from './ImportWords.jsx';

/** Vocabulary home: review button, sets of five units, a video per set. */
export default function VocabHome() {
  const st = useAsync(() => api.get('/vocab'), []);
  return <div className="page"><Gate state={st}>{(d) => <Home d={d} reload={st.reload} />}</Gate></div>;
}

export function Ring({ value, size = 44, stroke = 5 }) {
  const r = (size - 6) / 2; const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="v-ring" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--good)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

function Home({ d, reload }) {
  const { user } = useAuth();
  const teacher = user.role === 'master';
  const [video, setVideo] = useState(null);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(null); // { kind: 'deck'|'set'|'unit', mode: 'new'|'edit', parent, row }
  const [del, setDel] = useState(null); // { kind, row }
  const [imp, setImp] = useState(null); // set
  const toast = useToast();
  const t = d.totals;
  // sets fold to one line each; the set you are working on starts open (due words, else the first unfinished one)
  const [openSets, setOpenSets] = useState(() => {
    const all = d.decks.flatMap((x) => x.sets).filter((x) => x.open);
    const cur = all.find((x) => x.units.some((u) => u.due)) || all.find((x) => x.units.some((u) => u.learned < u.words)) || all[0];
    return new Set(cur ? [cur.id] : []);
  });
  // one deck at a time: the shelf on top picks it (remembered on this device)
  const [deckId, setDeckId] = useState(() => {
    let saved = null; try { saved = localStorage.getItem('vocab-deck'); } catch { /* storage blocked */ }
    if (saved && d.decks.some((x) => x.id === saved)) return saved;
    return (d.decks.find((x) => x.sets.some((st) => st.units.some((u) => u.due))) || d.decks[0])?.id || null;
  });
  const pickDeck = (id) => { setDeckId(id); try { localStorage.setItem('vocab-deck', id); } catch { /* storage blocked */ } };
  const deckStats = (dk) => {
    const us = dk.sets.flatMap((st) => st.units);
    const words = us.reduce((n, u) => n + u.words, 0); const learned = us.reduce((n, u) => n + u.learned, 0);
    return { sets: dk.sets.length, words, learned, due: us.reduce((n, u) => n + u.due, 0), pct: words ? Math.round((learned / words) * 100) : 0 };
  };
  const cur = d.decks.find((x) => x.id === deckId) || d.decks[0];
  const toggle = (id) => setOpenSets((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <>
      <section className="v-hero">
        <div className="v-hero-copy">
          <small className="eyebrow">VOCABULARY</small>
          <h1>Word <mark>Vault</mark></h1>
          <p>Every deck of SAT words in one place. Learn with flashcards that return right before you forget, read the words in a real text, then prove them in Words in Context or Word Arena.</p>
          <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>
            {!teacher && <Link className={`btn lg ${t.due ? 'sun' : 'primary'}`} to="/vocab/review">{t.due ? `Review ${t.due} due word${t.due === 1 ? '' : 's'}` : 'Review words'} <IconArrow /></Link>}
            <Link className="btn lg on-dark" to="/game"><IconGame /> Word Arena</Link>
          </div>
        </div>
        <div className="v-hero-stats">
          <div><b>{t.words}</b><span>words</span></div>
          <div><b>{t.learned}</b><span>learned</span></div>
          <div><b>{t.seen - t.learned}</b><span>learning</span></div>
          <div><b>{t.due}</b><span>due now</span></div>
        </div>
      </section>

      <nav className="v-shelf" aria-label="Decks">
        {d.decks.filter((dk) => teacher || dk.sets.length).map((dk) => { const k = deckStats(dk); return (
          <button key={dk.id} type="button" className={`v-deck ${cur?.id === dk.id ? 'on' : ''}`} aria-pressed={cur?.id === dk.id} onClick={() => pickDeck(dk.id)}>
            <span className="v-deck-top"><b>{dk.title}</b>{!teacher && k.due > 0 && <em>{k.due} due</em>}</span>
            <small>{k.sets} set{k.sets === 1 ? '' : 's'} · {k.words} words</small>
            {!teacher && <span className="v-deck-bar" aria-label={`${k.pct}% learned`}><span style={{ width: `${Math.max(k.pct, 2)}%` }} /></span>}
          </button>
        ); })}
        {teacher && <button type="button" className="v-deck add" onClick={() => setForm({ kind: 'deck', mode: 'new' })}><IconPlus width={20} height={20} /><b>New deck</b><small>e.g. SAT 3000</small></button>}
      </nav>

      {!d.full && cur && cur.sets.some((st) => !st.open) && (
        <div className="banner">
          <span className="item-ic"><IconCrown /></span>
          <div className="grow"><b>{cur.free_sets ? `${cur.free_sets === 1 ? 'Set 1 is' : `The first ${cur.free_sets} sets are`} free` : 'This deck comes with a plan'}</b><small>Subscribe to open all {cur.sets.length} sets of {cur.title} ({deckStats(cur).words} words) and every deck in Word Arena.</small></div>
          <Link className="btn primary sm" to="/subscribe">See plans <IconArrow width={16} height={16} /></Link>
        </div>
      )}

      {[cur].filter(Boolean).map((deck) => (
        <section key={deck.id} className="stack">
          <div className="row between wrap v-deck-head">
            <p className="muted"><b>{deck.title}</b>{deck.subtitle ? ` · ${deck.subtitle}` : ''}</p>
            {teacher && (
              <div className="row" style={{ gap: 6 }}>
                <button className="btn soft sm" onClick={() => setForm({ kind: 'set', mode: 'new', parent: deck })}><IconPlus width={16} height={16} /> Add set</button>
                <button className="icon-btn" aria-label={`Edit ${deck.title}`} onClick={() => setForm({ kind: 'deck', mode: 'edit', row: deck })}><IconEdit width={18} height={18} /></button>
                <button className="icon-btn danger" aria-label={`Delete ${deck.title}`} onClick={() => setDel({ kind: 'deck', row: deck })}><IconTrash width={18} height={18} /></button>
              </div>
            )}
          </div>
          {!deck.sets.length && <div className="v-empty"><b>{teacher ? 'This deck is empty' : 'Nothing here yet'}</b><p className="muted">{teacher ? 'Add a set, then units and words inside it. Each unit can get a reading text and 15 Words in Context questions.' : 'Your teacher is filling this deck.'}</p>{teacher && <button className="btn primary" onClick={() => setForm({ kind: 'set', mode: 'new', parent: deck })}><IconPlus width={16} height={16} /> Add the first set</button>}</div>}
          {deck.sets.map((s) => {
            const words = s.units.reduce((n, u) => n + u.words, 0);
            const learned = s.units.reduce((n, u) => n + u.learned, 0);
            const due = s.units.reduce((n, u) => n + (u.due || 0), 0);
            return (
              <div key={s.id} className={`v-set ${s.open ? '' : 'locked'} ${openSets.has(s.id) ? 'open' : 'shut'}`}>
                <div className="v-set-head">
                  <button type="button" className="v-set-toggle" aria-expanded={openSets.has(s.id)} onClick={() => toggle(s.id)}>
                    <span className="v-set-n">{s.n}</span>
                    <span className="grow v-set-info">
                      <b>{s.title}</b>
                      <small>{s.units.length} units · {words} words{due ? <em> · {due} due</em> : ''}</small>
                      <span className="v-set-bar" aria-label={`${learned} of ${words} learned`}><span style={{ width: `${words ? Math.round((learned / words) * 100) : 0}%` }} /></span>
                    </span>
                    <svg className="v-set-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {s.video_url && <button className="btn soft sm" onClick={() => setVideo(s)}><IconPlay width={16} height={16} /> Set video</button>}
                  {teacher && <>
                    <button className="btn soft sm" onClick={() => setImp(s)}><IconUpload width={16} height={16} /> Import</button>
                    <button className="btn ghost sm" onClick={() => setEdit(s)}>{s.video_url ? 'Change video' : 'Add video'}</button>
                    <button className="icon-btn" aria-label={`Rename ${s.title}`} onClick={() => setForm({ kind: 'set', mode: 'edit', row: s })}><IconEdit width={18} height={18} /></button>
                    <button className="icon-btn danger" aria-label={`Delete ${s.title}`} onClick={() => setDel({ kind: 'set', row: s })}><IconTrash width={18} height={18} /></button>
                  </>}
                  {!s.open && <span className="chip"><IconLock width={14} height={14} /> Subscription</span>}
                </div>
                {openSets.has(s.id) && <div className="v-units">
                  {s.units.map((u) => {
                    const pct = u.words ? u.learned / u.words : 0;
                    const body = (
                      <>
                        <Ring value={pct} />
                        <span className="v-u-n">{u.n}</span>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <b>{u.title}</b>
                          <small>{u.words} words{u.due ? ` · ${u.due} due` : ''}{u.best != null ? ` · test ${u.best}%` : ''}</small>
                        </div>
                      </>
                    );
                    return s.open
                      ? <Link key={u.id} to={`/vocab/unit/${u.id}`} className={`v-unit ${u.due ? 'due' : ''}`}>{body}</Link>
                      : <Link key={u.id} to="/subscribe" className="v-unit locked">{body}</Link>;
                  })}
                  {teacher && <button type="button" className="v-unit v-unit-add" onClick={() => setForm({ kind: 'unit', mode: 'new', parent: s })}><IconPlus width={18} height={18} /> Add unit</button>}
                </div>}
              </div>
            );
          })}
        </section>
      ))}


      {imp && <ImportWords setId={imp.id} units={imp.units} onClose={() => setImp(null)} onSaved={() => { setImp(null); reload(); }} />}
      {form && <ItemForm {...form} onClose={() => setForm(null)} onSaved={(r) => { if (form.kind === 'deck' && form.mode === 'new' && r?.id) pickDeck(r.id); setForm(null); reload(); }} />}
      {del && <Confirm title={`Delete ${del.row.title}`}
        text={del.kind === 'deck' ? 'The whole deck, with its sets, units and words, disappears for every student.' : del.kind === 'set' ? 'This set, its units and words disappear for every student.' : 'This unit and its words disappear for every student.'}
        onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.del(`/vocab/${del.kind}s/${del.row.id}`); toast('Deleted'); setDel(null); reload(); } catch (e) { toast(e.message, 'bad'); } }} />}

      {video && (
        <Modal wide title={`${video.title} · video`} onClose={() => setVideo(null)}>
          <VideoPlayer url={video.video_url} />
        </Modal>
      )}
      {edit && <VideoEdit set={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function VideoEdit({ set, onClose, onSaved }) {
  const toast = useToast();
  const [url, setUrl] = useState(set.video_url || '');
  const save = async () => {
    try { await api.put(`/vocab/sets/${set.id}`, { video_url: url }); toast('Video saved'); onSaved(); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Modal title={`${set.title} · video`} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <p className="muted">One video for the five units of this set. Paste a YouTube (unlisted is fine), Google Drive (“Anyone with the link”), Vimeo or .mp4 link. Leave empty to remove.</p>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" aria-label="Video link" />
      {url && <VideoPlayer url={url} />}
    </Modal>
  );
}

const LABEL = { deck: 'deck', set: 'set', unit: 'unit' };
/** Teacher: create or rename a word book, set or unit. */
export function ItemForm({ kind, mode, parent, row, onClose, onSaved }) {
  const toast = useToast();
  const [title, setTitle] = useState(row?.title || '');
  const [subtitle, setSubtitle] = useState(row?.subtitle || '');
  const [free, setFree] = useState(row?.free_sets ?? 1);
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const body = kind === 'deck' ? { title, subtitle, free_sets: Number(free) } : { title };
      let r = null;
      if (mode === 'edit') await api.put(`/vocab/${kind}s/${row.id}`, body);
      else if (kind === 'deck') r = await api.post('/vocab/decks', body);
      else if (kind === 'set') r = await api.post(`/vocab/decks/${parent.id}/sets`, body);
      else r = await api.post(`/vocab/sets/${parent.id}/units`, body);
      toast('Saved'); onSaved(r);
    } catch (ex) { toast(ex.message, 'bad'); setBusy(false); }
  };
  return (
    <Modal title={`${mode === 'edit' ? 'Rename' : 'New'} ${LABEL[kind]}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || (kind !== 'set' && !title.trim())} onClick={save}>Save</button></>}>
      <form onSubmit={save} className="stack">
        <Field label="Title" hint={kind === 'set' && mode === 'new' ? 'Leave empty to call it “Set N”.' : kind === 'unit' ? 'Usually the name of the reading passage.' : undefined}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={kind === 'unit' ? 120 : 80} placeholder={kind === 'deck' ? 'SAT 3000' : kind === 'set' ? 'Set 16' : 'The Lost City'} />
        </Field>
        {kind === 'deck' && <>
          <Field label="Short description"><input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={200} placeholder="Words from our class readings" /></Field>
          <Field label="Free sets" hint="How many sets students can open without a subscription."><input type="number" min={0} max={50} value={free} onChange={(e) => setFree(e.target.value)} /></Field>
        </>}
      </form>
    </Modal>
  );
}
