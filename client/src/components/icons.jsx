const P = (d, extra) => (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {d}
    {extra}
  </svg>
);

export const IconDashboard = P(<><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>);
export const IconRoad = P(<><path d="M4 20 8 4M20 20 16 4M12 5v3M12 11v3M12 17v3" /></>);
export const IconQuiz = P(<><path d="M9 11l2 2 4-4" /><rect x="4" y="3" width="16" height="18" rx="3" /></>);
export const IconChart = P(<><path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" /></>);
export const IconBookmark = P(<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />);
export const IconBookmarkFill = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" {...p}><path d="M7 3h10a2 2 0 0 1 2 2v16l-7-4.5L5 21V5a2 2 0 0 1 2-2z" /></svg>
);
export const IconBriefcase = P(<><rect x="3" y="7" width="18" height="13" rx="3" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></>);
export const IconUsers = P(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5 6.5-5s5.7 1.5 6.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.5c2.2.2 3.6 1.6 4 4.5" /></>);
export const IconLayers = P(<><path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" /></>);
export const IconUser = P(<><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></>);
export const IconSun = P(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const IconMoon = P(<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />);
export const IconLogout = P(<><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9" /></>);
export const IconPlus = P(<path d="M12 5v14M5 12h14" />);
export const IconUpload = P(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>);
export const IconDownload = P(<><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" /></>);
export const IconTrash = P(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></>);
export const IconEdit = P(<><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" /></>);
export const IconCheck = P(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconX = P(<path d="M6 6l12 12M18 6 6 18" />);
export const IconEye = P(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const IconEyeOff = P(<><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>);
export const IconFlame = P(<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2.2 1.2.8 1.9 1.6 2.2C10.4 8 11 5.5 12 3z" />);
export const IconTarget = P(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>);
export const IconClock = P(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconChevron = P(<path d="m6 9 6 6 6-6" />);
export const IconArrow = P(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconMenu = P(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconFlag = P(<path d="M5 21V4M5 4h11l-2 4 2 4H5" />);
export const IconStrike = P(<><circle cx="12" cy="12" r="8.5" /><path d="M5 12h14" /></>);
export const IconCopy = P(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>);
export const IconKey = P(<><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 7l3 3" /></>);
export const IconAward = P(<><circle cx="12" cy="9" r="6" /><path d="m8.5 14 -1.5 7 5-3 5 3-1.5-7" /></>);
export const IconPrint = P(<><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><rect x="7" y="14" width="10" height="7" rx="1" /></>);
export const IconBolt = P(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />);
export const IconSearch = P(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconLink = P(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>);

export const IconLock = P(<><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const IconPlay = P(<><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" stroke="none" /></>);
export const IconDoc = P(<><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>);
export const IconUp = P(<path d="m6 15 6-6 6 6" />);
export const IconDown = P(<path d="m6 9 6 6 6-6" />);
export const IconSettings = P(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);
export const IconCrown = P(<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" />);
export const IconGlobe = P(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></>);
export const IconInstagram = P(<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" /></>);
export const IconTelegram = P(<path d="M21 4 3 11l6 2.2M21 4l-3 16-6.5-5.3M21 4 9 13.2m0 0V19l2.5-4.3" />);
export const IconSend = P(<path d="M21 3 3 10.5l7 2.5 2.5 7L21 3zM10 13l4-4" />);
export const IconGoogle = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
  </svg>
);

/**
 * SAT Ustoz wordmark: “SAT” in Unbounded with “Ustoz” raised in a Sun badge.
 * tone: 'auto' (Night on light, white on dark theme) · 'white' (on Night) · 'sky' (white + white badge, on Sky Blue)
 */
export function Logo({ size = 28, tone = 'auto', label = 'SAT Ustoz' }) {
  return (
    <span className={`logo logo-${tone}`} style={{ fontSize: size }} role="img" aria-label={label}>
      <b aria-hidden="true">SAT</b><i aria-hidden="true">Ustoz</i>
    </span>
  );
}

/** App icon: white rounded square, “S” in Night Ink, “U” on a Sun dot. */
export function AppIcon({ size = 40 }) {
  return (
    <span className="app-icon" style={{ width: size, height: size, fontSize: size }} aria-hidden="true">
      <b>S</b><i>U</i>
    </span>
  );
}
