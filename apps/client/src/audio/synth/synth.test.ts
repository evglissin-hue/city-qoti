import { describe, expect, it } from 'vitest';
import { AMBIENCE_IDS, renderAmbience } from './ambience';
import { CUE_IDS, renderCue } from './cues';
import { RENDER_RATE, loopable } from './dsp';
import { renderNote, type Instrument } from './instruments';
import { CUE_GAP } from '../cues/limiter';

function check(buf: Float32Array): number {
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
  expect(energy / buf.length).toBeGreaterThan(1e-5);
  return peak;
}

describe('synthesized sounds', () => {
  it('renders every instrument across its range, clean and in bounds', () => {
    const insts: Instrument[] = ['guitar', 'piano', 'bass', 'brush', 'bell', 'pad'];
    for (const inst of insts) for (const midi of [38, 52, 64, 76, 84]) check(renderNote(inst, midi));
  });

  it('renders every cue, short enough to stay a cue', () => {
    for (const id of CUE_IDS) {
      const b = renderCue(id);
      check(b);
      expect(b.length / RENDER_RATE).toBeLessThan(5);
    }
    // Every cue has a rate limit.
    expect(Object.keys(CUE_GAP).sort()).toEqual([...CUE_IDS].sort());
  });

  it('renders every ambience loop loop-clean', () => {
    for (const id of AMBIENCE_IDS) {
      const b = renderAmbience(id);
      check(b);
      const secs = b.length / RENDER_RATE;
      expect(secs).toBeGreaterThanOrEqual(7);
      expect(secs).toBeLessThanOrEqual(16);
      // The seam is no louder a jump than the loop's own sample-to-sample motion.
      let step = 0;
      for (let i = 1; i < b.length; i++) step = Math.max(step, Math.abs(b[i]! - b[i - 1]!));
      expect(Math.abs(b[0]! - b[b.length - 1]!)).toBeLessThanOrEqual(step + 1e-6);
    }
  });

  it('crossfades a loop seam', () => {
    const ramp = loopable((len) => Float32Array.from({ length: len }, (_, i) => i / len), 1, 0.25);
    expect(ramp.length).toBe(RENDER_RATE);
    // The head carries on from the tail, one sample later.
    expect(ramp[0]! - ramp[ramp.length - 1]!).toBeCloseTo(1 / (RENDER_RATE * 1.25), 4);
  });
});
