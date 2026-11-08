// Ambience loops (C5G), synthesized after how each sound is made in the world:
// - the river: a brook's babble is thousands of small bubbles, each a sine that rises as it
//   closes, over a soft bed of moving water;
// - birds: four kinds of call (a warbler's tumbling song, a tit's two clear notes, a sparrow's
//   chips, a wood pigeon's soft coo), placed sparsely at different distances;
// - crickets: a few near field crickets (a carrier with a quiet octave, a snapped attack, a little
//   pitch droop and a wing-stroke flutter) over a dense, distant bed of noise-pulse chirpers;
// - night air, tawny owls and frogs: the rest of a summer night in a field;
// - rain: dense drops on leaves and the odd heavier drip from a roof;
// - wind, a crowd's murmur, a carpenter's hammer, the smithy's anvil, the sawmill and a hearth.
// Each renders once into a loop-clean buffer (8 to 20 s, crossfaded at the seam).
import {
  Biquad,
  Brown,
  OnePole,
  Partial,
  Pink,
  RENDER_RATE,
  addAt,
  loopable,
  midiToHz,
  noise,
  normalizeRms,
  seeded,
  t60Per,
} from './dsp';
import type { Rand } from '../rng';

export type AmbienceId =
  | 'anvil'
  | 'birds'
  | 'crickets'
  | 'frogs'
  | 'hammer'
  | 'hearth'
  | 'murmur'
  | 'night-air'
  | 'owl'
  | 'rain'
  | 'river'
  | 'saw'
  | 'wind';

export const AMBIENCE_IDS: readonly AmbienceId[] = [
  'anvil',
  'birds',
  'crickets',
  'frogs',
  'hammer',
  'hearth',
  'murmur',
  'night-air',
  'owl',
  'rain',
  'river',
  'saw',
  'wind',
];

/** Loop lengths, seconds. */
export const LOOP: Record<AmbienceId, number> = {
  anvil: 9,
  birds: 20,
  crickets: 28,
  frogs: 16,
  hammer: 8,
  hearth: 10,
  murmur: 12,
  'night-air': 20,
  owl: 48,
  rain: 8,
  river: 10,
  saw: 8,
  wind: 16,
};

const R = RENDER_RATE;

function river(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  // The bed: pink noise, low and moving, as water over stones.
  const pink = new Pink(rand);
  const bed = new Biquad('lowpass', 900, 0.5);
  const sheen = new Biquad('bandpass', 2400, 0.6);
  for (let i = 0; i < len; i++) {
    const t = i / R;
    const swell = 0.8 + 0.12 * Math.sin(t * 0.7) + 0.08 * Math.sin(t * 1.9 + 1);
    const n = pink.run();
    out[i] = (bed.run(n) * 0.9 + sheen.run(n) * 0.12) * swell;
  }
  // The babble: many small bubbles, each a sine rising as it closes, loudest when small.
  const count = Math.floor((len / R) * 90);
  for (let b = 0; b < count; b++) {
    const at = Math.floor(rand() * len);
    const radius = Math.pow(rand(), 2.2);
    const f0 = 350 + (1 - radius) * 2200;
    const dur = Math.floor((0.012 + radius * 0.05) * R);
    const amp = (0.04 + rand() * 0.05) * (0.6 + radius);
    const rise = 0.6 + rand() * 0.9;
    let phase = 0;
    addAt(out, at, dur, (i) => {
      const x = i / dur;
      phase += (2 * Math.PI * f0 * (1 + rise * x * x)) / R;
      return Math.sin(phase) * amp * Math.exp(-x * 4) * Math.min(1, i / 20);
    });
  }
  const air = new OnePole(3500);
  for (let i = 0; i < len; i++) out[i] = air.run(out[i]!);
  return out;
}

