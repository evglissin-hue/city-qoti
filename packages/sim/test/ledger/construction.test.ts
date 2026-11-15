import { describe, expect, it } from 'vitest';
import {
  BUILD_EFFORT,
  BuildingStatus,
  LEDGER_CATEGORIES,
  PENNIES_PER_COIN,
  TICKS_PER_HOUR,
} from '../../src/constants';
import type { BuildingView } from '../../src/contracts';
import { TREE_SPECIES, treeValue } from '../../src/map/layers';
import { findById } from '../../src/state/entities';
import { familyIndex } from '../../src/state/zones';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run, S } from '../helpers';
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
    const construction = LEDGER_CATEGORIES.findIndex((c) => c.id === 'construction');
    expect(f.state.economy.today.money[construction]).toBe(20 * PENNIES_PER_COIN);
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

  it('turns trees cleared off a site into timber, for the site first', () => {
    const f = hamletFixture();
    const store = building(f.state, f.b.storehouse);
    const oak = treeValue(TREE_SPECIES.oak, 3);
    // Three mature trees and a sapling under a Forester's Lodge that needs 12 timber, on the town's
    // side of the river (across it, with no bridge, the site would be cut off).
    for (const [x, z] of [
      [70, 55],
      [71, 55],
      [70, 56],
    ]) {
      f.state.map.tree[z! * S + x!] = oak;
    }
    f.state.map.tree[56 * S + 71] = treeValue(TREE_SPECIES.oak, 1);
    // The lodge wants twelve mature trees within eight tiles: a stand of them just south of the site.
    for (let x = 66; x < 78; x++) f.state.map.tree[61 * S + x] = oak;
    expect(rejection(run(f.state, { t: 'build.place', def: 'foresters-lodge', x: 70, z: 55, rot: 0 }))).toBe(
      undefined,
    );
    const hut = f.state.buildings[f.state.buildings.length - 1]!;
    expect(hut.def).toBe('foresters-lodge');
    expect(hut.rt!.construction!.delivered[good('timber')]).toBe(6);
    expect(hut.rt!.construction!.needs[good('timber')]).toBe(6);
    // A well needs no timber: its tree goes to the storehouse.
    f.state.map.tree[60 * S + 52] = oak;
    run(f.state, { t: 'build.place', def: 'well', x: 52, z: 60, rot: 0 });
    expect(stockOf(store, 'store', 'timber')).toBe(72);
    expect(f.state.economy.today.produced[good('timber')]).toBe(8);
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
    const f = withoutStall();
    run(f.state, { t: 'build.place', def: 'cottage', x: 52, z: 51, rot: 2 });
    const site = f.state.buildings[f.state.buildings.length - 1]!;
    const store = building(f.state, f.b.storehouse);
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    const events = ticks(f.state, 6 * H);
    expect(site.stage).toBe('built');
    expect(site.rt!.construction).toBeNull();
    expect(stockOf(store, 'store', 'timber')).toBe(70 - 16);
    expect(stockOf(store, 'store', 'stone')).toBe(20 - 6);
    // Stages only ever move forward, and every visible one shows (stage 0 may pass before the
    // first update when porters are quick).
    const stages = siteStages(events, site.id);
    expect(stages.filter((x) => x !== 0)).toEqual([1, 2, 3, 'built']);
    expect(events.some((e) => e.e === 'notify' && e.kind === 'built')).toBe(true);
    expect(f.state.economy.today.consumed[good('timber')]).toBe(16);
    // Builders go back to the town hall when the work is done.
    for (const id of building(f.state, f.b.townHall).rt!.workers) {
      expect(findById(f.state.residents, id)!.activity.kind).toBe('work');
    }
  });

  it('keeps work in step with deliveries: no frame without the timber', () => {
    const f = withoutStall();
    const store = building(f.state, f.b.storehouse);
    store.rt!.store[good('timber')] = 4;
    // R1: the carrier buys Materials a site waits for; here it stays home, so the timber runs short.
    f.state.carrier.families[familyIndex('materials')]!.rule = 'never';
    run(f.state, { t: 'build.place', def: 'cottage', x: 52, z: 51, rot: 2 });
    const site = f.state.buildings[f.state.buildings.length - 1]!;
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticks(f.state, 4 * H);
    const c = site.rt!.construction!;
    // 4 timber and 6 stone of 22 units: work stops at 10/22 of the cottage's builder-hours.
    expect(c.delivered[good('timber')]).toBe(4);
    expect(c.workDone).toBe(Math.floor((c.work * 10) / 22));
    expect(c.work).toBe(Math.round(8 * H * BUILD_EFFORT));
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
    ticksUntil(f.state, () => site.rt!.construction!.delivered[good('timber')]! > 0);
    const delivered = site.rt!.construction!.delivered[good('timber')]!;
    expect(delivered).toBeGreaterThan(0);
    const treasury = f.state.economy.treasury;
    run(f.state, { t: 'build.remove', ids: [site.id] });
    expect(f.state.economy.treasury - treasury).toBe(20 * PENNIES_PER_COIN);
    ticksUntil(f.state, (st) => st.logistics.jobs.length === 0);
    expect(f.state.logistics.jobs).toHaveLength(0);
    expect(stockOf(store, 'store', 'timber')).toBe(70);
    expect(store.rt!.reservedOut.every((n) => n === 0)).toBe(true);
  });

  it('returns a removed building’s stock to the nearest store (here the granary)', () => {
    const f = hamletFixture();
    const store = building(f.state, f.b.granary);
    run(f.state, { t: 'build.remove', ids: [f.b.stall] });
    expect(stockOf(store, 'store', 'bread')).toBe(16 + 10);
    expect(stockOf(store, 'store', 'vegetables')).toBe(16 + 8);
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
