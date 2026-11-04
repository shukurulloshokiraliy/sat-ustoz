import { useEffect, useRef, useState } from 'react';
import { useReveal } from '../../components/reveal.js';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useTheme } from '../../context.jsx';
import { IconBolt, IconBook, IconChevron, IconCrown, IconUser, IconMenu, IconMoon, IconSun, IconX, Logo } from '../../components/icons.jsx';
import SupportChat from '../../components/SupportChat.jsx';
import { useSite } from './site.jsx';

/** Website header (like a product site): menu with dropdowns, Log in, Start free trial. No sign-in needed. */
export default function PublicLayout() {
  useReveal('.pub-main');
  const { site } = useSite();
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  // while the phone menu is open: no page scroll behind it and no chat button over the menu
  useEffect(() => { document.body.classList.toggle('menu-open', open); return () => document.body.classList.remove('menu-open'); }, [open]);

  const sections = site?.sections || [];
  const pagesOf = (id) => (site?.pages || []).filter((p) => p.section === id);
  const menus = [
    {
      label: 'Practice Tests', to: '/practice',
      cols: [
        { title: 'Take a test', items: [
          { to: '/practice', label: `Full module · ${site?.practice?.test_size || 27} questions`, sub: `${site?.practice?.minutes || 32} min, score estimate` },
          { to: '/practice?levels=hard', label: 'Hard questions only', sub: 'For a 700+ goal' },
          { to: '/practice?levels=easy', label: 'Warm-up (easy)', sub: 'Build confidence' },
        ] },
        { title: 'By domain', items: [
          { to: '/practice?domain=Information and Ideas', label: 'Information and Ideas' },
          { to: '/practice?domain=Craft and Structure', label: 'Craft and Structure' },
          { to: '/practice?domain=Expression of Ideas', label: 'Expression of Ideas' },
          { to: '/practice?domain=Standard English Conventions', label: 'Standard English Conventions' },
        ] },
      ],
      callout: { title: 'Find your weak spots', text: 'Free, no sign-up. New questions every visit.', to: '/practice', cta: 'Start a test' },
    },
    ...sections.map((s) => ({
      label: s.label, to: `/s/${s.id}`,
      cols: [{ title: s.label, items: pagesOf(s.id).slice(0, 8).map((p) => ({ to: `/p/${p.slug}`, label: p.title, sub: p.summary })) }],
      callout: null,
    })),
  ];

  return (
    <div className="pub">
      <header className="pub-head">
        <div className="pub-head-in">
          <Link to="/" className="pub-logo" aria-label="SAT Ustoz — home"><Logo size={24} tone={theme === "dark" ? "white" : "auto"} /></Link>
          <nav className={`pub-nav ${open ? 'open' : ''}`} aria-label="Site menu">
            {menus.map((m) => <Menu key={m.label} m={m} />)}
            {/* phones: one short, flat list instead of the dropdown panels */}
            <div className="pub-mnav">
              <Link to="/practice"><IconBolt width={20} height={20} /><span><b>Free practice test</b><small>27 questions · score estimate</small></span></Link>
              {sections.map((s) => <Link key={s.id} to={`/s/${s.id}`}><IconBook width={20} height={20} /><span><b>{s.label}</b><small>{pagesOf(s.id).length} {pagesOf(s.id).length === 1 ? 'page' : 'pages'}</small></span></Link>)}
              <Link to="/#pricing" onClick={() => { setOpen(false); setTimeout(() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }), 80); }}><IconCrown width={20} height={20} /><span><b>Pricing</b><small>Free and 4 plans</small></span></Link>
              <Link to="/about"><IconUser width={20} height={20} /><span><b>About</b><small>Who teaches here</small></span></Link>
            </div>
            <NavLink to="/about" className="pub-nav-link">About</NavLink>
            <Link to="/#pricing" className="pub-nav-link" onClick={() => setTimeout(() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }), 60)}>Pricing</Link>
            <div className="pub-nav-mobile-cta">
              {user ? <Link className="btn sun lg block" to="/">Open my dashboard</Link> : <>
                <Link className="btn sun lg block" to="/signup">Start free trial</Link>
                <Link className="btn on-dark lg block" to="/login">Log in</Link>
              </>}
            </div>
          </nav>
          <div className="pub-actions">
            <button className="icon-btn on-dark" onClick={toggle} aria-label="Toggle theme">{theme === 'dark' ? <IconSun /> : <IconMoon />}</button>
            {user ? <Link className="btn sun pub-cta" to="/">Dashboard</Link> : <>
              <Link className="pub-login" to="/login">Log in</Link>
              <Link className="btn sun pub-cta" to="/signup">Start free trial</Link>
            </>}
            <button className="icon-btn on-dark pub-burger" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>{open ? <IconX /> : <IconMenu />}</button>
          </div>
        </div>
      </header>
      {open && <div className="pub-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <main className="pub-main"><Outlet /></main>
      <SupportChat />
      <footer className="pub-foot">
        <div className="pub-foot-in">
          <div className="pub-foot-brand">
            <Logo size={26} tone="white" />
            <p>Your personal ustoz for SAT Reading &amp; Writing — from 200 to 800.</p>
            {!user && <Link className="btn sun" to="/signup">Start free trial</Link>}
          </div>
          <div>
            <b>Practice</b>
            <Link to="/practice">Free practice test</Link>
            <Link to="/practice?levels=hard">Hard questions</Link>
            <Link to="/login">Question Bank</Link>
          </div>
          {sections.map((s) => (
            <div key={s.id}>
              <b>{s.label}</b>
              {pagesOf(s.id).slice(0, 5).map((p) => <Link key={p.slug} to={`/p/${p.slug}`}>{p.title}</Link>)}
              <Link to={`/s/${s.id}`}>All {s.label.toLowerCase()} →</Link>
            </div>
          ))}
          <div>
            <b>SAT Ustoz</b>
            <Link to="/login">Log in</Link>
            <Link to="/signup">Create account</Link>
            <Link to="/about">About us</Link>
            <Link to="/#pricing">Pricing</Link>
            {site?.about?.instagram && <a href={site.about.instagram} target="_blank" rel="noreferrer">Instagram</a>}
            {site?.about?.telegram && <a href={site.about.telegram} target="_blank" rel="noreferrer">Telegram</a>}
          </div>
        </div>
        <p className="pub-legal">© {new Date().getFullYear()} SAT Ustoz. SAT is a trademark of the College Board, which does not endorse this site.</p>
      </footer>
    </div>
  );
}

