import { useEffect, useState } from 'react';
import { useReveal } from './reveal.js';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useTheme } from '../context.jsx';
import { Avatar } from './ui.jsx';
import SupportChat from './SupportChat.jsx';
import {
  IconBookmark, IconBriefcase, IconChart, IconDashboard, IconLayers, IconLogout, IconMenu, IconMoon,
  IconQuiz, IconRoad, IconSun, IconUsers, IconCrown, IconSettings, IconTarget, IconBolt, IconGlobe, IconSend, IconBook, IconGame, IconMore, Logo,
} from './icons.jsx';

const STUDENT_NAV = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/roadmap', label: 'Roadmap', icon: IconRoad },
  { to: '/vocab', label: 'Vocabulary', icon: IconBook },
  { to: '/game', label: 'Word Arena', icon: IconGame },
  { to: '/question-bank', label: 'Question Bank', icon: IconTarget },
  { to: '/practice', label: 'Practice Tests', icon: IconBolt },
  { to: '/quizzes', label: 'Quizzes', icon: IconQuiz },
  { to: '/analytics', label: 'Results', icon: IconChart },
  { to: '/saved', label: 'Saved', icon: IconBookmark },
  { to: '/subscribe', label: 'Subscription', icon: IconCrown },
];
// phones: the most used places sit in a bottom tab bar; "More" opens the full menu
const STUDENT_TABS = [
  { to: '/', label: 'Home', icon: IconDashboard, end: true },
  { to: '/roadmap', label: 'Roadmap', icon: IconRoad },
  { to: '/vocab', label: 'Words', icon: IconBook },
  { to: '/question-bank', label: 'Practice', icon: IconTarget },
];
const MASTER_TABS = [
  { to: '/', label: 'Overview', icon: IconDashboard, end: true },
  { to: '/students', label: 'Students', icon: IconUsers },
  { to: '/roadmap', label: 'Roadmap', icon: IconRoad },
  { to: '/support', label: 'Support', icon: IconSend },
];
const MASTER_NAV = [
  { to: '/', label: 'Overview', icon: IconDashboard, end: true },
  { to: '/students', label: 'Students', icon: IconUsers },
  { to: '/groups', label: 'Groups', icon: IconLayers },
  { to: '/quizzes', label: 'Quizzes', icon: IconQuiz },
  { to: '/roadmap', label: 'Roadmap', icon: IconRoad },
  { to: '/question-bank/manage', label: 'Question Bank', icon: IconTarget },
  { to: '/vocab', label: 'Vocabulary', icon: IconBook },
  { to: '/game', label: 'Word Arena', icon: IconGame },
  { to: '/website', label: 'Website', icon: IconGlobe },
  { to: '/support', label: 'Support', icon: IconSend },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

export default function Layout() {
  useReveal('.main');
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
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
            <NavLink key={n.to} to={n.to} end={n.end}><n.icon />{n.label}
              {n.to === '/subscribe' && !user.sub_active && user.access?.subscription_required && <span className="badge-n sun">Get</span>}</NavLink>
          ))}
        </nav>
        <div className="side-foot">
          
          <button className="btn ghost sm block" onClick={toggle} aria-label={"Toggle theme"}>
            {theme === 'dark' ? <IconSun /> : <IconMoon />} {theme === 'dark' ? "Light mode" : "Dark mode"}
          </button>
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
            <NavLink key={n.to} to={n.to} end={n.end}><n.icon width={22} height={22} /><span>{n.label}</span></NavLink>
          ))}
          <button type="button" className={open ? 'active' : ''} onClick={() => setOpen(true)} aria-label="Open the full menu"><IconMore width={22} height={22} /><span>More</span></button>
        </nav>
      </div>
    </div>
  );
}
