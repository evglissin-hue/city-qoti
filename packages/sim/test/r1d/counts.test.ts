// R1D: the new counts and named predicates the R1 feats read (docs/spec/15-progression.md):
// businesses, businessTrades, foodFlavors, importFreeWinters, porridgeNoMore and marketDay.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { countOf, evaluate } from '../../src/conditions';
import { codePredicates } from '../../src/conditions/code';
import { DAYS_PER_SEASON } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { turnDay } from '../../src/systems/seasons';
import { Need } from '../../src/systems/residents/needs';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { tickAt } from '../fixtures/seasonsPlace';
import { build } from '../hearth/helpers';

const G = (id: string) => content.goodIndex.get(id)!;

/** A business that grew on a lot (a lot id is all the sim reads). */
function grown(s: WorldState, def: string, x: number, z: number, trade: string) {
  const b = build(s, def, x, z, 0, 0, trade);
  b.lot = s.nextId++;
  return b;
}

describe('businesses and businessTrades', () => {
  it('count only businesses that grew on a lot, built, optionally by trade or def', () => {
    const { state: s } = hamletFixture();
    expect(countOf(s, 'businesses')).toBe(0);
    grown(s, 'workshop', 100, 100, 'carpenter');
    grown(s, 'workshop', 105, 100, 'weaver');
    grown(s, 'workshop', 110, 100, 'weaver');
    grown(s, 'farmstead', 100, 110, 'grain-farm');
    build(s, 'workshop', 120, 100, 0, 0, 'chandler'); // placed by hand: no lot
    const pending = grown(s, 'workshop', 125, 100, 'baker');
    pending.stage = 'construction';
    expect(countOf(s, 'businesses')).toBe(4);
    expect(countOf(s, 'businesses', 'workshop')).toBe(3);
    expect(countOf(s, 'businesses', 'weaver')).toBe(2);
    expect(countOf(s, 'businesses', 'farmstead')).toBe(1);
    expect(countOf(s, 'businessTrades')).toBe(3);
    expect(countOf(s, 'businessTrades', 'workshop')).toBe(2);
    expect(evaluate(s, { count: { what: 'businessTrades', ref: 'workshop', atLeast: 3 } })).toBe(false);
    grown(s, 'workshop', 130, 100, 'baker');
    expect(evaluate(s, { count: { what: 'businessTrades', ref: 'workshop', atLeast: 3 } })).toBe(true);
  });
});

describe('foodFlavors', () => {
  it('counts the Food flavors in stock, or the family named by ref', () => {
    const { state: s } = hamletFixture();
    for (const b of s.buildings) {
      if (!b.rt) continue;
      b.rt.store.fill(0);
      b.rt.output.fill(0);
    }
    expect(countOf(s, 'foodFlavors')).toBe(0);
    const granary = s.buildings.find((b) => b.def === 'granary')!;
    granary.rt!.store[G('grain')] = 5;
    granary.rt!.store[G('bread')] = 2;
    granary.rt!.store[G('honey')] = 1;
    expect(countOf(s, 'foodFlavors')).toBe(2);
    expect(countOf(s, 'foodFlavors', 'food')).toBe(2);
    expect(countOf(s, 'foodFlavors', 'treats')).toBe(1);
    expect(countOf(s, 'foodFlavors', 'fuel')).toBe(0);
    expect(countOf(s, 'foodFlavors', 'nonsense')).toBe(0);
  });
});

describe('porridgeNoMore', () => {
  const porridge = codePredicates.get('porridgeNoMore')!;

  it('needs a household, and three Food flavors in every household with a home', () => {
    const { state: s } = hamletFixture();
    s.tick = tickAt(0, 3, 2, 8); // winter: no garden flavors
    expect(porridge(s, {}, [])).toBe(false);
    const veg = G('vegetables');
    const fish = G('fish');
    for (const h of s.households) h.recentFoods = [G('bread'), veg, fish];
    expect(porridge(s, {}, [])).toBe(true);
    s.households[0]!.recentFoods = [G('bread'), veg, veg];
    expect(porridge(s, {}, [])).toBe(false);
    // A garden bed beside that home brings vegetables, but they were already counted: still two.
    s.households[0]!.recentFoods = [G('bread'), G('fish'), G('fish')];
    s.tick = tickAt(0, 0, 2, 8);
    build(s, 'garden-bed', s.buildings.find((b) => b.id === s.households[0]!.homeId)!.x, 44);
    expect(porridge(s, {}, [])).toBe(true);
    const empty = hamletFixture().state;
    empty.households.length = 0;
    expect(porridge(empty, {}, [])).toBe(false);
  });
});

