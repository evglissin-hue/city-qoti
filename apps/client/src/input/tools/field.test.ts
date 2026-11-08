import { describe, expect, it } from 'vitest';
import { fieldReach } from './field';

describe('field tool', () => {
  it('reaches six tiles around a farmhouse footprint', () => {
    const reach = fieldReach({
      id: 1,
      def: 'farmhouse',
      x: 20,
      z: 30,
      rot: 0,
      builtBy: 0,
      handmade: false,
      stage: 'built',
      foundation: false,
    });
    expect(reach.contains(14, 24)).toBe(true);
    expect(reach.contains(27, 37)).toBe(true);
    expect(reach.contains(13, 30)).toBe(false);
    expect(reach.contains(28, 30)).toBe(false);
    expect(reach.tiles).toHaveLength(14 * 14);
  });
});
