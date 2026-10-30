import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Confirm, Field, Gate, Modal, Segmented, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconBack, IconBook, IconEdit, IconFlip, IconPlay, IconPlus, IconQuiz, IconTrash, IconVolume } from '../../components/icons.jsx';
import { ItemForm, Ring } from './VocabHome.jsx';
import { VideoPlayer } from '../student/Roadmap.jsx';
import Flashcards, { highlight, speak } from './Flashcards.jsx';
import VocabTest from './VocabTest.jsx';

const STATE = { new: 'New', learning: 'Learning', review: 'Learned' };

export default function VocabUnit() {
  const { id } = useParams();
  const st = useAsync(() => api.get('/vocab/units/' + id), [id]);
  return <div className="page"><Gate state={st}>{(u) => <Unit key={u.id} u={u} reload={st.reload} />}</Gate></div>;
}

/** Due words across all open sets. */
export function VocabReview() {
  const nav = useNavigate();
  const st = useAsync(() => api.get('/vocab/due'), []);
  return (
    <div className="page">
      <div className="vu-top"><Link className="btn ghost sm vu-back" to="/vocab"><IconBack width={18} height={18} /> Vocabulary</Link></div>
      <header className="vu-hero card"><div className="vu-hero-main"><span className="vu-tag">SPACED REVIEW</span><h1>Words due today</h1></div></header>
      <Gate state={st}>{(d) => <Flashcards words={d.words} title="Words due for review" onDone={() => nav('/vocab')} />}</Gate>
    </div>
  );
}

