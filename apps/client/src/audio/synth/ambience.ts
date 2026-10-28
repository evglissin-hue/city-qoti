// Ambience loops (C5G), synthesized after how each sound is made in the world:
// - the river: a brook's babble is thousands of small bubbles, each a sine that rises as it
//   closes, over a soft bed of moving water;
// - birds: four kinds of call (a warbler's tumbling song, a tit's two clear notes, a sparrow's
//   chips, a wood pigeon's soft coo), placed sparsely at different distances;
// - crickets: several, each with its own pulse rate and pitch;
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
  'anvil' | 'birds' | 'crickets' | 'hammer' | 'hearth' | 'murmur' | 'rain' | 'river' | 'saw' | 'wind';

export const AMBIENCE_IDS: readonly AmbienceId[] = [
  'anvil',
  'birds',
  'crickets',
  'hammer',
  'hearth',
  'murmur',
  'rain',
  'river',
  'saw',
  'wind',
];

/** Loop lengths, seconds. */
const LOOP: Record<AmbienceId, number> = {
  anvil: 9,
  birds: 20,
  crickets: 8,
  hammer: 8,
  hearth: 10,
  murmur: 12,
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

function crickets(len: number, rand: Rand): Float32Array {
  const out = new Float32Array(len);
  for (let c = 0; c < 4; c++) {
    const f = 4100 + rand() * 1100;
    const every = 0.45 + rand() * 0.5;
    const pulses = 2 + Math.floor(rand() * 4);
    const gap = 0.028 + rand() * 0.015;
    const amp = 0.22 / (1 + c * 0.5);
    const lp = new OnePole(5000 - c * 800);
    for (let t = rand() * every; t < len / R; t += every * (0.92 + rand() * 0.16)) {
      for (let p = 0; p < pulses; p++) {
        const at = Math.floor((t + p * gap) * R);
        const dur = Math.floor(0.018 * R);
        const osc = new Partial(f, amp);
        addAt(out, at, dur, (i) => lp.run(osc.run() * Math.sin((Math.PI * i) / dur)));
      }
    }
  }
  return out;
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
  // Far birds are dulled by distance; the near ones keep their sparkle.
  const leaves = new Biquad('bandpass', 2500, 0.4);
  for (let i = 0; i < len; i++) out[i] = out[i]! + leaves.run(noise(rand)) * 0.006;
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
  hammer,
  hearth,
  murmur,
  rain,
  river,
  saw,
  wind,
};

/** Loudness of each loop (RMS dBFS): beds sit low, sparse sounds a little higher so they carry. */
const LOUDNESS: Record<AmbienceId, number> = {
  anvil: -24,
  birds: -25,
  crickets: -27,
  hammer: -25,
  hearth: -26,
  murmur: -26,
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
