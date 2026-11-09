// The composer (C5G): writes a whole piece in a style from a seed, so the same piece always
// sounds the same and nothing is stored. Pure; the music player schedules the notes.
//
// A piece is built the way a songwriter would: a short intro on the accompaniment; an eight-bar A
// of two phrases (the first ends away from home, the second comes home); A again with a new
// ending; a B in a higher register that turns back; A once more, as it first was, with a bell
// doubling the tune; and a slowing outro on the home chord. The melody puts chord tones on the
// strong beats and steps between them, rises to the middle of a phrase and settles at its end,
// and its second bar answers the first with the same rhythm a step away. Chords are voiced close
// to the last voicing, so the hands barely move; the bass and the drums play figures that suit the
// style; the off-beats swing in the evening; and the tempo eases off at the very end.
import type { Bar, CompPattern, PieceChoice, Style } from './director';
import { pick, seededRand, type Rand } from './rng';
import { adaptMotif, valleyMotif, type Motif } from './motif';
import type { Instrument } from './synth/instruments';

export type Voice = 'lead' | 'sparkle' | 'comp' | 'bass' | 'pad' | 'drums';

export interface Note {
  /** Seconds from the top of the piece. */
  time: number;
  /** Seconds the note is held (struck instruments ring past it until their release). */
  dur: number;
  /** MIDI note; for drums, a variation (1 to 4). */
  midi: number;
  inst: Instrument;
  voice: Voice;
  /** 0 to 1. */
  vel: number;
}

