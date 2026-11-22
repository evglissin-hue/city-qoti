import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, Vector3 } from 'three';
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
  METER_STALE_MS,
  PHOTO_SAMPLES,
  PIXEL_SPREAD,
  refineGoal,
  refineJitter,
  refineOffFromUrl,
  SAMPLE_BUDGET_MS,
  SampleMeter,
  sampleProjection,
  SKY_EVERY,
  SLOW_MOVING_MS,
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

describe('V4.0: the refinement contracts', () => {
  it('takes the preset sample counts of 17-presentation.md (tune)', () => {
    expect(QUALITY_PRESETS.low.refineSamples).toBe(0);
    expect(QUALITY_PRESETS.medium.refineSamples).toBe(8);
    expect(QUALITY_PRESETS.high.refineSamples).toBe(16);
    expect(QUALITY_PRESETS.ultra.refineSamples).toBe(32);
    expect(PHOTO_SAMPLES).toBe(64);
  });

  it('develops nothing while the goal is 0: refine adds no sample', () => {
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

/** A rest on a laptop with room to spare (the governor's input). */
function roomy(o: Partial<RefineGovernorInput> = {}): RefineGovernorInput {
  return {
    quality: 'high',
    presetSamples: QUALITY_PRESETS.high.refineSamples,
    movingFrameMs: 16.7,
    resolutionStep: 0,
    gpuMs: 6,
    sampleGpuMs: 8,
    photo: false,
    off: false,
    ...o,
  };
}

describe('V4A: the governor', () => {
  it("develops to the preset's own samples when there is room", () => {
    for (const q of ['medium', 'high', 'ultra'] as const)
      expect(refineGoal(roomy({ quality: q, presetSamples: QUALITY_PRESETS[q].refineSamples }))).toBe(
        QUALITY_PRESETS[q].refineSamples,
      );
    // Before any frame was judged or timed there is nothing to say no with.
    expect(refineGoal(roomy({ movingFrameMs: null, gpuMs: null, sampleGpuMs: null }))).toBe(16);
  });

  it('develops nothing on Low, which has no still-frame cache, not even for a photo', () => {
    expect(refineGoal(roomy({ quality: 'low', presetSamples: 0 }))).toBe(0);
    expect(refineGoal(roomy({ quality: 'low', presetSamples: 0, photo: true }))).toBe(0);
  });

  it('develops nothing with ?debug&refine=0, not even for a photo', () => {
    expect(refineGoal(roomy({ off: true }))).toBe(0);
    expect(refineGoal(roomy({ off: true, photo: true }))).toBe(0);
  });

  it('develops nothing while moving frames already run slow or at a lower resolution', () => {
    expect(refineGoal(roomy({ movingFrameMs: SLOW_MOVING_MS + 0.5 }))).toBe(0);
    expect(refineGoal(roomy({ movingFrameMs: SLOW_MOVING_MS }))).toBe(16);
    expect(refineGoal(roomy({ resolutionStep: 1 }))).toBe(0);
  });

  it("develops nothing when a sample frame would not fit its budget, measured or, before that, guessed from the frames'", () => {
    expect(refineGoal(roomy({ sampleGpuMs: SAMPLE_BUDGET_MS + 1 }))).toBe(0);
    expect(refineGoal(roomy({ sampleGpuMs: SAMPLE_BUDGET_MS }))).toBe(16);
    // The measure wins over the frames' average once there is one.
    expect(refineGoal(roomy({ sampleGpuMs: 9, gpuMs: 20 }))).toBe(16);
    expect(refineGoal(roomy({ sampleGpuMs: null, gpuMs: 20 }))).toBe(0);
  });

  it('develops a photo to PHOTO_SAMPLES on every preset with the cache, however slow the frames', () => {
    for (const q of ['medium', 'high', 'ultra'] as const)
      expect(
        refineGoal(
          roomy({
            quality: q,
            photo: true,
            movingFrameMs: 40,
            resolutionStep: 3,
            sampleGpuMs: 30,
            gpuMs: 30,
          }),
        ),
      ).toBe(PHOTO_SAMPLES);
  });

  it("falls back to Medium's plain still frame on a laptop where Medium's sample frames do not fit", () => {
    // Kat's laptop on Medium: the measured sample frames say no, so the still frame stays plain.
    expect(refineGoal(roomy({ quality: 'medium', presetSamples: 8, sampleGpuMs: 14 }))).toBe(0);
    // And if the laptops' tables cut Medium's count to 0, Medium keeps today's still frame anywhere.
    expect(refineGoal(roomy({ quality: 'medium', presetSamples: 0 }))).toBe(0);
    expect(refineGoal(roomy({ quality: 'medium', presetSamples: 0, photo: true }))).toBe(PHOTO_SAMPLES);
  });
});

describe('V4A: the meter of sample frames', () => {
  it('counts only the results that arrive once a few sample frames have drawn', () => {
    const m = new SampleMeter();
    const history: number[] = [];
    let total = 0;
    const arrive = (ms: number) => {
      history.push(ms);
      total++;
    };
    m.start(total);
    // The first results to arrive may be the frames before the development's.
    arrive(30);
    m.sample(total, history, 0, 'high');
    arrive(30);
    m.sample(total, history, 16, 'high');
    m.sample(total, history, 33, 'high');
    expect(m.read(33, 'high')).toBe(null);
    arrive(10);
    m.sample(total, history, 50, 'high');
    expect(m.read(50, 'high')).toBe(10);
    arrive(14);
    m.sample(total, history, 66, 'high');
    expect(m.read(66, 'high')).toBeCloseTo(11, 9);
  });

  it('is kept per preset and forgotten once stale', () => {
    const m = new SampleMeter();
    const history = [9, 9, 9, 9, 9];
    m.start(0);
    for (let i = 1; i <= 5; i++) m.sample(i, history, i, 'medium');
    expect(m.read(10, 'medium')).toBe(9);
    expect(m.read(10, 'high')).toBe(null);
    expect(m.read(10 + METER_STALE_MS + 1, 'medium')).toBe(null);
    // A new preset starts over.
    m.start(5);
    m.sample(6, [...history, 20], 20, 'high');
    expect(m.read(20, 'medium')).toBe(null);
  });
});

describe("V4A: a sample's camera", () => {
  /** Where a camera-space point lands in normalized device coordinates. */
  function ndc(cam: PerspectiveCamera, p: Vector3): [number, number] {
    const v = p.clone().applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
    return [v.x, v.y];
  }

  it('moves the picture by the pixel offset and keeps the focus plane where it was through the lens', () => {
    const cam = new PerspectiveCamera(40, 1.6, 0.5, 2000);
    cam.position.set(10, 30, 40);
    cam.lookAt(10, 0, 0);
    cam.updateMatrixWorld();
    const focus = cam.position.distanceTo(new Vector3(10, 0, 0));
    const onFocus = new Vector3(13, 0, 1);
    const near = new Vector3(10, 10, 25);
    const before = { focus: ndc(cam, onFocus), near: ndc(cam, near) };
    const pm = cam.projectionMatrix.elements;
    const jitter = { ...refineJitter(5), pixel: [0.25, -0.5] as [number, number] };
    const w = 800;
    const h = 500;
    // The pixel alone moves everything by a quarter and half a pixel (times the spread).
    const pix = sampleProjection({ ...jitter, lens: [0, 0] }, w, h, 2, focus, pm[0]!, pm[5]!);
    expect(pix.eye).toEqual([0, 0]);
    expect(pix.shift[0]).toBeCloseTo((2 * 0.25 * PIXEL_SPREAD) / w, 12);
    expect(pix.shift[1]).toBeCloseTo((2 * -0.5 * PIXEL_SPREAD) / h, 12);
    // The lens alone: the eye moves, the focus plane stays put, nearer things move.
    const lens = sampleProjection(
      { ...jitter, pixel: [0, 0], lens: [0.6, -0.8] },
      w,
      h,
      2,
      focus,
      pm[0]!,
      pm[5]!,
    );
    expect(lens.eye[0]).toBeCloseTo(1.2, 12);
    expect(lens.eye[1]).toBeCloseTo(-1.6, 12);
    const moved = cam.clone();
    moved.translateX(lens.eye[0]);
    moved.translateY(lens.eye[1]);
    moved.updateMatrixWorld();
    moved.projectionMatrix.elements[8]! += lens.shift[0];
    moved.projectionMatrix.elements[9]! += lens.shift[1];
    // A point on the plane at the focus distance along the view axis (the ground point straight ahead).
    const ahead = new Vector3(10, 0, 0);
    const a0 = ndc(cam, ahead);
    const a1 = ndc(moved, ahead);
    expect(a1[0]).toBeCloseTo(a0[0], 9);
    expect(a1[1]).toBeCloseTo(a0[1], 9);
    // Something well off the focus plane moves (that is the blur).
    const n1 = ndc(moved, near);
    expect(Math.hypot(n1[0] - before.near[0], n1[1] - before.near[1])).toBeGreaterThan(0.01);
    void before.focus;
  });
});
