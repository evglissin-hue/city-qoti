// Small offline DSP for the synthesized sounds (C5G): seeded noise, a biquad, envelopes and a
// cheap sine bank. Everything renders into Float32Arrays, so the voices are tested without a
// browser and the engine wraps them in AudioBuffers once, lazily.
import { seededRand, type Rand } from '../rng';

/** Sample rate the voices render at; playback resamples to the context's rate. */
export const RENDER_RATE = 22050;

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** White noise in -1 to 1. */
export function noise(rand: Rand): number {
  return rand() * 2 - 1;
}

export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass';

/** An RBJ biquad, processed one sample at a time (coefficients can move between samples). */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(
    private readonly kind: BiquadKind,
    freq: number,
    q = 0.707,
    private readonly rate = RENDER_RATE,
  ) {
    this.set(freq, q);
  }

  set(freq: number, q = 0.707): void {
    const w = (2 * Math.PI * Math.min(freq, this.rate * 0.45)) / this.rate;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    let b0: number;
    let b1: number;
    let b2: number;
    if (this.kind === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = b0;
    } else if (this.kind === 'highpass') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = b0;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Brown noise: integrated white noise with a leak, for rumble and wind. */
export class Brown {
  private v = 0;
  constructor(private readonly rand: Rand) {}
  run(): number {
    this.v = (this.v + noise(this.rand) * 0.02) * 0.998;
    return this.v * 3.5;
  }
}

/** A sine by rotation (no Math.sin per sample); `decay` multiplies the amplitude each sample. */
export class Partial {
  private s1: number;
  private s2: number;
  private readonly k: number;
  amp: number;

  constructor(
    freq: number,
    amp: number,
    private readonly decay = 1,
    phase = 0,
    rate = RENDER_RATE,
  ) {
    const w = (2 * Math.PI * freq) / rate;
    this.k = 2 * Math.cos(w);
    this.s1 = Math.sin(phase);
    this.s2 = Math.sin(phase - w);
    this.amp = amp;
  }

  run(): number {
    const s = this.k * this.s1 - this.s2;
    this.s2 = this.s1;
    this.s1 = s;
    const out = s * this.amp;
    this.amp *= this.decay;
    return out;
  }
}

/** Per-sample multiplier that decays to 1/e in `seconds`. */
export function decayPer(seconds: number, rate = RENDER_RATE): number {
  return Math.exp(-1 / Math.max(1e-4, seconds * rate));
}

/** Attack (linear) then hold at 1: gain at sample i. */
export function attack(i: number, seconds: number, rate = RENDER_RATE): number {
  const n = seconds * rate;
  return i >= n ? 1 : i / n;
}

/** Scales a buffer so its peak is `peak`; leaves silence alone. */
export function normalize(buf: Float32Array, peak = 0.9): Float32Array {
  let max = 0;
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]!));
  if (max > 1e-6) {
    const k = peak / max;
    for (let i = 0; i < buf.length; i++) buf[i] = buf[i]! * k;
  }
  return buf;
}

/** Scales a buffer to a loudness (RMS, dBFS), never letting its peak pass `maxPeak`. */
export function normalizeRms(buf: Float32Array, db: number, maxPeak = 0.95): Float32Array {
  let sum = 0;
  let max = 0;
  for (let i = 0; i < buf.length; i++) {
    sum += buf[i]! * buf[i]!;
    max = Math.max(max, Math.abs(buf[i]!));
  }
  const rms = Math.sqrt(sum / Math.max(1, buf.length));
  if (rms < 1e-9) return buf;
  const k = Math.min(Math.pow(10, db / 20) / rms, maxPeak / max);
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i]! * k;
  return buf;
}

/** Short fades at both ends so a one-shot never clicks. */
export function fadeEdges(buf: Float32Array, seconds = 0.005, rate = RENDER_RATE): Float32Array {
  const n = Math.min(Math.floor(seconds * rate), Math.floor(buf.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    buf[i] = buf[i]! * g;
    buf[buf.length - 1 - i] = buf[buf.length - 1 - i]! * g;
  }
  return buf;
}

/**
 * Makes a buffer loop cleanly: renders `seconds + overlap`, then crossfades the tail into the head
 * and returns exactly `seconds` of audio.
 */
export function loopable(
  render: (len: number) => Float32Array,
  seconds: number,
  overlap = 0.5,
  rate = RENDER_RATE,
): Float32Array {
  const n = Math.floor(seconds * rate);
  const o = Math.floor(overlap * rate);
  const raw = render(n + o);
  const out = raw.slice(0, n);
  for (let i = 0; i < o; i++) {
    const g = i / o;
    out[i] = raw[i]! * g + raw[n + i]! * (1 - g);
  }
  return out;
}

export function seeded(seed: number): Rand {
  return seededRand(seed);
}
