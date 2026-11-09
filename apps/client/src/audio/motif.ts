// The valley motif: a short tune (four bars of 4/4) that belongs to one valley. Both seats derive
// the same one from the valley's seed, and it is never saved. The composer opens some pieces with
// it, so the town gets a melody it can call its own. Pure and deterministic.
//
// Degrees are scale degrees: 1 is the tonic, 8 the tonic an octave up, 0 and below sit under the
// tonic (5 an octave down is -2). `rhythm` holds the beats of each note, so a motif has one entry
// per note in both lists, and the rhythms add up to 16 beats (12 after `adaptMotif` for 3/4).
import { seededRand, type Rand } from './rng';

export interface Motif {
  degrees: number[];
  rhythm: number[];
}

interface Shape {
  id: string;
  contour: readonly number[];
  rhythm: readonly number[];
}

/** Twelve hand-authored shapes. Each spans a ninth or less, ends on 1, 3 or 5, and adds to 16 beats. */
export const SHAPES: readonly Shape[] = [
  {
    id: 'porch-light',
    contour: [3, 5, 6, 5, 3, 5, 8, 7, 6, 5, 3],
    rhythm: [1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 4],
  },
  {
    id: 'kettle-on',
    contour: [5, 5, 6, 5, 8, 7, 5, 5, 6, 5, 9, 7, 5],
    rhythm: [1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 2],
  },
  {
    id: 'river-stones',
    contour: [1, 2, 3, 2, 1, 2, 3, 5, 3, 2, 3, 5, 6, 5, 3],
    rhythm: [1, 0.5, 0.5, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2],
  },
  {
    id: 'lantern-walk',
    contour: [-2, 1, 3, 5, 3, 6, 5, 3, 2, 3, 5, 6, 5, 3],
    rhythm: [2, 1, 1, 2, 2, 1, 0.5, 0.5, 1, 1, 1, 0.5, 0.5, 2],
  },
  {
    id: 'hay-wagon',
    contour: [1, 3, 5, 5, 6, 5, 3, 2, 3, 5, 3, 2, 1],
    rhythm: [1, 1, 1, 0.5, 0.5, 1, 3, 1, 1, 1, 1, 1, 3],
  },
  {
    id: 'morning-bread',
    contour: [8, 7, 5, 3, 5, 6, 5, 3, 2, 3, 1],
    rhythm: [2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 4],
  },
  {
    id: 'low-fog',
    contour: [-2, -1, 1, 2, 3, 2, 1, -1, -2, -1, 1, 3, 2, 1, -2],
    rhythm: [2, 0.5, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  },
  {
    id: 'swallow-turn',
    contour: [5, 8, 7, 5, 6, 5, 3, 2, 3, 5, 3],
    rhythm: [1, 2, 1, 2, 2, 1, 1, 1, 1, 2, 2],
  },
  {
    id: 'market-bell',
    contour: [5, 5, 8, 6, 5, 3, 5, 6, 8, 7, 6, 5],
    rhythm: [1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 4],
  },
  {
    id: 'candle-stub',
    contour: [3, 2, 1, 2, 3, 5, 6, 5, 3, 2, 3, 1],
    rhythm: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 4],
  },
  {
    id: 'old-gate',
    contour: [1, 5, 6, 5, 3, 2, 3, 5, 6, 8, 6, 5],
    rhythm: [2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 3],
  },
  {
    id: 'fiddle-skip',
    contour: [3, 5, 3, 1, 3, 5, 6, 8, 7, 6, 5, 3],
    rhythm: [1.5, 0.5, 1, 1, 2, 2, 1.5, 0.5, 1, 1, 1, 3],
  },
];

interface MNote {
  beat: number;
  degree: number;
  beats: number;
}

function toNotes(shape: Shape): MNote[] {
  let beat = 0;
  return shape.contour.map((degree, i) => {
    const beats = shape.rhythm[i]!;
    const n = { beat, degree, beats };
    beat += beats;
    return n;
  });
}

/** Each returns the varied notes, or null when it does not apply. `r` (0 to 1) picks which note. */
type Variation = (notes: readonly MNote[], r: number) => MNote[] | null;

const indexes = (notes: readonly MNote[], ok: (i: number) => boolean): number[] =>
  notes.map((_, i) => i).filter(ok);

