import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api.js';
import { useToast } from '../context.jsx';
import { IconDoc, IconDownload, IconLock, IconTrash, IconUpload } from './icons.jsx';

const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const meta = (h) => ['PDF', h.pages && `${h.pages} pages`, h.size && mb(h.size)].filter(Boolean).join(' · ');

async function fetchPdf(stepId) {
  const res = await fetch(`/api/roadmap/steps/${stepId}/handout`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw Object.assign(new Error(j.error || 'Could not open the rules sheet'), { status: res.status });
  }
  const parts = Number(res.headers.get('X-Parts') || 1);
  const blobs = [await res.blob()];
  for (let p = 1; p < parts; p++) {
    const r = await fetch(`/api/roadmap/steps/${stepId}/handout?part=${p}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!r.ok) throw new Error('Could not open the rules sheet');
    blobs.push(await r.blob());
  }
  return URL.createObjectURL(new Blob(blobs, { type: 'application/pdf' }));
}

/** Rules sheet (PDF) of a roadmap step: open in a new tab or download. */
export function HandoutRow({ stepId, h, locked }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!h) return null;
  const open = async (download) => {
    // open the tab synchronously so the browser does not block it as a pop-up
    const w = download ? null : window.open('', '_blank');
    setBusy(true);
    try {
      const url = await fetchPdf(stepId);
      if (download) { const a = document.createElement('a'); a.href = url; a.download = h.name; a.click(); }
      else if (w) w.location.href = url; else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { w?.close(); toast(e.message, 'bad'); }
    finally { setBusy(false); }
  };
  return (
    <div className="handout">
      <span className="handout-ic"><IconDoc /></span>
      <div className="grow" style={{ minWidth: 0 }}>
        <b>{h.title}</b>
        <small>{meta(h)} · every rule of this part on one sheet</small>
      </div>
      {locked
        ? <Link className="btn soft sm" to="/subscribe"><IconLock width={15} height={15} /> Subscribe</Link>
        : <div className="row" style={{ gap: 6 }}>
            <button className="btn primary sm" disabled={busy} onClick={() => open(false)}>Open</button>
            <button className="icon-sm" aria-label="Download PDF" title="Download PDF" disabled={busy} onClick={() => open(true)}><IconDownload width={16} height={16} /></button>
          </div>}
    </div>
  );
}

/** Teacher: upload, replace or remove the rules sheet of a step. */
export function HandoutEditor({ stepId, h, onChange }) {
  const toast = useToast();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(null);
  const upload = async (file) => {
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') { toast('Choose a PDF file', 'bad'); return; }
    if (file.size > 25 * 1024 * 1024) { toast(`This PDF is ${(file.size / 1048576).toFixed(1)} MB — the limit is 25 MB. Compress it first (e.g. ilovepdf.com → Compress PDF).`, 'bad'); if (ref.current) ref.current.value = ''; return; }
    setBusy(true);
    try {
      // sent in 3 MB pieces with a progress bar, so big PDFs never hit the hosting request limit
      const CH = 3 * 1024 * 1024; const n = Math.ceil(file.size / CH) || 1;
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      let s;
      for (let i = 0; i < n; i++) {
        setPct(Math.round((i / n) * 100));
        const r = await fetch(`/api/roadmap/steps/${stepId}/handout/chunk?upload=${id}&i=${i}&n=${n}&name=${encodeURIComponent(file.name)}`,
          { method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/octet-stream' }, body: file.slice(i * CH, (i + 1) * CH) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Upload failed (${r.status})`);
        s = d;
      }
      setPct(null);
      onChange(s.handout); toast('Rules sheet saved');
    } catch (e) { setPct(null); toast(e.message, 'bad'); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.del(`/roadmap/steps/${stepId}/handout`); onChange(null); toast('Rules sheet removed'); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <div className="handout edit">
      <span className="handout-ic"><IconDoc /></span>
      <div className="grow" style={{ minWidth: 0 }}>
        <b>{h ? h.title : 'Rules sheet (PDF)'}</b>
        <small>{pct != null ? `Uploading… ${pct}%` : h ? `${meta(h)} · ${h.src === 'bundled' ? 'bundled with the course' : 'uploaded by you'}` : 'Optional, up to 25 MB. Students can open or download it from this step and its lessons.'}</small>
        {pct != null && <div className="vup-bar"><i style={{ width: `${pct}%` }} /></div>}
      </div>
      <input ref={ref} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn soft sm" disabled={busy} onClick={() => ref.current?.click()}><IconUpload width={15} height={15} /> {h ? 'Replace' : 'Upload PDF'}</button>
        {h && <button type="button" className="icon-sm danger" aria-label="Remove rules sheet" disabled={busy} onClick={remove}><IconTrash width={15} height={15} /></button>}
      </div>
    </div>
  );
}
