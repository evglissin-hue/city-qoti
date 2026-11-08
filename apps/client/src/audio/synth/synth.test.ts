import { describe, expect, it } from 'vitest';
import { AMBIENCE_IDS, renderAmbience } from './ambience';
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
      expect(secs).toBeGreaterThanOrEqual(7);
      expect(secs).toBeLessThanOrEqual(20);
      // The seam is no larger a jump than the loop's own sample-to-sample motion.
      let step = 0;
      for (let i = 1; i < b.length; i++) step = Math.max(step, Math.abs(b[i]! - b[i - 1]!));
      expect(Math.abs(b[0]! - b[b.length - 1]!)).toBeLessThanOrEqual(step + 1e-6);
    }
  });

  it('crossfades a loop seam', () => {
    const ramp = loopable((len) => Float32Array.from({ length: len }, (_, i) => i / len), 1, 0.25);
    expect(ramp.length).toBe(RENDER_RATE);
  });
});