const VARIATIONS: readonly Variation[] = [
  // A neighbor ornament on a weak beat: the note, its upper or lower neighbor, the note again.
  (notes, r) => {
    const idx = indexes(notes, (i) => {
      const n = notes[i]!;
      return n.beats >= 1.5 && Number.isInteger(n.beat) && n.beat % 2 === 1;
    });
    if (!idx.length) return null;
    const i = idx[Math.floor(r * idx.length)]!;
    const n = notes[i]!;
    const nb = n.degree + ((r * 997) % 1 < 0.5 ? 1 : -1);
    const out = notes.slice();
    out.splice(
      i,
      1,
      { beat: n.beat, degree: n.degree, beats: 0.5 },
      { beat: n.beat + 0.5, degree: nb, beats: 0.5 },
      { beat: n.beat + 1, degree: n.degree, beats: n.beats - 1 },
    );
    return out;
  },
  // Rhythmic displacement: one onset, not the first, an eighth early.
  (notes, r) => {
    const idx = indexes(notes, (i) => i > 0 && notes[i - 1]!.beats >= 1);
    if (!idx.length) return null;
    const i = idx[Math.floor(r * idx.length)]!;
    return notes.map((n, k) =>
      k === i - 1
        ? { ...n, beats: n.beats - 0.5 }
        : k === i
          ? { ...n, beat: n.beat - 0.5, beats: n.beats + 0.5 }
          : n,
    );
  },
  // A passing tone between two notes a third apart.
  (notes, r) => {
    const idx = indexes(
      notes,
      (i) =>
        i < notes.length - 1 &&
        notes[i]!.beats >= 1 &&
        Math.abs(notes[i + 1]!.degree - notes[i]!.degree) === 2,
    );
    if (!idx.length) return null;
    const i = idx[Math.floor(r * idx.length)]!;
    const a = notes[i]!;
    const b = notes[i + 1]!;
    const out = notes.slice();
    out.splice(
      i,
      1,
      { beat: a.beat, degree: a.degree, beats: a.beats - 0.5 },
      { beat: a.beat + a.beats - 0.5, degree: (a.degree + b.degree) / 2, beats: 0.5 },
    );
    return out;
  },
  // Interval swap: an interior note moves one degree and keeps the contour's direction.
  (notes, r) => {
    const opts: [number, number][] = [];
    for (let i = 1; i < notes.length - 1; i++) {
      const p = notes[i - 1]!.degree;
      const d = notes[i]!.degree;
      const q = notes[i + 1]!.degree;
      if (Math.sign(d - p) === 0 || Math.sign(q - d) === 0) continue;
      for (const by of [1, -1]) {
        const e = d + by;
        if (Math.sign(e - p) === Math.sign(d - p) && Math.sign(q - e) === Math.sign(q - d))
          opts.push([i, by]);
      }
    }
    if (!opts.length) return null;
    const [i, by] = opts[Math.floor(r * opts.length)]!;
    return notes.map((n, k) => (k === i ? { ...n, degree: n.degree + by } : n));
  },
];

function valid(notes: readonly MNote[]): boolean {
  const ds = notes.map((n) => n.degree);
  const last = notes[notes.length - 1]!;
  const end = (((last.degree - 1) % 7) + 7) % 7;
  return (
    Math.max(...ds) - Math.min(...ds) <= 8 &&
    (end === 0 || end === 2 || end === 4) &&
    Math.abs(last.beat + last.beats - 16) < 1e-9 &&
    notes.every((n) => Number.isInteger(n.degree) && n.beats >= 0.5)
  );
}

/** The valley's motif for a seed: the same four bars on every machine. */
export function valleyMotif(valleySeed: number): Motif {
  const rand: Rand = seededRand(valleySeed);
  const shape = SHAPES[Math.floor(rand() * SHAPES.length)]!;
  const plain = toNotes(shape);
  let notes: MNote[] = plain;
  const count = Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const kind = Math.floor(rand() * VARIATIONS.length);
    const r = rand();
    notes = VARIATIONS[kind]!(notes, r) ?? notes;
  }
  const out = valid(notes) ? notes : plain;
  return { degrees: out.map((n) => n.degree), rhythm: out.map((n) => n.beats) };
}

/**
 * The motif in a meter. 4/4 is as written; 3/4 scales the beats to 12 and snaps note ends to
 * sixteenths (a note that would be shorter than that is dropped and its time goes to the next).
 */
export function adaptMotif(m: Motif, meter: 3 | 4): Motif {
  if (meter === 4) return m;
  const degrees: number[] = [];
  const rhythm: number[] = [];
  let at = 0;
  let snapped = 0;
  m.rhythm.forEach((r, i) => {
    at += r * 0.75;
    const end = Math.round(at * 4) / 4;
    if (end - snapped >= 0.25) {
      degrees.push(m.degrees[i]!);
      rhythm.push(end - snapped);
      snapped = end;
    }
  });
  const total = rhythm.reduce((a, b) => a + b, 0);
  if (rhythm.length && Math.abs(total - 12) > 1e-9)
    rhythm[rhythm.length - 1] = rhythm[rhythm.length - 1]! + 12 - total;
  return { degrees, rhythm };
}
