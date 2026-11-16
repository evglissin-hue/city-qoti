// R2B: evening trade (docs/spec/19-evenings.md, Evening trade). Places are stubbed by hand.
import { content } from '@qoti/content';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PENNIES_PER_COIN, RoundFlags, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { isTreat, ROUND_EVERY, sellsTreats } from '../../src/systems/market/round';
import { accrueTreats, doorstepErrand, tradePass } from '../../src/systems/market/trade';
import { baskets, shopBaskets } from '../../src/systems/market/baskets';
import { unpack } from '../../src/systems/residents/shopping';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { villageFixture } from '../fixtures/village';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { place, setStubPlaces } from './stubPlaces';
import {
  addOutlet,
  doorOf,
  goodIx,
  owe,
  owedHundredths,
  resident,
  standAt,
  stockTreats,
  stop,
  tickAt,
  treatCount,
  walkAt,
} from './tradeKit';

/* eslint-disable no-restricted-syntax, @typescript-eslint/consistent-type-imports -- a test's mock factory */
vi.mock('../../src/systems/places/api', async (orig) => {
  const { stubPlacesApi } = await import('./stubPlaces');
  return stubPlacesApi(await orig<typeof import('../../src/systems/places/api')>());
});
/* eslint-enable no-restricted-syntax, @typescript-eslint/consistent-type-imports */

const P = content.places;

function setup() {
  const f = villageFixture();
  const s = f.state;
  const stall = findById(s.buildings, f.b.stalls[0])!;
  stockTreats(stall, 20);
  const door = doorOf(stall);
  setStubPlaces([place({ id: 'seats:1', tile: door, outlets: [stall.id] })]);
  s.tick = tickAt(2, 18);
  return { f, s, stall, door, ctx: createTickCtx(s) };
}

beforeEach(() => setStubPlaces([]));

describe('the schedule', () => {
  it('runs every four ticks and every moment of the evening lands on one', () => {
    expect(ROUND_EVERY).toBe(4);
    const moments = [
      P.eveningHour * TICKS_PER_HOUR,
      18 * TICKS_PER_HOUR,
      P.homeHour * TICKS_PER_HOUR,
      P.doorstepHour * TICKS_PER_HOUR + Math.round((P.doorstepMinute * TICKS_PER_HOUR) / 60),
    ];
    for (const m of moments) expect(m % ROUND_EVERY).toBe(0);
    const sys = baskets;
    expect(sys.every).toBe(ROUND_EVERY);
    expect(sys.offset).toBe(0);
  });
});

describe('sellsTreats', () => {
  it('says yes to a stall, a level 2 shop and a tavern; no to stores, a granary and a level 1 shop', () => {
    const f = villageFixture();
    const s = f.state;
    const stall = findById(s.buildings, f.b.stalls[0])!;
    const store = findById(s.buildings, f.b.storehouses[0])!;
    const granary = findById(s.buildings, f.b.granary)!;
    const shop = insertBuilding(s, null, content.buildingById.get('corner-shop')!, 70, 56, 0, 0, {
      site: false,
      trade: 'shop',
    });
    shop.level = 1;
    const tavern = insertBuilding(s, null, content.buildingById.get('tavern')!, 50, 56, 0, 0, {
      site: false,
    });
    expect(sellsTreats(s, stall)).toBe(true);
    expect(sellsTreats(s, store)).toBe(false);
    expect(sellsTreats(s, granary)).toBe(false);
    expect(sellsTreats(s, shop)).toBe(false);
    shop.level = 2;
    expect(sellsTreats(s, shop)).toBe(true);
    expect(sellsTreats(s, tavern)).toBe(true);
    const unbuilt: Building = { ...stall, stage: 'construction' };
    expect(sellsTreats(s, unbuilt)).toBe(false);
  });
});

