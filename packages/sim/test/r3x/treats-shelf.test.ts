// R3X: a market outlet keeps room for its Treats. Measured on the tuned autoplayer (willow, day 100):
// shops ended the afternoon full of food and Wares with 3 Treats, so the round's stops there went bare.
// Food and Wares restock now stops short of `PLACES.treatsRoom` units of storage while the Treats the
// outlet holds are fewer, so every outlet def that takes Treats ends the afternoon with one on its shelf
// when the stores hold Treats, whatever food and Wares the stores hold.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/constants';
import { insertBuilding } from '../../src/state/place';
import { treatsReserve } from '../../src/systems/logistics';
import { takes } from '../../src/systems/logistics/stores';
import { treatsOnShelf, TREATS } from '../../src/systems/market/round';
import { hamletFixture } from '../fixtures/hamlet';
import { building, everyoneToWork, good, untilHour } from '../ledger/helpers';

const defs = content.buildings.filter(
  (d) => d.tags?.includes('outlet') && d.tags.includes('market') && TREATS.some((g) => takes(d, g)),
);

describe('a market outlet keeps room for its Treats', () => {
  it('the defs that take Treats are the stall, the Square and the shop', () => {
    expect(defs.map((d) => d.id).sort()).toEqual(['corner-shop', 'market-square', 'market-stall']);
  });

  for (const def of defs) {
    it(`${def.id} has a Treat on its shelf at 16:00 with the stores full of food and Wares`, () => {
      const f = hamletFixture();
      const s = f.state;
      const outlet = insertBuilding(s, null, def, 77, 46, 0, 0, { site: false });
      const store = building(s, f.b.storehouse);
      for (let g = 0; g < content.goods.length; g++) {
        const fam = content.goods[g]!.family;
        if (fam === 'food' || fam === 'wares') store.rt!.store[g] = 60;
      }
      store.rt!.store[good('honey')] = 20;
      store.rt!.store[good('cider')] = 20;
      s.tick = 2 * TICKS_PER_HOUR; // 08:00
      everyoneToWork(s);
      untilHour(s, 16);
      expect(treatsOnShelf(s, outlet), 'a Treat on the shelf').toBe(true);
    });
  }

  it('the reserve is the room less the Treats held or coming, and none for an outlet that takes none', () => {
    const f = hamletFixture();
    const stall = insertBuilding(f.state, null, content.buildingById.get('market-stall')!, 77, 46, 0, 0, {
      site: false,
    });
    const room = content.places.treatsRoom ?? 12;
    expect(treatsReserve(content.buildingById.get('market-stall'), stall.rt!)).toBe(room);
    stall.rt!.store[good('honey')] = 5;
    stall.rt!.reservedIn[good('cider')] = 4;
    expect(treatsReserve(content.buildingById.get('market-stall'), stall.rt!)).toBe(room - 9);
    stall.rt!.store[good('honey')] = 40;
    expect(treatsReserve(content.buildingById.get('market-stall'), stall.rt!)).toBe(0);
    expect(treatsReserve(content.buildingById.get('granary'), stall.rt!)).toBe(0);
  });
});

describe("a tavern's pouring stock is a shelf's worth", () => {
  it('porters keep its cider toward treatsRoom, not two cycles, so the round has something to sell', () => {
    const f = hamletFixture();
    const s = f.state;
    const def = content.buildingById.get('tavern')!;
    const tavern = insertBuilding(s, null, def, 77, 46, 0, 0, { site: false });
    tavern.rt!.input.fill(0);
    const store = building(s, f.b.storehouse);
    store.rt!.store[good('cider')] = 40;
    s.tick = 2 * TICKS_PER_HOUR; // 08:00
    everyoneToWork(s);
    untilHour(s, 16);
    const room = content.places.treatsRoom ?? 12;
    // Two cycles' worth was the old mark (one cider a pour); a shelf's worth is well past it, less
    // what the day's pours took.
    expect(tavern.rt!.input[good('cider')]! + tavern.rt!.reservedIn[good('cider')]!).toBeGreaterThan(2);
    expect(tavern.rt!.input[good('cider')]!).toBeLessThanOrEqual(room);
    expect(treatsOnShelf(s, tavern)).toBe(true);
  });
});
