/**
 * Word Arena / Vocabulary characters: original 3D-cartoon mascots (transparent WebP in /public/characters).
 * `body` stays as each character's signature colour for rings, team chips and backgrounds.
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
  const k = CHARACTERS[kind] ? kind : 'owl';
  return (
    <img
      src={`/characters/${k}.webp`}
      width={size}
      height={size}
      alt={title || ''}
      aria-hidden={title ? undefined : 'true'}
      draggable="false"
      loading="lazy"
      decoding="async"
      className={`char char-${mood} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