function wind(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  const brown = new Brown(rand);
  const pink = new Pink(rand);
  const body = new Biquad('bandpass', 350, 0.7);
  const whistle = new Biquad('bandpass', 900, 6);
  for (let i = 0; i < len; i++) {
    const t = i / R;
    const gust = 0.5 + 0.28 * Math.sin(t * 0.37) + 0.16 * Math.sin(t * 1.1 + 2) + 0.06 * Math.sin(t * 2.9);
    if (i % 128 === 0) {
      body.set(220 + gust * 420, 0.8);
      whistle.set(700 + gust * 500, 7);
    }
    const n = pink.run();
    out[i] = (body.run(n) * 0.8 + brown.run() * 0.25 + whistle.run(n) * 0.12 * gust) * gust;
  }
  return out;
}

function rain(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  const pink = new Pink(rand);
  const hiss = new Biquad('highpass', 1500);
  const soft = new Biquad('lowpass', 8000);
  for (let i = 0; i < len; i++) out[i] = soft.run(hiss.run(pink.run())) * 0.45;
  // Drops on leaves: many tiny ticks with a little pitch; the odd fat drip from the eaves.
  const drops = Math.floor((len / R) * 260);
  for (let d = 0; d < drops; d++) {
    const at = Math.floor(rand() * len);
    const fat = rand() < 0.03;
    const f = fat ? 500 + rand() * 500 : 2000 + rand() * 4000;
    const p = new Partial(f, fat ? 0.25 : 0.04 + rand() * 0.06, t60Per(fat ? 0.06 : 0.012));
    addAt(out, at, Math.floor((fat ? 0.08 : 0.02) * R), () => p.run());
  }
  return out;
}

/**
 * One field cricket, a few meters off: a carrier near 4 kHz with a quiet octave, each pulse a
 * snapped attack (a breath of noise) that droops a little in pitch, the whole chirp fluttering at the
 * wing-stroke rate. It sings in bouts with rests between, and its chirp rate drifts as it goes.
 */
function fieldCricket(out: Float32Array, rand: Rand, c: number, level: number, lowpass: number): void {
  const len = out.length;
  const mine = new Float32Array(len);
  const carrier = 3800 + rand() * 800;
  const wing = 30 + rand() * 14;
  const pulses = 3 + Math.floor(rand() * 3);
  const every = 0.5 + rand() * 0.6;
  const dur = Math.floor((0.011 + rand() * 0.003) * R);
  const snap = new Biquad('bandpass', carrier, 3);
  let t = rand() * every * 2;
  let boutEnd = t + 4 + rand() * 8;
  while (t < len / R) {
    if (t > boutEnd) {
      t += 1.5 + rand() * 3.5;
      boutEnd = t + 4 + rand() * 8;
    }
    const chirpAmp = level * (0.85 + rand() * 0.3);
    for (let p = 0; p < pulses; p++) {
      const start = t + p / wing;
      const at = Math.floor(start * R);
      const amp = chirpAmp * (0.8 + (0.2 * p) / pulses);
      let phase = rand() * 6.28;
      addAt(mine, at, dur, (i) => {
        const x = i / dur;
        // A quick rise and a slower fall.
        const env = Math.sin(Math.PI * Math.pow(x, 0.6));
        phase += (2 * Math.PI * carrier * (1 - 0.035 * x)) / R;
        const flutter = 0.78 + 0.22 * Math.sin(2 * Math.PI * wing * (start + i / R));
        const tone = Math.sin(phase) + 0.2 * Math.sin(2 * phase + 0.7);
        const tick = i < 0.002 * R ? snap.run(noise(rand)) * 0.5 * (1 - i / R / 0.002) : 0;
        return (tone * env * flutter + tick) * amp;
      });
    }
    t += every * (0.88 + rand() * 0.24) * (1 + 0.07 * Math.sin(t * 0.31 + c));
  }
  const lp = new OnePole(lowpass);
  for (let i = 0; i < len; i++) out[i] = out[i]! + lp.run(mine[i]!);
}

/**
 * The bed: many far crickets, each a quiet chirper of band-limited noise pulses around 3 to 5 kHz,
 * all unrelated in pitch and rhythm, so the sum is a shimmer and no single one is a beep.
 */
