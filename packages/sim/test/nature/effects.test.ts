// C5C: nature's effects through the yield hook beside C5A's registrations: pollinators lift crop
// growers up to POLLINATOR_BONUS and set the apiary's honey; summer pests take up to PEST_MAX, cut by
// songbirds and frogs found and at home near the farm. Numbers come from the module's constants.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { pollinatorFactor } from '../../src/systems/habitats/api';
import {
  HIVE_FLOOR,
  PEST_MAX,
  POLLINATOR_BONUS,
  POLLINATOR_FULL,
  updatePests,
} from '../../src/systems/nature/effects';
import { yieldPermille } from '../../src/systems/production/modifiers';
import { ticks, toWork } from '../ledger/helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { tickAt } from '../fixtures/seasonsPlace';
import { EMPTY_CHUNK, EX, EZ, natureFixture, setHabitats } from '../fixtures/nature';
import { place, staff } from '../village/helpers';

function yieldOf(s: WorldState, b: Building): number {
  const def = content.buildingById.get(b.def)!;
  return yieldPermille(s, b, def, def.methods![b.rt!.method]!);
}

describe('pollinators', () => {
  it('lift a farm by up to the bonus, alongside the weather', () => {
    const s = natureFixture().state;
    s.weather.today = 'rain';
    const farm = place(s, 'farmhouse', EX + 4, EZ + 4);
    const plain = yieldOf(s, farm);
    expect(plain).toBeGreaterThan(1000); // C5A: rain on the fields
    setHabitats(s, EMPTY_CHUNK, { pollinator: POLLINATOR_FULL / 2 });
    expect(pollinatorFactor(s, farm.id)).toBe(1000 + POLLINATOR_BONUS / 2);
    setHabitats(s, EMPTY_CHUNK, { pollinator: 255 });
    expect(pollinatorFactor(s, farm.id)).toBe(1000 + POLLINATOR_BONUS);
    expect(yieldOf(s, farm)).toBe(Math.floor((plain * (1000 + POLLINATOR_BONUS)) / 1000));
  });

  it('leave workshops alone', () => {
    const s = natureFixture().state;
    const smithy = place(s, 'smithy', EX + 4, EZ + 4);
    setHabitats(s, EMPTY_CHUNK, { pollinator: 255 });
    expect(pollinatorFactor(s, smithy.id)).toBe(1000);
  });

  it("set the apiary's honey: a quarter with no flowers, all of it with plenty", () => {
    const made = (score: number) => {
      const s = natureFixture().state;
      s.tick = tickAt(0, 1, 2, 9);
      const b = place(s, 'apiary', EX + 4, EZ + 4);
      setHabitats(s, EMPTY_CHUNK, { pollinator: score });
      toWork(s, staff(s, b, 1));
      const before = moneySnapshot(s);
      const m = content.buildingById.get('apiary')!.methods![0]!;
      ticks(s, 2 * m.hours * TICKS_PER_HOUR);
      expectMoneyInvariant(before, s);
      return (
        b.rt!.output[content.goodIndex.get('honey')!]! +
        s.economy.today.produced[content.goodIndex.get('honey')!]!
      );
    };
    expect(pollinatorFactor(natureFixture().state, 0)).toBe(1000);
    const none = made(0);
    const full = made(POLLINATOR_FULL);
    expect(full).toBeGreaterThan(0);
    expect(none).toBeLessThan(full);
    expect(none).toBeLessThanOrEqual(Math.ceil((full * HIVE_FLOOR) / 1000) + 2);
  });
});

describe('pests', () => {
  it('take up to PEST_MAX of crops in summer, cut by songbirds and frogs found nearby', () => {
    const s = natureFixture().state;
    const farm = place(s, 'farmhouse', EX + 4, EZ + 4);
    const orchard = place(s, 'orchard', EX + 9, EZ + 4);
    updatePests(s);
    expect(s.nature.pests.find(([id]) => id === farm.id)?.[1]).toBe(PEST_MAX);
    expect(s.nature.pests.find(([id]) => id === orchard.id)?.[1]).toBe(PEST_MAX);
    const before = yieldOf(s, farm);
    // A wren in the Field Guide, and a hedgerow it likes by the farm.
    const wren = content.wildlifeById.get('wren')!;
    s.nature.guide.push({ species: 'wren', firstTick: 0, seats: [0], count: 1 });
    updatePests(s);
    expect(s.nature.pests.find(([id]) => id === farm.id)?.[1]).toBe(PEST_MAX);
    setHabitats(s, EMPTY_CHUNK, Object.fromEntries(wren.habitats));
    updatePests(s);
    const cut = wren.effect!.find(([n]) => n === 'pests')![1];
    const loss = Math.floor((PEST_MAX * (1000 - cut)) / 1000);
    expect(s.nature.pests.find(([id]) => id === farm.id)?.[1]).toBe(loss);
    expect(yieldOf(s, farm)).toBeGreaterThan(before);
  });

  it('are gone outside summer', () => {
    const s = natureFixture().state;
    place(s, 'farmhouse', EX + 4, EZ + 4);
    s.tick = tickAt(0, 2, 1, 10);
    updatePests(s);
    expect(s.nature.pests).toEqual([]);
  });

  it('pass by animals and workshops', () => {
    const s = natureFixture().state;
    const dairy = place(s, 'dairy', EX + 4, EZ + 4);
    updatePests(s);
    expect(s.nature.pests.some(([id]) => id === dairy.id)).toBe(false);
  });
});