describe('at a stop', () => {
  it('sells a Treat, pays the till, sets the carry and keeps the money invariant', () => {
    const { f, s, stall, door, ctx } = setup();
    const h = findById(s.households, f.households[0]!)!;
    const r = resident(s, h.members[0]!);
    owe(h, 1);
    const stops = [stop('seats:1', door, s.tick - 8)];
    standAt(r, door, stops, s);
    const before = moneySnapshot(s);
    const treasury = s.economy.treasury;
    const savings = h.savings;
    const shelf = treatCount(stall);
    tradePass(s, ctx);
    expect(treatCount(stall)).toBe(shelf - 1);
    expect(h.savings).toBeLessThan(savings);
    expect(s.economy.treasury).toBe(treasury + (savings - h.savings));
    expect(owedHundredths(h)).toBe(0);
    expect(stops[0]!.flags & RoundFlags.treat).toBeTruthy();
    expect(isTreat(r.carry![0])).toBe(true);
    expect(s.evenings.tonight.treatsAtStops).toBe(1);
    expect(s.evenings.tonight.takings).toBe(savings - h.savings);
    expectMoneyInvariant(before, s);
    // Once an evening: a second pass sells nothing more.
    owe(h, 3);
    tradePass(s, ctx);
    expect(s.evenings.tonight.treatsAtStops).toBe(1);
  });

  it('buys one more for a comfortable household, and owes only the one', () => {
    const { f, s, door, ctx } = setup();
    const h = findById(s.households, f.craftsfolk[0]!)!;
    h.savings = 200 * PENNIES_PER_COIN;
    const r = resident(s, h.members[0]!);
    owe(h, 2);
    standAt(r, door, [stop('seats:1', door, s.tick - 8)], s);
    tradePass(s, ctx);
    expect(s.evenings.tonight.treatsAtStops).toBe(2);
    expect(owedHundredths(h)).toBe(100);
  });

  it('does nothing for a household owed less than a unit, or a resident not at a stop', () => {
    const { f, s, door, ctx } = setup();
    const h = findById(s.households, f.households[0]!)!;
    const r = resident(s, h.members[0]!);
    owe(h, 0.5);
    standAt(r, door, [stop('seats:1', door, s.tick - 8)], s);
    tradePass(s, ctx);
    owe(h, 1);
    standAt(r, door, [stop('seats:1', door, s.tick - 8 - 4800)], s); // arrived yesterday
    tradePass(s, ctx);
    expect(s.evenings.tonight.treatsAtStops).toBe(0);
  });

  it("sells only at a stop of tonight's round, never at an afternoon one (R2X: tonightStops)", () => {
    const { f, s, door, ctx } = setup();
    const h = findById(s.households, f.households[0]!)!;
    const r = resident(s, h.members[0]!);
    owe(h, 1);
    // The stop is the afternoon round's (before roundEvening); tonight's round has no stop yet.
    standAt(r, door, [stop('seats:1', door, s.tick - 8)], s);
    r.roundEvening = 1;
    tradePass(s, ctx);
    expect(s.evenings.tonight.treatsAtStops).toBe(0);
    r.roundEvening = 0;
    tradePass(s, ctx);
    expect(s.evenings.tonight.treatsAtStops).toBe(1);
  });

  it('uses the shop of a shop stop, and eats the carry when the resident walks on', () => {
    const { f, s, ctx } = setup();
    const shop = insertBuilding(s, null, content.buildingById.get('corner-shop')!, 70, 56, 0, 0, {
      site: false,
      trade: 'shop',
    });
    shop.level = 2;
    stockTreats(shop, 5);
    const h = findById(s.households, f.households[1]!)!;
    const r = resident(s, h.members[0]!);
    owe(h, 1);
    standAt(r, doorOf(shop), [stop(`shop:${shop.id}`, doorOf(shop), s.tick - 4)], s);
    tradePass(s, ctx);
    expect(treatCount(shop)).toBe(9);
    expect(r.carry).not.toBeNull();
    // Still standing: kept. Walking: eaten.
    tradePass(s, ctx);
    expect(r.carry).not.toBeNull();
    r.move = { path: [1], step: 0, progress: 0, target: 1, reason: 'leisure', version: 0 };
    tradePass(s, ctx);
    expect(r.carry).toBeNull();
  });

  it('never overwrites food being carried home', () => {
    const { f, s, door, ctx } = setup();
    const h = findById(s.households, f.households[0]!)!;
    const r = resident(s, h.members[0]!);
    owe(h, 1);
    standAt(r, door, [stop('seats:1', door, s.tick - 8)], s);
    r.carry = [goodIx('bread'), 2];
    tradePass(s, ctx);
    expect(r.carry).toEqual([goodIx('bread'), 2]);
    expect(s.evenings.tonight.treatsAtStops).toBe(1);
  });

  it('prefers the flavor the household likes, ties to the lower good index', () => {
    const { f, s, door, ctx } = setup();
    // Sweet-tooth households like cider and honey alike; the rest value the cheaper per liking.
    const h = findById(s.households, f.households[0]!)!;
    s.market.prices[goodIx('cider')] = 100;
    s.market.prices[goodIx('honey')] = 300;
    owe(h, 1);
    const r = resident(s, h.members[0]!);
    standAt(r, door, [stop('seats:1', door, s.tick - 8)], s);
    tradePass(s, ctx);
    expect(r.carry![0]).toBe(goodIx('cider'));
  });
});

