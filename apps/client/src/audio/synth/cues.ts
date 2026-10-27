// One-shot sounds (C5G), synthesized: soft wood for placing, a hush for removing, small coins,
// paper and a chime for letters, a ping, little arpeggios for patterns, achievements and the
// rank-up, and the larger I3 sounds (the bell, a far howl, a cheer, the horn, skates, thunder).
import type { SoundCueId } from '../api';
import {
  Biquad,
  Brown,
  Partial,
  RENDER_RATE,
  attack,
  decayPer,
  fadeEdges,
  midiToHz,
  noise,
  normalize,
  seeded,
} from './dsp';
import { renderNote } from './instruments';
import type { Rand } from '../rng';

function buf(seconds: number): Float32Array {
  return new Float32Array(Math.floor(seconds * RENDER_RATE));
}

/** Mixes `src` into `out` at `seconds`, scaled. */
function mix(out: Float32Array, src: Float32Array, seconds: number, gain: number): void {
  const at = Math.floor(seconds * RENDER_RATE);
  for (let i = 0; i < src.length && at + i < out.length; i++) out[at + i] = out[at + i]! + src[i]! * gain;
}

function tone(
  freq: number,
  amp: number,
  seconds: number,
  ratios: [number, number, number][] = [[1, 1, seconds]],
): Float32Array {
  const out = buf(seconds);
  const parts = ratios.map(([r, a, t], i) => new Partial(freq * r, amp * a, decayPer(t), i));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (const p of parts) s += p.run();
    out[i] = s * attack(i, 0.002);
  }
  return out;
}

function place(): Float32Array {
  // A wooden block set down: a low knock and a hollow ring.
  const out = tone(196, 0.8, 0.35, [
    [1, 1, 0.06],
    [2.3, 0.4, 0.04],
    [3.9, 0.15, 0.02],
  ]);
  mix(out, tone(392, 0.3, 0.25, [[1, 1, 0.08]]), 0.01, 1);
  return out;
}

function remove(rand: Rand): Float32Array {
  // A soft brush-off: falling filtered noise and a low thump.
  const out = buf(0.4);
  const bp = new Biquad('bandpass', 2000, 1);
  for (let i = 0; i < out.length; i++) {
    const t = i / out.length;
    if (i % 64 === 0) bp.set(2000 - t * 1500, 1);
    out[i] = bp.run(noise(rand)) * (1 - t) * Math.min(1, i / 300) * 0.6;
  }
  mix(out, tone(110, 0.6, 0.2, [[1, 1, 0.05]]), 0, 1);
  return out;
}

function coins(rand: Rand): Float32Array {
  const out = buf(0.6);
  for (let c = 0; c < 3; c++) {
    const f = 2600 + rand() * 1400;
    mix(
      out,
      tone(f, 0.5, 0.3, [
        [1, 1, 0.09],
        [1.48, 0.5, 0.06],
        [2.3, 0.25, 0.03],
      ]),
      c * 0.07 + rand() * 0.02,
      0.6,
    );
  }
  return out;
}

function paper(rand: Rand, seconds: number): Float32Array {
  const out = buf(seconds);
  const bp = new Biquad('bandpass', 3500, 0.7);
  let env = 0;
  for (let i = 0; i < out.length; i++) {
    if (i % 400 === 0) env = 0.3 + rand() * 0.7;
    const t = i / out.length;
    out[i] = bp.run(noise(rand)) * env * Math.sin(Math.PI * t) * 0.5;
  }
  return out;
}

function notes(
  midis: number[],
  step: number,
  inst: 'bell' | 'piano' | 'guitar',
  tail = 1.2,
  gain = 0.7,
): Float32Array {
  const out = buf(midis.length * step + tail);
  midis.forEach((m, i) => mix(out, renderNote(inst, m), i * step, gain));
  return out;
}

function letter(rand: Rand): Float32Array {
  const out = buf(1.4);
  mix(out, paper(rand, 0.35), 0, 0.8);
  mix(out, notes([79, 84], 0.14, 'bell', 1), 0.25, 0.5);
  return out;
}

function bell(): Float32Array {
  // A town bell: hum, prime, minor third, fifth and nominal, ringing for seconds.
  const f = midiToHz(57);
  return tone(f, 0.6, 4.5, [
    [0.5, 0.6, 3.5],
    [1, 1, 2.2],
    [1.2, 0.5, 1.6],
    [1.5, 0.35, 1.2],
    [2, 0.5, 1],
    [2.5, 0.2, 0.5],
    [3, 0.12, 0.4],
  ]);
}

function howl(rand: Rand): Float32Array {
  // Far off and more lonesome than fierce: a gliding voice through a soft formant.
  const out = buf(3.2);
  const f1 = new Biquad('bandpass', 800, 3);
  const lp = new Biquad('lowpass', 1500);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RENDER_RATE;
    const glide = t < 0.6 ? 380 + (t / 0.6) * 280 : 660 - Math.min(1, (t - 0.6) / 2.4) * 160;
    const f = glide * (1 + 0.012 * Math.sin(t * 34));
    phase += f / RENDER_RATE;
    const tri = 1 - 4 * Math.abs((phase % 1) - 0.5);
    const env = Math.min(1, t / 0.35) * Math.max(0, Math.min(1, (3.2 - t) / 1.2));
    out[i] = lp.run(tri * 0.7 + f1.run(tri + noise(rand) * 0.05) * 0.6) * env;
  }
  return out;
}

