import { describe, expect, it } from 'vitest';
import { BuildingStatus, PENNIES_PER_COIN, TICKS_PER_HOUR } from '../../src/constants';
import type { BuildingView } from '../../src/contracts';
import { TREE_SPECIES, treeValue } from '../../src/map/layers';
import { findById } from '../../src/state/entities';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run, S } from '../helpers';
import { building, everyoneToWork, good, stockOf, ticks, ticksUntil, untilHour } from './helpers';

const H = TICKS_PER_HOUR;

function siteStages(events: ReturnType<typeof ticks>, id: number): (number | 'built')[] {
  const out: (number | 'built')[] = [];
  for (const e of events) {
    if (e.e !== 'building.updated' || e.b.id !== id) continue;
    const v: BuildingView = e.b;
    const s = v.stage === 'built' ? 'built' : v.rt!.construction!.stage;
    if (out[out.length - 1] !== s) out.push(s);
  }
  return out;
}

describe('placing a site', () => {
  it('charges the coin cost at placement and records it', () => {
    const f = hamletFixture();
    const before = f.state.economy.treasury;
    const ctx = run(f.state, { t: 'build.place', def: 'cottage', x: 52, z: 51, rot: 2 });
    expect(rejection(ctx)).toBeUndefined();
    const site = f.state.buildings[f.state.buildings.length - 1]!;
    expect(before - f.state.economy.treasury).toBe(20 * PENNIES_PER_COIN);
    expect(site.rt!.construction!.paid).toBe(20 * PENNIES_PER_COIN);
    expect(f.state.economy.today.money[4]).toBe(20 * PENNIES_PER_COIN);
    expect(ctx.events.some((e) => e.e === 'budget.updated')).toBe(true);
  });

  it('refuses what the treasury cannot cover, and anything in lean times', () => {
    const f = hamletFixture();
    f.state.economy.treasury = 10 * PENNIES_PER_COIN;
    expect(rejection(run(f.state, { t: 'build.place', def: 'cottage', x: 52, z: 51, rot: 2 }))).toBe(
      'CANNOT_AFFORD',
    );
    expect(rejection(run(f.state, { t: 'build.place', def: 'well', x: 80, z: 52, rot: 0 }))).toBeUndefined();
    f.state.economy.treasury = -1;
    f.state.economy.leanTimes = true;
    expect(rejection(run(f.state, { t: 'build.place', def: 'well', x: 82, z: 52, rot: 0 }))).toBe(
      'LEAN_TIMES',
    );
    expect(rejection(run(f.state, { t: 'road.paint', kind: 'path', tiles: [[82, 53]] }))).toBe('LEAN_TIMES');
  });

  it('turns trees cleared off a site into logs, for the site first', () => {
    const f = hamletFixture();
    const store = building(f.state, f.b.storehouse);
    const oak = treeValue(TREE_SPECIES.oak, 3);
    // Three mature trees and a sapling under a woodcutter's hut that needs 12 logs.
    for (const [x, z] of [
      [120, 60],
      [121, 60],
      [120, 61],
    ]) {
      f.state.map.tree[z! * S + x!] = oak;
    }
    f.state.map.tree[61 * S + 121] = treeValue(TREE_SPECIES.oak, 1);
    run(f.state, { t: 'build.place', def: 'woodcutter', x: 120, z: 60, rot: 0 });
    const hut = f.state.buildings[f.state.buildings.length - 1]!;
    expect(hut.rt!.construction!.delivered[good('logs')]).toBe(6);
    expect(hut.rt!.construction!.needs[good('logs')]).toBe(6);
    // A cottage needs no logs: its two trees go to the storehouse.
    f.state.map.tree[60 * S + 52] = oak;
    f.state.map.tree[61 * S + 53] = oak;
    run(f.state, { t: 'build.place', def: 'cottage', x: 52, z: 60, rot: 2 });
    expect(stockOf(store, 'store', 'logs')).toBe(44);
    expect(f.state.economy.today.produced[good('logs')]).toBe(10);
  });

  it('charges roads per new tile in standard valleys', () => {
    const f = hamletFixture();
    const before = f.state.economy.treasury;
    run(f.state, {
      t: 'road.paint',
      kind: 'lane',
      tiles: [
        [90, 50],
        [91, 50],
        [92, 50],
      ],
    });
    // (90, 50) was already lane: two new tiles at 2 coins.
    expect(before - f.state.economy.treasury).toBe(4 * PENNIES_PER_COIN);
  });
});

