// Offline DSP for the synthesized sounds (C5G): seeded noise, filters and resonators, a fractional
// delay for tuned strings, oscillators by rotation, envelopes and loudness. Everything renders into
// Float32Arrays in the audio worker, so the voices are tested without a browser.
import { seededRand, type Rand } from '../rng';

/** Sample rate the voices render at (playback resamples): clear to 14 kHz, half the memory of 64 kHz. */
export const RENDER_RATE = 32000;

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function seeded(seed: number): Rand {
  return seededRand(seed);
}

/** White noise in -1 to 1. */
export function noise(rand: Rand): number {
  return rand() * 2 - 1;
}

export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass' | 'peak' | 'lowshelf' | 'highshelf';

/** An RBJ biquad, one sample at a time (coefficients may move between samples). */
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
    private readonly gainDb = 0,
    private readonly rate = RENDER_RATE,
  ) {
    this.set(freq, q);
  }

  set(freq: number, q = 0.707): void {
    const w = (2 * Math.PI * Math.min(Math.max(freq, 10), this.rate * 0.45)) / this.rate;
    const cos = Math.cos(w);
    const sin = Math.sin(w);
    const alpha = sin / (2 * q);
    const A = Math.pow(10, this.gainDb / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (this.kind) {
      case 'lowpass':
        b0 = (1 - cos) / 2;
        b1 = 1 - cos;
        b2 = b0;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      case 'highpass':
        b0 = (1 + cos) / 2;
        b1 = -(1 + cos);
        b2 = b0;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      case 'bandpass':
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      case 'peak':
        b0 = 1 + alpha * A;
        b1 = -2 * cos;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cos;
        a2 = 1 - alpha / A;
        break;
      case 'lowshelf':
      case 'highshelf': {
        const s = this.kind === 'lowshelf' ? 1 : -1;
        const sq = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - s * (A - 1) * cos + sq);
        b1 = 2 * s * A * (A - 1 - s * (A + 1) * cos);
        b2 = A * (A + 1 - s * (A - 1) * cos - sq);
        a0 = A + 1 + s * (A - 1) * cos + sq;
        a1 = -2 * s * (A - 1 + s * (A + 1) * cos);
        a2 = A + 1 + s * (A - 1) * cos - sq;
        break;
      }
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
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

/** A one-pole lowpass (cheap smoothing), coefficient from a cutoff. */
export class OnePole {
  private y = 0;
  private k: number;
  constructor(freq: number, rate = RENDER_RATE) {
    this.k = 1 - Math.exp((-2 * Math.PI * freq) / rate);
  }
  set(freq: number, rate = RENDER_RATE): void {
    this.k = 1 - Math.exp((-2 * Math.PI * freq) / rate);
  }
  run(x: number): number {
    this.y += (x - this.y) * this.k;
    return this.y;
  }
}

/** Pink-ish noise (Paul Kellet's economy filter): softer and warmer than white. */
export class Pink {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  constructor(private readonly rand: Rand) {}
  run(): number {
    const w = noise(this.rand);
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.2;
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

/**
 * A tuned plucked string (extended Karplus-Strong): a delay line whose length is split into whole
 * samples and a first-order allpass for the fraction, so every note is in tune (a plain integer
 * delay drifts up to a third of a semitone flat on high notes). `bright` (0 to 1) is the loop
 * filter's openness; `t60` is how long the note takes to fall 60 dB.
 */
export class TunedString {
  private readonly line: Float32Array;
  private readonly n: number;
  private idx = 0;
  private prev = 0;
  private apX = 0;
  private apY = 0;
  private readonly a: number;
  private readonly g: number;
  private readonly s: number;

  constructor(freq: number, t60: number, bright: number, rate = RENDER_RATE) {
    // Loop filter y = (1 - s) x + s x[-1]: delay s samples, more damping as s nears 0.5.
    this.s = 0.5 - 0.45 * Math.min(1, Math.max(0, bright));
    const total = rate / freq;
    // Whole samples, leaving 1 to 2 samples for the allpass (Thiran, best near 1).
    this.n = Math.max(2, Math.floor(total - this.s - 1));
    const d = total - this.s - this.n;
    this.a = (1 - d) / (1 + d);
    this.line = new Float32Array(this.n);
    // Loss per trip so the whole note falls 60 dB in t60 seconds.
    this.g = Math.pow(10, -3 / (t60 * freq));
  }

  /** Loads the excitation (one period of it, or less). */
  excite(burst: ArrayLike<number>): void {
    for (let i = 0; i < this.n && i < burst.length; i++) this.line[i] = this.line[i]! + burst[i]!;
  }

  run(): number {
    const cur = this.line[this.idx]!;
    const lp = (1 - this.s) * cur + this.s * this.prev;
    this.prev = cur;
    // First-order allpass for the fractional part of the delay.
    const ap = this.a * lp + this.apX - this.a * this.apY;
    this.apX = lp;
    this.apY = ap;
    this.line[this.idx] = ap * this.g;
    this.idx = this.idx + 1 === this.n ? 0 : this.idx + 1;
    return cur;
  }

  get period(): number {
    return this.n;
  }
}

/** Per-sample multiplier that decays to 1/e in `seconds`. */
export function decayPer(seconds: number, rate = RENDER_RATE): number {
  return Math.exp(-1 / Math.max(1e-4, seconds * rate));
}

/** Per-sample multiplier that falls 60 dB in `seconds`. */
export function t60Per(seconds: number, rate = RENDER_RATE): number {
  return Math.pow(10, -3 / Math.max(1e-4, seconds * rate));
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
export function fadeEdges(buf: Float32Array, seconds = 0.004, tail = 0.02, rate = RENDER_RATE): Float32Array {
  const n = Math.min(Math.floor(seconds * rate), Math.floor(buf.length / 2));
  const m = Math.min(Math.floor(tail * rate), Math.floor(buf.length / 2));
  for (let i = 0; i < n; i++) buf[i] = buf[i]! * (i / n);
  for (let i = 0; i < m; i++) buf[buf.length - 1 - i] = buf[buf.length - 1 - i]! * (i / m);
  return buf;
}

/** Removes DC offset with a gentle high-pass (20 Hz). */
export function dcBlock(buf: Float32Array, rate = RENDER_RATE): Float32Array {
  const r = 1 - (2 * Math.PI * 20) / rate;
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i]!;
    const y = x - x1 + r * y1;
    x1 = x;
    y1 = y;
    buf[i] = y;
  }
  return buf;
}

/**
 * Makes a buffer loop cleanly: renders `seconds + overlap`, then crossfades the tail into the head
 * (equal power) and returns exactly `seconds` of audio.
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
    out[i] = raw[i]! * Math.sin((g * Math.PI) / 2) + raw[n + i]! * Math.cos((g * Math.PI) / 2);
  }
  return out;
}

/** Adds `voice(i)` into `out` from sample `at` for `len` samples. */
export function addAt(out: Float32Array, at: number, len: number, voice: (i: number) => number): void {
  const start = Math.max(0, at);
  for (let i = start - at; i < len && at + i < out.length; i++) out[at + i] = out[at + i]! + voice(i);
}

/** Mixes `src` into `out` at `seconds`, scaled. */
export function mixInto(
  out: Float32Array,
  src: Float32Array,
  seconds: number,
  gain: number,
  rate = RENDER_RATE,
): void {
  const at = Math.floor(seconds * rate);
  for (let i = 0; i < src.length && at + i < out.length; i++) out[at + i] = out[at + i]! + src[i]! * gain;
}

/** Estimates the fundamental (Hz) near `expected` by autocorrelation, for the tuning tests. */
export function estimatePitch(buf: Float32Array, expected: number, rate = RENDER_RATE): number {
  const start = Math.floor(0.08 * rate);
  const len = Math.min(buf.length - start - 2, Math.floor(0.25 * rate));
  const p0 = rate / expected;
  const lo = Math.max(2, Math.floor(p0 * 0.92));
  const hi = Math.ceil(p0 * 1.08);
  let best = lo;
  let bestV = -Infinity;
  const corr = (lag: number): number => {
    let s = 0;
    for (let i = 0; i < len - lag; i++) s += buf[start + i]! * buf[start + i + lag]!;
    return s;
  };
  for (let lag = lo; lag <= hi; lag++) {
    const v = corr(lag);
    if (v > bestV) {
      bestV = v;
      best = lag;
    }
  }
  const a = corr(best - 1);
  const b = bestV;
  const c = corr(best + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return rate / (best + shift);
}

/** Cents between two frequencies. */
export function cents(f: number, ref: number): number {
  return 1200 * Math.log2(f / ref);
}
