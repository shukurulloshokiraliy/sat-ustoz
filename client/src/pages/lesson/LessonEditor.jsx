import { useEffect, useRef, useState } from 'react';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Modal } from '../../components/ui.jsx';
import { IconPlus, IconTrash } from '../../components/icons.jsx';

/**
 * Teacher: edit a lesson's notes in place — headings, paragraphs, tables, lists, examples, traps, tips, Uzbek notes.
 * Save once and every student sees the new text on their next page load. Each save is kept in History.
 * Text formatting inside any field: **bold**, *italic*, ~~crossed out~~.
 */
export const BLOCKS = [
  ['h', 'Heading'], ['p', 'Paragraph'], ['table', 'Table'], ['list', 'Bullet list'], ['steps', 'Numbered steps'],
  ['examples', 'Examples'], ['trap', 'SAT trap'], ['tip', 'Ustoz tip'], ['uz', 'Uzbek note'], ['source', 'Source line'],
];
const NAME = Object.fromEntries(BLOCKS);
const TEXTY = ['h', 'p', 'tip', 'uz', 'source', 'trap'];
let seq = 0;
const key = () => `b${++seq}`;
const blank = (type) => ({
  table: { type, columns: ['Column 1', 'Column 2'], rows: [['', '']] },
  list: { type, items: [''] }, steps: { type, items: [''] },
  examples: { type, rows: [['', '']] },
  trap: { type, title: 'SAT trap: ', text: '' },
}[type] || { type, text: '' });
const withKeys = (list) => (list || []).map((b) => ({ ...JSON.parse(JSON.stringify(b)), _k: key() }));
const strip = (list) => list.map(({ _k, ...b }) => b);