function cricketBed(len: number, rand: Rand, count: number): Float32Array {
  const out = new Float32Array(len);
  for (let c = 0; c < count; c++) {
    const f = 3000 + rand() * 2000;
    const bp = new Biquad('bandpass', f, 5 + rand() * 4);
    const every = 0.4 + rand() * 0.9;
    const pulses = 2 + Math.floor(rand() * 3);
    const gap = 0.024 + rand() * 0.016;
    const dur = Math.floor((0.009 + rand() * 0.006) * R);
    const amp = 0.12 + rand() * 0.16;
    let t = rand() * every;
    while (t < len / R) {
      // Each chirper rests now and then, so the bed breathes.
      if (rand() < 0.06) t += 0.8 + rand() * 2.5;
      for (let p = 0; p < pulses; p++) {
        addAt(
          out,
          Math.floor((t + p * gap) * R),
          dur,
          (i) => bp.run(noise(rand)) * amp * Math.sin((Math.PI * i) / dur),
        );
      }
      t += every * (0.85 + rand() * 0.3);
    }
  }
  // Heard across a field: the top rolled off.
  const lp = new OnePole(4300);
  for (let i = 0; i < len; i++) out[i] = lp.run(out[i]!);
  return out;
}

export function crickets(len: number, rand: Rand, near = true, bed = true): Float32Array {
  const out = bed ? cricketBed(len, rand, 36) : new Float32Array(len);
  // The nearer ones sit above the bed; two of the three are a little farther off and duller.
  if (near)
    for (let c = 0; c < 3; c++) fieldCricket(out, rand, c, bed ? 0.13 / (1 + c * 0.7) : 0.2, 5200 - c * 800);
  return out;
}

/** Night air: a soft low rustle of leaves and grass, drifting slowly, never repeating its swell. */
function nightAir(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  const pink = new Pink(rand);
  const brown = new Brown(rand);
  const low = new Biquad('lowpass', 650, 0.5);
  const leaves = new Biquad('bandpass', 1700, 0.5);
  const soft = new Biquad('lowpass', 3000, 0.5);
  for (let i = 0; i < len; i++) {
    const t = i / R;
    const drift =
      0.55 + 0.25 * Math.sin(t * 0.43 + 1) + 0.14 * Math.sin(t * 0.97 + 4) + 0.06 * Math.sin(t * 2.3);
    const stir = Math.max(0, Math.sin(t * 0.61) * Math.sin(t * 0.23 + 2));
    if (i % 256 === 0) leaves.set(1400 + 700 * drift, 0.6);
    const n = pink.run();
    out[i] = soft.run(low.run(n) * drift + brown.run() * 0.12 + leaves.run(n) * 0.35 * stir);
  }
  return out;
}