describe("tonight's plan (R2X)", () => {
  it('never counts a treat on an afternoon stop as bought tonight (tonightStops)', () => {
    const f = hamletFixture();
    const s = f.state;
    const stall = findById(s.buildings, f.b.stall)!;
    stockTreats(stall, 30);
    const door = doorOf(stall);
    setStubPlaces([place({ id: 'seats:1', tile: door, outlets: [stall.id] })]);
    const ctx = createTickCtx(s);
    const h = findById(s.households, f.households[2]!)!;
    for (const id of h.members) resident(s, id).round = undefined;
    const r = resident(s, h.members[0]!);
    owe(h, 6);
    s.tick = tickAt(2, 21, 100);
    const afternoon = stop('seats:1', door, s.tick - 6 * TICKS_PER_HOUR);
    afternoon.flags |= RoundFlags.treat;
    standAt(r, doorOf(findById(s.buildings, h.homeId)!), [afternoon], s);
    r.roundEvening = 1;
    doorstepErrand(s, ctx);
    expect(s.evenings.tonight.treatsDoorstep).toBeGreaterThan(0);
  });

  it("never reads a plan left from another day as tonight's", () => {
    const f = hamletFixture();
    const s = f.state;
    const stall = findById(s.buildings, f.b.stall)!;
    stockTreats(stall, 30);
    const door = doorOf(stall);
    setStubPlaces([place({ id: 'seats:1', tile: door, outlets: [stall.id] })]);
    const ctx = createTickCtx(s);
    const h = findById(s.households, f.households[2]!)!;
    for (const id of h.members) resident(s, id).round = undefined;
    const r = resident(s, h.members[0]!);
    owe(h, 6);
    s.tick = tickAt(2, 21, 100);
    // Yesterday's plan bought a treat passing, on a stop never reached; tonight they stayed in.
    const stale = stop('seats:1', door, -1);
    stale.flags |= RoundFlags.treat;
    standAt(r, doorOf(findById(s.buildings, h.homeId)!), [stale], s);
    r.roundDay! -= 1;
    doorstepErrand(s, ctx);
    // Not tonight's plan, so not bought tonight: the doorstep errand serves the household.
    expect(s.evenings.tonight.treatsDoorstep).toBeGreaterThan(0);
  });
});

