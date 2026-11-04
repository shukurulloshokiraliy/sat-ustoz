import { setSound, soundOn } from './uiSound.js';
import { useEffect, useState } from 'react';
import { useReveal } from './reveal.js';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useTheme } from '../context.jsx';
import { Avatar } from './ui.jsx';
import SupportChat from './SupportChat.jsx';
import {
  IconBookmark, IconBriefcase, IconChats, IconChart, IconDashboard, IconLayers, IconLogout, IconMenu, IconMoon,
  IconQuiz, IconRoad, IconSun, IconUsers, IconCrown, IconSettings, IconTarget, IconBolt, IconGlobe, IconSend, IconBook, IconGame, IconMore, Logo, IconTrophy, IconDoc, IconConsult, IconVolume, IconMute } from './icons.jsx';

const STUDENT_NAV = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true, c: '#2A55E5' },
  { to: '/roadmap', label: 'Roadmap', icon: IconRoad, c: '#F28B4E' },
  { to: '/vocab', label: 'Vocabulary', icon: IconBook, c: '#E8A93C' },
  { to: '/game', label: 'Word Arena', icon: IconGame, c: '#8E5CF7' },
  { to: '/practice', label: 'Practice', icon: IconBolt, c: '#E2553D', also: ['/question-bank'] },
  { to: '/quizzes', label: 'Quizzes', icon: IconQuiz, c: '#12A39A' },
  { to: '/full-mocks', label: 'Full Mocks', icon: IconDoc, c: '#C2410C' },
  { to: '/analytics', label: 'Results', icon: IconChart, c: '#2A55E5' },
  { to: '/leaderboard', label: 'Leaderboard', icon: IconTrophy, c: '#E8A93C' },
  { to: '/consultations', label: 'Consultations', icon: IconConsult, c: '#0E9F6E' },
  { to: '/saved', label: 'Saved', icon: IconBookmark, c: '#E0569B' },
  { to: '/subscribe', label: 'Plans', icon: IconCrown, c: '#E8A93C' },
];
// phones: the most used places sit in a bottom tab bar; "More" opens the full menu
const STUDENT_TABS = [
  { to: '/', label: 'Home', icon: IconDashboard, end: true, c: '#2A55E5' },
  { to: '/roadmap', label: 'Roadmap', icon: IconRoad, c: '#F28B4E' },
  { to: '/vocab', label: 'Words', icon: IconBook, c: '#E8A93C' },
  { to: '/practice', label: 'Practice', icon: IconBolt, c: '#E2553D', also: ['/question-bank'] },
];
const MASTER_TABS = [
  { to: '/', label: 'Overview', icon: IconDashboard, end: true, c: '#2A55E5' },
  { to: '/students', label: 'Students', icon: IconUsers, c: '#2A55E5' },
  { to: '/roadmap', label: 'Roadmap', icon: IconRoad, c: '#F28B4E' },
  { to: '/support', label: 'Support', icon: IconChats, c: '#E0569B' },
];
const MASTER_NAV = [
  { to: '/', label: 'Overview', icon: IconDashboard, end: true, c: '#2A55E5' },
  { to: '/students', label: 'Students', icon: IconUsers, c: '#2A55E5' },
  { to: '/groups', label: 'Groups', icon: IconLayers, c: '#12A39A' },
  { to: '/quizzes', label: 'Quizzes', icon: IconQuiz, c: '#12A39A' },
  { to: '/roadmap', label: 'Roadmap', icon: IconRoad, c: '#F28B4E' },
  { to: '/question-bank/manage', label: 'Question Bank', icon: IconTarget, c: '#1E8E4E' },
  { to: '/full-mocks', label: 'Full Mocks', icon: IconDoc, c: '#C2410C' },
  { to: '/consultations', label: 'Consultations', icon: IconConsult, c: '#0E9F6E' },
  { to: '/vocab', label: 'Vocabulary', icon: IconBook, c: '#E8A93C' },
  { to: '/game', label: 'Word Arena', icon: IconGame, c: '#8E5CF7' },
  { to: '/website', label: 'Website', icon: IconGlobe, c: '#5C88FF' },
  { to: '/support', label: 'Support', icon: IconChats, c: '#E0569B' },
  { to: '/settings', label: 'Settings', icon: IconSettings, c: '#5B6380' },
];