/** One tawny owl phrase at sample `at`: "hoo, hu-hu-hoooo", a breathy hoot through a formant. */
function owlCall(out: Float32Array, at: number, rand: Rand, f0: number, amp: number): void {
  // [start s, length s, pitch from, pitch to, loudness, vibrato depth]
  const notes: [number, number, number, number, number, number][] = [
    [0, 0.55, 1, 0.97, 1, 0.004],
    [1.05, 0.17, 0.97, 0.94, 0.55, 0],
    [1.3, 0.17, 0.97, 0.94, 0.6, 0],
    [1.62, 1.5, 0.98, 0.86, 0.9, 0.022],
  ];
  const breath = new Biquad('bandpass', 620, 1.3);
  const tail = Math.floor(3.4 * R);
  const mine = new Float32Array(tail);
  const f0j = f0 * (0.97 + rand() * 0.06);
  for (const [s, d, p0, p1, loud, vib] of notes) {
    const n = Math.floor(d * R);
    let phase = 0;
    // P1 (player's ear): a living voice wanders a little in pitch; a steady one reads as a whistle.
    const wander = rand() * 2 * Math.PI;
    addAt(mine, Math.floor(s * R), n, (i) => {
      const x = i / n;
      const drift = 1 + 0.006 * Math.sin((2 * Math.PI * 1.3 * i) / R + wander);
      const f = f0j * (p0 + (p1 - p0) * x) * (1 + vib * Math.sin((2 * Math.PI * 5.5 * i) / R)) * drift;
      phase += (2 * Math.PI * f) / R;
      // The hoot's harmonics: a soft, round "hoo" is mostly its fundamental (the second harmonic
      // about 20 dB down), with a vowel formant sitting on the hoot itself.
      let v = 0;
      for (let h = 1; h <= 8; h++) {
        const df = (h * f - 480) / 220;
        v += (Math.sin(h * phase) / Math.pow(h, 2.1)) * (1 + 2.2 * Math.exp(-df * df));
      }
      const env = Math.pow(Math.sin(Math.PI * Math.pow(x, 0.7)), 1.2);
      return (v * 0.4 + breath.run(noise(rand)) * 0.1) * env * loud;
    });
  }
  // Heard from across the wood: a dull edge and two soft echoes off the trees.
  const lp = new OnePole(1700);
  const dry = new Float32Array(tail);
  for (let i = 0; i < tail; i++) dry[i] = lp.run(mine[i]!);
  for (let i = 0; i < tail; i++) {
    const e1 = i >= 5760 ? dry[i - 5760]! * 0.22 : 0;
    const e2 = i >= 13500 ? dry[i - 13500]! * 0.1 : 0;
    const j = at + i;
    if (j >= 0 && j < out.length) out[j] = out[j]! + (dry[i]! + e1 + e2) * amp;
  }
}

/** Owls: one near hoot and a farther one, each placed well inside the loop so the seam is quiet. */
function owl(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  const span = len - Math.floor(7 * R);
  owlCall(out, Math.floor(R * 3 + rand() * 0.25 * span), rand, 430, 0.45);
  owlCall(out, Math.floor(R * 3 + (0.6 + rand() * 0.3) * span), rand, 385, 0.25);
  return out;
}

/**
 * Frogs and toads: low croaks, each a carrier of 200 to 600 Hz in a train of pulses, a small chorus
 * of nearer voices over farther ones, with a toad's long purr now and then.
 */
function frogs(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  const voices = 8;
  for (let v = 0; v < voices; v++) {
    const near = v < 3;
    const f = 200 + rand() * 330;
    const pulseRate = 22 + rand() * 20;
    const level = (near ? 0.2 : 0.08) * (0.7 + rand() * 0.6);
    const lp = new OnePole(near ? 1500 : 900);
    const mine = new Float32Array(len);
    let t = rand() * 3;
    while (t < len / R) {
      // A run of one to four croaks, then quiet.
      const croaks = 1 + Math.floor(rand() * 4);
      for (let k = 0; k < croaks; k++) {
        const d = 0.16 + rand() * 0.3;
        const n = Math.floor(d * R);
        const pitch = f * (0.9 + rand() * 0.2);
        let phase = 0;
        addAt(mine, Math.floor(t * R), n, (i) => {
          const x = i / n;
          phase += (2 * Math.PI * pitch * (1 + 0.18 * Math.sin(Math.PI * x) - 0.1 * x)) / R;
          // Pulsed: the throat flutters, so the amplitude is a train of soft clicks.
          const am = 0.5 + 0.5 * Math.sin(2 * Math.PI * pulseRate * (i / R));
          const body = Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.3 * Math.sin(3 * phase);
          return body * am * am * Math.sin(Math.PI * x) * level;
        });
        t += d + 0.12 + rand() * 0.2;
      }
      t += 1 + rand() * 4.5;
    }
    for (let i = 0; i < len; i++) out[i] = out[i]! + lp.run(mine[i]!);
  }
  // A toad: a long, even purr, low in the water, once or twice a loop.
  const purrs = 1 + Math.floor(rand() * 2);
  for (let k = 0; k < purrs; k++) {
    const d = 1.4 + rand() * 1.4;
    const n = Math.floor(d * R);
    const f = 430 + rand() * 120;
    const lp = new OnePole(1100);
    let phase = 0;
    addAt(out, Math.floor(rand() * (len - n - R)), n, (i) => {
      const x = i / n;
      phase += (2 * Math.PI * f * (1 + 0.04 * x)) / R;
      const am = 0.5 + 0.5 * Math.sin(2 * Math.PI * 48 * (i / R));
      return lp.run((Math.sin(phase) + 0.4 * Math.sin(2 * phase)) * am * am * Math.sin(Math.PI * x) * 0.1);
    });
  }
  return out;
}