describe('a Hamlet pays nothing', () => {
  it('moves Treats and no money, at stops, passing and the doorstep', () => {
    const f = hamletFixture();
    const s = f.state;
    s.tick = tickAt(2, 18);
    const stall = findById(s.buildings, f.b.stall)!;
    stockTreats(stall, 30);
    const door = doorOf(stall);
    setStubPlaces([place({ id: 'seats:1', tile: door, outlets: [stall.id] })]);
    const ctx = createTickCtx(s);
    const [h1, h2, h3] = f.households.map((id) => findById(s.households, id)!);
    const money = () => [s.economy.treasury, ...s.households.map((h) => h.savings)];
    const before = money();
    // Stop.
    owe(h1!, 1);
    standAt(resident(s, h1!.members[0]!), door, [stop('seats:1', door, s.tick - 8)], s);
    // Passing: find a resident whose roll succeeds at this stall today.
    owe(h2!, 1);
    const walkers = h2!.members.map((id) => resident(s, id));
    for (const w of walkers) walkAt(w, door, [stop('seats:1', door, -1)], s);
    for (let i = 0; i < 4; i++) tradePass(s, ctx);
    const shelf = treatCount(stall);
    expect(shelf).toBeLessThan(60);
    // Doorstep for the third, owed three units.
    owe(h3!, 3);
    s.tick = tickAt(2, 21, 100);
    doorstepErrand(s, ctx);
    expect(money()).toEqual(before);
    expect(s.evenings.tonight.treatsAtStops).toBeGreaterThanOrEqual(1);
    expect(s.evenings.tonight.takings).toBe(0);
  });
});

describe('passing trade', () => {
  it('is about one in five and at most once a resident an evening', () => {
    const f = hamletFixture();
    const s = f.state;
    const stall = findById(s.buildings, f.b.stall)!;
    stockTreats(stall, 100000);
    const door = doorOf(stall);
    const ctx = createTickCtx(s);
    const residents = s.residents;
    let samples = 0;
    let sold = 0;
    for (let day = 0; day < 200; day++) {
      s.tick = tickAt(day, 19);
      for (const r of residents) {
        const h = findById(s.households, r.householdId)!;
        owe(h, 10);
        walkAt(r, door, [stop('seats:1', door, -1)], s);
      }
      s.evenings.tonight.treatsPassing = 0;
      // Many passes in one evening must not change the odds, nor sell twice.
      for (let i = 0; i < 6; i++) tradePass(s, ctx);
      for (const r of residents) {
        const flagged = r.round!.filter((st) => st.flags & RoundFlags.treat).length;
        expect(flagged).toBeLessThanOrEqual(1);
        sold += flagged;
        samples++;
      }
      // Passes never sell to someone who has bought tonight: units sold equal flags set.
      expect(s.evenings.tonight.treatsPassing).toBe(
        residents.filter((r) => r.round!.some((st) => st.flags & RoundFlags.treat)).length,
      );
    }
    const share = sold / samples;
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.3);
    expect(P.passingOneIn).toBe(5);
  });
});

describe('the doorstep errand in a town with no places', () => {
  it('sells a household about a third of what fell due', () => {
    const f = villageFixture();
    const s = f.state;
    setStubPlaces([]);
    const ctx = createTickCtx(s);
    for (const id of [f.craftsfolk[0]!, f.households[0]!]) {
      const h = findById(s.households, id)!;
      const home = findById(s.buildings, h.homeId)!;
      const stall = addOutlet(s, 'market-stall', home.x + 1, home.z - 4);
      const only = s.households;
      s.households = [h];
      s.evenings.tonight.treatsDoorstep = 0;
      let due = 0;
      const days = 12;
      for (let day = 0; day < days; day++) {
        stockTreats(stall, 50);
        s.tick = tickAt(day + 3, 17);
        accrueTreats(s);
        due += Math.floor(owedHundredths(h) / 100);
        s.tick = tickAt(day + 3, 21, 100);
        doorstepErrand(s, ctx);
        expect(owedHundredths(h)).toBeLessThan(100);
      }
      const bought = s.evenings.tonight.treatsDoorstep;
      s.households = only;
      expect(due).toBeGreaterThanOrEqual(3);
      expect(Math.abs(bought - due / 3)).toBeLessThanOrEqual(1);
      expect(bought).toBeGreaterThanOrEqual(1);
    }
  });

  it('goes to the next outlet in reach when the nearest shelf is empty', () => {
    const f = villageFixture();
    const s = f.state;
    const h = findById(s.households, f.craftsfolk[0]!)!;
    const home = findById(s.buildings, h.homeId)!;
    const a = addOutlet(s, 'market-stall', home.x + 1, home.z - 3);
    const b = addOutlet(s, 'market-stall', home.x + 1, home.z - 9);
    stockTreats(a, 0);
    stockTreats(b, 10);
    owe(h, 3);
    h.doorstep = 99;
    s.tick = tickAt(3, 21, 100);
    doorstepErrand(s, createTickCtx(s));
    expect(treatCount(b)).toBeLessThan(20);
    expect(treatCount(a)).toBe(0);
    expect(s.evenings.tonight.treatsDoorstep).toBeGreaterThanOrEqual(1);
  });
});