function Menu({ m }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname, loc.search]);
  const t = useRef(0);
  const enter = () => { clearTimeout(t.current); setOpen(true); };
  const leave = () => { t.current = setTimeout(() => setOpen(false), 120); };
  const hasItems = m.cols.some((c) => c.items.length);
  return (
    <div className={`pub-menu ${open ? 'open' : ''}`} onMouseEnter={enter} onMouseLeave={leave}>
      <div className="pub-menu-top">
        <NavLink to={m.to} className="pub-nav-link" onClick={() => setOpen(false)}>{m.label}</NavLink>
        {hasItems && <button className="pub-caret" aria-label={`${m.label} menu`} aria-expanded={open} onClick={() => setOpen(!open)}><IconChevron width={14} height={14} /></button>}
      </div>
      {hasItems && (
        <div className="pub-drop" role="menu">
          {m.cols.filter((c) => c.items.length).map((c) => (
            <div key={c.title} className="pub-drop-col">
              <small>{c.title}</small>
              {c.items.map((it) => (
                <Link key={it.to + it.label} to={it.to} className="pub-drop-item" onClick={() => setOpen(false)}>
                  <b>{it.label}</b>{it.sub && <span>{it.sub}</span>}
                </Link>
              ))}
            </div>
          ))}
          {m.callout && (
            <Link to={m.callout.to} className="pub-drop-callout" onClick={() => setOpen(false)}>
              <b>{m.callout.title}</b><span>{m.callout.text}</span><em>{m.callout.cta} →</em>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
