import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context.jsx';
import { Spinner } from '../../components/ui.jsx';
import { IconArrow } from '../../components/icons.jsx';
import { Markdown, Video, useSite } from './site.jsx';

/** A menu section (Guides, Courses…): cards of its pages. */
export function SectionPage() {
  const { id } = useParams();
  const { site } = useSite();
  if (!site) return <div className="pub-wrap"><Spinner /></div>;
  const sec = site.sections.find((s) => s.id === id);
  const pages = site.pages.filter((p) => p.section === id);
  if (!sec) return <NotFound />;
  return (
    <div className="pub-wrap pub-page">
      <small className="eyebrow">SAT USTOZ</small>
      <h1 className="pub-h2" style={{ textAlign: 'left' }}>{sec.label}</h1>
      {!pages.length ? <p className="muted">Nothing here yet — check back soon.</p> : (
        <div className="pub-cards">
          {pages.map((p) => (
            <Link key={p.slug} to={`/p/${p.slug}`} className="pub-card">
              <span className="em">{p.emoji || '📘'}</span>
              <b>{p.title}</b>
              {p.summary && <p>{p.summary}</p>}
              <em>Read <IconArrow width={14} height={14} /></em>
            </Link>
          ))}
        </div>
      )}
      <Cta />
    </div>
  );
}

/** One page written by the teacher. */
export function PageView() {
  const { slug } = useParams();
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  const { site } = useSite();
  useEffect(() => { setP(null); setErr(null); api.get(`/public/pages/${encodeURIComponent(slug)}`).then(setP).catch(setErr); }, [slug]);
  if (err) return <NotFound />;
  if (!p) return <div className="pub-wrap"><Spinner /></div>;
  const sec = site?.sections.find((s) => s.id === p.section);
  const more = (site?.pages || []).filter((x) => x.section === p.section && x.slug !== p.slug).slice(0, 3);
  return (
    <article className="pub-wrap pub-page pub-article">
      {sec && <Link to={`/s/${sec.id}`} className="eyebrow">← {sec.label}</Link>}
      <h1>{p.emoji && <span className="em">{p.emoji}</span>} {p.title}</h1>
      {p.summary && <p className="lead">{p.summary}</p>}
      <Video url={p.video_url} />
      <Markdown text={p.body} />
      <Cta />
      {more.length > 0 && (
        <>
          <h2 className="pub-h3">Read next</h2>
          <div className="pub-cards">
            {more.map((x) => <Link key={x.slug} to={`/p/${x.slug}`} className="pub-card"><span className="em">{x.emoji || '📘'}</span><b>{x.title}</b>{x.summary && <p>{x.summary}</p>}</Link>)}
          </div>
        </>
      )}
    </article>
  );
}

function Cta() {
  const { user } = useAuth();
  return (
    <div className="pt-nudge" style={{ marginTop: 28 }}>
      <b>📝 Try it on real questions</b>
      <span>A free 27-question practice test with a score estimate — no sign-up.</span>
      <div className="row wrap" style={{ gap: 8 }}>
        <Link className="btn sun" to="/practice">Take a practice test</Link>
        {!user && <Link className="btn ghost" to="/signup">Start free trial</Link>}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="pub-wrap pub-page center" style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
      <h1>Page not found</h1>
      <Link className="btn sun" to="/">Back to home</Link>
    </div>
  );
}
