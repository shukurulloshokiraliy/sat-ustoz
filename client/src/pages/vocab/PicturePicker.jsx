import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Modal, Spinner } from '../../components/ui.jsx';
import { IconSearch } from '../../components/icons.jsx';

/** Teacher: choose the picture for a word from openly licensed images (Openverse), or remove it. */
export default function PicturePicker({ w, onClose, onSaved }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = (text) => { setD(null); setErr(''); api.get(`/vocab/words/${w.id}/picture-options${text ? `?q=${encodeURIComponent(text)}` : ''}`).then((r) => { setD(r); setQ(r.q); }).catch((e) => setErr(e.message)); };
  useEffect(() => { load(''); }, [w.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = async (p) => { try { await api.post(`/vocab/words/${w.id}/picture`, p); toast('Picture saved'); onSaved(); } catch (e) { toast(e.message, 'bad'); } };
  const remove = async () => { try { await api.del(`/vocab/words/${w.id}/picture`); toast('Picture removed'); onSaved(); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <Modal title={`Picture for “${w.word}”`} onClose={onClose} wide footer={<><button className="btn ghost" onClick={remove}>No picture for this word</button><button className="btn primary" onClick={onClose}>Close</button></>}>
      <form className="row" style={{ gap: 8, marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); load(q); }}>
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words, e.g. ship journey" aria-label="Search pictures" />
        <button className="btn soft"><IconSearch width={16} height={16} /> Search</button>
      </form>
      <small className="muted">Openly licensed pictures from Openverse. The credit line is shown under the picture.</small>
      {err && <p className="bad-text" style={{ marginTop: 10 }}>{err}</p>}
      {!d && !err && <div style={{ padding: 30 }}><Spinner /></div>}
      {d && (d.results.length ? (
        <div className="pp-grid">{d.results.map((p) => <button key={p.url} className="pp-item" onClick={() => choose(p)} title={p.credit}><img src={p.url} alt="" loading="lazy" referrerPolicy="no-referrer" /></button>)}</div>
      ) : <p className="muted" style={{ marginTop: 12 }}>Nothing found. Try simpler words.</p>)}
    </Modal>
  );
}