describe('building a site', () => {
  it('gets materials from porters and work from builders, through the four stages in order', () => {
    const f = hamletFixture();
    run(f.state, { t: 'build.place', def: 'cottage', x: 52, z: 51, rot: 2 });
    const site = f.state.buildings[f.state.buildings.length - 1]!;
    const store = building(f.state, f.b.storehouse);
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    const events = ticks(f.state, 6 * H);
    expect(site.stage).toBe('built');
    expect(site.rt!.construction).toBeNull();
    expect(stockOf(store, 'store', 'planks')).toBe(10);
    expect(stockOf(store, 'store', 'stone')).toBe(12);
    // Stages only ever move forward, and every visible one shows (stage 0 may pass before the
    // first update when porters are quick).
    const stages = siteStages(events, site.id);
    expect(stages.filter((x) => x !== 0)).toEqual([1, 2, 3, 'built']);
    expect(events.some((e) => e.e === 'notify' && e.kind === 'built')).toBe(true);
    expect(f.state.economy.today.consumed[good('planks')]).toBe(20);
    // Builders go back to the town hall when the work is done.
    for (const id of building(f.state, f.b.townHall).rt!.workers) {
      expect(findById(f.state.residents, id)!.activity.kind).toBe('work');
    }
  });

  it('keeps work in step with deliveries: no frame without the planks', () => {
    const f = hamletFixture();
    const store = building(f.state, f.b.storehouse);
    store.rt!.store[good('planks')] = 4;
    run(f.state, { t: 'build.place', def: 'cottage', x: 52, z: 51, rot: 2 });
    const site = f.state.buildings[f.state.buildings.length - 1]!;
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticks(f.state, 4 * H);
    const c = site.rt!.construction!;
    // 4 planks and 8 stone of 28 units: work stops at 12/28 of 8 builder-hours.
    expect(c.delivered[good('planks')]).toBe(4);
    expect(c.workDone).toBe(Math.floor((8 * H * 12) / 28));
    expect(site.rt!.status & BuildingStatus.waitingMaterials).toBeTruthy();
  });

  it('serves a raised site first', () => {
    const f = hamletFixture();
    run(f.state, { t: 'build.place', def: 'cottage', x: 52, z: 51, rot: 2 });
    run(f.state, { t: 'build.place', def: 'well', x: 47, z: 52, rot: 0 });
    const well = f.state.buildings[f.state.buildings.length - 1]!;
    run(f.state, { t: 'build.setPriority', id: well.id, priority: true });
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticks(f.state, 6);
    expect(f.state.logistics.jobs[0]!.to).toBe(well.id);
    const builders = building(f.state, f.b.townHall).rt!.workers.map((id) =>
      findById(f.state.residents, id)!,
    );
    ticksUntil(f.state, () =>
      builders.every((r) => r.activity.kind === 'task' && r.activity.taskId === -well.id),
    );
    expect(builders.every((r) => r.activity.kind === 'task' && r.activity.taskId === -well.id)).toBe(true);
    ticks(f.state, 3 * H);
    expect(well.stage).toBe('built');
  });

  it('refunds coins and delivered materials when a site is cancelled', () => {
    const f = hamletFixture();
    const store = building(f.state, f.b.storehouse);
    run(f.state, { t: 'build.place', def: 'cottage', x: 52, z: 51, rot: 2 });
    const site = f.state.buildings[f.state.buildings.length - 1]!;
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticksUntil(f.state, () => site.rt!.construction!.delivered[good('planks')]! > 0);
    const delivered = site.rt!.construction!.delivered[good('planks')]!;
    expect(delivered).toBeGreaterThan(0);
    const treasury = f.state.economy.treasury;
    run(f.state, { t: 'build.remove', ids: [site.id] });
    expect(f.state.economy.treasury - treasury).toBe(20 * PENNIES_PER_COIN);
    ticksUntil(f.state, (st) => st.logistics.jobs.length === 0);
    expect(f.state.logistics.jobs).toHaveLength(0);
    const planks = stockOf(store, 'store', 'planks');
    expect(planks).toBe(30);
    expect(store.rt!.reservedOut.every((n) => n === 0)).toBe(true);
  });

  it('returns a removed building’s stock to the storehouse', () => {
    const f = hamletFixture();
    const store = building(f.state, f.b.storehouse);
    run(f.state, { t: 'build.remove', ids: [f.b.stall] });
    expect(stockOf(store, 'store', 'bread')).toBe(26);
    expect(stockOf(store, 'store', 'vegetables')).toBe(24);
  });

  it('repairs worn buildings when there is nothing to build', () => {
    const f = hamletFixture();
    const bakery = building(f.state, f.b.bakery);
    bakery.rt!.condition = 80;
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticks(f.state, 2 * H);
    expect(bakery.rt!.condition).toBe(100);
  });
});
