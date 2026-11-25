// R3B, level 3 and the grace (13-ledger.md, Levels; 19-evenings.md, Masters: losing one): level 3
// needs a master of the trade on the crew; a migrated level 3 holds (`levelKept`) until a master
// works there; with the master gone a business keeps its level six days and then slides one level.
import { MASTERY } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, ResidentFlags, TICKS_PER_DAY } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { entranceTiles } from '../../src/rules/footprint';
import { content } from '@qoti/content';
import { emptyCounters } from '../../src/state/zones';
import { levels, LEVEL_UP_DAYS } from '../../src/systems/levels';
import { release } from '../../src/systems/residents/jobs';
import { createTickCtx } from '../../src/turn';
import { masterWorld, res, today } from './masterFixture';

const GOOD = { madeToday: 10, soldToday: 9 };

function frontOf(b: Building): number {
  const def = content.buildingById.get(b.def)!;
  const { front } = entranceTiles(def, b.x, b.z, b.rot);
  return front[1] * MAP_SIZE + front[0];
}

/** One good day at 23:30, then the day turns over. */
function goodDay(state: WorldState, b: Building): void {
  b.counters ??= emptyCounters();
  Object.assign(b.counters, { customersToday: 0, shortToday: false, ...GOOD });
  levels.tick(state, createTickCtx(state));
  state.tick += TICKS_PER_DAY;
}

function makeMaster(state: WorldState, id: number): void {
  const r = res(state, id);
  r.flags |= ResidentFlags.master;
  r.mastery = 'baker';
}

describe('level 3 and the grace', () => {
  it('level 3 needs a master on the crew, and a street at the door', () => {
    const { state, bakery, crew } = masterWorld();
    state.map.road[frontOf(bakery)] = Road.lane;
    for (let d = 0; d < 6; d++) goodDay(state, bakery);
    expect(bakery.level).toBe(2);
    state.map.road[frontOf(bakery)] = Road.street;
    // The keeper's days no longer open level 3.
    bakery.counters!.keeperDays = 40;
    for (let d = 0; d < 6; d++) goodDay(state, bakery);
    expect(bakery.level).toBe(2);
    makeMaster(state, crew[1]!);
    for (let d = 0; d < LEVEL_UP_DAYS; d++) goodDay(state, bakery);
    expect(bakery.level).toBe(3);
  });

  it('a migrated level 3 holds without a master until one works there', () => {
    const { state, bakery, crew } = masterWorld();
    bakery.level = 3;
    state.map.road[frontOf(bakery)] = Road.street;
    bakery.counters = { ...emptyCounters(), levelKept: true };
    for (let d = 0; d < MASTERY.graceDays + 4; d++) goodDay(state, bakery);
    expect(bakery.level).toBe(3);
    expect(bakery.counters!.masterGone).toBeUndefined();
    expect(bakery.counters!.levelKept).toBe(true);
    makeMaster(state, crew[1]!);
    goodDay(state, bakery);
    expect(bakery.counters!.levelKept).toBeUndefined();
    // Now it needs the master like any level 3.
    release(state, res(state, crew[1]!));
    goodDay(state, bakery);
    expect(bakery.counters!.masterGone).toBe(today(state) - 1);
  });

  it('keeps its level six days after the master leaves, then slides one level and trims the crew', () => {
    const { state, bakery, crew } = masterWorld(3);
    bakery.level = 3;
    state.map.road[frontOf(bakery)] = Road.street;
    makeMaster(state, crew[1]!);
    goodDay(state, bakery);
    expect(bakery.counters!.masterGone).toBeUndefined();
    release(state, res(state, crew[1]!));
    const gone = today(state);
    for (let d = 0; d < MASTERY.graceDays; d++) {
      expect(bakery.level, `day ${d}`).toBe(3);
      goodDay(state, bakery);
      if (d === 0) expect(bakery.counters!.masterGone).toBe(gone);
    }
    // Six days kept (the day it left and the five after); the seventh pass slides it.
    expect(bakery.level).toBe(3);
    goodDay(state, bakery);
    expect(bakery.level).toBe(2);
    expect(bakery.counters!.masterGone).toBeUndefined();
    expect(bakery.counters!.levelDays).toBe(0);
    expect(bakery.rt!.workers.length).toBeLessThanOrEqual(content.tradeById.get('baker')!.crew[1]!);
  });

  it('a master back within the grace clears the clock', () => {
    const { state, bakery, crew } = masterWorld();
    bakery.level = 3;
    state.map.road[frontOf(bakery)] = Road.street;
    makeMaster(state, crew[1]!);
    const r = res(state, crew[1]!);
    release(state, r);
    for (let d = 0; d < 3; d++) goodDay(state, bakery);
    expect(bakery.counters!.masterGone).toBeDefined();
    bakery.rt!.workers.push(r.id);
    r.jobId = bakery.id;
    goodDay(state, bakery);
    expect(bakery.counters!.masterGone).toBeUndefined();
    for (let d = 0; d < 8; d++) goodDay(state, bakery);
    expect(bakery.level).toBe(3);
  });

  it('below level 3 nothing is kept or missed', () => {
    const { state, bakery } = masterWorld();
    bakery.level = 2;
    state.map.road[frontOf(bakery)] = Road.lane;
    bakery.counters = { ...emptyCounters(), levelKept: true, masterGone: 3 };
    goodDay(state, bakery);
    expect(bakery.counters!.levelKept).toBeUndefined();
    expect(bakery.counters!.masterGone).toBeUndefined();
  });
});