/**
 * A short impulse response for outdoors: a few early reflections off trees and walls, then a
 * quick, dark tail. Two channels; the music's room stays as it is.
 */
export function outdoorImpulse(rate: number, seconds = 0.7): [Float32Array, Float32Array] {
  const len = Math.floor(seconds * rate);
  const rand = seeded(31);
  const taps = [
    [0.011, 0.014],
    [0.023, 0.029],
    [0.041, 0.047],
    [0.067, 0.079],
    [0.101, 0.113],
  ];
  const chans: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
  for (let c = 0; c < 2; c++) {
    const d = chans[c]!;
    taps.forEach((tap, k) => {
      const at = Math.floor(tap[c]! * rate);
      const g = 0.5 * Math.pow(0.7, k);
      // Each reflection is a soft smear of a few samples, not a click.
      for (let j = 0; j < 6 && at + j < len; j++) d[at + j] = d[at + j]! + g * (1 - j / 6) * (k % 2 ? -1 : 1);
    });
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += (noise(rand) - lp) * (0.08 + 0.3 * (1 - t));
      const start = Math.min(1, Math.max(0, (i / rate - 0.02) / 0.03));
      d[i] = d[i]! + lp * 0.18 * Math.pow(1 - t, 4) * start;
    }
  }
  return chans;
}

/** A note sweeping from f0 to f1 with a trill; the shape of most small birds' calls. */
function chirp(
  out: Float32Array,
  at: number,
  seconds: number,
  f0: number,
  f1: number,
  amp: number,
  trill: number,
  depth: number,
): void {
  const n = Math.floor(seconds * R);
  let phase = 0;
  addAt(out, at, n, (i) => {
    const x = i / n;
    const f = (f0 + (f1 - f0) * x) * (1 + depth * Math.sin((2 * Math.PI * trill * i) / R));
    phase += (2 * Math.PI * f) / R;
    const env = Math.sin(Math.PI * x);
    return (Math.sin(phase) + 0.15 * Math.sin(2 * phase)) * amp * env * env;
  });
}

