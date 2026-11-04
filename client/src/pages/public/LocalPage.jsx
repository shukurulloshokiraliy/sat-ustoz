import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconArrow } from '../../components/icons.jsx';
import { localByPath, LOCAL_PAGES } from './localContent.js';
import Landing from './Landing.jsx';

/** Uzbek / Russian pages (same text as the prerendered HTML search engines read). */
export default function LocalPage() {
  const { pathname } = useLocation();
  const pg = localByPath(pathname);
  useEffect(() => {
    if (!pg) return undefined;
    const prev = document.documentElement.lang; const prevTitle = document.title;
    document.documentElement.lang = pg.lang; document.title = pg.title;
    return () => { document.documentElement.lang = prev || 'en'; document.title = prevTitle; };
  }, [pg]);
  if (!pg) return <Landing />;
  const more = LOCAL_PAGES.filter((x) => x.article && x.lang === pg.lang && x.path !== pg.path);
  const home = pg.lang === 'ru' ? '/ru' : '/uz';
  return (
    <article className="pub-wrap pub-page pub-article lp" lang={pg.lang}>
      <div className="lp-langs" aria-label="Language">
        <Link to="/" className={pg.lang === 'en' ? 'on' : ''}>English</Link>
        <Link to="/uz" className={pg.lang === 'uz' ? 'on' : ''}>O‘zbekcha</Link>
        <Link to="/ru" className={pg.lang === 'ru' ? 'on' : ''}>Русский</Link>
      </div>
      {pg.article ? <Link to={home} className="eyebrow">← SAT Ustoz</Link> : <small className="eyebrow">{pg.eyebrow}</small>}
      <h1>{pg.h1}</h1>
      <p className="lead">{pg.lead}</p>
      {pg.cta && (
        <div className="row wrap" style={{ gap: 10, margin: '6px 0 18px' }}>
          {pg.cta.map(([to, label], i) => <Link key={to} to={to} className={`btn ${i ? 'ghost' : 'primary'} lg`}>{label}{!i && <IconArrow width={18} height={18} />}</Link>)}
        </div>
      )}
      {pg.sections.map((s) => (
        <section key={s.h2}>
          <h2>{s.h2}</h2>
          {/* our own static content (localContent.js), not user input */}
          <div dangerouslySetInnerHTML={{ __html: s.html }} />
        </section>
      ))}
      {pg.faq && (
        <section>
          <h2>{pg.lang === 'ru' ? 'Частые вопросы' : 'Ko‘p beriladigan savollar'}</h2>
          {pg.faq.map(([q, a]) => <details key={q} className="lp-faq"><summary>{q}</summary><p>{a}</p></details>)}
        </section>
      )}
      {more.length > 0 && pg.article && (
        <section>
          <h2>{pg.lang === 'ru' ? 'Читать дальше' : 'Yana o‘qing'}</h2>
          <div className="pub-cards">{more.map((x) => <Link key={x.path} to={x.path} className="pub-card"><b>{x.h1}</b><p>{x.desc}</p></Link>)}</div>
        </section>
      )}
      <div className="row wrap" style={{ gap: 10, marginTop: 24 }}>
        <Link to="/practice" className="btn sun lg">{pg.lang === 'ru' ? 'Бесплатный тест SAT' : 'Bepul SAT test'} <IconArrow width={18} height={18} /></Link>
      </div>
    </article>
  );
}
