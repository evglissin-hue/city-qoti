// One-shot sounds (C5G), from the band's own instruments so they belong with the music: a soft
// marimba knock for placing, a falling hush for removing, a kalimba for finished sites, small
// clinks for coins, paper and celesta for letters, little glockenspiel arpeggios for patterns,
// achievements and the rank-up; and the larger I3 sounds: the town bell (struck bronze, its hum
// and partials), a far howl, a cheer with claps, the watch horn, skates and thunder.
// Musical cues are written in C; the engine tunes them to the music's key as they play.
import type { SoundCueId } from '../api';
import {
  Biquad,
  Brown,
  OnePole,
  Partial,
  Pink,
  RENDER_RATE,
  attack,
  dcBlock,
  fadeEdges,
  midiToHz,
  mixInto,
  noise,
  normalize,
  seeded,
  t60Per,
} from './dsp';
import { renderNote, type Instrument } from './instruments';
import type { Rand } from '../rng';

/** Cues tuned to the music's key (the rest are noises or bells with a pitch of their own). */
export const TUNED_CUES: ReadonlySet<SoundCueId> = new Set([
  'achievement',
  'built',
  'emote',
  'letter',
  'pattern',
  'ping',
  'place',
  'rank-up',
  'remove',
]);

function buf(seconds: number): Float32Array {
  return new Float32Array(Math.floor(seconds * RENDER_RATE));
}

/** Notes on one instrument: [midi, at seconds, gain, layer]. */
function play(inst: Instrument, notes: [number, number, number, number?][], tail: number): Float32Array {
  const end = Math.max(...notes.map(([, at]) => at)) + tail;
  const out = buf(end);
  for (const [m, at, g, layer] of notes) mixInto(out, renderNote(inst, m, layer ?? 1), at, g);
  return out;
}

function sum(...parts: Float32Array[]): Float32Array {
  const out = buf(Math.max(...parts.map((p) => p.length)) / RENDER_RATE);
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] = out[i]! + p[i]!;
  return out;
}

/** A short, soft wooden knock: a damped low mode and a dry tap. */
function knock(freq: number, rand: Rand, seconds = 0.25): Float32Array {
  const out = buf(seconds);
  const modes = [
    new Partial(freq, 0.7, t60Per(0.09)),
    new Partial(freq * 2.6, 0.25, t60Per(0.05)),
    new Partial(freq * 4.3, 0.1, t60Per(0.03)),
  ];
  const tap = new Biquad('bandpass', 1800, 1.5);
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (const m of modes) s += m.run();
    out[i] = s * attack(i, 0.001) + (i < 90 ? tap.run(noise(rand)) * (1 - i / 90) * 0.35 : 0);
  }
  return out;
}

/** Paper: a few quick rustles. */
function paper(rand: Rand, seconds: number): Float32Array {
  const out = buf(seconds);
  const bp = new Biquad('bandpass', 3200, 0.8);
  const hp = new Biquad('highpass', 1200);
  let env = 0;
  let target = 0;
  for (let i = 0; i < out.length; i++) {
    if (i % 300 === 0) target = rand() < 0.5 ? rand() : 0.1;
    env += (target - env) * 0.02;
    const t = i / out.length;
    out[i] = hp.run(bp.run(noise(rand))) * env * Math.sin(Math.PI * t);
  }
  return out;
}

function remove(rand: Rand): Float32Array {
  // A soft brush-off, then two low marimba notes falling.
  const hush = buf(0.35);
  const bp = new Biquad('bandpass', 2400, 0.9);
  for (let i = 0; i < hush.length; i++) {
    const t = i / hush.length;
    if (i % 64 === 0) bp.set(2600 - t * 1800, 0.9);
    hush[i] = bp.run(noise(rand)) * Math.sin(Math.PI * t) * 0.5;
  }
  return sum(
    hush,
    play(
      'marimba',
      [
        [62, 0.03, 0.55, 0],
        [57, 0.12, 0.45, 0],
      ],
      0.6,
    ),
  );
}

function coins(rand: Rand): Float32Array {
  // Two or three small coins meeting: bright, quick inharmonic rings.
  const out = buf(0.7);
  for (let c = 0; c < 3; c++) {
    const f = 3100 + rand() * 1600;
    const at = Math.floor((c * 0.075 + rand() * 0.02) * RENDER_RATE);
    const parts = [
      new Partial(f, 0.4, t60Per(0.35)),
      new Partial(f * 1.53, 0.25, t60Per(0.2)),
      new Partial(f * 2.41, 0.12, t60Per(0.12)),
    ];
    for (let i = 0; at + i < out.length; i++) {
      let s = 0;
      for (const p of parts) s += p.run();
      out[at + i] = out[at + i]! + s * 0.5 * attack(i, 0.0008);
    }
  }
  return out;
}

