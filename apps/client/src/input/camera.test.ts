import { describe, expect, it } from 'vitest';
import { smoothDamp } from './camera';

describe('camera smoothing', () => {
  it('glides to the target without overshoot, at any frame rate', () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
      const vel = { v: 0 };
      let x = 0;
      let max = 0;
      for (let t = 0; t < 2; t += dt) {
        x = smoothDamp(x, 10, vel, 0.16, dt);
        max = Math.max(max, x);
      }
      expect(max).toBeLessThanOrEqual(10.0001);
      expect(x).toBeCloseTo(10, 3);
    }
  });
});