function Unit({ u, reload }) {
  const { user } = useAuth();
  const teacher = user.role === 'master';
  const [tab, setTab] = useState('words');
  const [video, setVideo] = useState(false);
  const [rename, setRename] = useState(false);
  const [delUnit, setDelUnit] = useState(false);
  const navTo = useNavigate();
  const toast2 = useToast();
  const idx = u.siblings.findIndex((s) => s.id === u.id);
  const prev = u.siblings[idx - 1]; const next = u.siblings[idx + 1];
  const counts = { n: u.words.filter((w) => w.state === 'new').length, l: u.words.filter((w) => w.state === 'learning').length, r: u.words.filter((w) => w.state === 'review').length };
  const finish = () => { setTab('words'); reload(); };

  const learnedPct = u.words.length ? counts.r / u.words.length : 0;
  const TABS = [
    { value: 'words', label: 'Words', icon: <IconBook width={18} height={18} /> },
    ...(teacher ? [] : [{ value: 'cards', label: 'Flashcards', icon: <IconFlip width={18} height={18} /> }]),
    { value: 'test', label: 'Test', icon: <IconQuiz width={18} height={18} /> },
  ];

  return (
    <>
      <div className="vu-top">
        <Link className="btn ghost sm vu-back" to="/vocab"><IconBack width={18} height={18} /> Vocabulary</Link>
        <nav className="vu-steps" aria-label={`${u.set.title} units`}>
          <span className="vu-steps-label">{u.set.title}</span>
          {u.siblings.map((s, k) => (
            <Link key={s.id} to={`/vocab/unit/${s.id}`} className={s.id === u.id ? 'on' : ''} aria-current={s.id === u.id ? 'page' : undefined} title={s.title}>{k + 1}</Link>
          ))}
        </nav>
      </div>

      <header className="vu-hero card">
        <div className="vu-hero-main">
          <span className="vu-tag">{u.set.title.toUpperCase()} · UNIT {idx + 1} OF {u.siblings.length}</span>
          <h1>{u.title}</h1>
          <div className="vu-meta">
            <span><IconBook width={16} height={16} /> {u.words.length} words</span>
            {u.set.video_url && <button className="btn soft sm" onClick={() => setVideo(true)}><IconPlay width={16} height={16} /> Watch the {u.set.title} video</button>}
            {teacher && <>
              <button className="btn ghost sm" onClick={() => setRename(true)}><IconEdit width={16} height={16} /> Rename unit</button>
              <button className="btn ghost sm danger-text" onClick={() => setDelUnit(true)}><IconTrash width={16} height={16} /> Delete unit</button>
            </>}
          </div>
        </div>
        {!teacher && (
          <div className="vu-stats">
            <div className="vu-ring"><Ring value={learnedPct} size={92} stroke={8} /><b>{Math.round(learnedPct * 100)}%</b><small>learned</small></div>
            <ul>
              <li className="n"><i>{counts.n}</i>New</li>
              <li className="l"><i>{counts.l}</i>Learning</li>
              <li className="r"><i>{counts.r}</i>Learned</li>
            </ul>
          </div>
        )}
      </header>

      <div className="vu-bar">
        <div className="vu-tabs" role="tablist">
          {TABS.map((t) => <button key={t.value} role="tab" aria-selected={tab === t.value} className={tab === t.value ? 'on' : ''} onClick={() => setTab(t.value)}>{t.icon}{t.label}</button>)}
        </div>
        {!teacher && tab === 'words' && <button className="btn primary vu-cta" onClick={() => setTab('cards')}>Start learning <IconArrow width={18} height={18} /></button>}
      </div>

      {tab === 'words' && (
        <>
          {teacher ? <WordEditor u={u} reload={reload} /> : (
            <div className="v-words">
              {u.words.map((w) => (
                <article key={w.id} className="v-word">
                  <div className="row between"><h3>{w.word} <button className="fc-say sm" onClick={() => speak(w.word)} aria-label={`Listen to ${w.word}`}><IconVolume width={16} height={16} /></button></h3><span className={`v-state ${w.state}`}>{STATE[w.state]}</span></div>
                  <p>{w.definition}</p>
                  {(w.uz || w.ru) && <p className="fc-tr">{w.uz && <span><i>UZ</i> {w.uz}</span>}{w.ru && <span><i>RU</i> {w.ru}</span>}</p>}
                  {w.example && <p className="v-ex">{highlight(w.example, w.word)}</p>}
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {tab === 'cards' && <Flashcards words={u.words} onDone={finish} />}
      {tab === 'test' && <VocabTest words={u.words} unitId={u.id} setId={u.set.id} onDone={finish} />}

      <nav className="lesson-nav">
        {prev ? <Link className="btn ghost" to={`/vocab/unit/${prev.id}`}><IconBack width={18} height={18} /> Unit {idx}</Link> : <span />}
        {next && <Link className="btn soft" to={`/vocab/unit/${next.id}`}>Unit {idx + 2}: {next.title} <IconArrow width={18} height={18} /></Link>}
      </nav>
      {rename && <ItemForm kind="unit" mode="edit" row={u} onClose={() => setRename(false)} onSaved={() => { setRename(false); reload(); }} />}
      {delUnit && <Confirm title={`Delete ${u.title}`} text="This unit and its words disappear for every student." onClose={() => setDelUnit(false)}
        onConfirm={async () => { try { await api.del(`/vocab/units/${u.id}`); toast2('Unit deleted'); navTo('/vocab'); } catch (e) { toast2(e.message, 'bad'); } }} />}
      {video && <Modal wide title={`${u.set.title} · video`} onClose={() => setVideo(false)}><VideoPlayer url={u.set.video_url} /></Modal>}
    </>
  );
}

const BLANK = { word: '', definition: '', uz: '', ru: '', example: '', image_url: '' };
/** Teacher: edit, add or remove the words of a unit. */
function WordEditor({ u, reload }) {
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [bulk, setBulk] = useState(false);
  return (
    <>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn primary sm" onClick={() => setEdit({ ...BLANK })}><IconPlus width={16} height={16} /> Add word</button>
        <button className="btn ghost sm" onClick={() => setBulk(true)}>Paste many words</button>
      </div>
      <div className="v-words">
        {u.words.map((w) => (
          <article key={w.id} className="v-word">
            <div className="row between"><h3>{w.word}</h3>
              <span className="row" style={{ gap: 4 }}><button className="icon-sm" aria-label="Edit" onClick={() => setEdit(w)}><IconEdit width={15} height={15} /></button><button className="icon-sm danger" aria-label="Remove" onClick={() => setDel(w)}><IconTrash width={15} height={15} /></button></span>
            </div>
            <p>{w.definition}</p>
            {(w.uz || w.ru) && <p className="fc-tr">{w.uz && <span><i>UZ</i> {w.uz}</span>}{w.ru && <span><i>RU</i> {w.ru}</span>}</p>}
            {w.example && <p className="v-ex">{highlight(w.example, w.word)}</p>}
          </article>
        ))}
      </div>
      {edit && <WordModal unitId={u.id} w={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {bulk && <BulkModal unitId={u.id} onClose={() => setBulk(false)} onSaved={() => { setBulk(false); reload(); }} />}
      {del && <Confirm title="Remove word" text={`“${del.word}” will be removed from this unit for all students.`} confirmLabel="Remove" onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.del(`/vocab/words/${del.id}`); toast('Word removed'); setDel(null); reload(); } catch (e) { toast(e.message, 'bad'); } }} />}
    </>
  );
}

function WordModal({ unitId, w, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ ...BLANK, ...w });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    try { if (w.id) await api.put(`/vocab/words/${w.id}`, f); else await api.post(`/vocab/units/${unitId}/words`, f); toast('Saved'); onSaved(); }
    catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Modal title={w.id ? 'Edit word' : 'Add word'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.word.trim()} onClick={save}>Save</button></>}>
      <Field label="Word"><input value={f.word} onChange={set('word')} autoFocus /></Field>
      <Field label="Definition"><textarea rows={2} value={f.definition} onChange={set('definition')} /></Field>
      <div className="grid g2"><Field label="Uzbek"><input value={f.uz} onChange={set('uz')} /></Field><Field label="Russian"><input value={f.ru} onChange={set('ru')} /></Field></div>
      <Field label="Example sentence"><textarea rows={2} value={f.example} onChange={set('example')} /></Field>
      <Field label="Picture link" hint="optional — shown on the back of the card"><input value={f.image_url} onChange={set('image_url')} placeholder="https://…" /></Field>
    </Modal>
  );
}

function BulkModal({ unitId, onClose, onSaved }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const rows = text.split('\n').map((l) => l.split(/\t|\s\|\s/).map((x) => x.trim())).filter((r) => r[0]);
  const save = async () => {
    try {
      const r = await api.post(`/vocab/units/${unitId}/words`, { words: rows.map(([word, definition = '', uz = '', ru = '', example = '']) => ({ word, definition, uz, ru, example })) });
      toast(`${r.added} words saved`); onSaved();
    } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Modal wide title="Paste many words" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!rows.length} onClick={save}>Save {rows.length || ''} words</button></>}>
      <p className="muted">One word per line: <code>word | definition | Uzbek | Russian | example</code>. Copying rows from Google Sheets or Excel (tab-separated) works too.</p>
      <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'attic | the space under a house roof | chordoq | чердак | We found old photos in the attic.'} />
    </Modal>
  );
}
