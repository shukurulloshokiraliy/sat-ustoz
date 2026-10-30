import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { rich } from '../../components/Rich.jsx';

/** Public site content (home texts, menu sections, pages, counts). Loaded once per page load. */
let sitePromise;
export const loadSite = (fresh = false) => {
  if (fresh || !sitePromise) sitePromise = api.get('/public/site').catch((e) => { sitePromise = null; throw e; });
  return sitePromise;
};
export function useSite() {
  const [site, setSite] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { loadSite().then(setSite).catch(setErr); }, []);
  return { site, err };
}

/** A new random seed per visit to the practice page → a new 40% slice of the bank every time. */
export const newSeed = () => Math.random().toString(36).slice(2, 12);

const ytId = (u) => String(u || '').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/)?.[1];
export function Video({ url }) {
  const id = ytId(url);
  if (!url) return null;
  if (id) return <div className="pub-video"><iframe src={`https://www.youtube-nocookie.com/embed/${id}`} title="Video" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen /></div>;
  return <a className="btn soft" href={url} target="_blank" rel="noreferrer">▶ Watch the video</a>;
}

/** Tiny markdown for teacher pages: ## / ### headings, "- " lists, "1. " lists, paragraphs, **bold**, *italic*. */
export function Markdown({ text }) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n{2,}/).filter((b) => b.trim());
  return (
    <div className="md">
      {blocks.map((b, i) => {
        const t = b.trim();
        if (t.startsWith('### ')) return <h3 key={i}>{rich(t.slice(4))}</h3>;
        if (t.startsWith('## ')) return <h2 key={i}>{rich(t.slice(3))}</h2>;
        if (t.startsWith('# ')) return <h2 key={i}>{rich(t.slice(2))}</h2>;
        const lines = t.split('\n');
        if (lines.every((l) => /^[-*] /.test(l))) return <ul key={i}>{lines.map((l, k) => <li key={k}>{rich(l.slice(2))}</li>)}</ul>;
        if (lines.every((l) => /^\d+[.)] /.test(l))) return <ol key={i}>{lines.map((l, k) => <li key={k}>{rich(l.replace(/^\d+[.)] /, ''))}</li>)}</ol>;
        if (t.startsWith('> ')) return <blockquote key={i}>{rich(t.replace(/^> ?/gm, ''))}</blockquote>;
        return <p key={i}>{lines.map((l, k) => <span key={k}>{k > 0 && <br />}{rich(l)}</span>)}</p>;
      })}
    </div>
  );
}
