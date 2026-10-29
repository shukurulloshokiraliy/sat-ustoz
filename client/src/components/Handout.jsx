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
  return URL.createObjectURL(await res.blob());
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
  const upload = async (file) => {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    setBusy(true);
    try { const s = await api.upload(`/roadmap/steps/${stepId}/handout`, form); onChange(s.handout); toast('Rules sheet saved'); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
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
        <small>{h ? `${meta(h)} · ${h.src === 'bundled' ? 'bundled with the course' : 'uploaded by you'}` : 'Optional. Students can open or download it from this step and its lessons.'}</small>
      </div>
      <input ref={ref} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn soft sm" disabled={busy} onClick={() => ref.current?.click()}><IconUpload width={15} height={15} /> {h ? 'Replace' : 'Upload PDF'}</button>
        {h && <button type="button" className="icon-sm danger" aria-label="Remove rules sheet" disabled={busy} onClick={remove}><IconTrash width={15} height={15} /></button>}
      </div>
    </div>
  );
}