export interface Piece {
  style: string;
  key: number;
  tempo: number;
  meter: 3 | 4;
  bars: number;
  notes: Note[];
  /** Length in seconds, including the last chord's ring. */
  seconds: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

export interface ChordInfo {
  degree: number;
  /** Semitones above the tonic, root first: root, third, fifth, then any colors. */
  tones: number[];
  /** Root, third and fifth only (what a melody's strong beat may land on). */
  triad: number[];
}

function step(scale: readonly number[], n: number): number {
  return scale[((n % 7) + 7) % 7]! + 12 * Math.floor(n / 7);
}

/**
 * Reads a chord symbol: `[b|#]? NUMERAL QUALITY? EXTENSIONS*`, as in 'IVmaj7', 'bVII13', 'ii9',
 * 'V7sus4', 'iiø7', 'Iadd9', 'I69'. The numeral's case sets the triad (upper major, lower minor);
 * 'o' and 'ø7' are diminished and half-diminished; the extensions stack on top.
 */
export function chordInfo(symbol: string, mode: 'major' | 'minor'): ChordInfo {
  const m = /^([b#]?)([ivIV]+)(.*)$/.exec(symbol);
  const num = m?.[2] ?? 'i';
  const degree = Math.max(0, NUMERALS.indexOf(num.toLowerCase()));
  const scale = mode === 'major' ? MAJOR : MINOR;
  const root = step(scale, degree) + (m?.[1] === 'b' ? -1 : m?.[1] === '#' ? 1 : 0);
  let rest = m?.[3] ?? '';
  const take = (t: string): boolean => {
    const i = rest.indexOf(t);
    if (i < 0) return false;
    rest = rest.slice(0, i) + rest.slice(i + t.length);
    return true;
  };
  let third = num === num.toUpperCase() ? 4 : 3;
  let fifth = 7;
  const ext = new Set<number>();
  if (take('ø7')) {
    third = 3;
    fifth = 6;
    ext.add(10);
  } else if (take('o7')) {
    third = 3;
    fifth = 6;
    ext.add(9);
  } else if (take('o')) {
    third = 3;
    fifth = 6;
  }
  if (take('maj9')) {
    ext.add(11);
    ext.add(14);
  }
  if (take('maj7')) ext.add(11);
  if (take('add9')) ext.add(14);
  if (take('sus4')) third = 5;
  if (take('#11')) ext.add(18);
  if (take('7b9')) {
    ext.add(10);
    ext.add(13);
  }
  if (take('13')) {
    ext.add(10);
    ext.add(14);
    ext.add(21);
  }
  if (take('69')) {
    ext.add(9);
    ext.add(14);
  }
  if (take('11')) {
    ext.add(10);
    ext.add(14);
    ext.add(17);
  }
  if (take('9')) {
    ext.add(10);
    ext.add(14);
  }
  if (take('7')) ext.add(10);
  if (take('6')) ext.add(9);
  const triad = [root, root + third, root + fifth];
  const tones = [...triad, ...[...ext].sort((x, y) => x - y).map((e) => root + e)];
  return { degree, tones, triad };
}

const pc = (n: number): number => ((n % 12) + 12) % 12;

/** Nearest MIDI note with pitch class `p` to `near`. */
function nearestPc(p: number, near: number): number {
  const base = near - pc(near - p);
  return near - base > 6 ? base + 12 : base;
}

/** Fits a pitch into [lo, hi] by octaves. */
function fit(midi: number, lo: number, hi: number): number {
  let m = midi;
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}

/** A chord span in beats from the top of the piece. */
interface Slot {
  at: number;
  beats: number;
  sym: string;
  chord: ChordInfo;
  /** Bar index and whether this slot starts the bar. */
  bar: number;
}

function slotsOf(bars: readonly Bar[], firstBar: number, meter: number, mode: 'major' | 'minor'): Slot[] {
  const out: Slot[] = [];
  bars.forEach((b, i) => {
    const at = (firstBar + i) * meter;
    if (typeof b === 'string')
      out.push({ at, beats: meter, sym: b, chord: chordInfo(b, mode), bar: firstBar + i });
    else {
      const half = meter === 3 ? 2 : meter / 2;
      out.push({ at, beats: half, sym: b[0], chord: chordInfo(b[0], mode), bar: firstBar + i });
      out.push({
        at: at + half,
        beats: meter - half,
        sym: b[1],
        chord: chordInfo(b[1], mode),
        bar: firstBar + i,
      });
    }
  });
  return out;
}

/** A note before timing: beats from the top. */
interface Draft {
  beat: number;
  beats: number;
  midi: number;
  inst: Instrument;
  voice: Voice;
  vel: number;
  /** Seconds after the beat (a guitar chord rolled across its strings). */
  delay?: number;
}

// --- Melody ---------------------------------------------------------------------------------------

interface Tune {
  notes: { beat: number; beats: number; midi: number; vel: number }[];
}

/** Pitch classes (above the tonic) as MIDI notes across the melody's range (and a little beyond). */
function scaleNotes(key: number, pcs: readonly number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo - 12; m <= hi + 12; m++) if (pcs.includes(pc(m - key))) out.push(m);
  return out;
}

/**
 * The scale a melody may wander in over a chord with tones outside the key: the key's scale with
 * each chromatic chord tone standing in for the nearest scale note, minus any note a half step
 * above a chord tone (it would rub on a held note). Null when the chord sits in the key.
 */
export function chordScale(chord: ChordInfo, mode: 'major' | 'minor'): number[] | null {
  const base = mode === 'major' ? MAJOR : MINOR;
  const tonePcs = [...new Set(chord.tones.map(pc))];
  // The minor key's dominant borrows the raised leading tone; the caller handles that one.
  if (mode === 'minor' && chord.degree === 4 && tonePcs.every((t) => base.includes(t) || t === 11))
    return null;
  const chromatic = tonePcs.filter((t) => !base.includes(t));
  if (!chromatic.length) return null;
  let set = [...base];
  for (const t of chromatic) {
    let best = -1;
    let bestD = 99;
    for (const n of set) {
      if (tonePcs.includes(n)) continue;
      const d = Math.min(pc(n - t), pc(t - n));
      if (d < bestD || (d === bestD && pc(n - t) > pc(t - n))) {
        bestD = d;
        best = n;
      }
    }
    if (best >= 0) set = set.filter((n) => n !== best).concat(t);
  }
  const safe = set.filter((n) => tonePcs.includes(n) || !tonePcs.includes(pc(n - 1)));
  return (safe.length >= 5 ? safe : set).sort((a, b) => a - b);
}

function chordAt(slots: Slot[], beat: number): Slot {
  let s = slots[0]!;
  for (const x of slots) if (x.at <= beat + 1e-6) s = x;
  return s;
}

/**
 * One four-bar phrase of melody over `slots`. `cadence` 'open' ends on the second or fifth of the
 * key (a question), 'close' on the tonic (the answer). `lift` raises the register (the B section).
 */
function phraseMelody(
  rand: Rand,
  style: Style,
  key: number,
  slots: Slot[],
  firstBar: number,
  cadence: 'open' | 'close',
  start: number,
  lift: number,
  /** Where the next phrase begins, so this one's last note leads into it. */
  endNear?: number,
  /** The valley's motif, to open this phrase with (its first two bars). */
  motif?: Motif,
): { notes: Tune['notes']; last: number } {
  const meter = style.meter;
  const [lo0, hi0] = style.range;
  const lo = lo0 + lift;
  const hi = hi0 + lift;
  const scale = scaleNotes(key, style.mode === 'major' ? MAJOR : MINOR, lo, hi);
  const chordScales = new Map<string, number[]>();
  // Over a chord outside the key, steps follow the chord's own scale; the minor dominant's
  // raised leading tone is the common case.
  const minorV = (s: Slot): number[] => {
    const hit = chordScales.get(s.sym);
    if (hit) return hit;
    const cs = chordScale(s.chord, style.mode);
    const out = cs
      ? scaleNotes(key, cs, lo, hi)
      : style.mode === 'minor' && s.chord.degree === 4
        ? [
            ...scale.filter((n) => pc(n - key) !== 10),
            ...scale.filter((n) => pc(n - key) === 10).map((n) => n + 1),
          ].sort((a, b) => a - b)
        : scale;
    chordScales.set(s.sym, out);
    return out;
  };
  const rA = pick(rand, style.rhythms);
  const rB = rand() < 0.6 ? rA : pick(rand, style.rhythms);
  const rC = pick(rand, style.rhythms);
  const cad = meter === 3 ? pick(rand, [[0], [0, 1]]) : pick(rand, [[0], [0, 2], [0, 1, 2]]);
  const bars = [rA, rB, rC, cad];
  const center = fit(key + 12 + (style.mode === 'major' ? 4 : 3), lo + 3, hi - 5);
  const span = 4 + Math.floor(rand() * 5);
  const out: Tune['notes'] = [];
  let p = Math.max(lo, Math.min(hi, start));
  let lastLeap = 0;
  const onsets: number[] = [];
  bars.forEach((r, b) => {
    if (!(motif && b < 2)) r.forEach((o) => onsets.push((firstBar + b) * meter + o));
  });
  const end = (firstBar + 4) * meter;
  if (motif) {
    // The valley's tune opens the phrase: its first two bars, in this key and range, with the
    // strong-beat notes nudged onto the chord.
    const steps = style.mode === 'major' ? MAJOR : MINOR;
    const sd = (d: number): number => step(steps, d - 1);
    const mid = motif.degrees.reduce((a, d) => a + d, 0) / motif.degrees.length;
    let tonic = key;
    while (tonic + sd(mid) < (lo + hi) / 2 - 6) tonic += 12;
    while (tonic + sd(mid) > (lo + hi) / 2 + 6) tonic -= 12;
    let at = 0;
    motif.degrees.forEach((d, i) => {
      const onset = at;
      at += motif.rhythm[i]!;
      if (onset >= 2 * meter - 1e-6) return;
      const beat = firstBar * meter + onset;
      const s = chordAt(slots, beat);
      let midi = tonic + sd(d);
      const strong =
        Math.abs(beat - s.at) < 1e-6 ||
        (meter === 4 ? Math.abs(onset % 2) < 1e-6 : Math.abs(onset % 3) < 1e-6);
      if (strong) {
        const cands = s.chord.triad
          .concat(s.chord.tones.slice(3))
          .map((t) => nearestPc(pc(key + t), midi))
          .filter((c) => c >= lo - 2 && c <= hi);
        if (cands.length) midi = cands.reduce((a, c) => (Math.abs(c - midi) < Math.abs(a - midi) ? c : a));
      }
      out.push({
        beat,
        beats: Math.min(motif.rhythm[i]!, 2 * meter - onset),
        midi,
        vel: 0.62 + (strong ? 0.05 : 0) + (rand() - 0.5) * 0.04,
      });
      p = midi;
    });
  }
  // Bar 2 answers bar 1: the same rhythm, its scale steps moved by `shift`.
  const shift = pick(rand, [-1, 1, -2, 2, 1]);
  const bar1: number[] = [];
  onsets.forEach((beat, i) => {
    const s = chordAt(slots, beat);
    const x = (beat - firstBar * meter) / (4 * meter);
    const arch =
      center + Math.round(Math.sin(Math.PI * Math.min(1, x * 1.15)) * span) - (cadence === 'close' ? 2 : 0);
    // A phrase that hands over to the theme drifts down (or up) to meet it.
    const target = endNear === undefined ? arch : Math.round(arch * (1 - x * x) + endNear * x * x);
    const rel = beat - s.at;
    const strong =
      Math.abs(rel) < 1e-6 ||
      (meter === 4 && Math.abs(beat % 2) < 1e-6) ||
      (meter === 3 && Math.abs(beat % 3) < 1e-6);
    const last = i === onsets.length - 1;
    const sc = minorV(s);
    const tones = s.chord.triad.concat(s.chord.tones.slice(3));
    let midi: number;
    if (last) {
      // The cadence: home for an answer; the second or fifth for a question.
      const want = cadence === 'close' ? [0] : endNear !== undefined ? [2, 7, 11, 4] : [2, 7];
      const cands = scale.filter((n) => want.includes(pc(n - key)) && n >= lo - 2 && n <= hi);
      const aim = endNear ?? target;
      const cost = (n: number) => Math.abs(n - aim) * (endNear !== undefined ? 2 : 1) + Math.abs(n - p) * 0.6;
      midi = cands.reduce((a, c) => (cost(c) < cost(a) ? c : a), cands[0] ?? p);
    } else if (
      i < onsets.length &&
      beat >= (firstBar + 1) * meter &&
      beat < (firstBar + 2) * meter &&
      rB === rA &&
      bar1.length
    ) {
      // Sequence: the first bar's shape, a step up or down, then nudged onto the chord where strong.
      const k = onsets.filter((o) => o >= (firstBar + 1) * meter && o < beat).length;
      const src = bar1[Math.min(k, bar1.length - 1)]!;
      const idx = Math.max(
        0,
        sc.findIndex((n) => n >= src),
      );
      midi = sc[Math.max(0, Math.min(sc.length - 1, idx + shift))]!;
      if (strong && !tones.some((t) => pc(midi - key - t) === 0)) {
        const near = tones
          .map((t) => nearestPc(pc(key + t), midi))
          .reduce((a, c) => (Math.abs(c - midi) < Math.abs(a - midi) ? c : a));
        midi = near;
      }
    } else if (strong) {
      // A chord tone, near the contour's target but not far from where we are.
      const cands: number[] = [];
      for (const t of tones.slice(0, 4)) for (let o = -24; o <= 24; o += 12) cands.push(key + t + o);
      const inRange = cands.filter((c) => c >= lo && c <= hi);
      const near = inRange.filter((c) => Math.abs(c - p) <= 7);
      const pool = near.length ? near : inRange;
      midi = pool.reduce((a, c) => {
        const cost = (n: number) => Math.abs(n - target) + Math.abs(n - p) * 0.8 + (n === p ? 1.5 : 0);
        return cost(c) < cost(a) ? c : a;
      }, pool[0] ?? p);
    } else {
      // A step (or now and then a small skip) toward where the line is heading.
      const dir =
        lastLeap > 4 ? -1 : lastLeap < -4 ? 1 : target > p ? 1 : target < p ? -1 : rand() < 0.5 ? 1 : -1;
      const idx = sc.findIndex((n) => n >= p);
      const by = rand() < 0.78 ? 1 : 2;
      midi = sc[Math.max(0, Math.min(sc.length - 1, (idx < 0 ? sc.length - 1 : idx) + dir * by))]!;
      if (midi < lo || midi > hi) midi = sc[Math.max(0, Math.min(sc.length - 1, idx - dir * by))]!;
    }
    lastLeap = midi - p;
    p = midi;
    if (beat >= firstBar * meter && beat < (firstBar + 1) * meter) bar1.push(midi);
    const next = onsets[i + 1] ?? end;
    const beats = last ? end - beat + (cadence === 'close' ? 0.5 : 0) : Math.min(2.5, next - beat);
    const arc = Math.sin(Math.PI * x);
    out.push({ beat, beats, midi, vel: 0.58 + 0.12 * arc + (strong ? 0.06 : 0) + (rand() - 0.5) * 0.06 });
  });
  // A phrase breathes: a gentle swell toward its highest note, and the last note settles, a little
  // softer and longer when there is room.
  const lowest = Math.min(...out.map((n) => n.midi));
  const highest = Math.max(...out.map((n) => n.midi));
  for (const n of out) n.vel *= 1 + (0.1 * (n.midi - lowest)) / Math.max(1, highest - lowest);
  const tail = out[out.length - 1];
  if (tail) {
    tail.vel *= 0.92;
    if (tail.beat + tail.beats * 1.15 <= end + 0.5) tail.beats *= 1.15;
  }
  return { notes: out, last: p };
}

// --- Accompaniment --------------------------------------------------------------------------------

/**
 * The four or so notes a hand plays for a chord. Plain triads stay triads; a chord with one color
 * keeps its fifth (root, third, fifth, color); richer ones drop the fifth for the third and the
 * colors (a 13th keeps its seventh and sixth, not its ninth). Jazz hands leave the root to the bass.
 */
function voiceTones(chord: ChordInfo, rootless: boolean): number[] {
  const [root, third, fifth] = chord.triad as [number, number, number];
  let ext = chord.tones.slice(3);
  const has = (semis: number) => ext.includes(root + semis);
  if (has(21) || has(17)) ext = ext.filter((t) => t !== root + 14);
  if (!ext.length) return [root, third, fifth];
  if (ext.length === 1) return rootless ? [third, fifth, ext[0]!] : [root, third, fifth, ext[0]!];
  return rootless ? [third, fifth, ext[0]!, ext[1]!] : [root, third, ext[0]!, ext[1]!];
}

/** The voicing of a chord closest to the last one, within [lo, hi]. */
function voice(
  chord: ChordInfo,
  key: number,
  prev: number[] | null,
  lo: number,
  hi: number,
  rootless: boolean,
): number[] {
  const tones = voiceTones(chord, rootless);
  const pcs = tones.map((t) => pc(key + t));
  const cands: number[][] = [];
  for (let inv = 0; inv < pcs.length; inv++) {
    const order = [...pcs.slice(inv), ...pcs.slice(0, inv)];
    for (let base = lo; base < lo + 12; base++) {
      if (pc(base) !== order[0]) continue;
      const v = [base];
      for (const q of order.slice(1)) {
        let n = v[v.length - 1]! + 1;
        while (pc(n) !== q) n++;
        v.push(n);
      }
      if (v[v.length - 1]! <= hi) cands.push(v);
    }
  }
  if (!cands.length) return pcs.map((q) => fit(q, lo, hi)).sort((a, b) => a - b);
  if (!prev) return cands.reduce((a, c) => (Math.abs(c[0]! - (lo + 4)) < Math.abs(a[0]! - (lo + 4)) ? c : a));
  const cost = (v: number[]) => {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += Math.abs(v[i]! - (prev[Math.min(i, prev.length - 1)] ?? v[i]!));
    return s;
  };
  return cands.reduce((a, c) => (cost(c) < cost(a) ? c : a));
}

/** Patterns a single guitar can play, by meter, for the smallest band. */
const GUITAR_ONLY: readonly CompPattern[] = ['block', 'charleston', 'oompah', 'jazzwaltz', 'pad', 'broken'];

function comp(style: Style, key: number, slots: Slot[], rand: Rand, quiet: boolean, velMul = 1): Draft[] {
  const out: Draft[] = [];
  const { inst, pattern } = style.comp;
  const meter = style.meter;
  let prev: number[] | null = null;
  const vel = quiet ? 0.42 : 0.5;
  slots.forEach((s, si) => {
    const rootless = pattern === 'charleston' || pattern === 'jazzwaltz';
    const [lo, hi] =
      pattern === 'pad'
        ? [55, 76]
        : pattern === 'oompah'
          ? [55, 72]
          : pattern === 'charleston'
            ? [53, 72]
            : pattern === 'jazzwaltz'
              ? [52, 70]
              : [52, 71];
    const v = voice(s.chord, key, prev, lo, hi, rootless);
    prev = v;
    const root = fit(key + s.chord.tones[0]!, 40, 52);
    const fifth = fit(key + s.chord.tones[2]!, 43, 55);
    const live = (beat: number) => beat >= s.at - 1e-6 && beat < s.at + s.beats - 1e-6;
    const add = (beat: number, beats: number, midi: number, vl: number) =>
      live(beat) &&
      out.push({ beat, beats, midi, inst, voice: 'comp', vel: (vl + (rand() - 0.5) * 0.05) * velMul });
    /**
     * A chord struck together. The top voice sings a little (x1.12), the inner ones sit back
     * (x0.95). A guitar rolls it, 8 to 14 ms a string: low to high on a downstroke (on the beat),
     * high to low on an upstroke (off it), a touch softer.
     */
    const chord = (beat: number, beats: number, voices: readonly number[], vl: number, roll = true) => {
      if (!live(beat)) return;
      const up = Math.abs(beat - Math.round(beat)) > 1e-6;
      const rolled = roll && inst === 'guitar' && voices.length >= 3;
      const ms = 8 + rand() * 6;
      const order = rolled && up ? [...voices].reverse() : voices;
      order.forEach((midi, k) => {
        const top = midi === voices[voices.length - 1];
        out.push({
          beat,
          beats,
          midi,
          inst,
          voice: 'comp',
          vel: (vl + (rand() - 0.5) * 0.05) * (top ? 1.12 : 0.95) * (rolled && up ? 0.88 : 1) * velMul,
          delay: rolled ? (k * ms) / 1000 : 0,
        });
      });
    };
    const barsIn = Math.ceil(s.beats / meter - 1e-6);
    switch (pattern) {
      case 'travis': {
        // The thumb alternates the bass on the beat; the fingers pinch the top notes between.
        const top = v.slice(-2);
        for (let e = 0; e < s.beats * 2; e++) {
          const beat = s.at + e / 2;
          if (e % 2 === 0) add(beat, 0.9, (e / 2) % 2 === 0 ? root : fifth, vel + 0.05);
          else add(beat, 0.6, top[(e >> 1) % top.length]!, vel - 0.06);
        }
        break;
      }
      case 'arp': {
        // Up and back down through the chord, an octave of it, in eighths.
        const line = [root, ...v, v[0]! + 12];
        const run = [...line, ...line.slice(1, -1).reverse()];
        for (let e = 0; e < s.beats * 2; e++)
          add(s.at + e / 2, 1.4, run[e % run.length]!, vel - (e % 2 ? 0.08 : 0));
        break;
      }
      case 'broken': {
        // The left hand's root, fifth and tenth, rolling.
        const tenth = fit(key + s.chord.tones[1]!, root + 12, root + 19);
        const fig = [root, fifth, tenth, fifth];
        for (let e = 0; e < s.beats * 2; e++) add(s.at + e / 2, 1.2, fig[e % 4]!, vel - (e % 4 ? 0.1 : 0));
        break;
      }
      case 'block': {
        chord(s.at, Math.min(2, s.beats), v, vel);
        if (s.beats >= 4) chord(s.at + 2.5, 1.2, v, vel - 0.12);
        add(s.at, s.beats, root, vel);
        break;
      }
      case 'charleston': {
        chord(s.at, 0.8, v, vel);
        if (s.beats >= 4) chord(s.at + (rand() < 0.5 ? 1.5 : 2.5), 1.1, v, vel - 0.08);
        else chord(s.at + 1.5, 0.4, v, vel - 0.1);
        break;
      }
      case 'oompah': {
        add(s.at, 0.9, fit(root - 12, 33, 45), vel + 0.06);
        for (let b = 1; b < s.beats; b++) chord(s.at + b, 0.6, v, vel - 0.12);
        break;
      }
      case 'pad': {
        chord(s.at, s.beats + 0.1, v, vel - 0.05);
        break;
      }
      case 'bossa': {
        // The thumb walks root and fifth on the strong beats; the fingers answer off them, short
        // and soft, the pattern leaning the other way every second bar.
        for (let k = 0; k < barsIn; k++) {
          const t = s.bar * meter + k * meter;
          add(t, 1.5, root, 0.55);
          add(t + 2, 1.5, fifth, 0.5);
          const offs = (s.bar + k) % 2 === 0 ? [0, 1.5, 3] : [0.5, 2, 3.5];
          for (const o of offs) chord(t + o, 0.4, v.slice(-(rand() < 0.4 ? 4 : 3)), 0.5 + rand() * 0.1);
        }
        break;
      }
      case 'chops': {
        // Muted stabs on the off-beats, and a ghost before the last one.
        for (let k = 0; k < barsIn; k++) {
          const t = s.bar * meter + k * meter;
          for (const o of [0.5, 1.5, 2.5, 3.5]) chord(t + o, 0.12, v.slice(-3), 0.6, false);
          chord(t + 1.75, 0.12, v.slice(-3), 0.35, false);
        }
        break;
      }
      case 'jazzwaltz': {
        // Rootless voicings on two and three (the bass has one); every fourth bar the next chord
        // is anticipated a half beat early.
        const next = slots[si + 1];
        for (let k = 0; k < barsIn; k++) {
          const t = s.bar * meter + k * meter;
          const lean = (s.bar + k) % 4 === 3;
          const nextV =
            lean && next && Math.abs(next.at - (t + meter)) < 1e-6
              ? voice(next.chord, key, v, lo, hi, true)
              : null;
          chord(t + 1, 0.9, v, vel);
          if (nextV) chord(t + 2.5, 0.5, nextV, vel);
          else chord(t + 2, 0.9, v, vel - 0.06);
        }
        break;
      }
    }
  });
  return out;
}

function bassLine(
  style: Style,
  key: number,
  slots: Slot[],
  rand: Rand,
  /** Bars that end a phrase (the waltz bass walks into the next chord there). */
  lastBars: ReadonlySet<number> = new Set(),
): Draft[] {
  if (!style.bass) return [];
  const { inst, pattern } = style.bass;
  const out: Draft[] = [];
  const meter = style.meter;
  const scale = style.mode === 'major' ? MAJOR : MINOR;
  slots.forEach((s, i) => {
    const next = slots[i + 1] ?? s;
    const root = fit(key + s.chord.tones[0]!, 38, 50);
    const nextRoot = fit(key + next.chord.tones[0]!, 38, 50);
    const add = (beat: number, beats: number, midi: number, vel: number) =>
      beat >= s.at - 1e-6 &&
      beat < s.at + s.beats - 1e-6 &&
      out.push({ beat, beats, midi, inst, voice: 'bass', vel });
    const barsIn = Math.ceil(s.beats / meter - 1e-6);
    switch (pattern) {
      case 'pedal':
        add(s.at, s.beats, root, 0.42);
        break;
      case 'sparse':
        add(s.at, Math.min(2, s.beats), root, 0.5);
        break;
      case 'root5': {
        add(s.at, Math.min(1.8, s.beats), root, 0.58);
        if (s.beats >= 4) {
          const fifth = fit(key + s.chord.tones[2]!, root, root + 9);
          if (rand() < 0.45 && next !== s) {
            add(s.at + 2, 1, fifth, 0.5);
            // A step that leads into the next chord's root.
            const lead = nextRoot + (nextRoot > fifth ? -2 : 2);
            add(s.at + 3, 1, scale.includes(pc(lead - key)) ? lead : nextRoot - 1, 0.48);
          } else add(s.at + 2, 1.8, fifth, 0.5);
        }
        break;
      }
      case 'walk': {
        // Four to the bar: root, a chord tone, a chord tone or step, then a half step into the next.
        const tones = s.chord.tones.map((t) => fit(key + t, root, root + 12));
        const beats = Math.round(s.beats);
        const line = [root];
        for (let b = 1; b < beats; b++) {
          if (b === beats - 1) line.push(nextRoot + (rand() < 0.5 ? 1 : -1));
          else line.push(tones[1 + Math.floor(rand() * (tones.length - 1))]!);
        }
        line.forEach((m, b) => add(s.at + b, 0.9, fit(m, 36, 55), b === 0 ? 0.6 : 0.52));
        break;
      }
      case 'bossa': {
        const fifth = fit(key + s.chord.tones[2]!, root, root + 9);
        for (let k = 0; k < barsIn; k++) {
          const t = s.bar * meter + k * meter;
          add(t, 1.5, root, 0.55);
          add(t + 1.5, 0.5, fifth, 0.42);
          add(t + 2, 1, root, 0.48);
          add(t + 3, 0.5, fifth, 0.42);
          // The next chord's root arrives a half beat early.
          if (next !== s && k === barsIn - 1) add(t + 3.5, 0.5, nextRoot, 0.44);
        }
        break;
      }
      case 'funk': {
        const fifth = fit(key + s.chord.tones[2]!, root, root + 9);
        for (let k = 0; k < barsIn; k++) {
          const t = s.bar * meter + k * meter;
          add(t, 0.5, root, 0.62);
          add(t + 0.75, 0.25, root + 12, 0.4);
          add(t + 1.5, 0.4, root, 0.5);
          add(t + 2, 0.4, root, 0.55);
          add(t + 2.75, 0.25, root + 12, 0.4);
          add(t + 3.25, 0.3, root - 2, 0.42);
          add(t + 3.5, 0.3, fifth, 0.45);
        }
        break;
      }
      case 'waltz': {
        const fifth = fit(key + s.chord.tones[2]!, root, root + 9);
        for (let k = 0; k < barsIn; k++) {
          const bar = s.bar + k;
          const t = bar * meter;
          add(t, 1.8, root, 0.55);
          // At a phrase's last bar the third beat steps into the next root.
          if (lastBars.has(bar) && next !== s) add(t + 2, 1, nextRoot + (nextRoot >= root ? -1 : 1), 0.46);
          else add(t + 2, 1, fifth, 0.45);
        }
        break;
      }
    }
  });
  return out;
}

/**
 * `vm` scales every hit (a quiet B, a rainy day). `density` (0 to 1) is how busy the kit gets: the
 * ghost notes and fills come out when it is high.
 */
function drums(
  style: Style,
  bars: number,
  firstBar: number,
  rand: Rand,
  vm: number,
  density: number,
): Draft[] {
  if (!style.drums) return [];
  const out: Draft[] = [];
  const meter = style.meter;
  const add = (beat: number, inst: Instrument, variant: number, vel: number) =>
    out.push({ beat, beats: 0.25, midi: variant, inst, voice: 'drums', vel: vel * vm });
  // A brush's ghost note on a swung off-beat, only in a swinging style when the kit is busy.
  const ghost = (t: number) => {
    if (style.swing > 0.55 && rand() < density * 0.5) add(t + (rand() < 0.5 ? 0.5 : 2.5), 'brush', 2, 0.2);
  };
  for (let b = firstBar; b < firstBar + bars; b++) {
    const t = b * meter;
    switch (style.drums) {
      case 'brushes':
        add(t, 'brush', 1, 0.35);
        add(t + 1, 'brush', 3, 0.5);
        add(t + 2, 'brush', 2, 0.35);
        add(t + 3, 'brush', 4, 0.5);
        if (rand() < 0.35) add(t + 3.5, 'brush', 2, 0.25);
        ghost(t);
        break;
      case 'jazz':
        for (const [o, v] of [
          [0, 0.45],
          [1, 0.55],
          [1.5, 0.35],
          [2, 0.45],
          [3, 0.55],
          [3.5, 0.35],
        ] as const)
          add(t + o, 'ride', 1 + ((b + o) % 2), v);
        add(t + 1, 'brush', 3, 0.4);
        add(t + 3, 'brush', 4, 0.4);
        ghost(t);
        break;
      case 'shaker':
        for (let e = 0; e < meter * 2; e++) add(t + e / 2, 'shaker', 1 + (e % 3), e % 2 ? 0.5 : 0.3);
        break;
      case 'bossa':
        // Shaker eighths leaning on the beats; a rim click that alternates its place every bar.
        for (let e = 0; e < 8; e++) add(t + e / 2, 'shaker', 1 + (e % 3), e % 2 ? 0.26 : 0.42);
        for (const o of b % 2 === 0 ? [1.5, 3] : [1, 2.5]) add(t + o, 'rim', 1 + (b % 2), 0.4);
        break;
      case 'funk':
        // A soft kick on one and three (with a ghost before four when the kit is busy), a rim
        // on two and four, and a shaker in sixteenths underneath.
        add(t, 'kick', 1, 0.45);
        add(t + 2, 'kick', 1, 0.42);
        if (rand() < density) add(t + 2.75, 'kick', 1, 0.28);
        add(t + 1, 'rim', 1, 0.42);
        add(t + 3, 'rim', 2, 0.42);
        for (let e = 0; e < 16; e++)
          add(t + e / 4, 'shaker', 1 + (e % 3), e % 4 === 0 ? 0.28 : e % 2 === 0 ? 0.2 : 0.14);
        break;
      case 'waltz':
        // A swish on one, light taps on two and three.
        add(t, 'brush', 1, 0.5);
        add(t + 1, 'brush', 3, 0.28);
        add(t + 2, 'brush', 4, 0.28);
        break;
    }
  }
  return out;
}

// --- The piece ------------------------------------------------------------------------------------

interface Arrangement {
  style: Style;
  /** Scales the drums (a rainy day plays them softly). */
  drumVel: number;
  /** Scales the comping (fog hushes it). */
  compVel: number;
  /** The pad plays under the A sections too (a city's full band). */
  padA: boolean;
  /** The lead is doubled an octave below in the last A. */
  doubled: boolean;
  /** Snow brings a bell even where the style has none. */
  snow: boolean;
}

/**
 * The band the town can field and the weather it plays in. No `ensemble` is the style as written.
 * 0 hamlet: lead and a guitar. 1 village: bass and a brushes or shaker kit. 2 town: the style's own
 * comp and kit. 3 market town: a bell and a pad. 4 city: the pad under every A, the tune doubled.
 */
function arrange(choice: PieceChoice): Arrangement {
  const base = choice.style;
  let style: Style = base;
  let doubled = false;
  let padA = false;
  const rank = choice.ensemble;
  if (rank !== undefined) {
    const r = Math.max(0, Math.min(4, Math.floor(rank)));
    style = { ...base };
    if (r <= 1) {
      const pattern = GUITAR_ONLY.includes(base.comp.pattern)
        ? base.meter === 3
          ? 'arp'
          : 'travis'
        : base.comp.pattern;
      style.comp = { inst: 'guitar', pattern };
    }
    if (r === 0) {
      style.bass = null;
      style.drums = null;
    } else if (r === 1) {
      style.drums =
        base.drums === 'jazz' || base.drums === 'funk'
          ? 'brushes'
          : base.drums === 'bossa'
            ? 'shaker'
            : base.drums;
    }
    if (r < 3) {
      style.pad = undefined;
      style.sparkle = undefined;
    }
    padA = r >= 4;
    doubled = r >= 4;
  }
  let drumVel = 1;
  let compVel = 1;
  let snow = false;
  const weather = choice.weather ?? 'clear';
  if (weather === 'rain' || weather === 'storm') {
    drumVel = 0.6;
    style = { ...style, pad: style.pad ?? 'strings' };
    if (weather === 'storm') style.sparkle = undefined;
  } else if (weather === 'fog') {
    style = { ...style, drums: null };
    compVel = 0.8;
  } else if (weather === 'snow') snow = true;
  return { style, drumVel, compVel, padA, doubled, snow };
}

/** Writes the piece a director's choice names. */
export function compose(choice: PieceChoice): Piece {
  const { key } = choice;
  const arr = arrange(choice);
  const style = arr.style;
  const rand = seededRand(choice.seed * 7919 + key * 31 + style.id.length * 977);
  const tempo = Math.round(style.tempo[0] + rand() * (style.tempo[1] - style.tempo[0]));
  const meter = style.meter;
  const lead = pick(rand, style.lead);
  const aOpen = pick(rand, style.a.open);
  const aClose = pick(rand, style.a.close);
  const aClose2 = pick(rand, style.a.close);
  const bOpen = pick(rand, style.b.open);
  const bClose = pick(rand, style.b.close);
  const short = style.id === 'night';
  // Some pieces open with the valley's own tune.
  const motif =
    choice.valleySeed !== undefined && choice.seed % 3 === 0
      ? adaptMotif(valleyMotif(choice.valleySeed), meter)
      : undefined;
  const home = style.mode === 'major' ? (style.id === 'evening' ? 'Imaj7' : 'Iadd9') : 'i';
  const firstChord = typeof aOpen[0] === 'string' ? aOpen[0] : aOpen[0][0];

  // The form, bar by bar: [section, phrase harmonies].
  type Section = { name: 'intro' | 'A' | 'A2' | 'B' | 'A3' | 'outro'; bars: Bar[] };
  const form: Section[] = [
    { name: 'intro', bars: [firstChord, firstChord] },
    { name: 'A', bars: [...aOpen, ...aClose] },
    ...(short ? [] : [{ name: 'A2' as const, bars: [...aOpen, ...aClose2] }]),
    { name: 'B', bars: [...bOpen, ...bClose] },
    { name: 'A3', bars: [...aOpen, ...aClose] },
    { name: 'outro', bars: [home, home] },
  ];
  const drafts: Draft[] = [];
  let bar = 0;
  let pitch = fit(key + 12 + 7, style.range[0], style.range[1]);
  let themeOpen: Tune['notes'] | null = null;
  let themeClose: Tune['notes'] | null = null;
  const sections: { name: Section['name']; first: number; slots: Slot[] }[] = [];
  for (const sec of form) {
    const slots = slotsOf(sec.bars, bar, meter, style.mode);
    sections.push({ name: sec.name, first: bar, slots });
    const quiet = sec.name === 'intro' || sec.name === 'outro';
    drafts.push(
      ...comp(
        style,
        key,
        sec.name === 'outro' ? slots.slice(0, 1).map((s) => ({ ...s, beats: meter * 2 })) : slots,
        rand,
        quiet,
        arr.compVel,
      ),
    );
    // Where a phrase ends, the waltz bass leans into the next chord.
    const phraseEnds = new Set<number>(['A', 'A2', 'B', 'A3'].includes(sec.name) ? [bar + 3, bar + 7] : []);
    if (sec.name !== 'outro') drafts.push(...bassLine(style, key, slots, rand, phraseEnds));
    else
      drafts.push(
        ...bassLine(
          { ...style, bass: style.bass ? { ...style.bass, pattern: 'pedal' } : null },
          key,
          slots.slice(0, 1).map((s) => ({ ...s, beats: meter * 2 })),
          rand,
        ),
      );
    if (sec.name !== 'outro' && sec.name !== 'intro')
      drafts.push(
        ...drums(
          style,
          sec.bars.length,
          bar,
          rand,
          (sec.name === 'B' ? 0.7 : 1) * arr.drumVel,
          sec.name === 'B' || sec.name === 'A3' ? 0.8 : 0.4,
        ),
      );
    const padHere =
      sec.name === 'B' ||
      sec.name === 'A3' ||
      sec.name === 'outro' ||
      (arr.padA && (sec.name === 'A' || sec.name === 'A2'));
    if (style.pad && padHere) {
      let prev: number[] | null = null;
      for (const s of sec.name === 'outro' ? slots.slice(0, 1) : slots) {
        const v = voice(s.chord, key, prev, 55, 74, false);
        prev = v;
        for (const m of v)
          drafts.push({
            beat: s.at,
            beats: sec.name === 'outro' ? meter * 2 : s.beats + 0.1,
            midi: m,
            inst: style.pad,
            voice: 'pad',
            vel: 0.38,
          });
      }
    }

    // Melody.
    const at = (n: Tune['notes'][number], by: number) => ({ ...n, beat: n.beat + by });
    const emit = (notes: Tune['notes'], vel = 1) =>
      notes.forEach((n) =>
        drafts.push({
          beat: n.beat,
          beats: n.beats,
          midi: n.midi,
          inst: lead,
          voice: 'lead',
          vel: n.vel * vel,
        }),
      );
    if (sec.name === 'A') {
      const open = phraseMelody(
        rand,
        style,
        key,
        slots.filter((s) => s.bar < bar + 4),
        bar,
        'open',
        pitch,
        0,
        undefined,
        motif,
      );
      const close = phraseMelody(
        rand,
        style,
        key,
        slots.filter((s) => s.bar >= bar + 4),
        bar + 4,
        'close',
        open.last,
        0,
      );
      themeOpen = open.notes.map((n) => at(n, -bar * meter));
      themeClose = close.notes.map((n) => at(n, -bar * meter));
      emit(open.notes);
      emit(close.notes);
      pitch = close.last;
    } else if (sec.name === 'A2' && themeOpen) {
      emit(themeOpen.map((n) => at(n, bar * meter)));
      const lastOpen = themeOpen[themeOpen.length - 1]!.midi;
      const close = phraseMelody(
        rand,
        style,
        key,
        slots.filter((s) => s.bar >= bar + 4),
        bar + 4,
        'close',
        lastOpen,
        0,
      );
      emit(close.notes);
      pitch = close.last;
    } else if (sec.name === 'B') {
      const lift = style.range[1] - style.range[0] > 18 ? 3 : 0;
      const open = phraseMelody(
        rand,
        style,
        key,
        slots.filter((s) => s.bar < bar + 4),
        bar,
        'open',
        pitch,
        lift,
      );
      const back = themeOpen?.[0]?.midi;
      const close = phraseMelody(
        rand,
        style,
        key,
        slots.filter((s) => s.bar >= bar + 4),
        bar + 4,
        'open',
        open.last,
        lift,
        back,
      );
      emit(open.notes, 0.95);
      emit(close.notes, 0.95);
      pitch = close.last;
    } else if (sec.name === 'A3' && themeOpen && themeClose) {
      const notes = [...themeOpen, ...themeClose].map((n) => at(n, bar * meter));
      emit(notes);
      // The bell doubles the tune (the valley's motif bars with it) an octave up.
      const bell = style.sparkle ?? (arr.snow ? (lead === 'celesta' ? 'glock' : 'celesta') : undefined);
      if (bell)
        for (const n of notes)
          drafts.push({
            beat: n.beat,
            beats: n.beats,
            midi: n.midi + 12,
            inst: bell,
            voice: 'sparkle',
            vel: n.vel * 0.5,
          });
      // A city's band doubles the tune an octave below, in clarinet or strings.
      if (arr.doubled) {
        const under = lead === 'clarinet' ? 'strings' : pick(rand, ['clarinet', 'strings'] as const);
        for (const n of notes)
          drafts.push({
            beat: n.beat,
            beats: n.beats,
            midi: n.midi - 12,
            inst: under,
            voice: 'lead',
            vel: n.vel * 0.45,
          });
      }
    } else if (sec.name === 'outro') {
      // The tune's last word: home, held.
      const last = themeClose?.[themeClose.length - 1]?.midi ?? key + 24;
      const tonic = nearestPc(pc(key), last);
      drafts.push({ beat: bar * meter, beats: meter * 2, midi: tonic, inst: lead, voice: 'lead', vel: 0.55 });
    }
    bar += sec.bars.length;
  }

  // Timing: beats to seconds, with swing, a gently slowing outro, and a player's looseness.
  const spb = 60 / tempo;
  const outroAt = sections[sections.length - 1]!.first * meter;
  const outroLen = meter * 2;
  const slow = 0.22;
  const secondsAt = (beat: number): number => {
    if (beat <= outroAt) return beat * spb;
    const x = Math.min(beat - outroAt, outroLen + 4);
    return (
      outroAt * spb +
      (-(outroLen / slow) * Math.log(1 - (slow * Math.min(x, outroLen * 0.999)) / outroLen) +
        Math.max(0, x - outroLen) / (1 - slow)) *
        spb
    );
  };
  const swing = (beat: number): number => {
    const frac = beat - Math.floor(beat);
    return Math.abs(frac - 0.5) < 1e-6 ? Math.floor(beat) + style.swing : beat;
  };
  const notes: Note[] = drafts
    .map((d) => {
      const b = swing(d.beat);
      const loose = d.voice === 'bass' || d.voice === 'drums' ? 0.004 : d.voice === 'lead' ? 0.012 : 0.008;
      const lag = d.voice === 'lead' ? 0.008 : 0;
      const time = Math.max(0, secondsAt(b) + (rand() - 0.5) * 2 * loose + lag + (d.delay ?? 0));
      const dur = Math.max(0.05, secondsAt(swing(d.beat + d.beats)) - secondsAt(b) - 0.02);
      // Metric accents: the downbeat leans, the off-beats lie back a little.
      let accent = 1;
      if (d.voice !== 'drums' && d.voice !== 'pad') {
        const pos = (((d.beat % meter) + meter) % meter) as number;
        if (Math.abs(pos - Math.round(pos)) > 1e-6) accent = 0.93;
        else if (Math.round(pos) === 0) accent = meter === 4 ? 1.08 : 1.07;
        else if (meter === 4 && Math.round(pos) === 2) accent = 1.03;
      }
      return {
        time,
        dur,
        midi: d.midi,
        inst: d.inst,
        voice: d.voice,
        vel: Math.max(0.05, Math.min(1, d.vel * accent * style.level)),
      };
    })
    .sort((a, b) => a.time - b.time || a.midi - b.midi);
  const seconds = secondsAt(bar * meter) + 2.5;
  return { style: style.id, key, tempo, meter, bars: bar, notes, seconds };
}
