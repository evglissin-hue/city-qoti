import { describe, expect, it } from 'vitest';
import { CLOSE_UP_OFF, CLOSE_UP_ON, closeUpNow, pixelRatios, QUALITY_PRESETS } from './quality';

describe('P2-F: close-ups stay sharp in motion', () => {
  const { low, medium, high, ultra } = QUALITY_PRESETS;

  it('aims halfway between the moving and still ratios when close', () => {
    expect(pixelRatios(medium, 2, undefined, true)).toEqual({ moving: 1.5, still: 2 });
    expect(pixelRatios(high, 2, undefined, true)).toEqual({ moving: 1.75, still: 2 });
    expect(pixelRatios(ultra, 2, undefined, true)).toEqual({ moving: 2, still: 2 });
  });

  it('leaves Low and ordinary distances as they were', () => {
    expect(pixelRatios(low, 2, undefined, true)).toEqual(pixelRatios(low, 2));
    expect(pixelRatios(medium, 2, undefined, false)).toEqual({ moving: 1, still: 2 });
    expect(pixelRatios(medium, 2)).toEqual({ moving: 1, still: 2 });
  });

  it('is capped by the device pixel ratio', () => {
    expect(pixelRatios(medium, 1, undefined, true)).toEqual({ moving: 1, still: 1 });
    expect(pixelRatios(medium, 1.25, undefined, true)).toEqual({ moving: 1.125, still: 1.25 });
    expect(pixelRatios(ultra, 3, undefined, true).moving).toBeLessThanOrEqual(3);
  });

  it('never exceeds the still ratio, with or without a debug cap', () => {
    for (const p of [low, medium, high, ultra])
      for (const dpr of [1, 1.5, 2, 3]) {
        const r = pixelRatios(p, dpr, undefined, true);
        expect(r.moving).toBeLessThanOrEqual(r.still);
        expect(r.moving).toBeLessThanOrEqual(dpr);
      }
    expect(pixelRatios(medium, 2, 2, true)).toEqual({ moving: 2, still: 2 });
  });

  it('switches on under 20 tiles and off past 24, with no flapping between', () => {
    expect(closeUpNow(false, CLOSE_UP_ON - 0.1, false)).toBe(true);
    expect(closeUpNow(false, CLOSE_UP_ON, false)).toBe(false);
    expect(closeUpNow(false, 22, false)).toBe(false);
    expect(closeUpNow(true, 22, false)).toBe(true);
    expect(closeUpNow(true, CLOSE_UP_OFF, false)).toBe(true);
    expect(closeUpNow(true, CLOSE_UP_OFF + 0.1, false)).toBe(false);
  });

  it('is always on while following a resident', () => {
    expect(closeUpNow(false, 60, true)).toBe(true);
    expect(closeUpNow(true, 60, true)).toBe(true);
  });
});