function birds(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  const songs = Math.floor((len / R) * 0.5);
  for (let s = 0; s < songs; s++) {
    let t = Math.floor(rand() * (len - 2.5 * R));
    // Nearer birds are louder and brighter.
    const near = 0.3 + rand() * 0.7;
    const kind = Math.floor(rand() * 4);
    if (kind === 0) {
      // A warbler: a tumbling run of quick notes.
      const n = 6 + Math.floor(rand() * 8);
      let f = 2600 + rand() * 1600;
      for (let k = 0; k < n; k++) {
        const d = 0.05 + rand() * 0.06;
        const f1 = f * (0.8 + rand() * 0.45);
        chirp(out, t, d, f, f1, 0.16 * near, 40 + rand() * 30, 0.04);
        t += Math.floor((d + 0.02 + rand() * 0.04) * R);
        f = Math.max(2000, Math.min(5200, f1 * (0.9 + rand() * 0.25)));
      }
    } else if (kind === 1) {
      // A tit: two clear whistled notes, high then lower ("tea-cher").
      const hi = 3600 + rand() * 600;
      for (let r = 0; r < 2 + Math.floor(rand() * 2); r++) {
        chirp(out, t, 0.22, hi, hi * 0.98, 0.15 * near, 0, 0);
        chirp(out, t + Math.floor(0.26 * R), 0.22, hi * 0.84, hi * 0.82, 0.13 * near, 0, 0);
        t += Math.floor(0.6 * R);
      }
    } else if (kind === 2) {
      // A sparrow: short chips.
      const f = 3000 + rand() * 1500;
      for (let k = 0; k < 3 + Math.floor(rand() * 4); k++) {
        chirp(out, t, 0.035, f * 1.15, f * 0.85, 0.13 * near, 0, 0);
        t += Math.floor((0.12 + rand() * 0.1) * R);
      }
    } else if (rand() < 0.5) {
      // A wood pigeon, far off: a soft, low coo, coo-coo.
      const f = 480 + rand() * 60;
      const amp = 0.2 * near;
      for (const [o, d] of [
        [0, 0.45],
        [0.55, 0.3],
        [0.95, 0.5],
      ] as const) {
        const n = Math.floor(d * R);
        let ph = 0;
        const lp = new OnePole(900);
        addAt(out, t + Math.floor(o * R), n, (i) => {
          const x = i / n;
          ph += (2 * Math.PI * f * (1 + 0.06 * Math.sin(Math.PI * x))) / R;
          return lp.run(Math.sin(ph) * amp * Math.pow(Math.sin(Math.PI * x), 1.5));
        });
      }
    }
  }
  // Birds heard from a garden, not a cage: their sharpest edge rolled off, with a faint bed of leaves.
  const air = new Biquad('lowpass', 4200, 0.6);
  const air2 = new Biquad('lowpass', 4200, 0.6);
  const leaves = new Biquad('bandpass', 2500, 0.4);
  for (let i = 0; i < len; i++) out[i] = air2.run(air.run(out[i]!)) + leaves.run(noise(rand)) * 0.006;
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
  for (let v = 0; v < 10; v++) {
    const pitch = 95 + rand() * 150;
    const f1 = new Biquad('bandpass', 600, 4);
    const f2 = new Biquad('bandpass', 1400, 5);
    let phase = rand();
    let syll = 0;
    let env = 0;
    let target = 0;
    const far = 0.4 + rand() * 0.6;
    for (let i = 0; i < len; i++) {
      if (--syll <= 0) {
        syll = Math.floor((0.11 + rand() * 0.2) * R);
        const [a, b] = vowels[Math.floor(rand() * vowels.length)]!;
        f1.set(a, 4);
        f2.set(b, 5);
        target = rand() < 0.25 ? 0 : 0.5 + rand() * 0.5;
      }
      env += (target - env) * 0.0015;
      const f = pitch * (1 + 0.07 * Math.sin(i * 0.0007 + v));
      phase += f / R;
      if (phase >= 1) phase -= 1;
      const src = phase * 2 - 1 + noise(rand) * 0.12;
      out[i] = out[i]! + (f1.run(src) + f2.run(src) * 0.5) * env * 0.2 * far;
    }
  }
  const lp = new Biquad('lowpass', 1500);
  for (let i = 0; i < len; i++) out[i] = lp.run(out[i]!);
  return out;
}

function hammer(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  let t = 0.2;
  while (t < len / R) {
    const at = Math.floor(t * R);
    const f = 190 + rand() * 50;
    // Wood answers a hammer with a dull knock, a short ring and the nail's tick.
    const modes = [
      new Partial(f, 0.6, t60Per(0.08)),
      new Partial(f * 2.7, 0.18, t60Per(0.05)),
      new Partial(f * 5.1, 0.08, t60Per(0.025)),
    ];
    const click = new Biquad('bandpass', 3200, 1.2);
    addAt(out, at, Math.floor(0.2 * R), (i) => {
      let s = 0;
      for (const m of modes) s += m.run();
      return s + (i < 100 ? click.run(noise(rand)) * (1 - i / 100) * 0.5 : 0);
    });
    // Bursts of three or four, then a pause to find the next nail.
    t += rand() < 0.25 ? 1.2 + rand() * 1.4 : 0.32 + rand() * 0.12;
  }
  return out;
}

