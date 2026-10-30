/**
 * Word Arena characters — original flat creatures drawn in SVG (no external art).
 * Each one shares a round body and face, with its own colours and features.
 */
export const CHARACTERS = {
  owl: { name: 'Ustoz Owl', body: '#2A55E5', belly: '#E7EFFE', ear: 'tuft', extra: 'glasses' },
  fox: { name: 'Fizz the Fox', body: '#F28B4E', belly: '#FFF4E6', ear: 'pointy', extra: 'none' },
  cat: { name: 'Mochi Cat', body: '#9AA3BF', belly: '#F5F7F8', ear: 'pointy', extra: 'whiskers' },
  bear: { name: 'Bobo Bear', body: '#A8714A', belly: '#F2DCC5', ear: 'round', extra: 'none' },
  bunny: { name: 'Hop Bunny', body: '#F3EEF8', belly: '#FFD6E5', ear: 'long', extra: 'none', dark: true },
  frog: { name: 'Lily Frog', body: '#3CCB9A', belly: '#E2F8F0', ear: 'eyes-top', extra: 'none' },
  penguin: { name: 'Pingo', body: '#161B3D', belly: '#FFFFFF', ear: 'none', extra: 'beak' },
  robot: { name: 'Bit Robot', body: '#5C88FF', belly: '#DCE6FF', ear: 'antenna', extra: 'panel' },
  dragon: { name: 'Ember Dragon', body: '#E2553D', belly: '#FFCB3D', ear: 'horns', extra: 'none' },
  ghost: { name: 'Boo', body: '#FFFFFF', belly: '#FFFFFF', ear: 'none', extra: 'ghost', dark: true },
  chick: { name: 'Sunny Chick', body: '#FFCB3D', belly: '#FFF4D1', ear: 'feather', extra: 'beak', dark: true },
  octo: { name: 'Inky Octo', body: '#8E5CF7', belly: '#EDE3FF', ear: 'none', extra: 'tentacles' },
};
export const CHARACTER_KEYS = Object.keys(CHARACTERS);

export default function Character({ kind = 'owl', size = 64, mood = 'happy', className = '', title }) {
  const c = CHARACTERS[kind] || CHARACTERS.owl;
  const ink = '#161B3D';
  const ear = {
    tuft: <><path d="M26 30 20 10l17 13z" fill={c.body} /><path d="M74 30l6-20-17 13z" fill={c.body} /></>,
    pointy: <><path d="M22 36 24 8l20 18z" fill={c.body} /><path d="M78 36 76 8 56 26z" fill={c.body} /><path d="M27 30 28 16l9 9z" fill={c.belly} /><path d="M73 30l-1-14-9 9z" fill={c.belly} /></>,
    round: <><circle cx="24" cy="24" r="12" fill={c.body} /><circle cx="76" cy="24" r="12" fill={c.body} /><circle cx="24" cy="24" r="6" fill={c.belly} /><circle cx="76" cy="24" r="6" fill={c.belly} /></>,
    long: <><rect x="27" y="-4" width="14" height="40" rx="7" fill={c.body} stroke="#E4DCEF" strokeWidth="2" /><rect x="59" y="-4" width="14" height="40" rx="7" fill={c.body} stroke="#E4DCEF" strokeWidth="2" /><rect x="31" y="2" width="6" height="28" rx="3" fill={c.belly} /><rect x="63" y="2" width="6" height="28" rx="3" fill={c.belly} /></>,
    'eyes-top': <><circle cx="33" cy="24" r="12" fill={c.body} /><circle cx="67" cy="24" r="12" fill={c.body} /></>,
    antenna: <><path d="M50 22V8" stroke={ink} strokeWidth="3" strokeLinecap="round" /><circle cx="50" cy="7" r="5" fill="#FFCB3D" /></>,
    horns: <><path d="M28 30 22 8l14 16z" fill="#FFCB3D" /><path d="M72 30l6-22-14 16z" fill="#FFCB3D" /></>,
    feather: <path d="M50 22c-6-10 0-16 4-16-2 5 2 8 0 16" fill="#F2A900" />,
    none: null,
  }[c.ear];
  const frogEyes = c.ear === 'eyes-top';
  const eyeY = frogEyes ? 25 : 50;
  const eye = (x) => mood === 'sad'
    ? <path key={x} d={`M${x - 5} ${eyeY + 2}q5 -5 10 0`} stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
    : mood === 'win'
      ? <path key={x} d={`M${x - 5} ${eyeY + 1}q5 -7 10 0`} stroke={ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      : <g key={x}><circle cx={x} cy={eyeY} r={frogEyes ? 6.5 : 6} fill={ink} /><circle cx={x + 2} cy={eyeY - 2} r="2" fill="#fff" /></g>;
  return (
    <svg className={`char ${className}`} viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={title || c.name}>
      <ellipse cx="50" cy="95" rx="28" ry="4" fill="#161B3D" opacity=".12" />
      {ear}
      {c.extra === 'tentacles' && [22, 36, 50, 64, 78].map((x) => <path key={x} d={`M${x} 78q-4 12 4 16`} stroke={c.body} strokeWidth="9" strokeLinecap="round" fill="none" />)}
      {c.extra === 'ghost'
        ? <path d="M18 54a32 32 0 0 1 64 0v34l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6z" fill={c.body} stroke="#E1E5F2" strokeWidth="2" />
        : <ellipse cx="50" cy="56" rx="34" ry="34" fill={c.body} stroke={c.dark ? '#E1E5F2' : 'none'} strokeWidth="2" />}
      {c.extra !== 'ghost' && <ellipse cx="50" cy="68" rx="20" ry="18" fill={c.belly} />}
      {[36, 64].map(eye)}
      {c.extra === 'glasses' && <><circle cx="36" cy="50" r="10" fill="none" stroke="#FFCB3D" strokeWidth="3" /><circle cx="64" cy="50" r="10" fill="none" stroke="#FFCB3D" strokeWidth="3" /><path d="M46 50h8" stroke="#FFCB3D" strokeWidth="3" /></>}
      <circle cx="27" cy="60" r="4.5" fill="#FF8FA3" opacity=".55" /><circle cx="73" cy="60" r="4.5" fill="#FF8FA3" opacity=".55" />
      {c.extra === 'beak'
        ? <path d="M44 58h12l-6 7z" fill="#FF9F1C" />
        : mood === 'sad'
          ? <path d="M43 66q7 -5 14 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
          : <path d={mood === 'win' ? 'M41 60q9 12 18 0z' : 'M43 61q7 7 14 0'} stroke={ink} strokeWidth="3" fill={mood === 'win' ? ink : 'none'} strokeLinecap="round" strokeLinejoin="round" />}
      {c.extra === 'whiskers' && <path d="M18 58h10M18 64l10-2M82 58H72M82 64l-10-2" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />}
      {c.extra === 'panel' && <><rect x="38" y="70" width="24" height="12" rx="3" fill="#161B3D" /><circle cx="44" cy="76" r="2" fill="#3CCB9A" /><circle cx="50" cy="76" r="2" fill="#FFCB3D" /><circle cx="56" cy="76" r="2" fill="#F28B6E" /></>}
    </svg>
  );
}
