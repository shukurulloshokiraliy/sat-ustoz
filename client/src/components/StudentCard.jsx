import { Link } from 'react-router-dom';
import { daysUntil, fmtDate } from '../api.js';
import { Avatar } from './ui.jsx';
import Character, { CHARACTERS, isVipCharacter } from './Character.jsx';

/**
 * The student's card: a visual "SAT ID" shown on the dashboard and the profile.
 * Photo + chosen Word Arena hero, plan, estimated score vs goal, level, streak and days to the SAT.
 * `stats` comes from combine() on the dashboard ({ estimate, xp, level, levelProgress, streak }); may be null while loading.
 */
const heroOf = (vip) => {
  try { const h = localStorage.getItem('arena-hero'); if (CHARACTERS[h] && (vip || !isVipCharacter(h))) return h; } catch { /* storage blocked */ }
  return null;
};

export default function StudentCard({ user, stats, compact = false, edit = false }) {
  const acc = user.access || {};
  const paid = !!acc.sub_active;
  const plan = paid ? (acc.tier?.name || 'Pro') : 'Free';
  const hero = heroOf(paid || acc.subscription_required === false);
  const goal = Number(user.target_english) || 0;
  const est = stats?.estimate ?? user.diagnostic_score ?? null;
  const toGoal = est != null && goal ? Math.max(0, goal - est) : null;
  const pct = est != null && goal ? Math.max(4, Math.min(100, Math.round(((est - 200) / Math.max(1, goal - 200)) * 100))) : 0;
  const left = daysUntil(user.exam_date);
  const id = `SU-${String(user.id || 0).padStart(5, '0')}`;

  return (
    <section className={`scard ${paid ? 'paid' : ''} ${compact ? 'compact' : ''}`} aria-label="Your student card">
      <div className="scard-top">
        <span className="scard-brand">SAT <b>Ustoz</b></span>
        <span className={`scard-plan ${paid ? 'on' : ''}`}>{paid && <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z" /></svg>}{plan}</span>
      </div>

      <div className="scard-who">
        <div className="scard-face">
          <Avatar name={user.name} size={compact ? 54 : 64} src={user.avatar_url} />
          {hero && <span className="scard-hero" title={`Arena hero: ${CHARACTERS[hero].name}`}><Character kind={hero} size={compact ? 30 : 36} /></span>}
        </div>
        <div className="scard-name">
          <b>{user.name}</b>
          <small>{user.group?.name || 'Student'} · {id}</small>
        </div>
      </div>

      <div className="scard-score">
        <div className="row between"><span>Reading &amp; Writing</span><span><b>{est ?? '—'}</b> <i>/ goal {goal || '—'}</i></span></div>
        <div className="scard-bar" role="img" aria-label={est != null ? `${est} of goal ${goal}` : 'No estimate yet'}><span style={{ width: `${pct}%` }} /></div>
        <small>{est == null ? 'Take a test to see your score' : toGoal ? `${toGoal} points to your goal` : 'Goal reached — raise it!'}</small>
      </div>

      <div className="scard-stats">
        <div><b>{stats ? stats.level : '—'}</b><small>Level</small></div>
        <div><b>{stats ? stats.streak : '—'}</b><small>{stats?.streak === 1 ? 'Day streak' : 'Days streak'}</small></div>
        <div><b>{left != null && left >= 0 ? left : '—'}</b><small>{user.exam_date ? `Days to ${fmtDate(user.exam_date)}` : 'Days to SAT'}</small></div>
      </div>

      {(edit || !hero) && (
        <div className="scard-foot">
          {!hero && <Link to="/game">Choose your hero →</Link>}
          {!paid && <Link to="/subscribe">Upgrade →</Link>}
        </div>
      )}
    </section>
  );
}