describe('the round sells most Treats', () => {
  for (const [name, make] of [
    ['the village', () => villageFixture()],
    ['the hamlet', () => hamletFixture()],
  ] as const) {
    it(`sells four fifths of Treats off the round in ${name}`, () => {
      const f = make();
      const s: WorldState = f.state;
      const outlets: Building[] = [];
      for (let i = 0; i < 3; i++) outlets.push(addOutlet(s, 'market-stall', 40 + i * 5, 56));
      const places = outlets.map((o, i) => place({ id: `seats:${i + 1}`, tile: doorOf(o), outlets: [o.id] }));
      setStubPlaces(places);
      const ctx = createTickCtx(s);
      for (let day = 0; day < 8; day++) {
        for (const o of outlets) stockTreats(o, 30);
        s.tick = tickAt(day + 2, 17);
        accrueTreats(s);
        s.tick = tickAt(day + 2, 18);
        // Five households in six go out: one grown-up stands at a place.
        s.households.forEach((h, hi) => {
          const r = resident(s, h.members[0]!);
          if (hi % 6 === 5) {
            r.round = undefined;
            return;
          }
          const k = hi % 3;
          standAt(r, places[k]!.tile, [stop(places[k]!.id, places[k]!.tile, s.tick - 8)], s);
        });
        tradePass(s, ctx);
        s.tick = tickAt(day + 2, 21, 100);
        doorstepErrand(s, ctx);
      }
      const t = s.evenings.tonight;
      const onRound = t.treatsAtStops + t.treatsPassing;
      expect(onRound + t.treatsDoorstep).toBeGreaterThan(0);
      expect(onRound / (onRound + t.treatsDoorstep)).toBeGreaterThanOrEqual(0.8);
    });
  }
});

describe('the carry', () => {
  it('is eaten at 21:30, and unpack never puts a Treat in the pantry', () => {
    const { f, s, ctx } = setup();
    const h = findById(s.households, f.households[0]!)!;
    const r = resident(s, h.members[0]!);
    const honey = goodIx('honey');
    const had = h.pantry[honey] ?? 0;
    r.carry = [honey, 2];
    r.activity = { kind: 'home' };
    expect(unpack(s, ctx, r, h)).toBe(false);
    expect(r.carry).toBeNull();
    expect(h.pantry[honey] ?? 0).toBe(had);
    r.carry = [honey, 1];
    s.tick = tickAt(2, 21, 100);
    doorstepErrand(s, ctx);
    expect(r.carry).toBeNull();
  });
});

describe('the 18:00 pass', () => {
  it('no longer buys Treats but still records their demand', () => {
    const { f, s, stall, ctx } = setup();
    for (const id of f.households) owe(findById(s.households, id)!, 5);
    const shelf = treatCount(stall);
    const treats = [goodIx('cider'), goodIx('honey')];
    const demand = treats.map((g) => s.market.demandToday[g] ?? 0);
    const owed = s.households.map(owedHundredths);
    shopBaskets(s, ctx);
    expect(treatCount(stall)).toBe(shelf);
    expect(s.households.map(owedHundredths)).toEqual(owed);
    const now = treats.map((g) => s.market.demandToday[g] ?? 0);
    expect(now[0]! + now[1]!).toBeGreaterThan(demand[0]! + demand[1]!);
  });
});
