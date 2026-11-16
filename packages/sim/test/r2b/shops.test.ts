/* eslint-disable no-restricted-syntax, @typescript-eslint/consistent-type-imports -- vi.mock factories are async by design */
// R2B: shops follow the walkers (docs/spec/19-evenings.md, Shops follow the walkers). Places are
// R2A's stand-in, stubbed by hand (stubPlaces.ts); footfall and the places' saved rows are written
// by hand; the levels pass's day end is run directly.
import { content } from '@qoti/content';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMAND_KINDS, MAP_SIZE, TICKS_PER_DAY, TILE_FP, Zone } from '../../src/constants';
import type { Building, Lot, WorldState } from '../../src/contracts';
import { entranceTiles } from '../../src/rules/footprint';
import { newPlaceState } from '../../src/state/evenings';
import { cafeTables } from '../../src/systems/growth/cafes';
import {
  lotDesirability,
  pickStyle,
  refreshDesirability,
  servicesOf,
  townSpecies,
} from '../../src/systems/growth/desirability';
import { freeLots } from '../../src/systems/growth/bars';
import { refreshDemand } from '../../src/systems/growth';
import {
  eveningPassers,
  homeDoorTiles,
  shopReach,
  SHOP_HOUSEHOLDS,
  unservedDoors,
  unservedPlaces,
} from '../../src/systems/growth/outlets';
import { levels } from '../../src/systems/levels';
import { openShop } from '../../src/systems/residents/shops';
import { createTickCtx } from '../../src/turn';
import { demandView } from '../../src/view/demand';
import { villageFixture, type VillageFixture } from '../fixtures/village';
import { emptyCounters } from '../../src/state/zones';
import { place as placeBuilding } from '../village/helpers';
import { place, setStubPlaces } from './stubPlaces';

vi.mock('../../src/systems/places/api', async (orig) => {
  const { stubPlacesApi } = await import('./stubPlaces');
  return stubPlacesApi(await orig<typeof import('../../src/systems/places/api')>());
});

const S = MAP_SIZE;
const P = content.places;
const SHOPS = DEMAND_KINDS.indexOf('shops');

beforeEach(() => setStubPlaces([]));

function grownups(state: WorldState): number {
  return state.residents.filter((r) => r.stage === 'young' || r.stage === 'adult').length;
}

/** A free shops lot: the fixture's lots, or one cut by hand. */
function shopLot(f: VillageFixture): Lot {
  const lot = f.state.lots.find((l) => l.zone === Zone.shops && !l.buildingId);
  if (!lot) throw new Error('no free shops lot');
  return lot;
}

function score(state: WorldState, lot: Lot): number {
  return lotDesirability(state, lot, townSpecies(state), servicesOf(state));
}

describe('a Shops lot follows the walkers', () => {
  it('is worth more with evening footfall at its frontage, in full at a tenth of the grown-ups', () => {
    const f = villageFixture();
    const s = f.state;
    const lot = shopLot(f);
    // Keep the clamp out of the way.
    s.map.charm.fill(0);
    const base = score(s, lot);
    expect(base).toBeLessThanOrEqual(100 - P.footfallDesirability);
    const full = Math.max(1, Math.ceil((grownups(s) * P.footfallFullPercent) / 100));
    s.map.footfallEve[lot.frontage] = full * 2;
    expect(eveningPassers(s, lot.frontage)).toBe(full);
    expect(score(s, lot)).toBe(base + P.footfallDesirability);
    // A quarter of that is a quarter of the bonus; more than full is capped.
    s.map.footfallEve[lot.frontage] = full * 2 * 4;
    expect(score(s, lot)).toBe(base + P.footfallDesirability);
    s.map.footfallEve[lot.frontage] = Math.max(2, full);
    const part = score(s, lot) - base;
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(P.footfallDesirability);
    // The second frontage of a corner lot counts when it is the busier.
    s.map.footfallEve[lot.frontage] = 0;
    lot.frontage2 = lot.frontage + 1;
    s.map.footfallEve[lot.frontage2] = full * 2;
    expect(score(s, lot)).toBe(base + P.footfallDesirability);
  });

  it('is worth more by a place within three tiles, and a porch does not count', () => {
    const f = villageFixture();
    const s = f.state;
    const lot = shopLot(f);
    s.map.charm.fill(0);
    const base = score(s, lot);
    setStubPlaces([place({ id: 'porch:1', source: 'porch', tile: lot.frontage + 1 })]);
    expect(score(s, lot)).toBe(base);
    setStubPlaces([place({ id: 'seats:1', tile: lot.frontage + 2 })]);
    expect(score(s, lot)).toBe(base + P.placeNearShop);
    setStubPlaces([place({ id: 'seats:1', tile: lot.frontage + P.placeNearShopRadius + 1 })]);
    expect(score(s, lot)).toBe(base);
    // Homes do not care about walkers.
    const home = s.lots.find((l) => l.zone === Zone.homesLow && !l.buildingId);
    if (home) {
      s.map.footfallEve[home.frontage] = 500;
      const was = score(s, home);
      s.map.footfallEve[home.frontage] = 0;
      expect(score(s, home)).toBe(was);
    }
  });
});

