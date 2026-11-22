// P3A meals ("lack of food"): at Village rank households with savings missed breakfast on 20 to 50 of 70
// days. The rules that fix it: fill the belly (the cheapest food for tomorrow's meals) before pleasing it
// (shopFood); keep tomorrow's breakfast out of every other purchase (foodReserve in purchase); a household
// in work whose purse is short of the cheapest food eats on the slate (onTheSlate); a household that cannot
// pay at its nearest shelf walks to the cheapest in reach (shopOutlet); and the health watch's
// `meals-missed` flags households that missed breakfast two mornings running with food in reach.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Household, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { cheapestFoodPrice, foodReserve, purchase, tillPrice } from '../../src/systems/market/api';
import { onTheSlate, shopFood } from '../../src/systems/market/baskets';
import { hourOf } from '../../src/systems/economy/time';
import { shopOutlet } from '../../src/systems/residents/shopping';
import { doorTile } from '../../src/systems/movement/api';
import {
  HealthWatch,
  hungryHouseholds,
  MEALS_HOUR,
  MEAL_MISSED_BELOW,
  mealsMissed,
} from '../../src/view/health';
import { good } from '../market/helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { villageFixture } from '../fixtures/village';

const household = (s: WorldState, id: number): Household => findById(s.households, id)!;

/** Empties the stall and stocks it with exactly these goods. */
function stall(s: WorldState, id: number, goods: [string, number][]): void {
  const rt = findById(s.buildings, id)!.rt!;
  rt.store.fill(0);
  rt.reservedOut.fill(0);
  for (const [g, n] of goods) rt.store[good(g)] = n;
}

/** A working household (the cottage families have jobs), off the newcomers' slate, with an empty pantry. */
function worker(f: ReturnType<typeof villageFixture>) {
  const h = household(f.state, f.households[0]!);
  h.arrivedDay = -10;
  h.pantry.fill(0);
  return h;
}

describe('fill the belly, then please it', () => {
  /** A badger household (bread liked twice over) at a stall of bread at 150 and vegetables at 100. */
  function badgers(savingsPerMouth: number) {
    const f = villageFixture();
    const s = f.state;
    const h = worker(f);
    for (const id of h.members) findById(s.residents, id)!.species = 'badger';
    h.savings = savingsPerMouth * h.members.length;
    stall(s, f.b.stalls[0], [
      ['bread', 20],
      ['vegetables', 20],
    ]);
    s.market.prices[good('bread')] = 150;
    s.market.prices[good('vegetables')] = 100;
    return { s, h, stallId: f.b.stalls[0] };
  }

  it('buys the favorite for tomorrow when the purse covers every mouth at its price', () => {
    // Bread wins on value, as it did before P3A, and the purse pays for a loaf a mouth: variety.
    const { s, h, stallId } = badgers(400);
    expect(shopFood(s, h, stallId, 8)).toEqual([good('bread'), h.members.length]);
  });

  it('buys plain food for tomorrow when the favorite would leave a mouth unfed, then the favorite', () => {
    // 120 a mouth pays for vegetables all round but bread for only some: plain food first.
    const { s, h, stallId } = badgers(120);
    expect(shopFood(s, h, stallId, 8)).toEqual([good('vegetables'), h.members.length]);
    h.pantry[good('vegetables')] = h.members.length;
    h.savings = 2000;
    expect(shopFood(s, h, stallId, 2)![0]).toBe(good('bread'));
  });

  it('keeps the money invariant while it spends on plain food', () => {
    const f = villageFixture();
    const s = f.state;
    const h = worker(f);
    h.savings = 1000;
    stall(s, f.b.stalls[0], [['vegetables', 20]]);
    s.market.prices[good('vegetables')] = 100;
    const before = moneySnapshot(s);
    shopFood(s, h, f.b.stalls[0], 8);
    expectMoneyInvariant(before, s);
    expect(h.savings).toBe(1000 - 100 * h.members.length);
  });
});

describe('the slate for a household in work', () => {
  it('feeds a working household whose purse is short of the cheapest food, booked as the slate is', () => {
    const f = villageFixture();
    const s = f.state;
    const h = worker(f);
    h.savings = 60;
    stall(s, f.b.stalls[0], [['vegetables', 20]]);
    s.market.prices[good('vegetables')] = 100;
    expect(onTheSlate(s, h)).toBe(false);
    expect(onTheSlate(s, h, 100)).toBe(true);
    const before = moneySnapshot(s);
    const got = shopFood(s, h, f.b.stalls[0], 8)!;
    expect(got).toEqual([good('vegetables'), h.members.length]);
    expect(h.savings).toBe(60);
    expectMoneyInvariant(before, s);
  });

  it('pays for what the purse stretches to and takes the rest on the slate', () => {
    const f = villageFixture();
    const s = f.state;
    const h = worker(f);
    h.savings = 150;
    stall(s, f.b.stalls[0], [['vegetables', 20]]);
    s.market.prices[good('vegetables')] = 100;
    const got = shopFood(s, h, f.b.stalls[0], 8)!;
    expect(got[1]).toBe(h.members.length);
    expect(h.savings).toBe(50);
  });

  it('does not feed a household whose purse can pay', () => {
    const f = villageFixture();
    const s = f.state;
    const h = worker(f);
    h.savings = 5000;
    expect(onTheSlate(s, h, 100)).toBe(false);
  });
});

