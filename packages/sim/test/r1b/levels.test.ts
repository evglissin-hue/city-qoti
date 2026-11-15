// R1B levels (docs/spec/13-ledger.md, Levels): up after three good days, down after four failing
// ones, out-of-season days count neither, room to grow, the keeper's days for level 3, and a crew
// that grows with the level. The levels system's day end is run directly, so the rest of the town
// stays out of it.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, MAP_SIZE, TICKS_PER_DAY } from '../../src/constants';
import type { Building, BusinessCounters, WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { entranceTiles } from '../../src/rules/footprint';
import { findById } from '../../src/state/entities';
import { emptyCounters, jobsOf } from '../../src/state/zones';
import { levels, LEVEL_DOWN_DAYS, LEVEL_UP_DAYS } from '../../src/systems/levels';
import { outOfSeason } from '../../src/systems/levels/season';
import { crewWork } from '../../src/systems/production';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { building, hire, toWork } from '../ledger/helpers';
import { place } from '../village/helpers';

/** A baker's business at level 1 with its lane at the door, in the hamlet fixture. */
function bakery(): { state: WorldState; b: Building } {
  const { state, b } = hamletFixture();
  const bk = building(state, b.bakery);
  bk.counters = emptyCounters();
  return { state, b: bk };
}

/** The tile in front of a business's door. */
function frontOf(b: Building): number {
  const def = content.buildingById.get(b.def)!;
  const { front } = entranceTiles(def, b.x, b.z, b.rot);
  return front[1] * MAP_SIZE + front[0];
}

/** A day's counters, then the 23:30 pass. */
function endDay(state: WorldState, b: Building, today: Partial<BusinessCounters>): void {
  Object.assign((b.counters ??= emptyCounters()), {
    madeToday: 0,
    soldToday: 0,
    customersToday: 0,
    shortToday: false,
    ...today,
  });
  levels.tick(state, createTickCtx(state));
}

const GOOD = { madeToday: 10, soldToday: 9 };
const FAILING = { madeToday: 10, soldToday: 0 };

function atSeason(state: WorldState, season: number): void {
  state.tick = (season * DAYS_PER_SEASON + 1) * TICKS_PER_DAY;
}

describe('levels', () => {
  it('moves up after three good days and not after two', () => {
    const { state, b } = bakery();
    state.map.road[frontOf(b)] = Road.lane;
    for (let d = 1; d < LEVEL_UP_DAYS; d++) endDay(state, b, GOOD);
    expect(b.level ?? 1).toBe(1);
    expect(b.counters!.levelDays).toBe(LEVEL_UP_DAYS - 1);
    endDay(state, b, GOOD);
    expect(b.level).toBe(2);
    expect(b.counters!.levelDays).toBe(0);
  });

  it('resets the day counters and a day that is not good starts the count again', () => {
    const { state, b } = bakery();
    state.map.road[frontOf(b)] = Road.lane;
    endDay(state, b, GOOD);
    endDay(state, b, GOOD);
    endDay(state, b, { madeToday: 10, soldToday: 3 });
    expect(b.counters!.levelDays).toBe(0);
    expect(b.counters!.madeToday).toBe(0);
    expect(b.counters!.soldToday).toBe(0);
    expect(b.level ?? 1).toBe(1);
  });

  it('a day short of its raw good is not a good day', () => {
    const { state, b } = bakery();
    state.map.road[frontOf(b)] = Road.lane;
    for (let d = 0; d < 5; d++) endDay(state, b, { ...GOOD, shortToday: true });
    expect(b.level ?? 1).toBe(1);
  });

  it('slides down after four failing days, keeping its walls and trimming the crew', () => {
    const { state, b } = bakery();
    b.level = 2;
    hire(state, b.id, 1);
    expect(b.rt!.workers).toHaveLength(2);
    for (let d = 1; d < LEVEL_DOWN_DAYS; d++) endDay(state, b, FAILING);
    expect(b.level).toBe(2);
    expect(b.counters!.levelDays).toBe(-(LEVEL_DOWN_DAYS - 1));
    endDay(state, b, FAILING);
    expect(b.level).toBe(1);
    expect(b.counters!.levelDays).toBe(0);
    expect(b.rt!.workers).toHaveLength(jobsOf(b));
    expect(b.stage).toBe('built');
  });

  it('level 1 never slides', () => {
    const { state, b } = bakery();
    for (let d = 0; d < 8; d++) endDay(state, b, FAILING);
    expect(b.level ?? 1).toBe(1);
    expect(b.counters!.levelDays).toBe(0);
  });

  it('days out of season neither fail nor count', () => {
    const { state } = hamletFixture();
    const cider = place(state, 'workshop', 60, 30, 0, 'cider-maker');
    cider.level = 2;
    cider.counters = { ...emptyCounters(), levelDays: -3, keeperDays: 7 };
    atSeason(state, 3);
    expect(outOfSeason(state, cider)).toBe(true);
    for (let d = 0; d < 6; d++) endDay(state, cider, { madeToday: 4, soldToday: 0, shortToday: true });
    expect(cider.level).toBe(2);
    expect(cider.counters!.levelDays).toBe(-3);
    expect(cider.counters!.keeperDays).toBe(7);
    expect(cider.counters!.shortToday).toBe(false);
    // In season again the same days count.
    atSeason(state, 1);
    expect(outOfSeason(state, cider)).toBe(false);
    endDay(state, cider, FAILING);
    expect(cider.level).toBe(1);
  });

  it('knows what is out of season by good: winter for fruit, honey, vegetables and fields', () => {
    const { state } = hamletFixture();
    const orchard = place(state, 'farmstead', 60, 30, 0, 'orchard');
    const farm = place(state, 'farmstead', 66, 30, 0, 'grain-farm');
    const baker = place(state, 'workshop', 72, 30, 0, 'baker');
    const sheep = place(state, 'farmstead', 78, 30, 0, 'sheep-run');
    atSeason(state, 1);
    expect([orchard, farm, baker, sheep].map((x) => outOfSeason(state, x))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    atSeason(state, 3);
    expect([orchard, farm, baker, sheep].map((x) => outOfSeason(state, x))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('room to grow: a path at the door holds a workshop at level 1, a lane lets it up', () => {
    const { state, b } = bakery();
    state.map.road[frontOf(b)] = Road.path;
    for (let d = 0; d < 6; d++) endDay(state, b, GOOD);
    expect(b.level ?? 1).toBe(1);
    state.map.road[frontOf(b)] = Road.lane;
    for (let d = 0; d < LEVEL_UP_DAYS; d++) endDay(state, b, GOOD);
    expect(b.level).toBe(2);
  });

  it('level 3 needs a street at the door and the keeper’s 20 working days', () => {
    const { state, b } = bakery();
    b.level = 2;
    state.map.road[frontOf(b)] = Road.lane;
    for (let d = 0; d < 6; d++) endDay(state, b, GOOD);
    expect(b.level).toBe(2);
    state.map.road[frontOf(b)] = Road.street;
    for (let d = 0; d < 6; d++) endDay(state, b, GOOD);
    expect(b.level).toBe(2);
    b.counters!.keeperDays = 20;
    for (let d = 0; d < LEVEL_UP_DAYS; d++) endDay(state, b, GOOD);
    expect(b.level).toBe(3);
  });

  it('the keeper’s days count only when the keeper is on the crew and the business did something', () => {
    const { state, b } = bakery();
    b.keeperId = b.rt!.workers[0]!;
    endDay(state, b, GOOD);
    endDay(state, b, {});
    expect(b.counters!.keeperDays).toBe(1);
    b.keeperId = 999999;
    endDay(state, b, GOOD);
    expect(b.counters!.keeperDays).toBe(1);
    expect(b.keeperId).toBe(0);
  });

  it('a shop climbs on customers: 6 a day for level 2', () => {
    const { state } = hamletFixture();
    const shop = place(state, 'corner-shop', 60, 30, 0, 'shop');
    state.map.road[frontOf(shop)] = Road.lane;
    for (let d = 0; d < 5; d++) endDay(state, shop, { customersToday: 5 });
    expect(shop.level ?? 1).toBe(1);
    for (let d = 0; d < LEVEL_UP_DAYS; d++) endDay(state, shop, { customersToday: 6 });
    expect(shop.level).toBe(2);
    // At level 2 five customers a day is failing.
    for (let d = 0; d < LEVEL_DOWN_DAYS; d++) endDay(state, shop, { customersToday: 5 });
    expect(shop.level).toBe(1);
  });

  it('a farmstead needs free farm-zoned ground in reach for the larger crew', () => {
    const { state } = hamletFixture();
    const farm = place(state, 'farmstead', 60, 30, 0, 'market-garden');
    for (let d = 0; d < 5; d++) endDay(state, farm, GOOD);
    expect(farm.level ?? 1).toBe(1);
    // One more hand wants six free tiles for a market garden.
    for (let z = 36; z < 38; z++) for (let x = 60; x < 63; x++) state.map.zone[z * MAP_SIZE + x] = 5;
    for (let d = 0; d < LEVEL_UP_DAYS; d++) endDay(state, farm, GOOD);
    expect(farm.level).toBe(2);
  });

  it('the crew grows with the level and production speeds up with it', () => {
    const { state, b } = bakery();
    const def = content.buildingById.get(b.def)!;
    const method = content.tradeById.get('baker')!.method!;
    expect([1, 2, 3].map((l) => jobsOf({ ...b, level: l }))).toEqual([1, 2, 4]);
    hire(state, b.id, 3);
    toWork(state, b.rt!.workers);
    const at1 = crewWork(state, b, def, b.rt!, method);
    b.level = 2;
    const at2 = crewWork(state, b, def, b.rt!, method);
    b.level = 3;
    const at3 = crewWork(state, b, def, b.rt!, method);
    expect(at2).toBe(at1 * 2);
    expect(at3).toBe(at1 * 4);
    expect(findById(state.buildings, b.id)).toBe(b);
  });
});