/** A textarea that grows with its text. */
function Grow({ value, onChange, className = '', ...rest }) {
  const ref = useRef(null);
  useEffect(() => { const t = ref.current; if (t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + (t.offsetHeight - t.clientHeight)}px`; } }, [value]);
  return <textarea ref={ref} rows={1} className={`le-text ${className}`} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export default function LessonEditor({ l, Block, onClose, onSaved }) {
  const toast = useToast();
  const [title, setTitle] = useState(l.title);
  const [blocks, setBlocks] = useState(() => withKeys(l.written));
  const [sources, setSources] = useState((l.sources || []).join('\n'));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState(false);
  const [adding, setAdding] = useState(null); // index to insert at

  // keep the Save bar above the phone tab bar (the teacher's bar can wrap to two rows)
  const [barGap, setBarGap] = useState(10);
  useEffect(() => {
    const fit = () => { const t = document.querySelector('.tabbar'); setBarGap(t && getComputedStyle(t).display !== 'none' ? t.offsetHeight + 8 : 10); };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const touch = (fn) => { setBlocks((bs) => fn(bs.slice())); setDirty(true); };
  const set = (i, patch) => touch((bs) => { bs[i] = { ...bs[i], ...patch }; return bs; });
  const move = (i, d) => touch((bs) => { const j = i + d; if (j < 0 || j >= bs.length) return bs; [bs[i], bs[j]] = [bs[j], bs[i]]; return bs; });
  const remove = (i) => touch((bs) => { bs.splice(i, 1); return bs; });
  const insert = (i, type) => { touch((bs) => { bs.splice(i, 0, { ...blank(type), _k: key() }); return bs; }); setAdding(null); };
  const retype = (i, type) => touch((bs) => {
    const b = bs[i];
    if (TEXTY.includes(type) && TEXTY.includes(b.type)) bs[i] = { ...b, type, ...(type === 'trap' && !b.title ? { title: 'SAT trap' } : {}) };
    else if (['list', 'steps'].includes(type) && ['list', 'steps'].includes(b.type)) bs[i] = { ...b, type };
    return bs;
  });

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/lessons/${l.id}/content`, { title: title.trim(), written: strip(blocks), sources: sources.split('\n').map((x) => x.trim()).filter(Boolean) });
      toast('Saved. Every student sees the new version now.');
      setDirty(false); onSaved();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const cancel = () => { if (!dirty || window.confirm('Close without saving your changes?')) onClose(); };
  const restore = (v) => { setTitle(v.title || l.title); setBlocks(withKeys(v.written)); setSources((v.sources || []).join('\n')); setDirty(true); setHistory(false); toast('Loaded that version. Press Save to publish it.'); };

  const AddMenu = ({ at }) => (adding === at ? (
    <div className="le-add-menu" role="menu">
      {BLOCKS.map(([t, n]) => <button key={t} type="button" role="menuitem" onClick={() => insert(at, t)}>{n}</button>)}
      <button type="button" className="muted" onClick={() => setAdding(null)}>Cancel</button>
    </div>
  ) : (
    <button type="button" className="le-add" onClick={() => setAdding(at)} aria-label="Add a block here"><IconPlus width={14} height={14} /> Add block</button>
  ));

  return (
    <section className="le" aria-label="Edit lesson">
      <div className="le-head">
        <div className="grow">
          <b>Editing this lesson</b>
          <small className="muted">Changes are saved for every student at once. Formatting: **bold**, *italic*, ~~crossed out~~.</small>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <button type="button" className="btn ghost sm" onClick={() => setHistory(true)}>History</button>
          <button type="button" className={`btn sm ${preview ? 'primary' : 'soft'}`} onClick={() => setPreview((p) => !p)}>{preview ? 'Back to editing' : 'Preview'}</button>
        </div>
      </div>

      {preview ? (
        <article className="notes le-preview">
          <h2 className="n-h">{title.replace(/^Lesson \d+:\s*/, '')}</h2>
          {strip(blocks).map((b, i) => <Block key={i} b={b} />)}
        </article>
      ) : (
        <div className="le-body">
          <label className="le-title"><span>Lesson title</span><input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} maxLength={160} /></label>
          <AddMenu at={0} />
          {blocks.map((b, i) => (
            <div key={b._k}>
              <div className={`le-block t-${b.type}`}>
                <div className="le-bar">
                  {TEXTY.includes(b.type) || ['list', 'steps'].includes(b.type) ? (
                    <select value={b.type} onChange={(e) => retype(i, e.target.value)} aria-label="Block type">
                      {BLOCKS.filter(([t]) => (TEXTY.includes(b.type) ? TEXTY.includes(t) : ['list', 'steps'].includes(t))).map(([t, n]) => <option key={t} value={t}>{n}</option>)}
                    </select>
                  ) : <span className="le-type">{NAME[b.type] || b.type}</span>}
                  <span className="grow" />
                  <button type="button" className="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
                  <button type="button" className="icon-sm" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Move down" title="Move down">↓</button>
                  <button type="button" className="icon-sm danger" onClick={() => remove(i)} aria-label="Delete block" title="Delete block"><IconTrash width={15} height={15} /></button>
                </div>
                <BlockFields b={b} set={(patch) => set(i, patch)} />
              </div>
              <AddMenu at={i + 1} />
            </div>
          ))}
          <label className="le-title"><span>Sources (one per line, optional)</span><Grow value={sources} onChange={(v) => { setSources(v); setDirty(true); }} /></label>
        </div>
      )}

      <div className="le-save" style={{ bottom: barGap }}>
        <span className="muted">{dirty ? 'Unsaved changes' : l.edited ? `Last saved by ${l.edited.by || 'teacher'} · ${fmtDate(l.edited.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'No changes yet'}</span>
        <span className="grow" />
        <button type="button" className="btn ghost" onClick={cancel}>Close</button>
        <button type="button" className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : <><span className="le-long">Save for all students</span><span className="le-short">Save</span></>}</button>
      </div>

      {history && <History id={l.id} onClose={() => setHistory(false)} onPick={restore} />}
    </section>
  );
}

function BlockFields({ b, set }) {
  switch (b.type) {
    case 'h': return <Grow className="h" value={b.text} onChange={(text) => set({ text })} placeholder="Heading" />;
    case 'trap': return <><input className="le-in b" value={b.title} onChange={(e) => set({ title: e.target.value })} placeholder="SAT trap: …" /><Grow value={b.text} onChange={(text) => set({ text })} placeholder="What the trap is and how to avoid it" /></>;
    case 'list': case 'steps': return (
      <div className="le-items">
        {b.items.map((x, j) => (
          <div key={j} className="le-item">
            <span className="le-bullet">{b.type === 'steps' ? `${j + 1}.` : '•'}</span>
            <Grow value={x} onChange={(v) => set({ items: b.items.map((y, k) => (k === j ? v : y)) })} placeholder={b.type === 'steps' ? 'Step' : 'Point'} />
            <button type="button" className="icon-sm" onClick={() => set({ items: b.items.filter((_, k) => k !== j) })} aria-label="Remove line"><IconTrash width={14} height={14} /></button>
          </div>
        ))}
        <button type="button" className="btn ghost sm" onClick={() => set({ items: [...b.items, ''] })}><IconPlus width={14} height={14} /> Add line</button>
      </div>
    );
    case 'examples': return (
      <div className="le-items">
        {b.rows.map(([ex, note], j) => (
          <div key={j} className="le-ex">
            <Grow value={ex} onChange={(v) => set({ rows: b.rows.map((r, k) => (k === j ? [v, r[1]] : r)) })} placeholder="Example sentence" />
            <Grow value={note} onChange={(v) => set({ rows: b.rows.map((r, k) => (k === j ? [r[0], v] : r)) })} placeholder="Why / what to notice" />
            <button type="button" className="icon-sm" onClick={() => set({ rows: b.rows.filter((_, k) => k !== j) })} aria-label="Remove example"><IconTrash width={14} height={14} /></button>
          </div>
        ))}
        <button type="button" className="btn ghost sm" onClick={() => set({ rows: [...b.rows, ['', '']] })}><IconPlus width={14} height={14} /> Add example</button>
      </div>
    );
    case 'table': return <TableFields b={b} set={set} />;
    default: return <Grow value={b.text} onChange={(text) => set({ text })} placeholder={b.type === 'uz' ? 'O‘zbekcha izoh' : 'Text'} />;
  }
}

function TableFields({ b, set }) {
  const cols = b.columns.length;
  const cell = (i, j, v) => set({ rows: b.rows.map((r, k) => (k === i ? r.map((c, m) => (m === j ? v : c)) : r)) });
  return (
    <div className="le-table-wrap">
      <table className="le-table">
        <thead>
          <tr>
            {b.columns.map((c, j) => (
              <th key={j}>
                <Grow value={c} onChange={(v) => set({ columns: b.columns.map((x, m) => (m === j ? v : x)) })} placeholder="Column" />
                {cols > 1 && <button type="button" className="le-x" onClick={() => set({ columns: b.columns.filter((_, m) => m !== j), rows: b.rows.map((r) => r.filter((_, m) => m !== j)) })} aria-label="Remove column" title="Remove column">×</button>}
              </th>
            ))}
            <th className="le-tool"><button type="button" className="icon-sm" onClick={() => set({ columns: [...b.columns, `Column ${cols + 1}`], rows: b.rows.map((r) => [...r, '']) })} aria-label="Add column" title="Add column"><IconPlus width={14} height={14} /></button></th>
          </tr>
        </thead>
        <tbody>
          {b.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => <td key={j}><Grow value={c} onChange={(v) => cell(i, j, v)} /></td>)}
              <td className="le-tool"><button type="button" className="icon-sm" onClick={() => set({ rows: b.rows.filter((_, k) => k !== i) })} aria-label="Remove row" title="Remove row"><IconTrash width={14} height={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn ghost sm" onClick={() => set({ rows: [...b.rows, b.columns.map(() => '')] })}><IconPlus width={14} height={14} /> Add row</button>
    </div>
  );
}

function History({ id, onClose, onPick }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get(`/lessons/${id}/content/history`).then(setList).catch((e) => setErr(e.message)); }, [id]);
  return (
    <Modal title="Lesson history" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>Every saved version of this lesson. Opening one puts it in the editor; nothing changes for students until you press Save.</p>
      {err ? <p className="error-box">{err}</p> : !list ? <p className="muted">Loading…</p> : !list.length ? <p className="muted">No saved versions yet. The first save also keeps the original text here.</p> : (
        <div className="le-hist">
          {list.map((v) => (
            <div key={v.id} className="le-hist-row">
              <span className="grow"><b>{v.note === 'Original' ? 'Original text' : fmtDate(v.saved_at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</b>
                <small className="muted">{v.note === 'Original' ? 'as it was before any edits' : `${v.saved_by || 'Teacher'} · ${v.written.length} blocks`}</small></span>
              <button type="button" className="btn soft sm" onClick={() => onPick(v)}>Open</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
