// The start places its buildings through canPlaceBuilding, so the site rules apply to it too: on
// every seed the bench and tests use, the starting buildings still find a spot (the storehouse
// and granary with a road at the door).
import { describe, expect, it } from 'vitest';
import { createValley, defaultSettings } from '../../src/state/create';

describe('the start under the site rules', () => {
  for (const seed of ['willow', 'hazel', 'oak', 'kat-1', 'meadow', 'test']) {
    it(`${seed}: the starting buildings are all placed`, () => {
      const s = createValley(seed, { ...defaultSettings(), mode: 'standard' });
      for (const id of ['town-hall', 'storehouse', 'granary', 'well']) {
        expect(
          s.buildings.some((b) => b.def === id),
          `${id} on ${seed}`,
        ).toBe(true);
      }
      expect(s.buildings.filter((b) => b.def === 'cottage').length).toBe(2);
    });
  }
});