describe('the food reserve', () => {
  it("keeps tomorrow's breakfast out of every purchase but food", () => {
    const f = villageFixture();
    const s = f.state;
    const h = worker(f);
    stall(s, f.b.stalls[0], [
      ['vegetables', 20],
      ['candles', 20],
    ]);
    s.market.prices[good('vegetables')] = 100;
    s.market.prices[good('candles')] = 150;
    const reserve = h.members.length * 100;
    expect(cheapestFoodPrice(s)).toBe(100);
    expect(foodReserve(s, h)).toBe(reserve);
    h.savings = reserve + 149;
    expect(purchase(s, h, good('candles'), 3, f.b.stalls[0])).toBe(0);
    h.savings = reserve + 150;
    expect(purchase(s, h, good('candles'), 3, f.b.stalls[0])).toBe(1);
    expect(h.savings).toBe(reserve);
    // Food itself may use all of it.
    expect(purchase(s, h, good('vegetables'), 2, f.b.stalls[0])).toBe(2);
  });

  it('is nothing for a pantry that covers tomorrow, or when no shelf holds food', () => {
    const f = villageFixture();
    const s = f.state;
    const h = worker(f);
    stall(s, f.b.stalls[0], [['vegetables', 20]]);
    s.market.prices[good('vegetables')] = 100;
    h.pantry[good('vegetables')] = h.members.length;
    expect(foodReserve(s, h)).toBe(0);
    h.pantry.fill(0);
    for (const b of s.buildings) if (b.rt) b.rt.store.fill(0);
    expect(foodReserve(s, h)).toBe(0);
  });
});

describe('where a household shops', () => {
  it('takes the nearest shelf when the purse can pay for tomorrow there', () => {
    const f = villageFixture();
    const s = f.state;
    const h = worker(f);
    h.savings = 100000;
    const home = findById(s.buildings, h.homeId)!;
    expect(shopOutlet(s, h, doorTile(home))).toBeGreaterThan(0);
  });

  it('walks to a cheaper shelf in reach when the purse cannot pay at the nearest', () => {
    const f = villageFixture();
    const s = f.state;
    const h = worker(f);
    const [a, b] = f.b.stalls;
    // A home by the stalls (the fixture's homes stand a street away, past a stall's reach of 14 tiles).
    const door = doorTile(findById(s.buildings, a)!) + 1;
    // Every other outlet is dry; stall a holds only dear fish, stall b grain at a plain price.
    for (const bld of s.buildings) if (bld.rt && bld.id !== a && bld.id !== b) bld.rt.store.fill(0);
    stall(s, a, [['fish', 20]]);
    stall(s, b, [['vegetables', 20]]);
    s.market.prices[good('fish')] = 400;
    s.market.prices[good('vegetables')] = 100;
    h.savings = 400;
    // The dear shelf is nearer, and a purse of 400 for four mouths cannot pay for breakfast on it.
    expect(shopOutlet(s, h, door)).toBe(b);
    // With a purse that can, the nearest shelf will do.
    h.savings = 4 * 400;
    expect(shopOutlet(s, h, door)).toBe(a);
    expect(tillPrice(s, good('vegetables'))).toBeLessThan(tillPrice(s, good('fish')));
  });
});

describe('the meals-missed watch', () => {
  /** The tick of the first hour from MEALS_HOUR on the given day. */
  function lookTick(day: number): number {
    let t = day * TICKS_PER_DAY;
    while (hourOf(t) < MEALS_HOUR) t += TICKS_PER_HOUR;
    return t;
  }
  const flagged = (w: HealthWatch, s: WorldState) => w.check(s).some((i) => i.kind === 'meals-missed');

  /** The first household goes hungry with food on the stall. */
  function hungryTown() {
    const f = villageFixture();
    const s = f.state;
    const h = household(s, f.households[0]!);
    stall(s, f.b.stalls[0], [['vegetables', 20]]);
    const hunger = (n: number) => {
      for (const id of h.members) findById(s.residents, id)!.needs[0] = n;
    };
    hunger(20);
    return { f, s, h, hunger };
  }

  it('flags a household hungry two mornings running with food in reach, not the first morning', () => {
    const { s } = hungryTown();
    const w = new HealthWatch();
    s.tick = lookTick(4);
    expect(flagged(w, s)).toBe(false);
    s.tick = lookTick(5);
    const issue = w.check(s).find((i) => i.kind === 'meals-missed');
    expect(issue?.text).toMatch(/^\d+ households? went without breakfast two mornings running with food on /);
    expect(issue?.text).toMatch(/ on [a-z-]+ #\d+ in reach$/);
  });

  it('is quiet when the household ate on the second morning', () => {
    const { s, hunger } = hungryTown();
    const w = new HealthWatch();
    s.tick = lookTick(4);
    flagged(w, s);
    hunger(80);
    s.tick = lookTick(5);
    expect(flagged(w, s)).toBe(false);
  });

  it("is quiet when no shelf holds food (a shortage is another flag's to raise)", () => {
    const { s } = hungryTown();
    for (const b of s.buildings) if (b.rt) b.rt.store.fill(0);
    const w = new HealthWatch();
    s.tick = lookTick(4);
    flagged(w, s);
    s.tick = lookTick(5);
    expect(flagged(w, s)).toBe(false);
  });

  it('needs two mornings running: a gap of a day starts the count again', () => {
    const { s } = hungryTown();
    const w = new HealthWatch();
    s.tick = lookTick(4);
    flagged(w, s);
    s.tick = lookTick(6);
    expect(flagged(w, s)).toBe(false);
    s.tick = lookTick(7);
    expect(flagged(w, s)).toBe(true);
  });

  it('reads hunger as a food need under the line, and counts households once', () => {
    const { s, h } = hungryTown();
    expect(MEAL_MISSED_BELOW).toBe(60);
    expect([...hungryHouseholds(s)]).toContain(h.id);
    expect(mealsMissed(s, new Set())).toBeNull();
    expect(mealsMissed(s, hungryHouseholds(s))).toMatch(/^1 household went without/);
  });
});
