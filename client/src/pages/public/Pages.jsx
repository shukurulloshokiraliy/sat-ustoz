import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context.jsx';
import { Spinner } from '../../components/ui.jsx';
import { IconArrow, IconInstagram, IconTelegram } from '../../components/icons.jsx';
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

/** About the platform + the founder (teacher edits it in Website → About & founder). */
export function AboutPage() {
  const { site } = useSite();
  const { user } = useAuth();
  if (!site) return <div className="pub-wrap"><Spinner /></div>;
  const a = site.about;
  const c = site.counts;
  return (
    <div className="ab">
      <section className="ab-top">
        <div className="ab-top-in">
          <div className="ab-copy">
            <small className="eyebrow">ABOUT SAT USTOZ</small>
            <h1>{a.title}</h1>
            <p className="lead">{a.intro}</p>
            <div className="row wrap" style={{ gap: 10 }}>
              <Link className="btn sun lg" to="/practice">Take a free test</Link>
              {!user && <Link className="btn on-dark lg" to="/signup">Start free trial</Link>}
            </div>
          </div>
          <div className="ab-portrait">
            <Avatar a={a} />
            <span className="ab-badge b1">🎓 {a.founder_role}</span>
            <span className="ab-badge b2">📚 SAT Reading &amp; Writing</span>
          </div>
        </div>
      </section>

      <div className="pub-wrap" style={{ paddingTop: 0 }}>
        <div className="ab-stats">
          <div><b>{c.questions}+</b><span>original questions</span></div>
          <div><b>{c.skills}</b><span>SAT skills covered</span></div>
          <div><b>{site.practice.test_size}</b><span>questions per test</span></div>
          <div><b>200 → 800</b><span>step-by-step roadmap</span></div>
        </div>
      </div>

      {a.points?.length > 0 && (
        <section className="pub-wrap">
          <h2 className="pub-h2">Why SAT Ustoz</h2>
          <div className="pub-features">
            {a.points.map((pt, i) => <div key={i} className="pub-feature"><span className="em">{pt.emoji}</span><b>{pt.title}</b><p>{pt.text}</p></div>)}
          </div>
        </section>
      )}

      <section className="pub-wrap">
        <h2 className="pub-h2">Founder</h2>
        <FounderCard a={a} big />
      </section>

      {site.home?.steps?.length > 0 && (
        <section className="pub-wrap">
          <h2 className="pub-h2">How it works</h2>
          <div className="ab-steps">
            {site.home.steps.map((st, i) => <div key={i}><span>{i + 1}</span><b>{st.title}</b><p>{st.text}</p></div>)}
          </div>
        </section>
      )}

      <section className="pub-final">
        <h2>Start with one test</h2>
        <p>{site.practice.test_size} questions, {site.practice.minutes} minutes, a score estimate — free and without sign-up.</p>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <Link className="btn pill-cta" to="/practice">Take a practice test</Link>
          {!user && <Link className="btn on-dark lg" to="/signup">Start free trial</Link>}
        </div>
      </section>
    </div>
  );
}

function Avatar({ a, size }) {
  const initials = String(a.founder_name || 'U').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="founder-photo" style={size ? { width: size } : undefined}>
      <i className="orbit" aria-hidden="true" />
      <div className="disc">{a.photo_url ? <img src={a.photo_url} alt={a.founder_name} loading="lazy" /> : <span>{initials}</span>}</div>
    </div>
  );
}

export function FounderCard({ a, big = false }) {
  return (
    <div className={`founder ${big ? 'big' : ''}`}>
      <Avatar a={a} />
      <div className="founder-text">
        <small>{a.founder_role}</small>
        <h3>{a.founder_name}</h3>
        <p>{a.founder_bio}</p>
        <div className="row wrap" style={{ gap: 10 }}>
          {a.instagram && <a className="soc ig" href={a.instagram} target="_blank" rel="noreferrer"><IconInstagram width={18} height={18} /> Instagram</a>}
          {a.telegram && <a className="soc tg" href={a.telegram} target="_blank" rel="noreferrer"><IconTelegram width={18} height={18} /> Telegram</a>}
          {!big && <Link className="soc more" to="/about">About the platform →</Link>}
        </div>
      </div>
    </div>
  );
}
