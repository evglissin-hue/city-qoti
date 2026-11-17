// R2B (from the dead-end hunt): a shelf holds what households buy. A Village's shops each stocked
// eight wool, the weaver's input that no household ever buys, while the weaver went without and the
// carrier would not buy what the town held (hazel, 70 days). Shelves now skip input-only goods, and
// wool already on one goes on to the maker that wants it.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/constants';
import { insertBuilding } from '../../src/state/place';
import { INPUT_ONLY, SHELF_GOODS } from '../../src/systems/market/balances';
import { sourceAvail } from '../../src/systems/logistics';
import { hamletFixture } from '../fixtures/hamlet';
import { building, everyoneToWork, good, untilHour } from '../ledger/helpers';

const def = (id: string) => content.buildingById.get(id)!;

describe('shelves hold what households buy', () => {
  it('a Market Square restocks cloth from the storehouse, never wool', () => {
    const f = hamletFixture();
    const s = f.state;
    const square = insertBuilding(s, null, def('market-square'), 77, 46, 0, 0, { site: false });
    const store = building(s, f.b.storehouse);
    const wool = good('wool');
    const cloth = good('cloth');
    store.rt!.store[wool] = 40;
    store.rt!.store[cloth] = 40;
    s.tick = 2 * TICKS_PER_HOUR; // 08:00
    everyoneToWork(s);
    untilHour(s, 16);
    expect(square.rt!.store[cloth]).toBeGreaterThan(0);
    expect(square.rt!.store[wool]).toBe(0);
    expect(square.rt!.reservedIn[wool]).toBe(0);
  });

  it('wool already on a shelf is there for a porter to take on; a household good is not', () => {
    const f = hamletFixture();
    const s = f.state;
    const square = insertBuilding(s, null, def('market-square'), 77, 46, 0, 0, { site: false });
    square.rt!.store[good('wool')] = 8;
    square.rt!.store[good('cloth')] = 8;
    expect(sourceAvail(square, def('market-square'), good('wool'))).toBe(8);
    expect(sourceAvail(square, def('market-square'), good('cloth'))).toBe(0);
  });

  it('every input-only good is off every family shelf list', () => {
    for (const id of INPUT_ONLY) {
      const g = good(id);
      for (const shelf of SHELF_GOODS) expect(shelf.includes(g), id).toBe(false);
    }
  });
});