describe('a garden lot is never built on, priced or offered', () => {
  it('is skipped by the desirability pass, the free lots, the bar reasons and openShop', () => {
    const f = villageFixture();
    const s = f.state;
    const shops = s.lots.filter((l) => l.zone === Zone.shops && !l.buildingId);
    expect(shops.length).toBeGreaterThan(0);
    for (const l of shops) l.kind = 'garden';
    // Priced: the hourly slice leaves a garden lot's desirability alone.
    const lot = shops[0]!;
    lot.desirability = 3;
    refreshDesirability(s, null, lot.id % 24);
    expect(lot.desirability).toBe(3);
    // Free: none.
    expect(freeLots(s, [Zone.shops], servicesOf(s)).filter((l) => l.kind === 'garden')).toHaveLength(0);
    // Offered: a keeper with savings finds no lot to open on.
    expect(openShop(s, null)).toBeNull();
    // In the bars: with a crowd and nothing to sell, no reason counts a garden as a free lot.
    s.map.footfallEve.fill(0);
    s.places = [row('seats:5', 9, 0)];
    setStubPlaces([place({ id: 'seats:5', tile: lot.frontage })]);
    refreshDemand(s, null);
    const codes = demandView(s).bars[SHOPS]!.reasons.map((r) => r.code);
    expect(codes).toContain('unservedPlaces');
    expect(codes).not.toContain('lotWaiting');
    expect(codes).not.toContain('outOfReach');
    expect(codes).not.toContain('unsuitable');
    expect(codes.some((c) => c === 'needsLand' || c === 'noRoad')).toBe(true);
    // The same lots as plots are a lot waiting.
    for (const l of shops) l.kind = 'plot';
    refreshDemand(s, null);
    const plots = demandView(s).bars[SHOPS]!.reasons.map((r) => r.code);
    expect(plots).not.toContain('needsLand');
    expect(plots).not.toContain('noRoad');
  });

  it("sets no street style: a garden neighbor never decides a new lot's look", () => {
    const f = villageFixture();
    const s = f.state;
    const [a, b] = s.lots.filter((l) => l.zone === Zone.shops && !l.buildingId);
    expect(a && b).toBeTruthy();
    b!.style = '';
    const alone = pickStyle(s, a!);
    // A garden lot in the same row, painted every other style, is read as nothing.
    b!.kind = 'garden';
    for (const st of content.styles) {
      if (st.id === alone) continue;
      b!.style = st.id;
      b!.rot = a!.rot;
      expect(pickStyle(s, a!)).toBe(alone);
    }
  });
});

/** A place's saved row with `visitors` and `served` for its one evening. */
function row(id: string, visitors: number, served: number) {
  const r = newPlaceState(id, 'Test spot', 0);
  r.visitors = [visitors];
  r.served = [served];
  return r;
}

