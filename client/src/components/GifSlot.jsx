import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, useToast } from '../context.jsx';
import { Modal } from './ui.jsx';
import { IconEdit, IconGif, IconLink, IconSearch, IconTrash } from './icons.jsx';

// quick searches the teacher can tap — popular English reaction memes that fit studying
const IDEAS = ['meme', 'mind blown', 'you got this', 'nailed it', 'facepalm', 'confused math lady', 'thinking', 'celebrate', 'study hard', 'plot twist', 'grammar', 'the office', 'spongebob', 'brain'];

/**
 * One GIF / meme / picture for vocabulary: a whole unit (kind="unit") or one word (kind="word", shown on its flashcard).
 * Students only see it when the teacher has set one; the teacher gets Add / Change / Remove in place.
 * `query` starts the GIPHY search with that text (the word itself).
 */
export default function GifSlot({ kind, refId, gif: initial, compact, query = '', label = 'Add a GIF or meme', onChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const teacher = user?.role === 'master';
  const [gif, setGif] = useState(initial || null);
  const [pick, setPick] = useState(false);
  const [broken, setBroken] = useState(false);
  useEffect(() => { setGif(initial || null); setBroken(false); }, [initial?.url, refId]); // eslint-disable-line react-hooks/exhaustive-deps

  if ((!gif || broken) && !teacher) return null;
  const remove = async () => {
    try { await api.del(`/gifs/${kind}/${refId}`); setGif(null); onChange?.(null); toast('GIF removed'); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <>
      {gif ? (
        <figure className={`gif-slot ${compact ? 'compact' : ''}`}>
          {broken ? <span className="gif-broken">This GIF could not load</span> : <img src={gif.url} alt={gif.title || 'GIF'} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} />}
          {gif.source === 'giphy' && <figcaption>via GIPHY</figcaption>}
          {teacher && (
            <span className="gif-tools">
              <button type="button" className="icon-btn" onClick={() => setPick(true)} aria-label="Change GIF" title="Change GIF"><IconEdit width={16} height={16} /></button>
              <button type="button" className="icon-btn" onClick={remove} aria-label="Remove GIF" title="Remove GIF"><IconTrash width={16} height={16} /></button>
            </span>
          )}
        </figure>
      ) : (
        <button type="button" className={`gif-add ${compact ? 'compact' : ''}`} onClick={() => setPick(true)}>
          <IconGif width={22} height={22} /> {label}
        </button>
      )}
      {pick && <GifPicker kind={kind} refId={refId} query={query} onClose={() => setPick(false)} onPicked={(g) => { setBroken(false); setGif(g); setPick(false); onChange?.(g); toast('GIF saved'); }} />}
    </>
  );
}

function GifPicker({ kind, refId, query = '', onClose, onPicked }) {
  const toast = useToast();
  const [tab, setTab] = useState('search');
  const [q, setQ] = useState(query);
  const [res, setRes] = useState({ items: [], next: null, loading: true, err: null, code: null });
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = async (query, offset = 0) => {
    const my = ++seq.current;
    setRes((r) => ({ ...r, loading: true, err: null, ...(offset ? {} : { items: [] }) }));
    try {
      const d = await api.get(`/gifs/search?q=${encodeURIComponent(query)}&offset=${offset}`);
      if (my !== seq.current) return;
      setRes((r) => ({ items: offset ? [...r.items, ...d.items] : d.items, next: d.next, loading: false, err: null, code: null }));
    } catch (e) {
      if (my !== seq.current) return;
      setRes({ items: [], next: null, loading: false, err: e.message, code: e.data?.code || e.code || null });
    }
  };
  useEffect(() => { const t = setTimeout(() => load(q.trim()), q ? 400 : 0); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (body) => {
    setBusy(true);
    try { onPicked(await api.put(`/gifs/${kind}/${refId}`, body)); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const noKey = res.code === 'giphy_missing' || res.code === 'giphy_key' || /GIPHY API key|rejected the API key/.test(res.err || '');

  return (
    <Modal wide onClose={onClose} title="Add a GIF or meme">
      <div className="seg gif-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'search'} className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}><IconSearch width={16} height={16} /> Search GIPHY</button>
        <button role="tab" aria-selected={tab === 'link'} className={tab === 'link' ? 'on' : ''} onClick={() => setTab('link')}><IconLink width={16} height={16} /> Paste a link</button>
      </div>

      {tab === 'search' ? (
        <div className="stack" style={{ gap: 12 }}>
          <div className="gif-search">
            <IconSearch width={18} height={18} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memes: “mind blown”, “nailed it”…" maxLength={60} />
          </div>
          <div className="gif-ideas">{IDEAS.map((x) => <button key={x} type="button" className={`chip ${q === x ? 'primary' : ''}`} onClick={() => setQ(x)}>{x}</button>)}</div>
          {noKey ? (
            <div className="banner">
              <span className="item-ic"><IconGif /></span>
              <div className="grow"><b>GIPHY search is not connected yet</b><small>Add a free GIPHY API key in Settings → GIFs. Until then, paste a GIF link here.</small></div>
              <Link className="btn primary sm" to="/settings" onClick={onClose}>Open Settings</Link>
            </div>
          ) : res.err ? <p className="error-box">{res.err}</p> : null}
          {!noKey && (
            <>
              <div className="gif-grid" aria-busy={res.loading}>
                {res.items.map((g) => (
                  <button key={g.id} type="button" className="gif-cell" disabled={busy} onClick={() => save({ url: g.url, title: g.title, from: 'giphy' })} title={g.title}>
                    <img src={g.preview} alt={g.title || 'GIF'} loading="lazy" width={g.w} height={g.h} referrerPolicy="no-referrer" />
                  </button>
                ))}
                {res.loading && Array.from({ length: res.items.length ? 4 : 12 }, (_, i) => <span key={`s${i}`} className="gif-cell skel" style={{ height: 90 + ((i * 37) % 70) }} />)}
              </div>
              {!res.loading && !res.items.length && !res.err && <p className="muted center">Nothing found — try another word.</p>}
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <img className="giphy-attr" src="https://giphy.com/static/img/poweredby_giphy.png" alt="Powered by GIPHY" height={18} referrerPolicy="no-referrer" />
                {res.next != null && !res.loading && <button className="btn ghost sm" onClick={() => load(q.trim(), res.next)}>Load more</button>}
              </div>
            </>
          )}
        </div>
      ) : (
        <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); if (link.trim()) save({ url: link.trim() }); }}>
          <label className="field">
            <span>GIF link</span>
            <input autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://giphy.com/gifs/…  or  https://media.tenor.com/….gif" />
          </label>
          <small className="muted">Works with GIPHY pages, Tenor image addresses (right-click the GIF → Copy image address) and any https link ending in .gif or .webp.</small>
          {/^https:\/\/\S+\.(gif|webp|png|jpe?g)(\?|$)/i.test(link) && <img className="gif-preview" src={link} alt="Preview" referrerPolicy="no-referrer" />}
          <div><button className="btn primary" disabled={busy || !link.trim()}>Save GIF</button></div>
        </form>
      )}
    </Modal>
  );
}