function anvil(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  let t = 0.3;
  while (t < len / R) {
    const at = Math.floor(t * R);
    const f = midiToHz(84 + Math.floor(rand() * 3));
    const parts = [
      new Partial(f, 0.4, t60Per(1.2)),
      new Partial(f * 2.76, 0.2, t60Per(0.6)),
      new Partial(f * 5.4, 0.1, t60Per(0.3)),
    ];
    const hit = new Biquad('highpass', 3000);
    addAt(out, at, Math.floor(1.6 * R), (i) => {
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
  const body = new Biquad('bandpass', 650, 2);
  for (let i = 0; i < len; i++) {
    const t = i / R;
    const stroke = Math.abs(Math.sin(Math.PI * 1.3 * t));
    const teeth = 0.7 + 0.3 * Math.sin(2 * Math.PI * (80 + 30 * stroke) * t);
    const n = noise(rand);
    out[i] = (bp.run(n) * 0.7 + body.run(n) * 0.3) * stroke * stroke * teeth;
  }
  return out;
}

function hearth(len: number, rand: Rand): Float32Array {
  // A fire in the grate: a low breath of flame and the pops and ticks of burning wood.
  const out = new Float32Array(len);
  const brown = new Brown(rand);
  const roar = new Biquad('lowpass', 260);
  for (let i = 0; i < len; i++) out[i] = roar.run(brown.run()) * 0.5;
  const pops = Math.floor((len / R) * 7);
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(rand() * len);
    const big = rand() < 0.2;
    const bp = new Biquad('bandpass', 1200 + rand() * 3000, 2);
    const n = Math.floor((big ? 0.03 : 0.008) * R);
    const amp = big ? 0.5 : 0.15 + rand() * 0.2;
    addAt(out, at, n, (i) => bp.run(noise(rand)) * amp * Math.exp(-i / (n * 0.25)));
    if (big) {
      // A crackle follows a pop: a few quick ticks.
      for (let k = 1; k < 4; k++) {
        const at2 = at + Math.floor((0.02 + rand() * 0.05) * R * k);
        const tick = Math.floor(0.004 * R);
        addAt(out, at2, tick, (i) => noise(rand) * 0.12 * (1 - i / tick));
      }
    }
  }
  return out;
}

const RENDER: Record<AmbienceId, (len: number, rand: Rand) => Float32Array> = {
  anvil,
  birds,
  crickets,
  frogs,
  hammer,
  hearth,
  murmur,
  'night-air': nightAir,
  owl,
  rain,
  river,
  saw,
  wind,
};

/** Loudness of each loop (RMS dBFS): beds sit low, sparse sounds a little higher so they carry. */
const LOUDNESS: Record<AmbienceId, number> = {
  anvil: -24,
  birds: -31,
  crickets: -31,
  frogs: -30,
  hammer: -25,
  hearth: -26,
  murmur: -26,
  'night-air': -31,
  owl: -33,
  rain: -26,
  river: -26,
  saw: -27,
  wind: -27,
};

/** Seed slot of each loop: the first ten keep the slots they had, so older loops sound as before. */
const SEED_SLOT: Record<AmbienceId, number> = {
  anvil: 0,
  birds: 1,
  crickets: 2,
  frogs: 10,
  hammer: 3,
  hearth: 4,
  murmur: 5,
  'night-air': 11,
  owl: 12,
  rain: 6,
  river: 7,
  saw: 8,
  wind: 9,
};

/** Renders an ambience loop, loop-clean and at its loudness. */
export function renderAmbience(id: AmbienceId): Float32Array {
  const rand = seeded(SEED_SLOT[id] * 101 + 7);
  return normalizeRms(
    loopable((len) => RENDER[id](len, rand), LOOP[id], 0.6),
    LOUDNESS[id],
  );
}