/** A town bell: hum, prime, minor third, fifth, nominal and their kin, struck and ringing long. */
function bell(rand: Rand): Float32Array {
  const f = midiToHz(57);
  const out = buf(5.5);
  const partials: [number, number, number][] = [
    [0.5, 0.55, 4.5],
    [1, 0.7, 3.2],
    [1.183, 0.45, 2.6],
    [1.506, 0.3, 2.1],
    [2, 0.6, 1.9],
    [2.514, 0.22, 1.2],
    [2.662, 0.18, 1.1],
    [3.011, 0.15, 0.9],
    [4.166, 0.1, 0.6],
  ];
  // Each partial is a pair a hair apart: the bell's slow warble.
  const parts = partials.flatMap(([r, a, t]) => [
    new Partial(f * r, a * 0.6, t60Per(t), rand() * 6),
    new Partial(f * r * 1.0015, a * 0.4, t60Per(t * 0.9), rand() * 6),
  ]);
  const strike = new Biquad('bandpass', 1800, 1);
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (const p of parts) s += p.run();
    out[i] = s * attack(i, 0.002) + (i < 300 ? strike.run(noise(rand)) * (1 - i / 300) * 0.3 : 0);
  }
  return out;
}

function howl(rand: Rand): Float32Array {
  // Far off and more lonesome than fierce: a voice that glides up, holds, and falls away.
  const out = buf(3.4);
  const f1 = new Biquad('bandpass', 750, 4);
  const f2 = new Biquad('bandpass', 1150, 5);
  const air = new OnePole(1600);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RENDER_RATE;
    const glide = t < 0.5 ? 360 + (t / 0.5) * 300 : 660 - Math.min(1, (t - 0.5) / 2.6) * 190;
    const f = glide * (1 + 0.012 * Math.sin(t * 31) + 0.004 * Math.sin(t * 7.3));
    phase += f / RENDER_RATE;
    const ph = phase % 1;
    const src = Math.sin(2 * Math.PI * ph) * 0.8 + (1 - 4 * Math.abs(ph - 0.5)) * 0.3 + noise(rand) * 0.04;
    const env = Math.min(1, t / 0.3) * Math.max(0, Math.min(1, (3.4 - t) / 1.4));
    out[i] = air.run(src * 0.6 + f1.run(src) * 0.8 + f2.run(src) * 0.4) * env;
  }
  return out;
}

function cheer(rand: Rand): Float32Array {
  // A happy crowd swelling on "hey!" and "ah", and a scatter of claps.
  const out = buf(2.6);
  const vowels: [number, number][] = [
    [730, 1090],
    [660, 1720],
    [570, 840],
  ];
  for (let v = 0; v < 14; v++) {
    const pitch = 150 + rand() * 300;
    const [a, b] = vowels[v % vowels.length]!;
    const f1 = new Biquad('bandpass', a * (0.9 + rand() * 0.2), 5);
    const f2 = new Biquad('bandpass', b * (0.9 + rand() * 0.2), 6);
    let phase = rand();
    const start = rand() * 0.3;
    for (let i = 0; i < out.length; i++) {
      const t = i / RENDER_RATE - start;
      if (t < 0) continue;
      phase += (pitch * (1 + 0.06 * Math.sin(t * 5) + t * 0.04)) / RENDER_RATE;
      const src = (phase % 1) * 2 - 1 + noise(rand) * 0.15;
      const env = Math.min(1, t / 0.15) * Math.max(0, 1 - t / 2.1);
      out[i] = out[i]! + (f1.run(src) + f2.run(src) * 0.6) * env * 0.13;
    }
  }
  const clap = new Biquad('bandpass', 1300, 1.1);
  for (let c = 0; c < 40; c++) {
    const at = Math.floor((0.15 + rand() * 2.1) * RENDER_RATE);
    const g = 0.25 + rand() * 0.3;
    for (let i = 0; i < 380 && at + i < out.length; i++)
      out[at + i] = out[at + i]! + clap.run(noise(rand)) * Math.exp(-i / 70) * g;
  }
  return out;
}

function horn(): Float32Array {
  // A cow horn from the watchtower: a swell that bends up into the note, breathy and round.
  const out = buf(2.4);
  const rand = seeded(5);
  const lp = new Biquad('lowpass', 1100, 1.4);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RENDER_RATE;
    const f = 116 * (t < 0.25 ? 0.93 + (t / 0.25) * 0.07 : 1 + 0.003 * Math.sin(t * 30));
    phase += f / RENDER_RATE;
    const ph = phase % 1;
    let s = 0;
    for (let k = 1; k <= 8; k++) s += Math.sin(2 * Math.PI * k * ph) / (k * 0.9);
    const env = Math.min(1, t / 0.35) * Math.max(0, Math.min(1, (2.4 - t) / 0.7));
    out[i] = lp.run(s + noise(rand) * 0.08) * env;
  }
  return out;
}

