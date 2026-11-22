// R3H: the hands a specialized building's level adds rank behind food work (residents/jobs.ts,
// slotPriority), so a bigger crew never takes a hand a farm or a fishery wants. The level 1 crew
// keeps the ranks it had; a Fishery's added hands are food work and rank as such.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { slotPriority } from '../../src/systems/residents/jobs';

const def = (id: string) => content.buildingById.get(id)!;
const timberShort = { food: false, goods: new Set(['timber']) };
const foodShort = { food: true, goods: new Set<string>() };

describe('R3H: the hands a level adds', () => {
  it('a Lodge keeps its level 1 ranks and ranks its added hands behind food, timber short or not', () => {
    const lodge = def('foresters-lodge');
    const first = lodge.levels!.crew![0]!;
    expect(slotPriority(lodge, first - 1, timberShort)).toBeLessThan(2);
    expect(slotPriority(lodge, first, timberShort)).toBe(3);
    expect(slotPriority(lodge, first + 1)).toBe(3);
    // Food work when food is plain (2) and when it is short (lower) both come first.
    const farm = def('fishery');
    expect(slotPriority(farm, 1)).toBeLessThan(slotPriority(lodge, first, timberShort));
  });

  it("a Fishery's added hands are food work and rank as food", () => {
    const fishery = def('fishery');
    const first = fishery.levels!.crew![0]!;
    expect(slotPriority(fishery, first, foodShort)).toBe(slotPriority(fishery, first - 1, foodShort));
  });

  it("a Stall's second vendor and a store's added porter wait behind food", () => {
    expect(slotPriority(def('market-stall'), 0)).toBe(1);
    expect(slotPriority(def('market-stall'), 1)).toBe(3);
    const granary = def('granary');
    expect(slotPriority(granary, granary.levels!.crew![0]!)).toBe(4);
    const store = def('storehouse');
    expect(slotPriority(store, store.levels!.crew![0]!, { ...timberShort, haul: true })).toBe(3);
  });
});
