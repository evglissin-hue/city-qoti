import { describe, expect, it } from 'vitest';
import { DynamicResolution, FAIL_MS, RESOLUTION_STEPS, UP_WAIT_MS } from './resolution';

function run(
  r: DynamicResolution,
  frames: number,
  ms: number,
  start: number,
  base = 2,
  moving = true,
): number {
  let t = start;
  for (let i = 0; i < frames; i++) {
    t += ms;
    r.frame(t, true, base, moving);
  }
  return t;
}

describe('dynamic resolution', () => {
  it('stays at full resolution while frames are quick', () => {
    const r = new DynamicResolution();
    run(r, 600, 8, 0);
    expect(r.scale).toBe(1);
  });

  it('steps down when frames are slow, and back up once they are quick again', () => {
    const r = new DynamicResolution();
    let t = run(r, 31, 33, 0);
    expect(r.scale).toBe(RESOLUTION_STEPS[1]);
    t = run(r, 90, 33, t);
    expect(r.scale).toBeLessThan(RESOLUTION_STEPS[1]);
    const low = r.scale;
    t = run(r, 100, 10, t);
    expect(r.scale).toBe(low);
    run(r, 200, 10, t);
    expect(r.scale).toBeGreaterThan(low);
  });

  it('ignores idle stretches and long gaps', () => {
    const r = new DynamicResolution();
    let t = 0;
    for (let i = 0; i < 100; i++) {
      t += 1500;
      r.frame(t, true, 2);
    }
    for (let i = 0; i < 100; i++) {
      t += 40;
      r.frame(t, i % 2 === 0, 2);
    }
    expect(r.scale).toBe(1);
  });

  it('judges moving frames only (V1D): slow idle and still frames change nothing', () => {
    const r = new DynamicResolution();
    run(r, 300, 50, 0, 2, false);
    expect(r.scale).toBe(1);
  });

  it('steps down on a very slow machine too (a few frames a second)', () => {
    const r = new DynamicResolution();
    run(r, 31, 300, 0);
    expect(r.scale).toBeLessThan(1);
  });

  it('can be switched off', () => {
    const r = new DynamicResolution();
    r.enabled = false;
    run(r, 200, 50, 0);
    expect(r.scale).toBe(1);
  });

  it('never drops the pixel ratio below the floor', () => {
    const r = new DynamicResolution();
    run(r, 2000, 50, 0, 1);
    expect(r.scale).toBeGreaterThanOrEqual(0.6);
    expect(r.scale).toBeLessThan(1);
  });

  it('waits twice as long after a step-up that failed, and starts over on reset (V1D)', () => {
    const r = new DynamicResolution();
    let t = run(r, 31, 30, 0);
    expect(r.scale).toBe(RESOLUTION_STEPS[1]);
    // Quick frames for the first wait: it steps back up.
    t = run(r, Math.ceil(UP_WAIT_MS / 10) + 30, 10, t);
    expect(r.scale).toBe(1);
    expect(r.wait).toBe(UP_WAIT_MS);
    // Slow again right away (well within FAIL_MS of moving time): the step-up failed.
    t = run(r, 30, 30, t);
    expect(30 * 30).toBeLessThan(FAIL_MS);
    expect(r.scale).toBe(RESOLUTION_STEPS[1]);
    expect(r.wait).toBe(UP_WAIT_MS * 2);
    // The old wait is no longer enough...
    t = run(r, Math.ceil(UP_WAIT_MS / 10) + 30, 10, t);
    expect(r.scale).toBe(RESOLUTION_STEPS[1]);
    // ...the doubled one is.
    run(r, Math.ceil(UP_WAIT_MS / 10) + 30, 10, t);
    expect(r.scale).toBe(1);
    r.reset();
    expect(r.wait).toBe(UP_WAIT_MS);
    expect(r.scale).toBe(1);
  });

  it('keeps the wait when a step-up holds for a while before frames slow down', () => {
    const r = new DynamicResolution();
    let t = run(r, 31, 30, 0);
    t = run(r, Math.ceil(UP_WAIT_MS / 10) + 30, 10, t);
    expect(r.scale).toBe(1);
    // Well past FAIL_MS of quick moving frames, then slow: that is the scene, not the step-up.
    t = run(r, Math.ceil((FAIL_MS * 2) / 10), 10, t);
    run(r, 30, 30, t);
    expect(r.scale).toBe(RESOLUTION_STEPS[1]);
    expect(r.wait).toBe(UP_WAIT_MS);
  });
});