describe('places that drew a crowd with nothing to sell', () => {
  /** A free spot of the map away from every stall, market and tavern. */
  function spot(f: VillageFixture): number {
    return f.state.map.height.length > 0 ? 40 * S + 100 : 0;
  }

  it('show in the Shops bar and in the unserved doors; households are still counted alone', () => {
    const f = villageFixture();
    const s = f.state;
    const lot = shopLot(f);
    const homes = unservedDoors(s, servicesOf(s), homeDoorTiles(s));
    s.places = [row('seats:5', 9, 0)];
    setStubPlaces([place({ id: 'seats:5', tile: spot(f) })]);
    expect(unservedPlaces(s)).toEqual([spot(f)]);
    const all = unservedDoors(s, servicesOf(s));
    expect(all).toHaveLength(homes.length + SHOP_HOUSEHOLDS);
    expect(all.slice(-SHOP_HOUSEHOLDS)).toEqual([
      [spot(f) % S, Math.floor(spot(f) / S)],
      [spot(f) % S, Math.floor(spot(f) / S)],
    ]);
    refreshDemand(s, null);
    const bar = demandView(s).bars[SHOPS]!;
    const places = bar.reasons.find((r) => r.code === 'unservedPlaces');
    expect(places?.value).toBe(1);
    expect(bar.value).toBeGreaterThanOrEqual(40);
    const households = bar.reasons.find((r) => r.code === 'noOutlet');
    expect(households?.value ?? 0).toBe(homes.length);
    void lot;
  });

  it('draws a lot near it to the front of growth, since it counts as homes with no outlet', () => {
    const f = villageFixture();
    const s = f.state;
    const lots = s.lots.filter((l) => l.zone === Zone.shops && !l.buildingId);
    s.places = [row('seats:5', 12, 0)];
    // A shop lot whose frontage is far enough from every stall for a crowd to go unserved there.
    const near = lots.find((l) => {
      setStubPlaces([place({ id: 'seats:5', tile: l.frontage })]);
      return unservedPlaces(s).length === 1;
    })!;
    expect(near).toBeDefined();
    const doors = unservedDoors(s, servicesOf(s));
    expect(shopReach(near, doors, Infinity)).toBeGreaterThanOrEqual(SHOP_HOUSEHOLDS);
    expect(shopReach(near, doors.slice(0, doors.length - SHOP_HOUSEHOLDS))).toBeLessThan(
      shopReach(near, doors),
    );
  });

  it('are not counted when the evening was quiet, served, or has a stall at the door', () => {
    const f = villageFixture();
    const s = f.state;
    setStubPlaces([place({ id: 'seats:5', tile: spot(f) })]);
    s.places = [row('seats:5', P.unservedVisitors - 1, 0)];
    expect(unservedPlaces(s)).toEqual([]);
    s.places = [row('seats:5', 9, 1)];
    expect(unservedPlaces(s)).toEqual([]);
    s.places = [row('seats:5', 9, 0)];
    expect(unservedPlaces(s)).toHaveLength(1);
    // A place the pass no longer finds is not unserved.
    setStubPlaces([]);
    expect(unservedPlaces(s)).toEqual([]);
    // A stall at its door.
    setStubPlaces([place({ id: 'seats:5', tile: spot(f) })]);
    const x = spot(f) % S;
    const z = Math.floor(spot(f) / S);
    placeBuilding(s, 'market-stall', x + 1, z - 2, 0);
    expect(unservedPlaces(s)).toEqual([]);
  });

  it('counts the evening before while tonight is under way, and nothing before Village rank', () => {
    const f = villageFixture();
    const s = f.state;
    setStubPlaces([place({ id: 'seats:5', tile: spot(f) })]);
    const r = newPlaceState('seats:5', 'Test spot', 0);
    r.visitors = [10, 2];
    r.served = [0, 0];
    s.places = [r];
    // 18:00, tonight's tally is for today: yesterday's evening (the one before the last) is read.
    s.tick = 12 * 60 * 0 + 12 * (TICKS_PER_DAY / 24);
    s.evenings.tonight.day = Math.floor((s.tick + 6 * (TICKS_PER_DAY / 24)) / TICKS_PER_DAY);
    expect(unservedPlaces(s)).toEqual([spot(f)]);
    // Midday: the last entry is the last closed evening: 2 visitors, not enough.
    s.tick = 4 * (TICKS_PER_DAY / 24);
    expect(unservedPlaces(s)).toEqual([]);
    r.visitors = [1, 10];
    expect(unservedPlaces(s)).toEqual([spot(f)]);
    s.charter.rank = 'hamlet';
    expect(unservedPlaces(s)).toEqual([]);
  });
});

