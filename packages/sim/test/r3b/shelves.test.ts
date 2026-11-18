// R3B: a master's good on the shelves (docs/spec/19-evenings.md, Masters; 13-ledger.md, Goods). A pie
// made in a bakery reaches a shelf by the porters, is bought as a Treat on the round, and counts for
// the household's variety once seen. A good no master makes is no flavor anybody wants (no demand,
// base price); once the master is gone and the last is sold, it stops being asked for.
import { content } from '@qoti/content';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOD_FAMILIES, ResidentFlags } from '../../src/constants';
import { findById } from '../../src/state/entities';
import { MASTER_GOOD_IDS } from '../../src/state/masters';
import { townStock } from '../../src/view/hamlet';
import { householdVariety, markSeen, seenLately, SHELF_GOODS } from '../../src/systems/market/balances';
import { shopBaskets } from '../../src/systems/market/baskets';
import { updatePrices } from '../../src/systems/market/index';
import { masterGoodsInTown, masterMakes } from '../../src/systems/masters/api';
import { tradePass } from '../../src/systems/market/trade';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { villageFixture } from '../fixtures/village';
import { building, everyoneToWork, resident, untilHour } from '../ledger/helpers';
import { place as placeBuilding } from '../village/helpers';
import { place, setStubPlaces } from '../r2b/stubPlaces';
import { doorOf, goodIx, owe, standAt, stop, tickAt } from '../r2b/tradeKit';

/* eslint-disable no-restricted-syntax, @typescript-eslint/consistent-type-imports -- a test's mock factory */
vi.mock('../../src/systems/places/api', async (orig) => {
  const { stubPlacesApi } = await import('../r2b/stubPlaces');
  return stubPlacesApi(await orig<typeof import('../../src/systems/places/api')>());
});
/* eslint-enable no-restricted-syntax, @typescript-eslint/consistent-type-imports */

beforeEach(() => setStubPlaces([]));

const MASTER_GOODS = [...MASTER_GOOD_IDS];

describe('shelf lists', () => {
  it('carry every master good in its family, and still no input-only good', () => {
    for (const id of MASTER_GOODS) {
      const def = content.goodById.get(id)!;
      expect(SHELF_GOODS[GOOD_FAMILIES.indexOf(def.family)]!.includes(goodIx(id)), id).toBe(true);
    }
    expect(SHELF_GOODS.some((l) => l.includes(goodIx('wool')))).toBe(false);
  });
});

describe('a pie from the bakery', () => {
  it('reaches a shelf by the porters', () => {
    const f = hamletFixture();
    const s = f.state;
    const bakery = building(s, f.b.bakery);
    bakery.rt!.output[goodIx('pies')] = 6;
    everyoneToWork(s);
    s.tick = 2 * 60;
    let onShelf = 0;
    for (let day = 0; day < 3 && onShelf === 0; day++) {
      untilHour(s, 16);
      for (const b of s.buildings) {
        const def = content.buildingById.get(b.def)!;
        if (def.tags?.includes('market') && b.rt) onShelf += b.rt.store[goodIx('pies')] ?? 0;
      }
    }
    expect(onShelf).toBeGreaterThan(0);
  });

  it('is bought as a Treat flavor on the round, and counts for variety once seen', () => {
    const f = villageFixture();
    const s = f.state;
    const stall = findById(s.buildings, f.b.stalls[0])!;
    // Pies are the only Treat on this shelf.
    stall.rt!.reservedOut.fill(0);
    for (const g of content.goods) if (g.family === 'treats') stall.rt!.store[goodIx(g.id)] = 0;
    stall.rt!.store[goodIx('pies')] = 10;
    const door = doorOf(stall);
    setStubPlaces([place({ id: 'seats:1', tile: door, outlets: [stall.id] })]);
    s.tick = tickAt(2, 18);
    const ctx = createTickCtx(s);
    const h = findById(s.households, f.households[0]!)!;
    const r = resident(s, h.members[0]!);
    owe(h, 1);
    standAt(r, door, [stop('seats:1', door, s.tick - 8)], s);
    tradePass(s, ctx);
    expect(stall.rt!.store[goodIx('pies')]).toBe(9);
    expect(r.carry![0]).toBe(goodIx('pies'));
    // The 18:00 pass marks what the household saw on a shelf in reach (a store is open to all).
    const store = findById(s.buildings, f.b.storehouses[0])!;
    store.rt!.store[goodIx('pies')] = 3;
    expect(seenLately(s, h, goodIx('pies'))).toBe(false);
    const family = GOOD_FAMILIES.indexOf('treats');
    const before = householdVariety(s, h, family);
    markSeen(s);
    expect(seenLately(s, h, goodIx('pies'))).toBe(true);
    expect(householdVariety(s, h, family)).toBeGreaterThan(before);
  });
});

describe('a good no master makes', () => {
  function bakeryOf(f: ReturnType<typeof villageFixture>, master: boolean) {
    const b = placeBuilding(f.state, 'workshop', 120, 120, 0, 'baker');
    const r = resident(f.state, findById(f.state.households, f.craftsfolk[0]!)!.members[0]!);
    b.rt!.workers.push(r.id);
    if (master) {
      r.flags |= ResidentFlags.master;
      r.mastery = 'baker';
      b.masterId = r.id;
    } else {
      r.flags &= ~ResidentFlags.master;
      delete r.mastery;
      delete b.masterId;
    }
    return { b, r };
  }

  it('is not wanted: no demand tallied, and the price stays at base', () => {
    const f = villageFixture();
    const s = f.state;
    s.tick = tickAt(2, 18);
    shopBaskets(s, createTickCtx(s));
    for (const id of MASTER_GOODS) expect(s.market.demandToday[goodIx(id)] ?? 0, id).toBe(0);
    expect(s.market.demandToday[goodIx('cider')]).toBeGreaterThan(0);
    updatePrices(s);
    for (const id of MASTER_GOODS) expect(s.market.prices[goodIx(id)], id).toBe(content.goodById.get(id)!.basePrice);
  });

  it('is asked for once a master makes it, and again not once the master is gone and the stock sold', () => {
    const f = villageFixture();
    const s = f.state;
    const { b, r } = bakeryOf(f, true);
    const pies = goodIx('pies');
    r.inside = b.id;
    expect(masterMakes(s, 'pies')).toBe(true);
    expect(masterGoodsInTown(s)[pies]).toBe(true);
    s.tick = tickAt(2, 18);
    s.market.demandToday.fill(0);
    shopBaskets(s, createTickCtx(s));
    expect(s.market.demandToday[pies]).toBeGreaterThan(0);

    // The master leaves; some pies are still about, so they are still asked for.
    bakeryOf(f, false);
    b.rt!.output[pies] = 4;
    expect(masterMakes(s, 'pies')).toBe(false);
    expect(townStock(s)[pies]).toBe(4);
    s.market.demandToday.fill(0);
    shopBaskets(s, createTickCtx(s));
    expect(s.market.demandToday[pies]).toBeGreaterThan(0);

    // The last is sold: nobody asks for them any more, and the price goes home.
    b.rt!.output[pies] = 0;
    s.market.demandToday.fill(0);
    shopBaskets(s, createTickCtx(s));
    expect(s.market.demandToday[pies] ?? 0).toBe(0);
    updatePrices(s);
    expect(s.market.prices[pies]).toBe(content.goodById.get('pies')!.basePrice);
  });
});
