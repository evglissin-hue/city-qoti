// Ambience loops (C5G), synthesized: the river, wind, birds, crickets, rain, a crowd's murmur, a
// carpenter's hammer, the smithy's anvil and the sawmill. Each renders once into a loop-clean
// buffer (8 to 16 s, crossfaded at the seam); the engine plays the ones in view, at most 8.
import {
  Biquad,
  Brown,
  Partial,
  RENDER_RATE,
  decayPer,
  loopable,
  midiToHz,
  noise,
  normalizeRms,
  seeded,
} from './dsp';
import type { Rand } from '../rng';

export type AmbienceId =
  'anvil' | 'birds' | 'crickets' | 'hammer' | 'murmur' | 'rain' | 'river' | 'saw' | 'wind';

export const AMBIENCE_IDS: readonly AmbienceId[] = [
  'anvil',
  'birds',
  'crickets',
  'hammer',
  'murmur',
  'rain',
  'river',
  'saw',
  'wind',
];

/** Loop lengths, seconds. */
const LOOP: Record<AmbienceId, number> = {
  anvil: 9,
  birds: 16,
  crickets: 7,
  hammer: 8,
  murmur: 12,
  rain: 8,
  river: 10,
  saw: 8,
  wind: 14,
};

/** Adds a decaying one-shot `voice(i)` into `out` at sample `at`. */
function add(out: Float32Array, at: number, len: number, voice: (i: number) => number): void {
  for (let i = 0; i < len && at + i < out.length; i++) out[at + i] = out[at + i]! + voice(i);
}

function river(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  const rush = new Biquad('bandpass', 700, 0.5);
  const low = new Biquad('lowpass', 400);
  const brown = new Brown(rand);
  for (let i = 0; i < len; i++) {
    const wobble = 0.8 + 0.2 * Math.sin((i / RENDER_RATE) * 0.9) * Math.sin((i / RENDER_RATE) * 0.37 + 1);
    out[i] = (rush.run(noise(rand)) * 0.5 + low.run(brown.run()) * 0.6) * wobble;
  }
  // Bubbles: short sines that rise as they close, the classic babble of a stream.
  const count = Math.floor((len / RENDER_RATE) * 14);
  for (let b = 0; b < count; b++) {
    const at = Math.floor(rand() * len);
    const f0 = 300 + rand() * 900;
    const dur = Math.floor((0.02 + rand() * 0.05) * RENDER_RATE);
    const amp = 0.08 + rand() * 0.12;
    let phase = 0;
    add(out, at, dur, (i) => {
      const t = i / dur;
      phase += (2 * Math.PI * f0 * (1 + t * 1.5)) / RENDER_RATE;
      return Math.sin(phase) * amp * (1 - t) * Math.min(1, i / 40);
    });
  }
  return out;
}

function wind(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  const brown = new Brown(rand);
  const bp = new Biquad('bandpass', 400, 0.8);
  const lp = new Biquad('lowpass', 900);
  for (let i = 0; i < len; i++) {
    const t = i / RENDER_RATE;
    const gust = 0.55 + 0.3 * Math.sin(t * 0.45) + 0.15 * Math.sin(t * 1.3 + 2);
    if (i % 128 === 0) bp.set(250 + gust * 500, 0.9);
    out[i] = (bp.run(noise(rand)) * 0.7 + lp.run(brown.run()) * 0.4) * gust;
  }
  return out;
}

function rain(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  const hp = new Biquad('highpass', 900);
  const lp = new Biquad('lowpass', 7000);
  for (let i = 0; i < len; i++) out[i] = lp.run(hp.run(noise(rand))) * 0.35;
  // Drops on leaves and roofs.
  const drops = Math.floor((len / RENDER_RATE) * 40);
  for (let d = 0; d < drops; d++) {
    const at = Math.floor(rand() * len);
    const f = 1800 + rand() * 3000;
    const p = new Partial(f, 0.1 + rand() * 0.15, decayPer(0.006));
    add(out, at, 400, () => p.run());
  }
  return out;
}

function crickets(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  // Two or three crickets, each a carrier pulsed in short trills.
  for (let c = 0; c < 3; c++) {
    const f = 4200 + rand() * 900;
    const every = 0.55 + rand() * 0.4;
    const pulses = 3 + Math.floor(rand() * 3);
    const amp = 0.25 - c * 0.06;
    for (let t = rand() * every; t < len / RENDER_RATE; t += every * (0.9 + rand() * 0.2)) {
      for (let p = 0; p < pulses; p++) {
        const at = Math.floor((t + p * 0.035) * RENDER_RATE);
        const dur = Math.floor(0.022 * RENDER_RATE);
        const osc = new Partial(f, amp);
        add(out, at, dur, (i) => osc.run() * Math.sin((Math.PI * i) / dur));
      }
    }
  }
  return out;
}

/** One bird call: a few chirps that sweep and wobble. */
function chirps(out: Float32Array, at: number, rand: Rand): void {
  const base = 2200 + rand() * 1800;
  const count = 2 + Math.floor(rand() * 5);
  const kind = Math.floor(rand() * 3);
  let t = at;
  for (let c = 0; c < count; c++) {
    const dur = Math.floor((0.05 + rand() * 0.09) * RENDER_RATE);
    const sweep = kind === 0 ? 0.5 : kind === 1 ? -0.35 : 0.2;
    const amp = 0.18 + rand() * 0.1;
    let phase = 0;
    add(out, t, dur, (i) => {
      const x = i / dur;
      const f = base * (1 + sweep * x) * (1 + 0.04 * Math.sin(i * 0.02));
      phase += (2 * Math.PI * f) / RENDER_RATE;
      const env = Math.sin(Math.PI * x);
      return (Math.sin(phase) + 0.2 * Math.sin(phase * 2)) * amp * env * env;
    });
    t += dur + Math.floor((0.03 + rand() * 0.08) * RENDER_RATE);
  }
}