describe('marketDay', () => {
  const day = codePredicates.get('marketDay')!;
  const base = () => content.goods.filter((g) => g.family === 'food' && g.raw).map((g) => g.id);

  it('wants every base Food flavor on the stalls at once', () => {
    const { state: s } = hamletFixture();
    const stall = s.buildings.find((b) => b.def === 'market-stall')!;
    stall.rt!.store.fill(0);
    expect(day(s, {}, [])).toBe(false);
    const ids = base();
    expect(ids.length).toBeGreaterThanOrEqual(4);
    ids.forEach((id, i) => {
      if (i < ids.length - 1) stall.rt!.store[G(id)] = 3;
    });
    expect(day(s, {}, [])).toBe(false);
    stall.rt!.store[G(ids[ids.length - 1]!)] = 1;
    expect(day(s, {}, [])).toBe(true);
    // Bread is made, not a base flavor; and a granary is a store, not a stall.
    stall.rt!.store[G(ids[0]!)] = 0;
    s.buildings.find((b) => b.def === 'granary')!.rt!.store[G(ids[0]!)] = 9;
    expect(day(s, {}, [])).toBe(false);
  });
});

describe('importFreeWinters', () => {
  /** Runs the morning turns from Autumn's last day through Spring day 1. */
  function winter(s: WorldState, brought: (day: number) => number, hungryOnDay = -1): void {
    s.tick = tickAt(0, 2, DAYS_PER_SEASON, 12);
    for (let d = 1; d <= DAYS_PER_SEASON + 1; d++) {
      s.tick = d <= DAYS_PER_SEASON ? tickAt(0, 3, d, 0) + 2 : tickAt(1, 0, 1, 0) + 2;
      const row = new Array<number>(content.goods.length).fill(0);
      row[G('firewood')] = d === 1 ? 7 : 0; // autumn's last boat, before winter: never counted
      // Winter day d's boat is seen by the next morning's turn.
      row[G('vegetables')] = brought(d - 1);
      s.carrier.bought.push(row);
      for (const r of s.residents) r.needs[Need.food] = d === hungryOnDay ? 10 : 80;
      turnDay(s, createTickCtx(s));
    }
  }

  it('counts a winter with no Food or Fuel brought and nobody hungry or cold', () => {
    const { state: s } = hamletFixture();
    s.warmth = { winter: 0, coldHouseholdDays: 0, coldHouseholds: [] };
    expect(countOf(s, 'importFreeWinters')).toBe(0);
    winter(s, () => 0);
    expect(countOf(s, 'importFreeWinters')).toBe(1);
    expect(s.seasons.winterImported).toBeUndefined();
  });

  it('does not count a winter the boat brought Food in, even on its last day', () => {
    const a = hamletFixture().state;
    winter(a, (d) => (d === DAYS_PER_SEASON ? 2 : 0));
    expect(countOf(a, 'importFreeWinters')).toBe(0);
    const b = hamletFixture().state;
    winter(b, (d) => (d === 3 ? 1 : 0));
    expect(countOf(b, 'importFreeWinters')).toBe(0);
  });

  it('does not count a winter where someone went hungry or cold', () => {
    const hungry = hamletFixture().state;
    winter(hungry, () => 0, 4);
    expect(countOf(hungry, 'importFreeWinters')).toBe(0);
    const cold = hamletFixture().state;
    winter(cold, () => 0);
    expect(countOf(cold, 'importFreeWinters')).toBe(1);
    // A second winter that was cold: the count stays.
    cold.tick = tickAt(1, 3, 1, 0) + 2;
    turnDay(cold, createTickCtx(cold));
    cold.warmth.coldHouseholdDays = 3;
    cold.tick = tickAt(2, 0, 1, 0) + 2;
    turnDay(cold, createTickCtx(cold));
    expect(countOf(cold, 'importFreeWinters')).toBe(1);
  });
});