function skates(rand: Rand): Float32Array {
  // Two long strokes of steel on ice.
  const out = buf(1.4);
  const bp = new Biquad('bandpass', 5000, 2.5);
  for (let i = 0; i < out.length; i++) {
    const t = i / RENDER_RATE;
    if (i % 64 === 0) bp.set(4200 + 1800 * Math.sin(t * 4.5), 2.5);
    const stroke = Math.pow(Math.sin(Math.PI * ((t * 1.45) % 1)), 2);
    out[i] = bp.run(noise(rand)) * stroke * 0.8;
  }
  return out;
}

function thunder(rand: Rand): Float32Array {
  const out = buf(4.8);
  const brown = new Brown(rand);
  const lp = new Biquad('lowpass', 160);
  const crack = new Biquad('bandpass', 1100, 0.6);
  const pink = new Pink(rand);
  for (let i = 0; i < out.length; i++) {
    const t = i / RENDER_RATE;
    const roll =
      Math.min(1, t / 0.2) * Math.exp(-t / 1.5) * (0.65 + 0.35 * Math.sin(t * 6.2 + Math.sin(t * 2.1) * 3));
    const c = t < 0.3 ? crack.run(pink.run()) * Math.exp(-t / 0.08) * 0.6 : 0;
    out[i] = lp.run(brown.run()) * roll * 1.8 + c;
  }
  return out;
}

const RENDER: Record<SoundCueId, (rand: Rand) => Float32Array> = {
  achievement: () =>
    sum(
      play(
        'glock',
        [
          [72, 0, 0.5],
          [76, 0.1, 0.5],
          [79, 0.2, 0.5],
          [84, 0.3, 0.6],
        ],
        2,
      ),
      play(
        'vibes',
        [
          [60, 0.3, 0.35],
          [64, 0.3, 0.3],
          [67, 0.3, 0.3],
        ],
        2.5,
      ),
    ),
  bell: (r) => bell(r),
  built: () =>
    play(
      'kalimba',
      [
        [67, 0, 0.6],
        [72, 0.09, 0.6],
        [76, 0.18, 0.7],
      ],
      1.6,
    ),
  coins: (r) => coins(r),
  emote: () =>
    play(
      'marimba',
      [
        [79, 0, 0.6],
        [84, 0.07, 0.5],
      ],
      0.8,
    ),
  'festival-cheer': (r) => cheer(r),
  howl: (r) => howl(r),
  letter: (r) =>
    sum(
      paper(r, 0.32),
      play(
        'celesta',
        [
          [79, 0.22, 0.55],
          [84, 0.36, 0.6],
        ],
        1.6,
      ),
    ),
  pattern: () =>
    play(
      'celesta',
      [
        [72, 0, 0.55],
        [76, 0.1, 0.55],
        [79, 0.2, 0.55],
        [83, 0.3, 0.6],
      ],
      2,
    ),
  ping: () =>
    play(
      'kalimba',
      [
        [84, 0, 0.7],
        [79, 0.11, 0.45],
      ],
      1.4,
    ),
  place: (r) => sum(knock(150, r), play('marimba', [[55, 0, 0.35, 0]], 0.8)),
  'raid-horn': () => horn(),
  'rank-up': () =>
    sum(
      play(
        'piano',
        [
          [48, 0, 0.5],
          [60, 0, 0.45],
          [64, 0, 0.4],
          [67, 0, 0.4],
          [53, 0.5, 0.45],
          [65, 0.5, 0.4],
          [69, 0.5, 0.4],
          [55, 1, 0.45],
          [67, 1, 0.4],
          [71, 1, 0.4],
          [48, 1.5, 0.55],
          [64, 1.5, 0.45],
          [67, 1.5, 0.45],
          [72, 1.5, 0.5],
        ],
        3,
      ),
      play(
        'glock',
        [
          [79, 1.5, 0.4],
          [84, 1.62, 0.45],
          [88, 1.74, 0.5],
        ],
        2.5,
      ),
    ),
  remove: (r) => remove(r),
  skates: (r) => skates(r),
  thunder: (r) => thunder(r),
};

export const CUE_IDS: readonly SoundCueId[] = Object.keys(RENDER) as SoundCueId[];

/** Renders a cue, normalized, with click-free edges. */
export function renderCue(id: SoundCueId): Float32Array {
  const rand = seeded(id.length * 977 + id.charCodeAt(0));
  return fadeEdges(dcBlock(normalize(RENDER[id](rand), 0.8)), 0.002, 0.05);
}
