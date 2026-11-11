import { LAMP_COLORS } from '@qoti/art';
import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { flameColor } from './material';

describe('lamp flames by era (V2A)', () => {
  it('keeps the Old Age candle the glow it always was', () => {
    expect(flameColor('old').toArray()).toEqual([1, 0.7, 0.36]);
  });

  it('burns gas a greener gold and electric a paler warm white', () => {
    const old = flameColor('old');
    const gas = flameColor('steam');
    const electric = flameColor('bright');
    // Greener: more green against red than the candle, still gold (blue well below both).
    expect(gas.g / gas.r).toBeGreaterThan(old.g / old.r);
    expect(gas.b).toBeLessThan(gas.g * 0.5);
    // Paler: the smallest channel closer to the largest than the candle's, and still warm.
    expect(electric.b).toBeGreaterThan(old.b);
    expect(electric.r).toBeGreaterThanOrEqual(electric.b);
    for (const c of [gas, electric]) expect(Math.max(c.r, c.g, c.b)).toBeCloseTo(1);
  });

  it('reads the era table appended to the palette', () => {
    const linear = new Color().setHex(LAMP_COLORS.steam);
    const k = 1 / Math.max(linear.r, linear.g, linear.b);
    expect(flameColor('steam').r).toBeCloseTo(linear.r * k);
  });
});
