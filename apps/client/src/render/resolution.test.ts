import { describe, expect, it } from 'vitest';
import { DynamicResolution, RESOLUTION_STEPS } from './resolution';

function run(r: DynamicResolution, frames: number, ms: number, start: number, base = 2): number {
  let t = start;
  for (let i = 0; i < frames; i++) {
    t += ms;
    r.frame(t, true, base);
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
});
