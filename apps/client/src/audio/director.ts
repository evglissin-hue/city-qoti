// The music director (C5G): which kind of music suits the hour and the season, when a piece plays
// and when the valley is quiet. Pure, so it is tested without sound. docs/spec/17-presentation.md,
// Audio: acoustic guitar, piano, upright bass and brushes; light jazz chords in the evening, a waltz
// in winter; music that follows the hour and the season, with quiet between pieces.
import { pick, type Rand } from './rng';
import type { Instrument } from './synth/instruments';

export type Phase = 'morning' | 'afternoon' | 'evening' | 'night';

/** Morning 5 to 11, afternoon 11 to 17, evening 17 to 21, night 21 to 5. */
export function phaseOf(hour: number): Phase {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * A bar of harmony: one chord, or two sharing the bar. Chords are scale-degree numerals with
 * optional colors: '7' (the diatonic seventh), '6', 'add9', '9' (seventh and ninth), 'sus4'.
 */
export type Bar = string | readonly [string, string];
/** Four bars: a phrase's harmony. */
export type Phrase = readonly [Bar, Bar, Bar, Bar];

export type CompPattern =
  | 'arp'
  | 'block'
  | 'broken'
  | 'charleston'
  | 'oompah'
  | 'pad'
  | 'travis'
  // Combined pass (Valley Band): a bossa guitar, light funk chops, a jazz waltz comp.
  | 'bossa'
  | 'chops'
  | 'jazzwaltz';
export type BassPattern = 'pedal' | 'root5' | 'sparse' | 'walk' | 'bossa' | 'funk' | 'waltz';
export type DrumPattern = 'brushes' | 'jazz' | 'shaker' | 'bossa' | 'funk' | 'waltz';

/**
 * What the valley tells the music besides the hour and season (combined pass). Optional everywhere,
 * so old callers keep working. `rank` 0 hamlet to 4 city; `valleySeed` is shared by both seats.
 */
export interface MusicContext {
  rank: number;
  weather: 'clear' | 'rain' | 'storm' | 'fog' | 'snow' | string;
  festival: boolean;
  valleySeed: number;
}

/** A style the composer writes in. */
export interface Style {
  id: string;
  /** Beats per minute. */
  tempo: [min: number, max: number];
  meter: 3 | 4;
  /** Where the off-beat eighth falls: 0.5 straight, about 0.63 for a jazz swing. */
  swing: number;
  mode: 'major' | 'minor';
  /** The melody's instrument (the seed picks one) and its range (MIDI). */
  lead: readonly Instrument[];
  range: [lo: number, hi: number];
  comp: { inst: Instrument; pattern: CompPattern };
  bass: { inst: Instrument; pattern: BassPattern } | null;
  drums: DrumPattern | null;
  /** A soft sustained layer under the B section and the last A. */
  pad?: Instrument;
  /** A bell that doubles the melody an octave up in the last A. */
  sparkle?: Instrument;
  /** Phrase harmonies: `open` ends away from home, `close` comes home (A) or turns back (B). */
  a: { open: readonly Phrase[]; close: readonly Phrase[] };
  b: { open: readonly Phrase[]; close: readonly Phrase[] };
  /** Melody onsets within a bar (beats); the composer repeats and varies them. */
  rhythms: readonly (readonly number[])[];
  /** Overall loudness of the piece, 0 to 1. */
  level: number;
}

const MORNING_A = {
  open: [
    ['Iadd9', 'IIadd9', 'IVmaj7', 'Iadd9'],
    ['Imaj9', 'vi9', 'IVmaj9', 'V7sus4'],
    ['I', 'iii7', 'IVadd9', 'iv6'],
    ['vi9', 'IVmaj7#11', 'Iadd9', 'V9sus4'],
  ],
  close: [
    ['IVmaj9', 'iv6', 'Iadd9', 'Iadd9'],
    ['ii9', 'V7sus4', 'V7', 'Imaj9'],
    ['vi9', ['ii9', 'V13'], 'Imaj9', 'I69'],
  ],
} as const;

const MORNING_B = {
  open: [
    ['IVmaj7#11', 'iii7', 'vi9', 'IIadd9'],
    ['bVIImaj7', 'IVmaj7', 'Iadd9', 'Iadd9'],
    ['iii7', 'VI7', 'ii9', 'V7sus4'],
  ],
  close: [
    ['IVmaj9', 'iv6', 'iii7', 'V7sus4'],
    ['ii9', 'iii7', 'IVmaj7', 'V13'],
  ],
} as const;

const WINTER_MORNING_A = {
  open: [...MORNING_A.open, ['Imaj7', 'IVmaj7#11', 'Imaj7', 'iv6']],
  close: MORNING_A.close,
} as const;

const AFTERNOON_A = {
  open: [
    ['Imaj9', 'vi9', 'ii9', 'V13'],
    ['Imaj9', 'VI7', 'ii9', 'V9'],
    ['iii7', 'VI7', 'ii9', 'V13'],
    ['IVmaj9', 'iv6', 'iii7', 'VI7'],
  ],
  close: [
    ['ii9', 'V13', 'Imaj9', 'I69'],
    ['IVmaj9', ['iii7', 'VI7'], ['ii9', 'bII7'], 'Imaj9'],
    ['iv9', 'bVII13', 'Imaj9', 'I69'],
  ],
} as const;

const AFTERNOON_B = {
  open: [
    ['IVmaj7#11', 'iv9', 'iii7', 'VI7'],
    ['ii9', 'V9', 'iii7', 'VI7b9'],
  ],
  close: [
    ['ii9', 'V13', 'iii7', 'V7sus4'],
    ['IVmaj9', 'bVII9', 'iii7', 'V13'],
  ],
} as const;

const RHYTHMS_4 = [
  [0, 1, 2],
  [0, 1.5, 2, 3],
  [0, 0.5, 1, 2],
  [0, 2, 2.5, 3],
  [1, 1.5, 2, 3],
  [0, 1, 1.5, 2.5],
  [0, 1.5, 3],
] as const;

const MORNING: Style = {
  id: 'morning',
  tempo: [84, 94],
  meter: 4,
  swing: 0.5,
  mode: 'major',
  lead: ['flute', 'clarinet', 'kalimba'],
  range: [64, 84],
  comp: { inst: 'guitar', pattern: 'travis' },
  bass: { inst: 'bass', pattern: 'sparse' },
  drums: 'shaker',
  sparkle: 'glock',
  a: MORNING_A,
  b: MORNING_B,
  rhythms: RHYTHMS_4,
  level: 0.85,
};

const SUMMER_MORNING: Style = {
  ...MORNING,
  id: 'summer-morning',
  tempo: [90, 100],
  lead: ['marimba', 'kalimba'],
  range: [62, 84],
  comp: { inst: 'guitar', pattern: 'arp' },
  bass: { inst: 'bass', pattern: 'root5' },
};

const WINTER_MORNING: Style = {
  ...MORNING,
  id: 'winter-morning',
  tempo: [72, 82],
  lead: ['celesta', 'harp'],
  range: [67, 88],
  comp: { inst: 'piano', pattern: 'broken' },
  bass: null,
  drums: null,
  pad: 'strings',
  sparkle: undefined,
  a: WINTER_MORNING_A,
  level: 0.75,
};

const AFTERNOON: Style = {
  id: 'afternoon',
  tempo: [92, 104],
  meter: 4,
  swing: 0.5,
  mode: 'major',
  lead: ['piano', 'vibes'],
  range: [62, 84],
  comp: { inst: 'piano', pattern: 'block' },
  bass: { inst: 'bass', pattern: 'root5' },
  drums: 'brushes',
  sparkle: 'glock',
  a: AFTERNOON_A,
  b: AFTERNOON_B,
  rhythms: RHYTHMS_4,
  level: 0.85,
};

/** Summer afternoons: a bossa nova, nylon guitar and brushes. */
const BOSSA: Style = {
  id: 'bossa',
  tempo: [112, 126],
  meter: 4,
  swing: 0.5,
  mode: 'major',
  lead: ['flute', 'vibes', 'clarinet'],
  range: [62, 84],
  comp: { inst: 'guitar', pattern: 'bossa' },
  bass: { inst: 'bass', pattern: 'bossa' },
  drums: 'bossa',
  sparkle: 'vibes',
  a: {
    open: [
      ['Imaj9', 'Imaj9', 'II7', 'II7'],
      ['Imaj9', 'VI7b9', 'ii9', 'V13'],
      ['ii9', 'V13', 'Imaj9', 'IVmaj7#11'],
    ],
    close: [
      ['ii9', 'bII7', 'Imaj9', 'I69'],
      ['iv9', 'bVII13', 'Imaj9', 'I69'],
    ],
  },
  b: {
    open: [
      ['IVmaj9', 'IVmaj9', 'iv9', 'bVII13'],
      ['iii7', 'VI7b9', 'ii9', 'V7sus4'],
    ],
    close: [
      ['ii9', 'V13', 'iii7', 'VI7'],
      ['IVmaj9', 'iv9', 'ii9', 'V13'],
    ],
  },
  rhythms: [
    [0, 1.5, 3],
    [0.5, 2, 3.5],
    [0, 1, 2.5],
    [1.5, 2.5, 3],
    [0, 0.5, 2],
  ],
  level: 0.85,
};

/** Festival afternoons and evenings: light funk in a Dorian minor. */
const FESTIVAL: Style = {
  id: 'festival',
  tempo: [100, 108],
  meter: 4,
  swing: 0.5,
  mode: 'minor',
  lead: ['vibes', 'flute', 'clarinet'],
  range: [62, 84],
  comp: { inst: 'guitar', pattern: 'chops' },
  bass: { inst: 'bass', pattern: 'funk' },
  drums: 'funk',
  a: {
    open: [
      ['i9', 'IV9', 'i9', 'IV9'],
      ['i9', 'i9', 'IV13', 'IV13'],
    ],
    close: [
      ['VImaj7', 'V7b9', 'i9', 'i9'],
      ['iv9', 'VII13', 'i9', 'i9'],
    ],
  },
  b: {
    open: [
      ['VImaj7', 'VII13', 'IIImaj7', 'VImaj7'],
      ['iv9', 'iv9', 'i9', 'i9'],
    ],
    close: [
      ['VImaj7', 'VII13', 'V7sus4', 'V7b9'],
      ['iv9', 'VII13', 'IIImaj7', 'V7sus4'],
    ],
  },
  rhythms: [
    [0.5, 1.5, 2.5],
    [0, 0.75, 1.5, 3],
    [1, 1.5, 2.75, 3.5],
  ],
  level: 0.9,
};

const AUTUMN: Style = {
  id: 'autumn',
  tempo: [80, 90],
  meter: 4,
  swing: 0.5,
  mode: 'minor',
  lead: ['piano', 'flute', 'clarinet'],
  range: [62, 82],
  comp: { inst: 'harp', pattern: 'arp' },
  bass: { inst: 'bass', pattern: 'root5' },
  drums: 'brushes',
  pad: 'strings',
  a: {
    open: [
      ['i9', 'IV9', 'i9', 'IV9'],
      ['i9', 'VImaj7', 'iv9', 'V7b9'],
      ['i11', 'VII9', 'IIImaj7', 'VImaj7'],
    ],
    close: [
      ['VImaj7', 'iv9', 'V7sus4', 'i9'],
      ['iv9', 'VII13', 'i9', 'i9'],
      ['iiø7', 'V7b9', 'i9', 'i69'],
    ],
  },
  b: {
    open: [
      ['IIImaj7', 'VII9', 'VImaj7', 'IIImaj7'],
      ['VImaj7', 'VII13', 'IIImaj7', 'VImaj7'],
    ],
    close: [
      ['iv9', 'VII13', 'IIImaj7', 'V7sus4'],
      ['VImaj7', 'iiø7', 'V7sus4', 'V7b9'],
    ],
  },
  rhythms: RHYTHMS_4,
  level: 0.8,
};

const EVENING: Style = {
  id: 'evening',
  tempo: [76, 88],
  meter: 4,
  swing: 0.63,
  mode: 'major',
  lead: ['vibes', 'clarinet', 'flute'],
  range: [62, 82],
  comp: { inst: 'epiano', pattern: 'charleston' },
  bass: { inst: 'bass', pattern: 'walk' },
  drums: 'jazz',
  a: {
    open: [
      ['Imaj7', 'VI7b9', 'ii9', 'V13'],
      ['Imaj9', 'vi9', 'ii9', 'bII7'],
      ['iii7', 'VI7', 'ii9', 'V7b9'],
      ['Imaj7', 'I7', 'IVmaj7', 'iv7'],
    ],
    close: [
      ['ii9', 'V13', 'Imaj9', 'I69'],
      ['iv9', 'bVII13', 'Imaj9', 'I69'],
      [['iii7', 'VI7'], ['ii9', 'bII7'], 'Imaj9', 'I69'],
    ],
  },
  b: {
    open: [
      ['IVmaj7', 'IVmaj7', 'iv7', 'bVII9'],
      ['ii9', 'V9', 'iii7', 'VI7b9'],
      ['vi9', 'II7', 'ii9', 'V7sus4'],
    ],
    close: [
      ['ii9', 'V13', 'iii7', 'V7sus4'],
      ['IVmaj7', 'bVII9', 'ii9', 'V13'],
    ],
  },
  rhythms: [
    [0, 1.5, 2.5],
    [0.5, 1, 2, 3.5],
    [0, 1, 1.5, 3],
    [1.5, 2, 2.5, 3.5],
    [0, 2.5, 3],
  ],
  level: 0.8,
};

const NIGHT: Style = {
  id: 'night',
  tempo: [60, 68],
  meter: 4,
  swing: 0.5,
  mode: 'major',
  lead: ['celesta', 'harp', 'vibes'],
  range: [67, 88],
  comp: { inst: 'strings', pattern: 'pad' },
  bass: { inst: 'bass', pattern: 'pedal' },
  drums: null,
  a: {
    open: [
      ['Imaj7', 'IVmaj7#11', 'Imaj7', 'IVmaj7#11'],
      ['Iadd9', 'vi9', 'IVmaj9', 'iv6'],
      ['Imaj9', 'bVImaj7', 'Imaj9', 'bVImaj7'],
    ],
    close: [
      ['vi9', 'IVmaj9', 'V9sus4', 'Iadd9'],
      ['IVmaj9', 'iv6', 'Imaj9', 'Imaj9'],
    ],
  },
  b: {
    open: [
      ['vi9', 'iii7', 'IVmaj7#11', 'Imaj9'],
      ['bVImaj7', 'bVIImaj7', 'Imaj9', 'Imaj9'],
    ],
    close: [['IVmaj9', 'Iadd9', 'iv6', 'V9sus4']],
  },
  rhythms: [[0, 2], [0, 1.5, 3], [0], [1, 2.5], [0, 3]],
  level: 0.65,
};

/** Winter afternoons, evenings and nights: a jazz waltz. */
const WALTZ: Style = {
  id: 'waltz',
  tempo: [108, 124],
  meter: 3,
  swing: 0.5,
  mode: 'major',
  lead: ['piano', 'celesta'],
  range: [64, 86],
  comp: { inst: 'piano', pattern: 'jazzwaltz' },
  bass: { inst: 'bass', pattern: 'waltz' },
  drums: 'waltz',
  pad: 'strings',
  sparkle: 'glock',
  a: {
    open: [
      ['Imaj7', 'VI7', 'ii9', 'V7'],
      ['I', 'iii7', 'IVmaj7', 'iv6'],
      ['Imaj7', 'I7', 'IVmaj7', 'iv6'],
    ],
    close: [
      ['ii9', 'V7', 'Imaj7', 'I6'],
      ['IVmaj7', 'iv6', 'Imaj7', 'Imaj7'],
      ['vi7', 'ii9', 'V7', 'I6'],
    ],
  },
  b: {
    open: [
      ['IVmaj7', 'IVmaj7', 'iii7', 'VI7'],
      ['ii9', 'V7', 'iii7', 'VI7b9'],
    ],
    close: [
      ['ii9', 'V7', 'iii7', 'V7sus4'],
      ['IVmaj7', 'iv6', 'ii9', 'V7'],
    ],
  },
  rhythms: [[0, 1, 2], [0, 2], [0], [0, 1.5, 2], [1, 2]],
  level: 0.8,
};

export const STYLES: readonly Style[] = [
  MORNING,
  SUMMER_MORNING,
  WINTER_MORNING,
  AFTERNOON,
  BOSSA,
  FESTIVAL,
  AUTUMN,
  EVENING,
  NIGHT,
  WALTZ,
];

/**
 * The style for an hour of a season (0 spring to 3 winter). A festival, outside winter, takes the
 * afternoon and the evening; summer afternoons play bossa.
 */
export function styleFor(hour: number, season: number, ctx?: MusicContext): Style {
  const phase = phaseOf(hour);
  if (season === 3) return phase === 'morning' ? WINTER_MORNING : WALTZ;
  if (ctx?.festival && (phase === 'afternoon' || phase === 'evening')) return FESTIVAL;
  if (phase === 'morning') return season === 1 ? SUMMER_MORNING : MORNING;
  if (phase === 'afternoon') return season === 1 ? BOSSA : season === 2 ? AUTUMN : AFTERNOON;
  return phase === 'evening' ? EVENING : NIGHT;
}

/** Quiet between pieces, seconds. */
export const GAP_SECONDS: [number, number] = [20, 90];
/** Quiet between pieces while a festival is on, seconds: the band plays nearly on. */
export const FESTIVAL_GAP_SECONDS: [number, number] = [5, 15];
/** Crossfade when the hour turns to a new style mid-piece, seconds. */
export const CROSSFADE_SECONDS = 4;
/** Keys a piece may be in (MIDI note of the tonic in the bass register). */
export const KEYS: readonly number[] = [48, 50, 51, 53, 55, 46];

export interface DirectorState {
  /** 'playing' a piece until `until`, or 'quiet' until `until` (seconds on the audio clock). */
  mode: 'playing' | 'quiet';
  until: number;
  style: string;
  /** The last two piece seeds, never played again straight away. */
  recent: number[];
}

export function startDirector(now: number): DirectorState {
  // A short breath before the first piece, so the valley is heard first.
  return { mode: 'quiet', until: now + 6, style: '', recent: [] };
}

/** A piece to play: its style, seed and key. */
export interface PieceChoice {
  style: Style;
  seed: number;
  key: number;
  /** Combined pass: the valley's seed, for its motif (absent: no motif). */
  valleySeed?: number;
  /** Combined pass: how big the band is, 0 hamlet to 4 city (absent: the full style). */
  ensemble?: number;
  /** Combined pass: the weather softens or thins the band (absent: clear). */
  weather?: string;
}

/**
 * Moves the director on: when a piece ends, a quiet gap of GAP_SECONDS; when a gap ends, a new
 * piece in the hour's style that is not one of the last two. Returns the piece to start, if any.
 */
export function stepDirector(
  d: DirectorState,
  now: number,
  hour: number,
  season: number,
  rand: Rand,
  pieceSeconds: (choice: PieceChoice) => number,
  ctx?: MusicContext,
): PieceChoice | null {
  if (now < d.until) return null;
  if (d.mode === 'playing') {
    d.mode = 'quiet';
    const [lo, hi] = ctx?.festival ? FESTIVAL_GAP_SECONDS : GAP_SECONDS;
    d.until = now + lo + rand() * (hi - lo);
    return null;
  }
  const style = styleFor(hour, season, ctx);
  let seed = Math.floor(rand() * 64);
  for (let i = 0; i < 8 && d.recent.includes(seed); i++) seed = Math.floor(rand() * 64);
  const choice: PieceChoice = { style, seed, key: pick(rand, KEYS) };
  if (ctx) {
    choice.valleySeed = ctx.valleySeed;
    choice.ensemble = ctx.rank;
    choice.weather = ctx.weather;
  }
  d.recent = [...d.recent, seed].slice(-2);
  d.mode = 'playing';
  d.style = style.id;
  d.until = now + pieceSeconds(choice);
  return choice;
}
