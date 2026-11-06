import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { useAuth } from './context.jsx';
import { IconCrown, IconLock } from './components/icons.jsx';

/**
 * Free daily limit (100 answers a day across every test). The server counts and refuses; this file
 *  - counts an answer the moment it is picked inside a test (so the test stops right at the limit), and
 *  - shows one wall over any page when the limit is reached.
 */
let metered = false;
const sent = new Set();
/** Count one picked answer, e.g. meter(`fm:${attemptId}:${questionId}`). Only for students with a daily limit. */
export function meter(key) {
  if (!metered || sent.has(key)) return;
  sent.add(key);
  api.post('/usage/answer', { key }).catch((e) => { if (e.status !== 402) sent.delete(key); });
}

export function LimitWall() {
  const { user } = useAuth();
  const [hit, setHit] = useState(null);
  const nav = useNavigate();
  const loc = useLocation();
  const cap = user?.usage?.cap || 0;
  useEffect(() => { metered = user?.role === 'student' && cap > 0; }, [user?.role, cap]);
  useEffect(() => {
    const on = (e) => setHit(e.detail || {});
    window.addEventListener('limit:daily', on);
    return () => window.removeEventListener('limit:daily', on);
  }, []);
  // leaving for the plans page or the dashboard closes the wall there
  useEffect(() => { if (hit && (loc.pathname === '/subscribe' || loc.pathname === '/live')) setHit(null); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!hit) return null;
  const go = (to) => { setHit(null); nav(to); };
  return (
    <div className="lw-back" role="dialog" aria-modal="true" aria-labelledby="lw-h">
      <div className="lw-card">
        <span className="lw-ic"><IconLock width={26} height={26} /></span>
        <h2 id="lw-h">Today's {cap || 100} free questions are used</h2>
        <p>Free accounts answer {cap || 100} questions a day across the whole platform: practice, quizzes, full mocks, level checks and Words in Context. Your answers so far are saved.</p>
        <p className="muted">New questions open at midnight (Tashkent time). With any plan, practice has no daily limit.</p>
        <div className="lw-act">
          <button className="btn primary lg" onClick={() => go('/subscribe')}><IconCrown width={18} height={18} /> See plans</button>
          <button className="btn ghost lg" onClick={() => go('/')}>Back to dashboard</button>
        </div>
        <small className="muted">Want to learn new words meanwhile? <Link to="/vocab" onClick={() => setHit(null)}>Flashcards</Link> are not counted.</small>
      </div>
    </div>
  );
}

/** "37 of 100 free questions left today" for free students (nothing for plans without a limit). */
export function UsageChip({ className = '' }) {
  const { user } = useAuth();
  const [u, setU] = useState(user?.usage || null);
  useEffect(() => { if (user?.usage?.cap) api.get('/usage').then(setU).catch(() => {}); }, [user?.usage?.cap]);
  if (!u?.cap) return null;
  const low = u.left <= 10;
  return <span className={`chip ${low ? 'warn' : ''} ${className}`} title="Free accounts: questions a day across every test">{u.left} of {u.cap} free questions left today</span>;
}
