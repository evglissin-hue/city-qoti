// The music director (C5G): which kind of music suits the hour and the season, when a piece plays
// and when the valley is quiet. Pure, so it is tested without sound. docs/spec/17-presentation.md,
// Audio: acoustic guitar, piano, upright bass and brushes; light jazz chords in the evening, a waltz
// in winter; music that follows the hour and the season, with quiet between pieces.
import { pick, type Rand } from './rng';

export type Phase = 'morning' | 'afternoon' | 'evening' | 'night';

/** Morning 5 to 11, afternoon 11 to 17, evening 17 to 21, night 21 to 5. */
export function phaseOf(hour: number): Phase {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/** A style the composer writes in. */
export interface Style {
  id: string;
  /** Beats per minute. */
  tempo: [min: number, max: number];
  meter: 3 | 4;
  /** Swung eighths (evening jazz). */
  swing: boolean;
  /** Chord progressions in scale degrees (1 to 7); `7` marks a seventh chord. */
  progressions: readonly (readonly string[])[];
  /** The lead: plucked guitar, piano, or a soft bell for night. */
  lead: 'guitar' | 'piano' | 'bell';
  /** Brushes on the drum. */
  brushes: boolean;
  /** Notes per bar the melody aims for (1 sparse to 6 busy). */
  density: number;
  /** Major or minor. */
  mode: 'major' | 'minor';
}

const MORNING: Style = {
  id: 'morning',
  tempo: [84, 96],
  meter: 4,
  swing: false,
  progressions: [
    ['I', 'vi', 'IV', 'V'],
    ['I', 'iii', 'IV', 'V'],
    ['I', 'V', 'vi', 'IV'],
  ],
  lead: 'guitar',
  brushes: false,
  density: 4,
  mode: 'major',
};

const AFTERNOON: Style = {
  id: 'afternoon',
  tempo: [88, 100],
  meter: 4,
  swing: false,
  progressions: [
    ['I', 'IV', 'ii', 'V'],
    ['I', 'V', 'vi', 'IV'],
    ['IV', 'I', 'ii', 'V'],
  ],
  lead: 'piano',
  brushes: true,
  density: 4,
  mode: 'major',
};

const EVENING: Style = {
  id: 'evening',
  tempo: [72, 84],
  meter: 4,
  swing: true,
  progressions: [
    ['Imaj7', 'vi7', 'ii7', 'V7'],
    ['Imaj7', 'IVmaj7', 'iii7', 'vi7', 'ii7', 'V7', 'Imaj7', 'V7'],
    ['ii7', 'V7', 'Imaj7', 'vi7'],
  ],
  lead: 'piano',
  brushes: true,
  density: 3,
  mode: 'major',
};

const NIGHT: Style = {
  id: 'night',
  tempo: [60, 68],
  meter: 4,
  swing: false,
  progressions: [
    ['Imaj7', 'IVmaj7'],
    ['vi7', 'IVmaj7', 'Imaj7', 'V7'],
  ],
  lead: 'bell',
  brushes: false,
  density: 2,
  mode: 'major',
};

/** Winter evenings and nights waltz. */
const WALTZ: Style = {
  id: 'waltz',
  tempo: [108, 126],
  meter: 3,
  swing: false,
  progressions: [
    ['I', 'IV', 'V', 'I'],
    ['I', 'vi', 'ii', 'V'],
    ['I', 'iii', 'IV', 'V'],
  ],
  lead: 'piano',
  brushes: false,
  density: 3,
  mode: 'major',
};

/** Autumn afternoons turn a little wistful. */
const AUTUMN: Style = {
  ...AFTERNOON,
  id: 'autumn',
  tempo: [80, 92],
  mode: 'minor',
  progressions: [
    ['i', 'VI', 'III', 'VII'],
    ['i', 'iv', 'VII', 'III'],
  ],
};

/** The style for an hour of a season (0 spring to 3 winter). */
export function styleFor(hour: number, season: number): Style {
  const phase = phaseOf(hour);
  if (season === 3 && (phase === 'evening' || phase === 'night' || phase === 'afternoon')) return WALTZ;
  if (season === 2 && phase === 'afternoon') return AUTUMN;
  return phase === 'morning'
    ? MORNING
    : phase === 'afternoon'
      ? AFTERNOON
      : phase === 'evening'
        ? EVENING
        : NIGHT;
}

export const STYLES: readonly Style[] = [MORNING, AFTERNOON, EVENING, NIGHT, WALTZ, AUTUMN];

/** Quiet between pieces, seconds. */
export const GAP_SECONDS: [number, number] = [20, 90];
/** Crossfade when the hour turns to a new style mid-piece, seconds. */
export const CROSSFADE_SECONDS = 4;
/** Keys a piece may be in (MIDI note of the tonic in the bass register). */
export const KEYS: readonly number[] = [48, 50, 53, 55, 46, 51];

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
