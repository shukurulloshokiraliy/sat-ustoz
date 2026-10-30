/**
 * Word Arena / Vocabulary characters: original 3D-cartoon mascots (transparent WebP in /public/characters).
 * `body` stays as each character's signature colour for rings, team chips and backgrounds.
 */
// set: picker group · rarity: cosmetic badge (Blooket-style)
export const CHARACTERS = {
  owl: { name: 'Ustoz Owl', body: '#2A55E5', set: 'Classic', rarity: 'rare' },
  fox: { name: 'Fizz the Fox', body: '#F28B4E', set: 'Classic', rarity: 'common' },
  cat: { name: 'Mochi Cat', body: '#9AA3BF', set: 'Classic', rarity: 'common' },
  bear: { name: 'Bobo Bear', body: '#A8714A', set: 'Classic', rarity: 'common' },
  bunny: { name: 'Hop Bunny', body: '#F3B8CF', set: 'Classic', rarity: 'common' },
  frog: { name: 'Lily Frog', body: '#3CCB9A', set: 'Classic', rarity: 'common' },
  penguin: { name: 'Pingo', body: '#161B3D', set: 'Classic', rarity: 'common' },
  chick: { name: 'Sunny Chick', body: '#FFCB3D', set: 'Classic', rarity: 'common' },
  panda: { name: 'Bamboo Panda', body: '#2B2B2B', set: 'Wild', rarity: 'rare' },
  koala: { name: 'Snooze Koala', body: '#9AA3BF', set: 'Wild', rarity: 'common' },
  lion: { name: 'Leo Cub', body: '#E8A93C', set: 'Wild', rarity: 'epic' },
  tiger: { name: 'Stripes', body: '#F28B2E', set: 'Wild', rarity: 'epic' },
  redpanda: { name: 'Maple', body: '#C9532B', set: 'Wild', rarity: 'rare' },
  raccoon: { name: 'Bandit', body: '#7A7F8C', set: 'Wild', rarity: 'common' },
  hedgehog: { name: 'Spike', body: '#8A5A36', set: 'Wild', rarity: 'common' },
  monkey: { name: 'Banana Joe', body: '#8B5A3C', set: 'Wild', rarity: 'common' },
  octo: { name: 'Inky Octo', body: '#F06FA5', set: 'Ocean', rarity: 'rare' },
  shark: { name: 'Chomp', body: '#3D7BEA', set: 'Ocean', rarity: 'epic' },
  whale: { name: 'Splash', body: '#3D7BEA', set: 'Ocean', rarity: 'rare' },
  axolotl: { name: 'Axel', body: '#F49AC1', set: 'Ocean', rarity: 'epic' },
  robot: { name: 'Bit Robot', body: '#5C88FF', set: 'Magic', rarity: 'epic' },
  ghost: { name: 'Boo', body: '#C9D3F5', set: 'Magic', rarity: 'rare' },
  dragon: { name: 'Ember Dragon', body: '#8E5CF7', set: 'Magic', rarity: 'legendary' },
  unicorn: { name: 'Twinkle', body: '#E7B6F0', set: 'Magic', rarity: 'legendary' },
};
export const CHARACTER_SETS = ['Classic', 'Wild', 'Ocean', 'Magic'];
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
