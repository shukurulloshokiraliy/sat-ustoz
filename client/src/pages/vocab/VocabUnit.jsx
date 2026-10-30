import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Confirm, Field, Gate, Modal, Segmented, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconEdit, IconPlay, IconPlus, IconTrash, IconVolume } from '../../components/icons.jsx';
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
      <header className="lesson-head"><Link to="/vocab" className="crumb">← Vocabulary</Link><h1>Review</h1></header>
      <Gate state={st}>{(d) => <Flashcards words={d.words} title="Words due for review" onDone={() => nav('/vocab')} />}</Gate>
    </div>
  );
}

function Unit({ u, reload }) {
  const { user } = useAuth();
  const teacher = user.role === 'master';
  const [tab, setTab] = useState('words');
  const [video, setVideo] = useState(false);
  const idx = u.siblings.findIndex((s) => s.id === u.id);
  const prev = u.siblings[idx - 1]; const next = u.siblings[idx + 1];
  const counts = { n: u.words.filter((w) => w.state === 'new').length, l: u.words.filter((w) => w.state === 'learning').length, r: u.words.filter((w) => w.state === 'review').length };
  const finish = () => { setTab('words'); reload(); };

  return (
    <>
      <header className="lesson-head">
        <Link to="/vocab" className="crumb">← Vocabulary · {u.set.title}</Link>
        <small className="eyebrow-ink">UNIT {u.n} · {u.words.length} WORDS</small>
        <h1>{u.title}</h1>
      </header>

      <div className="row wrap between" style={{ gap: 10 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'words', label: 'Words' }, ...(teacher ? [] : [{ value: 'cards', label: 'Flashcards' }]), { value: 'test', label: 'Test' }]} />
        <div className="row" style={{ gap: 8 }}>
          {u.set.video_url && <button className="btn soft sm" onClick={() => setVideo(true)}><IconPlay width={16} height={16} /> {u.set.title} video</button>}
          {!teacher && tab === 'words' && <button className="btn primary sm" onClick={() => setTab('cards')}>Start learning <IconArrow width={16} height={16} /></button>}
        </div>
      </div>

      {tab === 'words' && (
        <>
          {!teacher && <div className="fc-counts big"><span className="n">{counts.n} New</span><span className="l">{counts.l} Learning</span><span className="r">{counts.r} Learned</span></div>}
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
        {prev ? <Link className="btn ghost" to={`/vocab/unit/${prev.id}`}>← Unit {prev.n}</Link> : <span />}
        {next && <Link className="btn soft" to={`/vocab/unit/${next.id}`}>Unit {next.n} →</Link>}
      </nav>
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
