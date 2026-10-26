// A small illustrated badge for a resident, drawn in SVG from species, life stage and look seed.
// It stands in until the art kit can render a 3D portrait.
import type { JSX } from 'preact';

interface SpeciesLook {
  fur: string[];
  /** Muzzle and inner-ear color. */
  light: string;
  ears: (fur: string, light: string) => JSX.Element;
  extra?: (fur: string, light: string) => JSX.Element;
}

const INK = '#4a3626';
const INNER = '#e8a9a0';

// prettier-ignore
const LOOKS: Record<string, SpeciesLook> = {
  badger: {
    fur: ['#8a8580', '#77726c', '#9a948d'], light: '#f3eee6',
    ears: (f) => <g><circle cx="13.5" cy="17" r="4" fill={f} /><circle cx="34.5" cy="17" r="4" fill={f} /></g>,
    extra: (_f, l) => <path d="M21.5 15.5h5l1 14h-7z" fill={l} stroke="none" />,
  },
  fox: {
    fur: ['#d4783a', '#c4652e', '#e08c48'], light: '#fbf1e2',
    ears: (f) => <g><path d="M12 22 13.5 8.5 21 16z" fill={f} /><path d="M36 22 34.5 8.5 27 16z" fill={f} /><path d="m14.5 18 .8-6 3.4 3.5z" fill={INK} stroke="none" opacity="0.7" /><path d="m33.5 18-.8-6-3.4 3.5z" fill={INK} stroke="none" opacity="0.7" /></g>,
  },
  hedgehog: {
    fur: ['#a88a68', '#957656', '#b89a76'], light: '#f1e2c8',
    ears: (f) => <path d="M9.5 26 8 18l4 1-1-6 5 3 1-6 4 4 3-5 3 5 4-4 1 6 5-3-1 6 4-1-1.5 8z" fill={f} />,
  },
  mouse: {
    fur: ['#b8aca0', '#cdbfb0', '#9f9286'], light: '#f4ece2',
    ears: (f) => <g><circle cx="12" cy="15" r="6.5" fill={f} /><circle cx="36" cy="15" r="6.5" fill={f} /><circle cx="12" cy="15" r="3.6" fill={INNER} stroke="none" /><circle cx="36" cy="15" r="3.6" fill={INNER} stroke="none" /></g>,
  },
  otter: {
    fur: ['#8a6448', '#755339', '#9c7656'], light: '#e9d6bf',
    ears: (f) => <g><circle cx="14" cy="18" r="3" fill={f} /><circle cx="34" cy="18" r="3" fill={f} /></g>,
    extra: () => <path d="M16 33.5h-4M16 35.5l-3.5 1.2M32 33.5h4M32 35.5l3.5 1.2" stroke={INK} stroke-width="0.9" />,
  },
  rabbit: {
    fur: ['#d9c3a5', '#c2a786', '#efe4d2', '#a98d72'], light: '#fbf4ea',
    ears: (f) => <g><path d="M17.5 18c-3-5-3.5-12-1.2-13.5 2.4-1.5 5 6 4.6 12.5z" fill={f} /><path d="M30.5 18c3-5 3.5-12 1.2-13.5-2.4-1.5-5 6-4.6 12.5z" fill={f} /><path d="M18.4 15.5c-1.5-3.5-1.7-7.5-.9-8.5.9-.7 2.2 3.4 2.2 8z" fill={INNER} stroke="none" /><path d="M29.6 15.5c1.5-3.5 1.7-7.5.9-8.5-.9-.7-2.2 3.4-2.2 8z" fill={INNER} stroke="none" /></g>,
  },
  squirrel: {
    fur: ['#b0603a', '#9a5434', '#c27448'], light: '#f6e4cf',
    ears: (f) => <g><path d="M13 20 13.5 10l6 6z" fill={f} /><path d="M35 20 34.5 10l-6 6z" fill={f} /><path d="M13.5 10.5c-.5-2 .5-3.5 1.5-4M34.5 10.5c.5-2-.5-3.5-1.5-4" stroke={INK} stroke-width="1.2" /></g>,
  },
};

/** Scarf colors, picked by the look seed. */
const CLOTHES = ['#c7604a', '#3f7f7a', '#d6a73e', '#34506b', '#7a5468', '#6e7f4e', '#a8473b'];
/** Badge backgrounds by species, soft and warm. */
const GROUND = ['#f3e3bd', '#dde9cf', '#e6dcef', '#d9e7ec', '#f1d9cc'];

/** A stable small hash of the look seed, so the badge never changes between visits. */
function pick(seed: number, salt: number, n: number): number {
  let h = (seed ^ (salt * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % n;
}

export function Portrait({
  species,
  look,
  stage,
  size = 56,
  mood,
}: {
  species: string;
  look: number;
  stage?: string;
  size?: number;
  /** Mood band 0 to 4: a smile for content, a flat line for miserable. */
  mood?: number;
}) {
  const s = LOOKS[species] ?? LOOKS.mouse!;
  const fur = s.fur[pick(look, 1, s.fur.length)]!;
  const scarf = CLOTHES[pick(look, 2, CLOTHES.length)]!;
  const ground = GROUND[pick(look, 3, GROUND.length)]!;
  const small = stage === 'child';
  const elder = stage === 'elder';
  const band = mood ?? 3;
  const mouth =
    band >= 3
      ? 'M21.5 34c1.4 1.3 3.6 1.3 5 0'
      : band === 2
        ? 'M21.8 34.5h4.4'
        : 'M21.5 35.2c1.4-1.2 3.6-1.2 5 0';
  return (
    <svg
      class="portrait"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label={`A ${species}`}
      stroke={INK}
      stroke-width="1.3"
      stroke-linejoin="round"
      stroke-linecap="round"
    >
      <circle cx="24" cy="24" r="22.5" fill={ground} stroke-width="1.6" />
      <circle cx="24" cy="24" r="19.5" fill="none" stroke-dasharray="1.5 2.5" opacity="0.35" />
      <g transform={small ? 'translate(24 30) scale(0.86) translate(-24 -30)' : undefined}>
        <path d="M11 47c1-7 6-10 13-10s12 3 13 10z" fill={scarf} />
        <path d="M15.5 40.5c3 2.3 14 2.3 17 0" fill="none" stroke-width="1.1" opacity="0.6" />
        {s.ears(fur, s.light)}
        <ellipse cx="24" cy="27" rx="12.5" ry="11.5" fill={fur} />
        {s.extra?.(fur, s.light)}
        <ellipse cx="24" cy="32" rx="6.2" ry="4.6" fill={s.light} stroke="none" />
        <circle cx="19" cy="26.5" r="1.6" fill={INK} stroke="none" />
        <circle cx="29" cy="26.5" r="1.6" fill={INK} stroke="none" />
        <circle cx="19.5" cy="26" r="0.5" fill="#fff" stroke="none" />
        <circle cx="29.5" cy="26" r="0.5" fill="#fff" stroke="none" />
        <circle cx="15.8" cy="30.5" r="2" fill="#e89a8c" stroke="none" opacity="0.5" />
        <circle cx="32.2" cy="30.5" r="2" fill="#e89a8c" stroke="none" opacity="0.5" />
        <ellipse cx="24" cy="30.6" rx="1.6" ry="1.1" fill={INK} stroke="none" />
        <path d={mouth} fill="none" stroke-width="1.1" />
        {elder && (
          <g fill="none" stroke-width="1">
            <circle cx="19" cy="26.5" r="3" />
            <circle cx="29" cy="26.5" r="3" />
            <path d="M22 26.5h4" />
          </g>
        )}
      </g>
    </svg>
  );
}
