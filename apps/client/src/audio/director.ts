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

export type CompPattern = 'arp' | 'block' | 'broken' | 'charleston' | 'oompah' | 'pad' | 'travis';
export type BassPattern = 'pedal' | 'root5' | 'sparse' | 'walk';
export type DrumPattern = 'brushes' | 'jazz' | 'shaker';

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

const MAJOR_A = {
  open: [
    ['Iadd9', 'vi7', 'IVmaj7', 'V'],
    ['I', 'iii7', 'IVadd9', 'V'],
    ['Imaj7', 'IVmaj7', 'Imaj7', ['ii7', 'V']],
    ['I', 'V', 'vi7', 'IVadd9'],
  ],
  close: [
    ['Iadd9', 'vi7', ['ii7', 'V7'], 'I'],
    ['IVmaj7', 'iii7', ['ii7', 'V7'], 'Iadd9'],
    ['vi7', 'IVmaj7', ['IV', 'V7'], 'I'],
  ],
} as const;

const MAJOR_B = {
  open: [
    ['IVmaj7', 'V', 'iii7', 'vi7'],
    ['vi7', 'iii7', 'IVmaj7', 'Iadd9'],
    ['IVadd9', 'I', 'IVadd9', 'I'],
  ],
  close: [
    ['ii7', 'V', 'iii7', 'vi7'],
    ['IVmaj7', 'iii7', 'ii7', 'V7sus4'],
    ['ii7', 'iii7', 'IVmaj7', 'V7'],
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
  lead: ['flute', 'kalimba'],
  range: [64, 84],
  comp: { inst: 'guitar', pattern: 'travis' },
  bass: { inst: 'bass', pattern: 'sparse' },
  drums: 'shaker',
  sparkle: 'glock',
  a: MAJOR_A,
  b: MAJOR_B,
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
  lead: ['celesta'],
  range: [67, 88],
  comp: { inst: 'piano', pattern: 'broken' },
  bass: null,
  drums: null,
  pad: 'strings',
  sparkle: undefined,
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
  a: MAJOR_A,
  b: MAJOR_B,
  rhythms: RHYTHMS_4,
  level: 0.85,
};

const AUTUMN: Style = {
  id: 'autumn',
  tempo: [80, 90],
  meter: 4,
  swing: 0.5,
  mode: 'minor',
  lead: ['piano', 'flute'],
  range: [62, 82],
  comp: { inst: 'guitar', pattern: 'arp' },
  bass: { inst: 'bass', pattern: 'root5' },
  drums: 'brushes',
  pad: 'strings',
  a: {
    open: [
      ['i', 'VI', 'III', 'VII'],
      ['i', 'iv7', 'VII', 'III'],
      ['i7', 'VImaj7', 'iv7', 'V'],
    ],
    close: [
      ['VI', 'iv7', 'V', 'i'],
      ['iv7', 'VII', ['iv', 'V7'], 'i'],
    ],
  },
  b: {
    open: [
      ['III', 'VII', 'VI', 'III'],
      ['VImaj7', 'VII', 'III', 'VI'],
    ],
    close: [
      ['iv7', 'VII', 'III', 'V'],
      ['VI', 'iv7', 'VII', 'V7'],
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
  lead: ['vibes', 'flute'],
  range: [62, 82],
  comp: { inst: 'epiano', pattern: 'charleston' },
  bass: { inst: 'bass', pattern: 'walk' },
  drums: 'jazz',
  a: {
    open: [
      ['Imaj7', 'vi9', 'ii9', 'V9'],
      ['Imaj7', 'IVmaj7', 'iii7', 'vi9'],
      ['iii7', 'vi7', 'ii9', 'V7'],
    ],
    close: [
      ['ii9', 'V9', 'Imaj7', 'vi9'],
      ['IVmaj7', 'iii7', ['ii9', 'V9'], 'Imaj7'],
      [['iii7', 'vi7'], ['ii9', 'V9'], 'Imaj7', 'I6'],
    ],
  },
  b: {
    open: [
      ['IVmaj7', 'IVmaj7', 'iii7', 'vi9'],
      ['ii9', 'V9', 'iii7', 'vi9'],
    ],
    close: [
      ['ii9', 'V9', 'iii7', 'V7sus4'],
      ['IVmaj7', 'iii7', 'ii9', 'V9'],
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
  lead: ['celesta', 'vibes'],
  range: [67, 88],
  comp: { inst: 'strings', pattern: 'pad' },
  bass: { inst: 'bass', pattern: 'pedal' },
  drums: null,
  a: {
    open: [
      ['Imaj7', 'IVmaj7', 'Imaj7', 'IVmaj7'],
      ['Iadd9', 'vi7', 'IVmaj7', 'Iadd9'],
    ],
    close: [
      ['vi7', 'IVmaj7', 'V7sus4', 'Iadd9'],
      ['IVmaj7', 'iii7', 'IVmaj7', 'Imaj7'],
    ],
  },
  b: {
    open: [['vi7', 'iii7', 'IVmaj7', 'Imaj7']],
    close: [['IVmaj7', 'Iadd9', 'IVmaj7', 'V7sus4']],
  },
  rhythms: [[0, 2], [0, 1.5, 3], [0], [1, 2.5], [0, 3]],
  level: 0.65,
};

/** Winter afternoons, evenings and nights waltz. */
const WALTZ: Style = {
  id: 'waltz',
  tempo: [108, 124],
  meter: 3,
  swing: 0.5,
  mode: 'major',
  lead: ['piano', 'celesta'],
  range: [64, 86],
  comp: { inst: 'piano', pattern: 'oompah' },
  bass: null,
  drums: null,
  pad: 'strings',
  sparkle: 'glock',
  a: {
    open: [
      ['I', 'I', 'IV', 'V'],
      ['I', 'vi', 'ii', 'V'],
      ['I', 'iii', 'IV', 'V7'],
    ],
    close: [
      ['I', 'IV', 'V7', 'I'],
      ['vi', 'ii', 'V7', 'I'],
    ],
  },
  b: {
    open: [
      ['IV', 'I', 'IV', 'I'],
      ['vi', 'iii', 'IV', 'I'],
    ],
    close: [
      ['ii', 'V', 'iii', 'vi'],
      ['IV', 'I', 'ii', 'V7'],
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
  AUTUMN,
  EVENING,
  NIGHT,
  WALTZ,
];

/** The style for an hour of a season (0 spring to 3 winter). */
export function styleFor(hour: number, season: number): Style {
  const phase = phaseOf(hour);
  if (season === 3) return phase === 'morning' ? WINTER_MORNING : WALTZ;
  if (phase === 'morning') return season === 1 ? SUMMER_MORNING : MORNING;
  if (phase === 'afternoon') return season === 2 ? AUTUMN : AFTERNOON;
  return phase === 'evening' ? EVENING : NIGHT;
}

/** Quiet between pieces, seconds. */
export const GAP_SECONDS: [number, number] = [20, 90];
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
): PieceChoice | null {
  if (now < d.until) return null;
  if (d.mode === 'playing') {
    d.mode = 'quiet';
    d.until = now + GAP_SECONDS[0] + rand() * (GAP_SECONDS[1] - GAP_SECONDS[0]);
    return null;
  }
  const style = styleFor(hour, season);
  let seed = Math.floor(rand() * 64);
  for (let i = 0; i < 8 && d.recent.includes(seed); i++) seed = Math.floor(rand() * 64);
  const choice: PieceChoice = { style, seed, key: pick(rand, KEYS) };
  d.recent = [...d.recent, seed].slice(-2);
  d.mode = 'playing';
  d.style = style.id;
  d.until = now + pieceSeconds(choice);
  return choice;
}
