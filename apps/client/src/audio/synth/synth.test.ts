import { describe, expect, it } from 'vitest';
import { AMBIENCE_IDS, LOOP, outdoorImpulse, renderAmbience } from './ambience';
import { CUE_IDS, TUNED_CUES, renderCue } from './cues';
import { RENDER_RATE, cents, estimatePitch, loopable, midiToHz } from './dsp';
import { INSTRUMENTS, UNPITCHED, renderNote } from './instruments';
import { CUE_GAP } from '../cues/limiter';

function check(buf: Float32Array, oneShot = true): void {
  let peak = 0;
  let energy = 0;
  let finite = true;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i]!;
    if (!Number.isFinite(v)) finite = false;
    peak = Math.max(peak, Math.abs(v));
    energy += v * v;
  }
  expect(finite).toBe(true);
  expect(peak).toBeLessThanOrEqual(1);
  expect(energy / buf.length).toBeGreaterThan(1e-6);
  // No click at the start (loops start anywhere; they never start from silence).
  if (oneShot) expect(Math.abs(buf[0]!)).toBeLessThan(0.05);
}

const peakOf = (b: Float32Array): number => b.reduce((a, v) => Math.max(a, Math.abs(v)), 0);

describe('synthesized sounds', () => {
  it('renders every instrument, both touches, clean and in bounds', () => {
    for (const inst of INSTRUMENTS)
      for (const midi of [40, 57, 72, 84]) for (const layer of [0, 1]) check(renderNote(inst, midi, layer));
  });

  it('plays in tune: plucked strings within 3 cents, bars and winds within 3, the piano stretched no more than 12', () => {
    const tol: Partial<Record<string, number>> = { piano: 12, epiano: 5 };
    for (const inst of INSTRUMENTS) {
      if (UNPITCHED.has(inst) || inst === 'glock') continue;
      const range = inst === 'bass' ? [33, 40, 45, 52] : [48, 57, 64, 69, 76];
      for (const m of range) {
        const off = cents(estimatePitch(renderNote(inst, m, 1), midiToHz(m)), midiToHz(m));
        expect(Math.abs(off), `${inst} ${m}`).toBeLessThanOrEqual(tol[inst] ?? 3);
      }
    }
  });

  it('renders every cue, short enough to stay a cue, each with a rate limit', () => {
    for (const id of CUE_IDS) {
      const b = renderCue(id);
      check(b);
      expect(b.length / RENDER_RATE).toBeLessThan(6);
    }
    expect(Object.keys(CUE_GAP).sort()).toEqual([...CUE_IDS].sort());
    for (const id of TUNED_CUES) expect(CUE_IDS).toContain(id);
  });

  it('renders every ambience loop loop-clean', () => {
    for (const id of AMBIENCE_IDS) {
      const b = renderAmbience(id);
      check(b, false);
      const secs = b.length / RENDER_RATE;
      expect(secs).toBe(LOOP[id]);
      // The seam is no larger a jump than the loop's own sample-to-sample motion.
      let step = 0;
      for (let i = 1; i < b.length; i++) step = Math.max(step, Math.abs(b[i]! - b[i - 1]!));
      expect(Math.abs(b[0]! - b[b.length - 1]!)).toBeLessThanOrEqual(step + 1e-6);
    }
  });

  it('renders the night layers finite, in level, and in the lengths asked for', () => {
    const rms = (b: Float32Array): number =>
      20 * Math.log10(Math.sqrt(b.reduce((a, v) => a + v * v, 0) / b.length));
    // Crickets are a long loop (24 to 32 s) so the pattern is not heard to repeat, and sit 4 dB under the old -27.
    expect(renderAmbience('crickets').length / RENDER_RATE).toBeGreaterThanOrEqual(24);
    expect(renderAmbience('crickets').length / RENDER_RATE).toBeLessThanOrEqual(32);
    const target = { crickets: -31, frogs: -30, 'night-air': -31, owl: -33 } as const;
    for (const id of ['crickets', 'frogs', 'night-air', 'owl'] as const) {
      const b = renderAmbience(id);
      expect(b.every(Number.isFinite), id).toBe(true);
      expect(rms(b), id).toBeCloseTo(target[id], 0);
      expect(peakOf(b), id).toBeLessThan(0.5);
    }
  });

  it('keeps the owl to a few calls and the frogs low', () => {
    // Owl: sparse, so most of its loop is quiet; its hoots sit under a kilohertz or two.
    const owl = renderAmbience('owl');
    const win = RENDER_RATE / 2;
    let loud = 0;
    let wins = 0;
    for (let i = 0; i + win <= owl.length; i += win) {
      let e = 0;
      for (let j = 0; j < win; j++) e += owl[i + j]! * owl[i + j]!;
      wins++;
      if (Math.sqrt(e / win) > 0.01) loud++;
    }
    expect(loud / wins).toBeGreaterThan(0.1);
    expect(loud / wins).toBeLessThan(0.45);
  });

  it('makes a short outdoor space, not a room', () => {
    const [l, r] = outdoorImpulse(48000);
    expect(l.length).toBe(r.length);
    expect(l.length / 48000).toBeLessThan(1);
    expect(l.every(Number.isFinite) && r.every(Number.isFinite)).toBe(true);
    // The tail is gone well before the end.
    const last = l.slice(Math.floor(l.length * 0.9));
    expect(peakOf(last)).toBeLessThan(0.01);
  });

  it('crossfades a loop seam', () => {
    const ramp = loopable((len) => Float32Array.from({ length: len }, (_, i) => i / len), 1, 0.25);
    expect(ramp.length).toBe(RENDER_RATE);
  });
});
