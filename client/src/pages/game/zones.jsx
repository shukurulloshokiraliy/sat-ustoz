import Character from '../../components/Character.jsx';

/** Themed zones: the same game, a different world on screen. Everything except Classic is VIP. */
export const ZONES = [
  { id: 'classic', name: 'Classic', text: 'Leaderboard with points and streaks.', free: true },
  { id: 'race', name: 'Race Track', text: 'Every right answer is a sprint toward the finish line.' },
  { id: 'space', name: 'Space Race', text: 'Rockets on, fly past the planets to the moon base.' },
  { id: 'ocean', name: 'Deep Dive', text: 'Swim through the reef to the sunken treasure.' },
  { id: 'jungle', name: 'Jungle Run', text: 'Swing through the jungle to the golden temple.' },
];
export const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]));

export const BOT_LEVELS = [
  { id: 'easy', name: 'Easy', text: 'Slow, makes plenty of mistakes', free: true },
  { id: 'medium', name: 'Medium', text: 'A steady classmate' },
  { id: 'hard', name: 'Hard', text: 'Fast and rarely wrong' },
  { id: 'insane', name: 'Insane', text: 'Lightning fast, almost perfect' },
];

export const isVip = (user) => !!user && (user.role === 'master' || !!user.access?.sub_active || user.access?.subscription_required === false);

/** Lanes: each player moves toward the finish with their correct answers. */
export function ZoneTrack({ room, limit = 12, compact = false }) {
  const zone = room.zone || 'classic';
  if (zone === 'classic') return null;
  const me = room.players.find((p) => p.me);
  let lanes = [...room.players].sort((a, b) => b.correct - a.correct || b.score - a.score).slice(0, limit);
  if (me && !lanes.includes(me)) lanes = [...lanes.slice(0, limit - 1), me];
  const total = Math.max(1, room.total);
  return (
    <div className={`zt zt-${zone} ${compact ? 'compact' : ''}`} aria-label={`${ZONE[zone]?.name}: race positions`}>
      <div className="zt-scenery" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className="zt-goal" aria-hidden="true"><span /></div>
      {lanes.map((p, i) => {
        const pct = Math.min(1, p.correct / total);
        return (
          <div key={p.id} className={`zt-lane ${p.me ? 'me' : ''} ${p.team ? `t-${p.team.toLowerCase()}` : ''}`}>
            <span className="zt-place">{i + 1}</span>
            <div className="zt-road">
              <div className={`zt-runner ${pct >= 1 ? 'done' : ''}`} style={{ left: `calc(${pct * 100}% - ${pct * (compact ? 34 : 46)}px)` }}>
                <span className="zt-fx" aria-hidden="true" />
                <Character kind={p.avatar} size={compact ? 34 : 46} />
                {!compact && <em>{p.name}</em>}
              </div>
            </div>
            <b className="zt-score">{p.correct}</b>
          </div>
        );
      })}
    </div>
  );
}