function cheer(rand: Rand): Float32Array {
  // A happy crowd: many voices swelling on "ah", and claps.
  const out = buf(2.4);
  for (let v = 0; v < 10; v++) {
    const pitch = 160 + rand() * 260;
    const f1 = new Biquad('bandpass', 700 + rand() * 200, 4);
    const f2 = new Biquad('bandpass', 1100 + rand() * 300, 5);
    let phase = rand();
    const start = rand() * 0.25;
    for (let i = 0; i < out.length; i++) {
      const t = i / RENDER_RATE - start;
      if (t < 0) continue;
      phase += (pitch * (1 + t * 0.05)) / RENDER_RATE;
      const src = (phase % 1) * 2 - 1;
      const env = Math.min(1, t / 0.25) * Math.max(0, 1 - t / 2);
      out[i] = out[i]! + (f1.run(src) + f2.run(src) * 0.5) * env * 0.2;
    }
  }
  const clap = new Biquad('bandpass', 1400, 1.2);
  for (let c = 0; c < 26; c++) {
    const at = Math.floor((0.1 + rand() * 2) * RENDER_RATE);
    for (let i = 0; i < 260 && at + i < out.length; i++)
      out[at + i] = out[at + i]! + clap.run(noise(rand)) * (1 - i / 260) * 0.5;
  }
  return out;
}

function horn(): Float32Array {
  // A low horn from the watchtower: a swell on a brassy tone that bends up into the note.
  const out = buf(2.2);
  const lp = new Biquad('lowpass', 900, 1.2);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RENDER_RATE;
    const f = 110 * (t < 0.2 ? 0.94 + (t / 0.2) * 0.06 : 1);
    phase += f / RENDER_RATE;
    const ph = phase % 1;
    const s =
      Math.sin(2 * Math.PI * ph) +
      0.5 * Math.sin(4 * Math.PI * ph) +
      0.3 * Math.sin(6 * Math.PI * ph) +
      0.15 * Math.sin(8 * Math.PI * ph);
    const env = Math.min(1, t / 0.3) * Math.max(0, Math.min(1, (2.2 - t) / 0.6));
    out[i] = lp.run(s) * env;
  }
  return out;
}

function skates(rand: Rand): Float32Array {
  const out = buf(1.1);
  const bp = new Biquad('bandpass', 5000, 2);
  for (let i = 0; i < out.length; i++) {
    const t = i / RENDER_RATE;
    if (i % 64 === 0) bp.set(4000 + 2500 * Math.sin(t * 3), 2);
    out[i] = bp.run(noise(rand)) * Math.sin(Math.PI * (t / 1.1)) * 0.8;
  }
  return out;
}

function thunder(rand: Rand): Float32Array {
  const out = buf(4.5);
  const brown = new Brown(rand);
  const lp = new Biquad('lowpass', 180);
  const crack = new Biquad('bandpass', 900, 0.6);
  for (let i = 0; i < out.length; i++) {
    const t = i / RENDER_RATE;
    const roll =
      Math.min(1, t / 0.15) * Math.exp(-t / 1.4) * (0.7 + 0.3 * Math.sin(t * 7 + Math.sin(t * 2.3) * 3));
    const c = t < 0.25 ? crack.run(noise(rand)) * (1 - t / 0.25) * 0.4 : 0;
    out[i] = lp.run(brown.run()) * roll * 1.6 + c;
  }
  return out;
}

const RENDER: Record<SoundCueId, (rand: Rand) => Float32Array> = {
  achievement: () => notes([72, 76, 79, 84], 0.11, 'bell', 1.6),
  bell: () => bell(),
  built: () => notes([67, 72, 76], 0.07, 'guitar', 1.2, 0.6),
  coins: (r) => coins(r),
  emote: () => notes([84], 0.1, 'bell', 0.6, 0.5),
  'festival-cheer': (r) => cheer(r),
  howl: (r) => howl(r),
  letter: (r) => letter(r),
  pattern: () => notes([67, 71, 74], 0.12, 'bell', 1.4),
  ping: () => notes([88, 95], 0.08, 'bell', 0.8, 0.6),
  place: () => place(),
  'raid-horn': () => horn(),
  'rank-up': () => notes([60, 64, 67, 72, 76, 79, 84], 0.09, 'piano', 2.2, 0.6),
  remove: (r) => remove(r),
  skates: (r) => skates(r),
  thunder: (r) => thunder(r),
};

/** Renders a cue, normalized, with click-free edges. */
export function renderCue(id: SoundCueId): Float32Array {
  const rand = seeded(id.length * 977 + id.charCodeAt(0));
  return fadeEdges(normalize(RENDER[id](rand), 0.8), 0.004);
}

export const CUE_IDS: readonly SoundCueId[] = Object.keys(RENDER) as SoundCueId[];
