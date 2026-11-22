// R3A: the carrier buys for places (10:00 step 4b). Each case sets the clock and the stores by hand,
// calls the visit and the 17:30 settling directly, and reads what came and what lit.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { carrierDay } from '../../src/systems/carrier';
import { placesFloor } from '../../src/systems/carrier/places';
import { someoneSells } from '../../src/systems/carrier/terms';
import { SHELF_GOODS } from '../../src/systems/market/balances';
import { bumpPlaceInputs } from '../../src/systems/places/inputs';
import { placesWant } from '../../src/systems/supplies/want';
import { settle } from '../../src/systems/supplies/settle';
import { tickAt } from '../../src/systems/supplies/time';
import { createTickCtx } from '../../src/turn';
import { balancesView } from '../../src/view/balances';
import { villageFixture } from '../fixtures/village';
import { decor } from '../hearth/helpers';
import { run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';

const good = (id: string): number => content.goodIndex.get(id)!;
const CANDLES = good('candles');
const FIREWOOD = good('firewood');
const FUEL = 1;
const WARES = 3;

function setup() {
  const f = villageFixture();
  const s = f.state;
  for (const b of s.buildings) {
    if (!b.rt) continue;
    b.rt.store.fill(0);
    b.rt.output.fill(0);
  }
  // Pantries stocked, so Food and Fuel essentials do not use up the cart's load.
  for (const h of s.households) h.pantry.fill(0);
  for (const h of s.households) for (const g of [...SHELF_GOODS[0]!, ...SHELF_GOODS[1]!]) h.pantry[g] = 30;
  s.seasonPlan.reserve = 0;
  s.seasonPlan.food = null;
  s.seasonPlan.fuel = null;
  for (const fam of s.carrier.families) {
    fam.reserve = 0;
    fam.rule = 'essentials';
    fam.sell = false;
  }
  const store = (g: number, n: number): void => {
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[g] = n;
  };
  const stored = (g: number): number =>
    s.buildings.reduce((t, b) => t + (b.def === 'storehouse' ? b.rt!.store[g]! : 0), 0);
  const lanterns = (n: number): void => {
    for (let k = 0; k < n; k++) decor(s, 'lantern', 50 + 2 * k, 40);
    bumpPlaceInputs(s);
  };
  const visit = (day: number): void => {
    s.tick = tickAt(day, 10);
    carrierDay(s, createTickCtx(s));
  };
  const settleDay = (day: number): void => {
    s.tick = tickAt(day, 17, 30);
    settle(s, createTickCtx(s));
  };
  /** Wares of another flavor fill the floor, so candles are the only thing short above it. */
  const fillWaresFloor = (): void => {
    const other = SHELF_GOODS[WARES]!.find((g) => g !== CANDLES && g !== good('cloth'))!;
    store(other, 12);
  };
  return { f, s, store, stored, lanterns, visit, settleDay, fillWaresFloor };
}

const bought = (s: WorldState, g: number): number => s.carrier.bought[s.carrier.bought.length - 1]![g]!;

describe('the carrier buys candles for places', () => {
  it('has someone to buy from', () => {
    const { s } = setup();
    expect(someoneSells(s, CANDLES)).toBe(true);
  });

  it('with the switch off buys none for places and the lanterns rest', () => {
    const { s, lanterns, visit, settleDay, fillWaresFloor } = setup();
    lanterns(4);
    s.carrier.families[WARES]!.reserve = 1;
    fillWaresFloor();
    expect(placesFloor(s, WARES)).toBeGreaterThan(0);
    visit(2);
    expect(bought(s, CANDLES)).toBe(0);
    settleDay(2);
    expect(s.supplies.lamps).toEqual([]);
  });

  it('with the switch on buys the candles within the budget and the settling lights the lanterns', () => {
    const { s, lanterns, visit, settleDay, fillWaresFloor, stored } = setup();
    lanterns(4);
    s.carrier.families[WARES]!.reserve = 1;
    fillWaresFloor();
    run(s, { t: 'carrier.setRule', family: 'wares', rule: 'essentials', sell: false, places: true });
    expect(s.carrier.families[WARES]!.places).toBe(true);
    const snap = moneySnapshot(s);
    const tab = s.carrier.tab;
    visit(2);
    expect(bought(s, CANDLES)).toBe(1);
    expect(s.carrier.spentToday).toBeLessThanOrEqual(s.carrier.budget);
    expect(s.carrier.tab).toBe(tab);
    expect(stored(CANDLES)).toBe(1);
    expectMoneyInvariant(snap, s);
    settleDay(2);
    expect(s.supplies.lamps).toHaveLength(4);
    expect(stored(CANDLES)).toBe(0);
  });

  it('puts nothing on the tab: a treasury at zero buys nothing for places', () => {
    const { s, lanterns, visit, fillWaresFloor } = setup();
    lanterns(4);
    s.carrier.families[WARES]!.reserve = 1;
    s.carrier.families[WARES]!.places = true;
    fillWaresFloor();
    s.economy.treasury = 0;
    visit(2);
    expect(bought(s, CANDLES)).toBe(0);
    expect(s.carrier.tab).toBe(0);
  });

  it('does not sell the candle places want tonight, even when it is over twice the reserve', () => {
    const { s, lanterns, visit, stored, store } = setup();
    lanterns(4);
    store(CANDLES, 1);
    // No reserve and nothing else in Wares: without the keep, the cart would sell the candle.
    s.carrier.families[WARES]!.places = true;
    s.carrier.families[WARES]!.sell = true;
    visit(2);
    expect(bought(s, CANDLES)).toBe(0);
    expect(s.carrier.sold[s.carrier.sold.length - 1]![CANDLES]).toBe(0);
    expect(stored(CANDLES)).toBe(1);
  });
});

describe('the carrier buys firewood for places in winter', () => {
  function fire() {
    const t = setup();
    decor(t.s, 'brazier', 58, 40);
    bumpPlaceInputs(t.s);
    t.s.carrier.families[FUEL]!.reserve = 1;
    return t;
  }
  const winterDay = 3 * DAYS_PER_SEASON + 2;

  it('buys nothing for places with the switch off', () => {
    const { s, visit } = fire();
    s.tick = tickAt(winterDay, 10);
    expect(placesWant(s)[FIREWOOD]).toBeGreaterThan(0);
    visit(winterDay);
    expect(bought(s, FIREWOOD)).toBe(0);
  });

  it('with the switch on buys for the fire within the budget', () => {
    const { s, visit, stored } = fire();
    s.carrier.families[FUEL]!.places = true;
    visit(winterDay);
    expect(bought(s, FIREWOOD)).toBeGreaterThan(0);
    expect(stored(FIREWOOD)).toBe(bought(s, FIREWOOD));
    expect(s.carrier.tab).toBe(0);
  });

  it('with the switch on and a treasury at zero buys nothing and owes nothing', () => {
    const { s, visit } = fire();
    s.carrier.families[FUEL]!.places = true;
    s.economy.treasury = 0;
    visit(winterDay);
    expect(bought(s, FIREWOOD)).toBe(0);
    expect(s.carrier.tab).toBe(0);
  });
});

describe('the Balances lines', () => {
  it('show forPlaces and what places drew', () => {
    const { s, lanterns, store, settleDay } = setup();
    lanterns(4);
    store(CANDLES, 1);
    s.carrier.families[WARES]!.places = true;
    settleDay(0);
    const lines = balancesView(s).lines;
    expect(lines[WARES]!.forPlaces).toBe(true);
    expect(lines[FUEL]!.forPlaces).toBe(false);
    expect(lines[WARES]!.drawnByPlaces).toEqual({ lastNight: 1, before: 0 });
    expect(lines[FUEL]!.drawnByPlaces).toEqual({ lastNight: 0, before: 0 });
  });
});
