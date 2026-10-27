// The band (C5G), synthesized: a nylon guitar (Karplus-Strong), a felt piano (inharmonic partials
// with two slightly detuned strings), an upright bass, brushes, a music box bell and a soft pad.
// Each note renders once into a Float32Array at RENDER_RATE; the engine caches them by note.
import {
  Biquad,
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

export type Instrument = 'guitar' | 'piano' | 'bass' | 'brush' | 'bell' | 'pad';

/** Seconds each instrument's note rings (longer notes are cut with a fade by the player). */
export const NOTE_SECONDS: Record<Instrument, number> = {
  guitar: 1.8,
  piano: 2.4,
  bass: 1.4,
  brush: 0.3,
  bell: 2.6,
  pad: 4,
};

/** Karplus-Strong pluck: a burst of filtered noise in a damped delay line. */
function pluck(freq: number, seconds: number, bright: number, damp: number, seed: number): Float32Array {
  const rand = seeded(seed);
  const n = Math.floor(seconds * RENDER_RATE);
  const out = new Float32Array(n);
  const period = Math.max(2, Math.round(RENDER_RATE / freq));
  const line = new Float32Array(period);
  const shape = new Biquad('lowpass', 600 + bright * 5000);
  for (let i = 0; i < period; i++) line[i] = shape.run(noise(rand));
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[idx]!;
    const next = (cur + prev) * 0.5 * damp;
    prev = cur;
    line[idx] = next;
    out[i] = cur;
    idx = (idx + 1) % period;
  }
  return out;
}

function guitar(midi: number): Float32Array {
  const f = midiToHz(midi);
  const raw = pluck(f, NOTE_SECONDS.guitar, 0.6, 0.997 - Math.max(0, midi - 60) * 0.0003, midi);
  // A little body: a low resonance and a soft top cut, so it reads as nylon, not steel.
  const body = new Biquad('bandpass', 220, 1.2);
  const top = new Biquad('lowpass', 5200);
  for (let i = 0; i < raw.length; i++) raw[i] = top.run(raw[i]! + body.run(raw[i]!) * 0.4);
  return fadeEdges(normalize(raw, 0.8), 0.003);
}

function piano(midi: number): Float32Array {
  const f = midiToHz(midi);
  const n = Math.floor(NOTE_SECONDS.piano * RENDER_RATE);
  const out = new Float32Array(n);
  const B = 0.00025;
  const parts: Partial[] = [];
  for (let k = 1; k <= 8; k++) {
    const fk = f * k * Math.sqrt(1 + B * k * k);
    if (fk > RENDER_RATE * 0.45) break;
    const amp = 1 / Math.pow(k, 1.05);
    // Higher partials and higher notes fade sooner, like felt on a hammer.
    const t = (1.6 / (1 + (k - 1) * 0.45)) * Math.min(1.4, 300 / f + 0.5);
    parts.push(new Partial(fk, amp, decayPer(t), k * 0.7));
    if (k <= 3) parts.push(new Partial(fk * 1.0007, amp * 0.7, decayPer(t * 1.1), k * 1.3));
  }
  const rand = seeded(midi * 13);
  const hammer = new Biquad('bandpass', Math.min(4000, f * 4), 0.8);
  const soft = new Biquad('lowpass', Math.min(7000, f * 8 + 1200));
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const p of parts) s += p.run();
    const click = i < 300 ? hammer.run(noise(rand)) * (1 - i / 300) * 0.15 : 0;
    out[i] = soft.run(s * attack(i, 0.004) + click);
  }
  return fadeEdges(normalize(out, 0.75), 0.002);
}

function bass(midi: number): Float32Array {
  const f = midiToHz(midi);
  const n = Math.floor(NOTE_SECONDS.bass * RENDER_RATE);
  const out = new Float32Array(n);
  const ks = pluck(f, NOTE_SECONDS.bass, 0.1, 0.992, midi * 7);
  const fund = new Partial(f, 0.9, decayPer(0.6));
  const second = new Partial(f * 2, 0.35, decayPer(0.35), 0.4);
  const lp = new Biquad('lowpass', 700);
  for (let i = 0; i < n; i++) {
    const s = fund.run() + second.run() + ks[i]! * 0.5;
    out[i] = lp.run(s * attack(i, 0.012));
  }
  return fadeEdges(normalize(out, 0.85), 0.004);
}

function brush(seed: number): Float32Array {
  const rand = seeded(seed);
  const n = Math.floor(NOTE_SECONDS.brush * RENDER_RATE);
  const out = new Float32Array(n);
  const bp = new Biquad('bandpass', 5000, 0.6);
  const hp = new Biquad('highpass', 1800);
  let env = 0;
  const d = decayPer(0.07);
  for (let i = 0; i < n; i++) {
    env = i < 220 ? i / 220 : env * d;
    out[i] = hp.run(bp.run(noise(rand))) * env;
  }
  return fadeEdges(normalize(out, 0.9), 0.002);
}

function bell(midi: number): Float32Array {
  const f = midiToHz(midi);
  const n = Math.floor(NOTE_SECONDS.bell * RENDER_RATE);
  const out = new Float32Array(n);
  // A music box tine: strong fundamental, a few inharmonic overtones that die quickly.
  const ratios: [number, number, number][] = [
    [1, 1, 1.6],
    [2.0, 0.25, 0.7],
    [3.01, 0.12, 0.35],
    [5.43, 0.06, 0.15],
  ];
  const parts = ratios
    .filter(([r]) => f * r < RENDER_RATE * 0.45)
    .map(([r, a, t], i) => new Partial(f * r, a, decayPer(t), i));
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const p of parts) s += p.run();
    out[i] = s * attack(i, 0.002);
  }
  return fadeEdges(normalize(out, 0.6), 0.002);
}

function pad(midi: number): Float32Array {
  const f = midiToHz(midi);
  const n = Math.floor(NOTE_SECONDS.pad * RENDER_RATE);
  const out = new Float32Array(n);
  const parts = [
    new Partial(f, 0.6),
    new Partial(f * 1.003, 0.5, 1, 1),
    new Partial(f * 2, 0.15, 1, 2),
    new Partial(f * 0.998 * 3, 0.06, 1, 3),
  ];
  const lp = new Biquad('lowpass', 1600);
  for (let i = 0; i < n; i++) {
    const t = i / RENDER_RATE;
    let s = 0;
    for (const p of parts) s += p.run();
    const env = Math.min(1, t / 1.2) * Math.min(1, (NOTE_SECONDS.pad - t) / 1.2);
    out[i] = lp.run(s) * env;
  }
  return normalize(out, 0.5);
}

/** Renders one note of an instrument. Brush notes ignore the pitch and vary by `midi` as a seed. */
export function renderNote(inst: Instrument, midi: number): Float32Array {
  switch (inst) {
    case 'guitar':
      return guitar(midi);
    case 'piano':
      return piano(midi);
    case 'bass':
      return bass(midi);
    case 'brush':
      return brush(midi);
    case 'bell':
      return bell(midi);
    case 'pad':
      return pad(midi);
  }
}
