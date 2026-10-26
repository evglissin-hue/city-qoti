import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { BuildingStatus, MAP_SIZE, STALL_RESTOCK_TARGET, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { JobClass } from '../../src/systems/logistics';
import { nearestOutletWithFood, outletFood, takeFromOutlet } from '../../src/systems/economy/outlets';
import { hamletFixture } from '../fixtures/hamlet';
import { run } from '../helpers';
import {
  building,
  everyoneToWork,
  good,
  stockOf,
  ticks,
  ticksUntil,
  untilHour,
  withoutStall,
} from './helpers';

const H = TICKS_PER_HOUR;

function place(state: WorldState, def: string, x: number, z: number, rot: 0 | 1 | 2 | 3 = 0): Building {
  return insertBuilding(state, null, content.buildingById.get(def)!, x, z, rot, 0, { site: false });
}

/**
 * The fixture without its market stall (in porter range since the C3X range of 24, and these tests
 * are about the other job classes), at 08:00 with everyone at work; the first porter match runs 5
 * ticks later.
 */
function morning() {
  const f = withoutStall();
  untilHour(f.state, 8);
  everyoneToWork(f.state);
  return f;
}

describe('porter matching', () => {
  it('never books the same units twice', () => {
    const f = morning();
    ticks(f.state, 5);
    const mill = building(f.state, f.b.windmill);
    const store = building(f.state, f.b.storehouse);
    const jobs = f.state.logistics.jobs.filter((j) => j.to === mill.id);
    // The windmill wants two cycles of wheat (6); two porters share it, 4 and 2.
    expect(jobs.map((j) => j.qty)).toEqual([4, 2]);
    expect(mill.rt!.reservedIn[good('wheat')]).toBe(6);
    expect(store.rt!.reservedOut[good('wheat')]).toBe(6);
    // Porters walk now (C3A): wait for both trips to land.
    ticksUntil(f.state, (s) => !s.logistics.jobs.some((j) => j.to === mill.id));
    expect(stockOf(mill, 'input', 'wheat')).toBe(6);
    expect(mill.rt!.reservedIn[good('wheat')]).toBe(0);
    expect(store.rt!.reservedOut[good('wheat')]).toBe(0);
    expect(stockOf(store, 'store', 'wheat')).toBe(6);
  });

  it('feeds market stalls before production inputs, varying the food', () => {
    const f = withoutStall();
    const stall = place(f.state, 'market-stall', 48, 51, 2);
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticks(f.state, 5);
    const jobs = f.state.logistics.jobs;
    expect(jobs.every((j) => j.to === stall.id && j.priority === JobClass.stallFood)).toBe(true);
    expect(new Set(jobs.map((j) => j.good)).size).toBe(2);
    ticks(f.state, 2 * H);
    let food = 0;
    for (let g = 0; g < content.goods.length; g++) if (content.goods[g]!.food) food += stall.rt!.store[g]!;
    expect(food).toBe(STALL_RESTOCK_TARGET);
    expect(outletFood(f.state, stall.id)).toBe(STALL_RESTOCK_TARGET);
  });

  it('serves raised construction before everything else', () => {
    const f = withoutStall();
    run(f.state, { t: 'build.place', def: 'well', x: 47, z: 52, rot: 0 });
    const well = f.state.buildings[f.state.buildings.length - 1]!;
    run(f.state, { t: 'build.setPriority', id: well.id, priority: true });
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticks(f.state, 5);
    expect(f.state.logistics.jobs.map((j) => [j.to, j.priority])).toEqual([
      [well.id, JobClass.prioritySite],
      [well.id, JobClass.prioritySite],
    ]);
  });

  it('clears full output buffers into the storehouse', () => {
    const f = withoutStall();
    const store = building(f.state, f.b.storehouse);
    store.rt!.store[good('wheat')] = 0;
    const bakery = building(f.state, f.b.bakery);
    bakery.rt!.output[good('bread')] = 8;
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticks(f.state, 5);
    expect(f.state.logistics.jobs.map((j) => [j.from, j.to, j.priority])).toEqual([
      [bakery.id, store.id, JobClass.clearing],
      [bakery.id, store.id, JobClass.clearing],
    ]);
    ticksUntil(f.state, (s) => s.logistics.jobs.length === 0);
    expect(stockOf(bakery, 'output', 'bread')).toBe(0);
    // 16 from the start, 10 back from the removed stall, 8 from the bakery.
    expect(stockOf(store, 'store', 'bread')).toBe(34);
    expect(f.state.logistics.flows).toEqual([[bakery.id, store.id, 8]]);
  });

  it('leaves buildings beyond 24 tiles of a storehouse alone, marked "no porters"', () => {
    const f = hamletFixture();
    run(f.state, { t: 'build.place', def: 'cottage', x: 84, z: 48, rot: 0 });
    const far = f.state.buildings[f.state.buildings.length - 1]!;
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticks(f.state, H);
    expect(f.state.logistics.jobs.some((j) => j.to === far.id)).toBe(false);
    expect(far.rt!.construction!.delivered.every((n) => n === 0)).toBe(true);
    expect(far.rt!.status & BuildingStatus.noPorters).toBeTruthy();
    // The fixture's stall sits 24 tiles from the storehouse door: just in reach.
    expect(building(f.state, f.b.stall).rt!.status & BuildingStatus.noPorters).toBeFalsy();
    expect(building(f.state, f.b.windmill).rt!.status & BuildingStatus.noPorters).toBeFalsy();
  });

  it('hands porters back when the work day ends', () => {
    const f = morning();
    untilHour(f.state, 17);
    ticks(f.state, 30);
    expect(f.state.logistics.jobs).toHaveLength(0);
    for (const id of building(f.state, f.b.storehouse).rt!.workers) {
      expect(findById(f.state.residents, id)!.activity.kind).toBe('work');
    }
  });
});

describe('outlets', () => {
  it('sends shoppers to a stall in reach, else to the nearest storehouse', () => {
    const f = hamletFixture();
    expect(nearestOutletWithFood(f.state, 50 * MAP_SIZE + 72)).toBe(f.b.stall);
    expect(nearestOutletWithFood(f.state, 50 * MAP_SIZE + 52)).toBe(f.b.storehouse);
    const stall = building(f.state, f.b.stall);
    stall.rt!.store.fill(0);
    expect(nearestOutletWithFood(f.state, 50 * MAP_SIZE + 72)).toBe(f.b.storehouse);
  });

  it('never hands out goods a porter has been promised', () => {
    const f = hamletFixture();
    const stall = building(f.state, f.b.stall);
    stall.rt!.reservedOut[good('bread')] = 8;
    expect(takeFromOutlet(f.state, stall.id, good('bread'), 4)).toBe(2);
    expect(outletFood(f.state, stall.id)).toBe(8);
  });
});
