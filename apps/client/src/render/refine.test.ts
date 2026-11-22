import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import {
  restartsDevelopment,
  StillCache,
  stillChange,
  stillKeyOf,
  type RefineContext,
  type StillKeyParts,
} from './cache';
import { QUALITY_PRESETS } from './quality';
import {
  halton,
  PHOTO_SAMPLES,
  refineGoal,
  refineJitter,
  refineOffFromUrl,
  SKY_EVERY,
  toDisc,
  type RefineGovernorInput,
} from './refine';
import { DynamicResolution } from './resolution';

const parts: StillKeyParts = {
  targets: 1,
  quality: 'medium',
  view: 3,
  content: 4,
  light: 5,
  shadows: 6,
  lamps: 7,
};

describe('V4.0: the still frame says what changed', () => {
  it('keeps the key string V1D made', () => {
    expect(stillKeyOf(parts)).toBe('1|medium|3|4|5|6|7');
  });

  it('names the biggest change, and restarts only for the view, the targets or the first', () => {
    expect(stillChange(null, parts)).toBe('first');
    expect(stillChange(parts, parts)).toBe(null);
    expect(stillChange(parts, { ...parts, quality: 'high' })).toBe('targets');
    expect(stillChange(parts, { ...parts, view: 9, light: 9 })).toBe('view');
    expect(stillChange(parts, { ...parts, content: 9, lamps: 9 })).toBe('content');
    expect(stillChange(parts, { ...parts, light: 9, shadows: 9 })).toBe('light');
    // The lamplighter's lamps: one light map change a tick, never a restart.
    expect(stillChange(parts, { ...parts, lamps: 8 })).toBe('lamps');
    expect(stillChange(parts, { ...parts, shadows: 8 })).toBe('shadows');
    for (const c of ['first', 'targets', 'view'] as const) expect(restartsDevelopment(c)).toBe(true);
    for (const c of ['content', 'light', 'lamps', 'shadows'] as const)
      expect(restartsDevelopment(c)).toBe(false);
  });
});

describe('V4.0: the refinement stubs change nothing', () => {
  it('takes the preset sample counts of 17-presentation.md (tune)', () => {
    expect(QUALITY_PRESETS.low.refineSamples).toBe(0);
    expect(QUALITY_PRESETS.medium.refineSamples).toBe(8);
    expect(QUALITY_PRESETS.high.refineSamples).toBe(16);
    expect(QUALITY_PRESETS.ultra.refineSamples).toBe(32);
    expect(PHOTO_SAMPLES).toBe(64);
  });

  it('develops nothing: the goal is 0 and refine adds no sample', () => {
    const input: RefineGovernorInput = {
      quality: 'ultra',
      presetSamples: 32,
      movingFrameMs: 8,
      resolutionStep: 0,
      gpuMs: 3,
      sampleGpuMs: 2,
      photo: true,
      off: false,
    };
    expect(refineGoal(input)).toBe(0);
    const c = new StillCache(new Scene(), new PerspectiveCamera());
    c.enabled = true;
    expect(c.samples).toBe(0);
    expect(c.goal).toBe(0);
    expect(c.developing('k')).toBe(false);
    const ctx = { draw: () => expect.unreachable() } as unknown as RefineContext;
    expect(c.refine(4, ctx)).toBe(0);
    expect(c.samples).toBe(0);
    c.dispose();
  });

  it('reads ?debug&refine=0 only in a debug valley', () => {
    expect(refineOffFromUrl('?debug&refine=0')).toBe(true);
    expect(refineOffFromUrl('?refine=0')).toBe(false);
    expect(refineOffFromUrl('?debug&refine=1')).toBe(false);
  });

  it('gives the governor the moving frames of the last window, and forgets them on a reset', () => {
    const r = new DynamicResolution();
    expect(r.movingMs).toBe(null);
    expect(r.stepIndex).toBe(0);
    let t = 0;
    for (let i = 0; i <= 30; i++) r.frame((t += 10), true, 2, true);
    expect(r.movingMs).toBeCloseTo(10, 6);
    r.reset();
    expect(r.movingMs).toBe(null);
  });
});

describe('V4.0: the jitter sequence', () => {
  it('runs the radical inverse', () => {
    expect(halton(0, 2)).toBe(0);
    expect(halton(1, 2)).toBe(0.5);
    expect(halton(2, 2)).toBe(0.25);
    expect(halton(3, 2)).toBe(0.75);
    expect(halton(1, 3)).toBeCloseTo(1 / 3, 12);
  });

  it('maps the unit square into the unit disc', () => {
    for (let i = 0; i < 200; i++) {
      const [x, y] = toDisc(halton(i, 2), halton(i, 3));
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(toDisc(0.5, 0.5)).toEqual([0, 0]);
  });

  it('leaves sample 0 plain, keeps every offset in range, and lights one in four from the sky', () => {
    expect(refineJitter(0)).toEqual({ index: 0, pixel: [0, 0], sun: [0, 0], lens: [0, 0], sky: null });
    let skies = 0;
    for (let i = 1; i <= PHOTO_SAMPLES; i++) {
      const j = refineJitter(i);
      for (const p of j.pixel) expect(Math.abs(p)).toBeLessThanOrEqual(0.5);
      expect(Math.hypot(...j.sun)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.hypot(...j.lens)).toBeLessThanOrEqual(1 + 1e-9);
      if (j.sky) {
        skies++;
        expect(Math.hypot(...j.sky)).toBeCloseTo(1, 9);
        expect(j.sky[1]).toBeGreaterThanOrEqual(0);
      }
      expect(j.sky !== null).toBe(i % SKY_EVERY === 0);
    }
    expect(skies).toBe(PHOTO_SAMPLES / SKY_EVERY);
  });

  it('spreads the first eight pixel offsets over all four quadrants', () => {
    const quads = new Set<string>();
    for (let i = 1; i <= 8; i++) {
      const [x, y] = refineJitter(i).pixel;
      quads.add(`${x < 0}|${y < 0}`);
    }
    expect(quads.size).toBe(4);
  });
});