describe('cafes', () => {
  function shopWithSeats(seats: { def: string; dx: number; dz: number }[], level = 2) {
    const f = villageFixture();
    const s = f.state;
    const b = placeBuilding(s, 'corner-shop', 40, 30, 0, 'shop');
    b.level = level;
    b.counters = emptyCounters();
    const def = content.buildingById.get(b.def)!;
    const { front } = entranceTiles(def, b.x, b.z, b.rot);
    for (const q of seats) {
      s.decor.push({
        id: s.nextId++,
        def: q.def,
        fx: (front[0] + q.dx) * TILE_FP + TILE_FP / 2,
        fz: (front[1] + q.dz) * TILE_FP + TILE_FP / 2,
        rot: 0,
        builtBy: 0,
      });
    }
    return { s, b, front };
  }

  const dayEnd = (s: WorldState) => levels.tick(s, createTickCtx(s));

  it('puts tables out at level 2 with two grown-up seats at the door, and clears them when the seats go', () => {
    const { s, b } = shopWithSeats([{ def: 'bench', dx: 1, dz: 0 }]);
    expect(content.decorById.get('bench')!.seats).toBeGreaterThanOrEqual(P.cafeSeats);
    expect(cafeTables(s, b)).toBe(0);
    dayEnd(s);
    expect(b.cafe).toBe(true);
    expect(cafeTables(s, b)).toBe(content.decorById.get('cafe-table')!.seats);
    s.decor.length = 0;
    dayEnd(s);
    expect(b.cafe).toBeUndefined();
    expect(cafeTables(s, b)).toBe(0);
  });

  it('needs level 2, and seats within the radius of the door', () => {
    const one = shopWithSeats([{ def: 'bench', dx: 1, dz: 0 }], 1);
    dayEnd(one.s);
    expect(one.b.cafe).toBeUndefined();
    const far = shopWithSeats([{ def: 'bench', dx: P.cafeRadius + 1, dz: 1 }]);
    dayEnd(far.s);
    expect(far.b.cafe).toBeUndefined();
  });

  it('does not count child seats', () => {
    const kids = content.decor.find((d) => d.childSeats);
    const { s, b } = shopWithSeats([{ def: kids?.id ?? 'swing', dx: 1, dz: 0 }]);
    expect(content.decorById.get(kids?.id ?? 'swing')?.childSeats).toBe(true);
    dayEnd(s);
    expect(b.cafe).toBeUndefined();
  });

  it('tells the art and the places when the tables go out', () => {
    const { s } = shopWithSeats([{ def: 'bench', dx: 1, dz: 0 }]);
    const ctx = createTickCtx(s);
    levels.tick(s, ctx);
    expect(ctx.events.some((e) => e.e === 'building.updated')).toBe(true);
  });
});

describe('steps past the door are customers', () => {
  it('120 on the footfall at the front tile adds 6 customers to the day', () => {
    const f = villageFixture();
    const s = f.state;
    const b: Building = placeBuilding(s, 'corner-shop', 40, 30, 0, 'shop');
    b.counters = emptyCounters();
    const def = content.buildingById.get(b.def)!;
    const { front } = entranceTiles(def, b.x, b.z, b.rot);
    s.map.footfallEve[front[1] * S + front[0]] = 120;
    // Spy on the counter the pass resets: read it through a level decision that keeps it.
    const seen: number[] = [];
    const real = Object.getOwnPropertyDescriptor(b.counters, 'customersToday');
    expect(real).toBeDefined();
    let value = 0;
    Object.defineProperty(b.counters, 'customersToday', {
      get: () => value,
      set: (v: number) => {
        seen.push(v);
        value = v;
      },
    });
    levels.tick(s, createTickCtx(s));
    expect(seen[0]).toBe(120 / 2 / P.stepsPerCustomer);
  });
});