function birds(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  const calls = Math.floor((len / RENDER_RATE) * 0.6);
  for (let c = 0; c < calls; c++) chirps(out, Math.floor(rand() * (len - RENDER_RATE)), rand);
  // A faint bed of leaves so the loop is never dead silent.
  const lp = new Biquad('bandpass', 2500, 0.4);
  for (let i = 0; i < len; i++) out[i] = out[i]! + lp.run(noise(rand)) * 0.01;
  return out;
}

/** Talkers: a buzzy voice through two formants that hop between vowels a few times a second. */
function murmur(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  const vowels: [number, number][] = [
    [730, 1090],
    [530, 1840],
    [270, 2290],
    [570, 840],
    [440, 1020],
    [660, 1720],
  ];
  for (let v = 0; v < 7; v++) {
    const pitch = 95 + rand() * 140;
    const f1 = new Biquad('bandpass', 600, 4);
    const f2 = new Biquad('bandpass', 1400, 5);
    let phase = rand();
    let syll = 0;
    let env = 0;
    let target = 0;
    for (let i = 0; i < len; i++) {
      if (--syll <= 0) {
        syll = Math.floor((0.12 + rand() * 0.18) * RENDER_RATE);
        const [a, b] = vowels[Math.floor(rand() * vowels.length)]!;
        f1.set(a, 4);
        f2.set(b, 5);
        target = rand() < 0.22 ? 0 : 0.5 + rand() * 0.5;
      }
      env += (target - env) * 0.002;
      const f = pitch * (1 + 0.06 * Math.sin(i * 0.0009 + v));
      phase += f / RENDER_RATE;
      if (phase >= 1) phase -= 1;
      const src = phase * 2 - 1 + noise(rand) * 0.1;
      const s = f1.run(src) + f2.run(src) * 0.6;
      out[i] = out[i]! + s * env * 0.25;
    }
  }
  const lp = new Biquad('lowpass', 1800);
  for (let i = 0; i < len; i++) out[i] = lp.run(out[i]!);
  return out;
}

function hammer(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  let t = 0.2;
  while (t < len / RENDER_RATE) {
    const at = Math.floor(t * RENDER_RATE);
    const f = 180 + rand() * 60;
    const knock = new Partial(f, 0.6, decayPer(0.03));
    const ring = new Partial(f * 2.7, 0.15, decayPer(0.02));
    const click = new Biquad('bandpass', 2500, 1);
    add(out, at, 2200, (i) => knock.run() + ring.run() + (i < 120 ? click.run(noise(rand)) * 0.5 : 0));
    // Bursts of three or four, then a pause to find the next nail.
    t += rand() < 0.25 ? 1.2 + rand() * 1.4 : 0.32 + rand() * 0.12;
  }
  return out;
}

function anvil(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  let t = 0.3;
  while (t < len / RENDER_RATE) {
    const at = Math.floor(t * RENDER_RATE);
    const f = midiToHz(84 + Math.floor(rand() * 3));
    const parts = [
      new Partial(f, 0.4, decayPer(0.5)),
      new Partial(f * 2.76, 0.2, decayPer(0.25)),
      new Partial(f * 5.4, 0.1, decayPer(0.12)),
    ];
    const hit = new Biquad('highpass', 3000);
    add(out, at, Math.floor(1.6 * RENDER_RATE), (i) => {
      let s = i < 80 ? hit.run(noise(rand)) * 0.5 : 0;
      for (const p of parts) s += p.run();
      return s;
    });
    t += rand() < 0.3 ? 1.6 + rand() : 0.45 + rand() * 0.1;
  }
  return out;
}

function saw(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  const bp = new Biquad('bandpass', 2400, 1.5);
  const body = new Biquad('bandpass', 600, 2);
  for (let i = 0; i < len; i++) {
    const t = i / RENDER_RATE;
    const stroke = Math.abs(Math.sin(Math.PI * 1.4 * t));
    const teeth = 0.7 + 0.3 * Math.sin(2 * Math.PI * 90 * t);
    const n = noise(rand);
    out[i] = (bp.run(n) * 0.7 + body.run(n) * 0.3) * stroke * stroke * teeth;
  }
  return out;
}

const RENDER: Record<AmbienceId, (len: number, rand: Rand) => Float32Array> = {
  anvil,
  birds,
  crickets,
  hammer,
  murmur,
  rain,
  river,
  saw,
  wind,
};

/** Loudness of each loop (RMS dBFS): beds sit low, sparse sounds a little higher so they carry. */
const LOUDNESS: Record<AmbienceId, number> = {
  anvil: -24,
  birds: -24,
  crickets: -27,
  hammer: -25,
  murmur: -25,
  rain: -26,
  river: -26,
  saw: -27,
  wind: -27,
};

/** Renders an ambience loop, loop-clean and at its loudness. */
export function renderAmbience(id: AmbienceId): Float32Array {
  const rand = seeded(AMBIENCE_IDS.indexOf(id) * 101 + 7);
  return normalizeRms(
    loopable((len) => RENDER[id](len, rand), LOOP[id], 0.6),
    LOUDNESS[id],
  );
}
