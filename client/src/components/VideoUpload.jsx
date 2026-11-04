import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../context.jsx';
import { IconUpload } from './icons.jsx';

/**
 * Teacher: upload an MP4 straight from the browser to Bunny Stream (TUS, resumable).
 * The server creates the video and signs the upload; on success the lesson keeps `bunny:<id>`.
 */
export default function VideoUpload({ title, onDone }) {
  const toast = useToast();
  const input = useRef(null);
  const [pct, setPct] = useState(null);
  const [state, setState] = useState('');
  const [paused, setPaused] = useState(false);
  const up = useRef(null);
  // after the upload: poll Bunny until the video is transcoded (uploading → processing → ready, or a readable error)
  const watch = async (id) => {
    for (let k = 0; k < 120; k++) {
      await new Promise((r) => setTimeout(r, k ? 10000 : 3000));
      try {
        const v = await api.get(`/videos/${id}`);
        if (v.failed) { setState('Bunny could not process this video. Try another MP4 (H.264) file.'); return; }
        if (v.ready) { setState(`Ready to watch${v.length ? ` · ${Math.round(v.length / 60)} min` : ''}.`); return; }
        setState(`Processing on Bunny… ${v.progress || 0}% (you can keep working)`);
      } catch { /* keep waiting */ }
    }
  };

  const start = async (file) => {
    if (!file) return;
    if (!/^video\//.test(file.type)) { toast('Choose a video file (MP4)', 'bad'); return; }
    try {
      setPct(0); setState('Preparing…');
      const s = await api.post('/videos/upload', { title: title || file.name });
      const { Upload } = await import('tus-js-client');
      await new Promise((resolve, reject) => {
        up.current = new Upload(file, {
          endpoint: 'https://video.bunnycdn.com/tusupload',
          retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
          headers: { AuthorizationSignature: s.signature, AuthorizationExpire: String(s.expire), VideoId: s.videoId, LibraryId: String(s.libraryId) },
          metadata: { filetype: file.type, title: title || file.name },
          onProgress: (sent, total) => { setPct(Math.round((sent / total) * 100)); setState('Uploading…'); },
          onSuccess: resolve,
          onError: reject,
        });
        up.current.findPreviousUploads().then((prev) => { if (prev.length) up.current.resumeFromPreviousUpload(prev[0]); up.current.start(); });
      });
      setState('Uploaded. Processing on Bunny…');
      onDone(s.url);
      toast('Video uploaded — save the step');
      watch(s.videoId);
    } catch (e) {
      setState(''); setPct(null);
      toast(e.message || 'Upload failed', 'bad');
    }
  };

  return (
    <div className="vup">
      <input ref={input} type="file" accept="video/mp4,video/*" hidden onChange={(e) => { start(e.target.files?.[0]); e.target.value = ''; }} />
      {pct == null || pct >= 100
        ? <button type="button" className="btn soft sm" onClick={() => input.current?.click()}><IconUpload width={15} height={15} /> Upload MP4</button>
        : <span className="row" style={{ gap: 6 }}>
            <button type="button" className="btn ghost sm" onClick={() => { if (paused) { up.current?.start(); setPaused(false); setState('Uploading…'); } else { up.current?.abort(); setPaused(true); setState('Paused'); } }}>{paused ? 'Resume' : 'Pause'}</button>
            <button type="button" className="btn ghost sm" onClick={() => { up.current?.abort(true); setPct(null); setState(''); setPaused(false); }}>Cancel</button>
          </span>}
      {pct != null && <div className="vup-bar"><i style={{ width: `${pct}%` }} /></div>}
      {state && <small className="muted">{state}{pct != null && pct < 100 && /Upload|Paused/.test(state) ? ` ${pct}%` : ''}</small>}
    </div>
  );
}
