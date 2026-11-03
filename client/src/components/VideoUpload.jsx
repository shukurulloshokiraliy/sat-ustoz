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
  const up = useRef(null);

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
      setState('Uploaded. Bunny is preparing the video (a few minutes).');
      onDone(s.url);
      toast('Video uploaded — save the step');
    } catch (e) {
      setState(''); setPct(null);
      toast(e.message || 'Upload failed', 'bad');
    }
  };

  return (
    <div className="vup">
      <input ref={input} type="file" accept="video/mp4,video/*" hidden onChange={(e) => { start(e.target.files?.[0]); e.target.value = ''; }} />
      {pct == null || state.startsWith('Uploaded')
        ? <button type="button" className="btn soft sm" onClick={() => input.current?.click()}><IconUpload width={15} height={15} /> Upload MP4</button>
        : <button type="button" className="btn ghost sm" onClick={() => { up.current?.abort(); setPct(null); setState(''); }}>Cancel</button>}
      {pct != null && <div className="vup-bar"><i style={{ width: `${pct}%` }} /></div>}
      {state && <small className="muted">{state}{pct != null && !state.startsWith('Uploaded') ? ` ${pct}%` : ''}</small>}
    </div>
  );
}
