// R1A (E1): favorites, sightings and the goods need's amount-and-variety average
// (docs/spec/13-ledger.md, Households: amount and variety).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import type { Household, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { dayIndex } from '../../src/systems/economy/time';
import { householdVariety, markSeen, seenLately } from '../../src/systems/market/balances';
import { basketScore, ensureBasket, shopFood } from '../../src/systems/market/baskets';
import { villageFixture } from '../fixtures/village';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { good } from '../market/helpers';

const household = (state: WorldState, id: number): Household => findById(state.households, id)!;
const FOOD = 0;

/** Empties every shelf, store and pantry so a test names exactly what is out there. */
function bare(state: WorldState): void {
  for (const b of state.buildings) {
    if (!b.rt) continue;
    b.rt.store.fill(0);
    b.rt.reservedOut.fill(0);
  }
  for (const h of state.households) {
    h.pantry.fill(0);
    delete h.seen;
  }
}

function stock(state: WorldState, id: number, goods: [string, number][]): void {
  const rt = findById(state.buildings, id)!.rt!;
  for (const [g, n] of goods) rt.store[good(g)] = n;
}

function setSpecies(state: WorldState, h: Household, species: string, thrifty = false): void {
  for (const id of h.members) {
    const r = findById(state.residents, id)!;
    r.species = species;
    r.traits = thrifty && r.stage !== 'child' ? ['thrifty'] : ['cheerful'];
  }
}

describe('favorites', () => {
  function outing(species: string, thrifty: boolean, fishPrice: number): number {
    const f = villageFixture();
    const s = f.state;
    const h = household(s, f.households[0]!);
    h.arrivedDay = -10;
    ensureBasket(h);
    h.savings = 1000;
    setSpecies(s, h, species, thrifty);
    bare(s);
    stock(s, f.b.stalls[0], [
      ['cheese', 10],
      ['fish', 10],
    ]);
    s.market.prices[good('fish')] = fishPrice;
    s.market.prices[good('cheese')] = 100;
    const before = moneySnapshot(s);
    const got = shopFood(s, h, f.b.stalls[0], 1)!;
    expectMoneyInvariant(before, s);
    return got[0];
  }

  it('an otter household buys fish over cheese at an equal price', () => {
    expect(outing('otter', false, 100)).toBe(good('fish'));
  });

  it('a fox household buys the cheese at the same price', () => {
    expect(outing('fox', false, 100)).toBe(good('cheese'));
  });

  it('a Thrifty otter household still takes the cheaper good when the favorite is much dearer', () => {
    expect(outing('otter', true, 220)).toBe(good('cheese'));
  });
});

describe('sightings', () => {
  function town() {
    const f = villageFixture();
    const s = f.state;
    bare(s);
    const h = household(s, f.households[0]!);
    return { f, s, h };
  }

  it('a good on a stall whose coverage does not reach the home does not count', () => {
    const { f, s } = town();
    stock(s, f.b.stalls[0], [['honey', 3]]);
    const stall = findById(s.buildings, f.b.stalls[0])!;
    const x = stall.x;
    const z = stall.z;
    stall.x = 2;
    stall.z = 2;
    markSeen(s);
    expect(s.households.some((h) => seenLately(s, h, good('honey')))).toBe(false);
    stall.x = x;
    stall.z = z;
    markSeen(s);
    // The stall serves the homes in its reach, not every home in the valley.
    const served = s.households.filter((h) => seenLately(s, h, good('honey')));
    expect(served.length).toBeGreaterThan(0);
    expect(served.length).toBeLessThan(s.households.length);
  });

  it("a storehouse's shelf counts for every home", () => {
    const { f, s } = town();
    stock(s, f.b.storehouses[0], [['fish', 2]]);
    markSeen(s);
    for (const h of s.households) if (h.homeId) expect(seenLately(s, h, good('fish'))).toBe(true);
  });

  it('a pantry good counts', () => {
    const { s, h } = town();
    h.pantry[good('cheese')] = 1;
    markSeen(s);
    expect(seenLately(s, h, good('cheese'))).toBe(true);
    expect(householdVariety(s, h, FOOD)).toBe(1);
  });

  it('a flavor drops out after three days unseen', () => {
    const { f, s, h } = town();
    stock(s, f.b.storehouses[0], [['fish', 2]]);
    markSeen(s);
    const seenOn = dayIndex(s.tick);
    stock(s, f.b.storehouses[0], [['fish', 0]]);
    s.tick += 2 * TICKS_PER_DAY;
    expect(dayIndex(s.tick)).toBe(seenOn + 2);
    expect(seenLately(s, h, good('fish'))).toBe(true);
    s.tick += TICKS_PER_DAY;
    expect(seenLately(s, h, good('fish'))).toBe(false);
  });
});

describe('the goods need', () => {
  it('averages amount and variety: one flavor seen when three are wanted scores below 100', () => {
    const f = villageFixture();
    const s = f.state;
    bare(s);
    const h = household(s, f.craftsfolk[0]!);
    ensureBasket(h);
    h.basket!.fill(100);
    s.tick = 0;
    // Every want met in amount; one food flavor, one wares and one treat seen.
    h.pantry[good('bread')] = 1;
    stock(s, f.b.storehouses[0], [
      ['cloth', 5],
      ['cider', 5],
    ]);
    markSeen(s);
    // Craftsfolk: food 1 of 3, wares 1 of 1, treats 1 of 1; three year-round wants fully met.
    const wants = content.basketByTier.get('craftsfolk')!.wants;
    expect(wants.filter((w) => w.amount > 0 && w.season === undefined).length).toBe(3);
    expect(basketScore(s, h)).toBe(Math.round((300 + 33 + 100 + 100) / 6));
    expect(basketScore(s, h)).toBeLessThan(100);
    // Three flavors seen: full marks.
    h.pantry[good('fish')] = 1;
    h.pantry[good('cheese')] = 1;
    markSeen(s);
    expect(basketScore(s, h)).toBe(100);
  });
});
