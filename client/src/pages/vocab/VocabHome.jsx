import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Confirm, Field, Gate, Modal, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconCrown, IconEdit, IconGame, IconLock, IconPlay, IconPlus, IconTrash, IconUpload } from '../../components/icons.jsx';
import Character from '../../components/Character.jsx';
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
  return (
    <>
      <section className="v-hero">
        <div className="v-hero-copy">
          <small className="eyebrow">VOCABULARY</small>
          <h1>Words that <mark>stick</mark>.</h1>
          <p>Learn every word from the ELS reading passages with flashcards that come back right before you forget them. Then test yourself, or battle friends in Word Arena.</p>
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
        <div className="v-hero-chars" aria-hidden="true"><Character kind="owl" size={96} /><Character kind="fox" size={70} /><Character kind="chick" size={58} /></div>
      </section>

      {!d.full && (
        <div className="banner">
          <span className="item-ic"><IconCrown /></span>
          <div className="grow"><b>Set 1 is free</b><small>Subscribe to open all 15 sets ({t.words} words), tests and Word Arena with every set.</small></div>
          <Link className="btn primary sm" to="/subscribe">See plans <IconArrow width={16} height={16} /></Link>
        </div>
      )}

      {d.decks.map((deck) => (
        <section key={deck.id} className="stack">
          <div className="row between wrap">
            <div><h2>{deck.title}</h2><p className="muted">{deck.subtitle}</p></div>
            {teacher && (
              <div className="row" style={{ gap: 6 }}>
                <button className="btn soft sm" onClick={() => setForm({ kind: 'set', mode: 'new', parent: deck })}><IconPlus width={16} height={16} /> Add set</button>
                <button className="icon-btn" aria-label={`Edit ${deck.title}`} onClick={() => setForm({ kind: 'deck', mode: 'edit', row: deck })}><IconEdit width={18} height={18} /></button>
                <button className="icon-btn danger" aria-label={`Delete ${deck.title}`} onClick={() => setDel({ kind: 'deck', row: deck })}><IconTrash width={18} height={18} /></button>
              </div>
            )}
          </div>
          {teacher && !deck.sets.length && <p className="muted">No sets yet. Add a set, then units and words inside it.</p>}
          {deck.sets.map((s) => {
            const words = s.units.reduce((n, u) => n + u.words, 0);
            const learned = s.units.reduce((n, u) => n + u.learned, 0);
            return (
              <div key={s.id} className={`v-set ${s.open ? '' : 'locked'}`}>
                <div className="v-set-head">
                  <span className="v-set-n">{s.n}</span>
                  <div className="grow"><b>{s.title}</b><small>{s.units.length} units · {words} words · {learned} learned</small></div>
                  {s.video_url && <button className="btn soft sm" onClick={() => setVideo(s)}><IconPlay width={16} height={16} /> Set video</button>}
                  {teacher && <>
                    <button className="btn soft sm" onClick={() => setImp(s)}><IconUpload width={16} height={16} /> Import</button>
                    <button className="btn ghost sm" onClick={() => setEdit(s)}>{s.video_url ? 'Change video' : 'Add video'}</button>
                    <button className="icon-btn" aria-label={`Rename ${s.title}`} onClick={() => setForm({ kind: 'set', mode: 'edit', row: s })}><IconEdit width={18} height={18} /></button>
                    <button className="icon-btn danger" aria-label={`Delete ${s.title}`} onClick={() => setDel({ kind: 'set', row: s })}><IconTrash width={18} height={18} /></button>
                  </>}
                  {!s.open && <span className="chip"><IconLock width={14} height={14} /> Subscription</span>}
                </div>
                <div className="v-units">
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
                </div>
              </div>
            );
          })}
        </section>
      ))}

      {teacher && <button className="btn ghost block v-add-deck" onClick={() => setForm({ kind: 'deck', mode: 'new' })}><IconPlus width={18} height={18} /> New word book</button>}

      {imp && <ImportWords setId={imp.id} units={imp.units} onClose={() => setImp(null)} onSaved={() => { setImp(null); reload(); }} />}
      {form && <ItemForm {...form} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
      {del && <Confirm title={`Delete ${del.row.title}`}
        text={del.kind === 'deck' ? 'The whole word book, with its sets, units and words, disappears for every student.' : del.kind === 'set' ? 'This set, its units and words disappear for every student.' : 'This unit and its words disappear for every student.'}
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

const LABEL = { deck: 'word book', set: 'set', unit: 'unit' };
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
      if (mode === 'edit') await api.put(`/vocab/${kind}s/${row.id}`, body);
      else if (kind === 'deck') await api.post('/vocab/decks', body);
      else if (kind === 'set') await api.post(`/vocab/decks/${parent.id}/sets`, body);
      else await api.post(`/vocab/sets/${parent.id}/units`, body);
      toast('Saved'); onSaved();
    } catch (ex) { toast(ex.message, 'bad'); setBusy(false); }
  };
  return (
    <Modal title={`${mode === 'edit' ? 'Rename' : 'New'} ${LABEL[kind]}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || (kind !== 'set' && !title.trim())} onClick={save}>Save</button></>}>
      <form onSubmit={save} className="stack">
        <Field label="Title" hint={kind === 'set' && mode === 'new' ? 'Leave empty to call it “Set N”.' : kind === 'unit' ? 'Usually the name of the reading passage.' : undefined}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={kind === 'unit' ? 120 : 80} placeholder={kind === 'deck' ? 'SAT Hard Words' : kind === 'set' ? 'Set 16' : 'The Lost City'} />
        </Field>
        {kind === 'deck' && <>
          <Field label="Short description"><input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={200} placeholder="Words from our class readings" /></Field>
          <Field label="Free sets" hint="How many sets students can open without a subscription."><input type="number" min={0} max={50} value={free} onChange={(e) => setFree(e.target.value)} /></Field>
        </>}
      </form>
    </Modal>
  );
}
