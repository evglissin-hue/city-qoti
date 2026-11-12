import type { BuildingView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { fieldReach, isGrainFarm } from './field';

const farmstead = (trade?: string): BuildingView => ({
  id: 1,
  def: 'farmstead',
  x: 20,
  z: 30,
  rot: 0,
  builtBy: 0,
  handmade: false,
  stage: 'built',
  foundation: false,
  ...(trade && { trade }),
});

describe('field tool', () => {
  it("reaches six tiles around a grain farm's footprint", () => {
    const reach = fieldReach(farmstead('grain-farm'));
    expect(reach.contains(14, 24)).toBe(true);
    expect(reach.contains(28, 38)).toBe(true);
    expect(reach.contains(13, 30)).toBe(false);
    expect(reach.contains(29, 30)).toBe(false);
    expect(reach.tiles).toHaveLength(15 * 15);
  });

  it('sows only for grain farms, not every farmstead', () => {
    expect(isGrainFarm(farmstead('grain-farm'))).toBe(true);
    expect(isGrainFarm(farmstead('orchard'))).toBe(false);
    expect(isGrainFarm(farmstead())).toBe(false);
    expect(isGrainFarm({ def: 'cottage' })).toBe(false);
  });
});
