// The composer (C5G): writes a short piece in a style as a list of notes, from a seed, so the same
// piece always sounds the same and nothing is stored. Pure; the music player schedules the notes.
// A piece is 12 to 24 bars in an A A B A form: a melody motif over a chord loop, a bass line, the
// chords comped on the lead's instrument, and brushes where the style has them.
import type { PieceChoice, Style } from './director';
import { pick, seededRand, type Rand } from './rng';

export type Voice = 'lead' | 'comp' | 'bass' | 'brush' | 'pad';

export interface Note {
  /** Start in beats from the top of the piece. */
  beat: number;
  /** Length in beats. */
  len: number;
  /** MIDI note (brush notes are 0). */
  midi: number;
  voice: Voice;
  /** 0 to 1. */
  vel: number;
}

export interface Piece {
  style: string;
  tempo: number;
  meter: 3 | 4;
  bars: number;
  notes: Note[];
  /** Length in seconds, including a bar to let the last notes ring. */
  seconds: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

/** Scale degree (0 to 6) and whether a seventh is added, from 'IVmaj7', 'ii7', 'V'. */
export function parseChord(symbol: string): { degree: number; seventh: boolean } {
  const m = /^([ivIV]+)/.exec(symbol);
  const degree = NUMERALS.indexOf((m?.[1] ?? 'i').toLowerCase());
  return { degree: Math.max(0, degree), seventh: symbol.includes('7') };
}

/** The scale step `n` (may run past an octave) as semitones above the tonic. */
function step(scale: readonly number[], n: number): number {
  const o = Math.floor(n / 7);
  return scale[((n % 7) + 7) % 7]! + 12 * o;
}

/** Chord tones as semitones above the tonic: stacked diatonic thirds from the degree. */
export function chordTones(symbol: string, mode: 'major' | 'minor'): number[] {
  const scale = mode === 'major' ? MAJOR : MINOR;
  const { degree, seventh } = parseChord(symbol);
  const tones = [step(scale, degree), step(scale, degree + 2), step(scale, degree + 4)];
  if (seventh) tones.push(step(scale, degree + 6));
  return tones;
}

/** Fits a pitch class into [lo, hi] (MIDI). */
function fit(midi: number, lo: number, hi: number): number {
  let m = midi;
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}

/** A melody motif: onsets in eighths within a bar, and a contour of scale steps. */
interface Motif {
  onsets: number[];
  contour: number[];
}

function makeMotif(rand: Rand, meter: number, density: number): Motif {
  const slots = meter * 2;
  const count = Math.max(1, Math.min(slots, density + Math.floor(rand() * 2) - 1));
  const set = new Set<number>([0]);
  while (set.size < count) set.add(Math.floor(rand() * slots));
  const onsets = [...set].sort((a, b) => a - b);
  const contour: number[] = [];
  let c = 0;
  for (let i = 0; i < onsets.length; i++) {
    contour.push(c);
    c += pick(rand, [-2, -1, -1, 1, 1, 2, 0]);
  }
  return { onsets, contour };
}

function sectionBars(style: Style): number {
  return style.id === 'night' ? 3 : style.meter === 3 ? 6 : 4;
}

/** Writes the piece a director's choice names. */
export function compose(choice: PieceChoice): Piece {
  const { style, key } = choice;
  const rand = seededRand(choice.seed * 7919 + key * 31 + style.id.length);
  const tempo = Math.round(style.tempo[0] + rand() * (style.tempo[1] - style.tempo[0]));
  const meter = style.meter;
  const scale = style.mode === 'major' ? MAJOR : MINOR;
  const progA = pick(rand, style.progressions);
  const progB = pick(rand, style.progressions);
  const per = sectionBars(style);
  const form: ('A' | 'B')[] = ['A', 'A', 'B', 'A'];
  const bars = per * form.length;
  const notes: Note[] = [];
  const motifA = makeMotif(rand, meter, style.density);
  const motifB = makeMotif(rand, meter, style.density);
  const swing = (eighth: number): number => (style.swing && eighth % 2 === 1 ? eighth + 0.33 : eighth) / 2;
  const tonicHigh = fit(key + 12, 67, 78);

  for (let bar = 0; bar < bars; bar++) {
    const section = form[Math.floor(bar / per)]!;
    const prog = section === 'A' ? progA : progB;
    const symbol = prog[bar % prog.length]!;
    const tones = chordTones(symbol, style.mode);
    const next = chordTones(prog[(bar + 1) % prog.length]!, style.mode);
    const t0 = bar * meter;
    const last = bar === bars - 1;
    const root = fit(key + tones[0]!, 38, 52);

    // Bass.
    if (style.swing) {
      const walk = [
        root,
        fit(key + tones[1]!, 38, 55),
        fit(key + tones[2]!, 38, 55),
        fit(key + next[0]!, 38, 52) - 1,
      ];
      for (let b = 0; b < meter; b++)
        notes.push({ beat: t0 + b, len: 0.9, midi: walk[b]!, voice: 'bass', vel: 0.55 });
    } else if (meter === 3) {
      notes.push({ beat: t0, len: 1, midi: root, voice: 'bass', vel: 0.6 });
    } else {
      notes.push({ beat: t0, len: 1.8, midi: root, voice: 'bass', vel: 0.6 });
      notes.push({ beat: t0 + 2, len: 1.8, midi: fit(key + tones[2]!, 38, 55), voice: 'bass', vel: 0.5 });
    }

    // Chords.
    const voicing = tones.map((t) => fit(key + t, 55, 70)).sort((a, b) => a - b);
    if (style.id === 'night') {
      for (const m of voicing) notes.push({ beat: t0, len: meter, midi: m, voice: 'pad', vel: 0.3 });
    } else if (meter === 3) {
      for (const b of [1, 2])
        for (const m of voicing) notes.push({ beat: t0 + b, len: 0.7, midi: m, voice: 'comp', vel: 0.3 });
    } else if (style.lead === 'guitar') {
      const arp = [...voicing, ...voicing.slice(1, -1).reverse()];
      for (let e = 0; e < 8; e++)
        notes.push({ beat: t0 + e / 2, len: 0.9, midi: arp[e % arp.length]!, voice: 'comp', vel: 0.28 });
    } else {
      for (const m of voicing) notes.push({ beat: t0, len: 1.6, midi: m, voice: 'comp', vel: 0.3 });
      for (const m of voicing) notes.push({ beat: t0 + swing(5), len: 1, midi: m, voice: 'comp', vel: 0.22 });
    }

    // Melody: the section's motif placed on this bar's chord, resolving home in the last bar.
    const motif = section === 'A' ? motifA : motifB;
    const anchor = fit(key + tones[bar % 2 === 0 ? 0 : 2]!, 67, 81);
    if (last) {
      notes.push({ beat: t0, len: meter, midi: tonicHigh, voice: 'lead', vel: 0.5 });
    } else {
      motif.onsets.forEach((o, i) => {
        const deg = scale.findIndex((s) => (anchor - key - s) % 12 === 0);
        const n = deg >= 0 ? step(scale, deg + motif.contour[i]!) : anchor - key;
        const midi = fit(key + n, 65, 84);
        const nextOnset = motif.onsets[i + 1] ?? meter * 2;
        notes.push({
          beat: t0 + swing(o),
          len: Math.max(0.5, (nextOnset - o) / 2),
          midi,
          voice: 'lead',
          vel: 0.45 + rand() * 0.15,
        });
      });
    }

    // Brushes on two and four.
    if (style.brushes && !last) {
      for (const b of meter === 4 ? [1, 3] : [1])
        notes.push({ beat: t0 + b, len: 0.25, midi: 0, voice: 'brush', vel: 0.35 });
      if (style.swing) notes.push({ beat: t0 + swing(7), len: 0.15, midi: 0, voice: 'brush', vel: 0.2 });
    }
  }
  notes.sort((a, b) => a.beat - b.beat);
  const seconds = ((bars + 1) * meter * 60) / tempo;
  return { style: style.id, tempo, meter, bars, notes, seconds };
}
