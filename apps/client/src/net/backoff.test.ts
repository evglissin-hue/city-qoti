import { describe, expect, it } from 'vitest';
import { BACKOFF_MAX_MS, backoffMs } from './backoff';

describe('backoffMs', () => {
  it('doubles from half a second and caps at 30 s', () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3].map((a) => backoffMs(a, mid))).toEqual([500, 1000, 2000, 4000]);
    expect(backoffMs(10, mid)).toBe(BACKOFF_MAX_MS);
    expect(backoffMs(1000, mid)).toBe(BACKOFF_MAX_MS);
  });

  it('jitters within 25 percent either way', () => {
    expect(backoffMs(2, () => 0)).toBe(1500);
    expect(backoffMs(2, () => 1)).toBe(2500);
  });
});