function SoundToggle() {
  const [on, setOn] = useState(soundOn());
  return <button className="btn ghost sm sound-toggle" onClick={() => { setSound(!on); setOn(!on); }} aria-pressed={on} aria-label={on ? 'Turn button sounds off' : 'Turn button sounds on'} title={on ? 'Sounds on' : 'Sounds off'}>{on ? <IconVolume /> : <IconMute />}</button>;
}

export default function Layout() {
  useReveal('.main');
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const on = (n) => !!n.also?.some((pfx) => loc.pathname.startsWith(pfx));
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  const nav = user.role === 'master' ? MASTER_NAV : STUDENT_NAV;

  return (
    <div className="app">
      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <NavLink to="/" className="brand-tile" aria-label="SAT Ustoz — home">
          <Logo size={30} tone="white" />
          <span className="brand-sub">{user.role === 'master' ? 'Teacher panel' : 'SAT Reading & Writing'}</span>
          <span className="brand-track" aria-hidden="true"><b>200</b><i /><b className="end">800</b></span>
        </NavLink>
        <nav className="nav" aria-label={"Main menu"}>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} style={{ '--c': n.c || '#2A55E5' }} className={({ isActive }) => (isActive || on(n) ? 'active' : '')}>{({ isActive }) => (<><span className="nav-ic"><n.icon width={19} height={19} weight={isActive || on(n) ? 'fill' : 'duotone'} /></span>{n.label}
              {n.to === '/subscribe' && !user.sub_active && user.access?.subscription_required && <span className="badge-n sun">Get</span>}</>)}</NavLink>
          ))}
        </nav>
        <div className="side-foot">
          
          <div className="side-tools">
            <button className="btn ghost sm" onClick={toggle} aria-label={"Toggle theme"}>
              {theme === 'dark' ? <IconSun /> : <IconMoon />} {theme === 'dark' ? "Light mode" : "Dark mode"}
            </button>
            <SoundToggle />
          </div>
          <NavLink to="/profile" className="user-chip">
            <Avatar name={user.name} src={user.avatar_url} />
            <div className="grow"><b>{user.name}</b><small>{user.role === 'master' ? 'Teacher' : user.group?.name || (user.sub_active ? 'Subscriber' : 'Student')}</small></div>
          </NavLink>
          <button className="btn ghost sm block" onClick={logout}><IconLogout /> {"Log out"}</button>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <div className="topbar">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label={"Menu"}><IconMenu /></button>
          <div className="grow"><Logo size={22} /></div>
          
          <button className="icon-btn" onClick={toggle} aria-label={"Toggle theme"}>{theme === 'dark' ? <IconSun /> : <IconMoon />}</button>
        </div>
        <main className="main"><Outlet /></main>
        <SupportChat />
        <nav className="tabbar" aria-label="Quick menu">
          {(user.role === 'master' ? MASTER_TABS : STUDENT_TABS).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} style={{ '--c': n.c || '#2A55E5' }} className={({ isActive }) => (isActive || on(n) ? 'active' : '')}>{({ isActive }) => (<><n.icon width={22} height={22} weight={isActive || on(n) ? 'fill' : 'duotone'} /><span>{n.label}</span></>)}</NavLink>
          ))}
          <button type="button" className={open ? 'active' : ''} onClick={() => setOpen(true)} aria-label="Open the full menu"><IconMore width={22} height={22} /><span>More</span></button>
        </nav>
      </div>
    </div>
  );
}
