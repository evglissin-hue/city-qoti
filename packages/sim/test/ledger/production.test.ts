import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { BuildingStatus, MAP_SIZE, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { TREE_SPECIES, treeStage, treeValue } from '../../src/map/layers';
import { insertBuilding } from '../../src/state/place';
import { CROP_RIPE, CROP_STEP_TICKS, CROP_YIELD } from '../../src/systems/production/fields';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run, S } from '../helpers';
import { building, good, hire, stockOf, ticks, toWork } from './helpers';

const H = TICKS_PER_HOUR;

function place(state: WorldState, def: string, x: number, z: number): Building {
  return insertBuilding(state, null, content.buildingById.get(def)!, x, z, 0, 0, { site: false });
}

function fertile(state: WorldState, x0: number, z0: number, x1: number, z1: number, f = 60): void {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) state.map.fertility[z * S + x] = f;
}

describe('crafting', () => {
  it('saws 2 logs into 3 planks every 2 hours with the full crew', () => {
    const f = hamletFixture();
    const sawpit = building(f.state, f.b.sawpit);
    toWork(f.state, hire(f.state, sawpit.id, 2));
    ticks(f.state, 2 * H);
    expect(stockOf(sawpit, 'output', 'planks')).toBe(3);
    expect(stockOf(sawpit, 'input', 'logs')).toBe(2);
    expect(f.state.economy.today.produced[good('planks')]).toBe(3);
    expect(f.state.economy.today.consumed[good('logs')]).toBe(2);
  });

  it('takes twice as long with half the crew', () => {
    const f = hamletFixture();
    const sawpit = building(f.state, f.b.sawpit);
    toWork(f.state, hire(f.state, sawpit.id, 1));
    ticks(f.state, 2 * H);
    expect(stockOf(sawpit, 'output', 'planks')).toBe(0);
    ticks(f.state, 2 * H);
    expect(stockOf(sawpit, 'output', 'planks')).toBe(3);
  });

  it('bakes 5 bread from 2 flour every 2 hours, and waits when the flour runs out', () => {
    const f = hamletFixture();
    const bakery = building(f.state, f.b.bakery);
    toWork(f.state, [...bakery.rt!.workers, ...hire(f.state, bakery.id, 1)]);
    ticks(f.state, 4 * H);
    expect(stockOf(bakery, 'output', 'bread')).toBe(10);
    expect(stockOf(bakery, 'input', 'flour')).toBe(0);
    ticks(f.state, 2 * H);
    expect(stockOf(bakery, 'output', 'bread')).toBe(10);
    expect(bakery.rt!.status & BuildingStatus.missingInput).toBeTruthy();
  });

  it('grinds 3 wheat into 2 flour an hour, 25% faster on high ground', () => {
    const low = hamletFixture();
    const mill = building(low.state, low.b.windmill);
    mill.rt!.input[good('wheat')] = 30;
    toWork(low.state, hire(low.state, mill.id, 1));
    ticks(low.state, 4 * H);
    expect(stockOf(mill, 'output', 'flour')).toBe(8);

    const high = hamletFixture();
    const hill = building(high.state, high.b.windmill);
    for (let z = hill.z; z < hill.z + 2; z++)
      for (let x = hill.x; x < hill.x + 2; x++) high.state.map.height[z * S + x] = 4;
    hill.rt!.input[good('wheat')] = 30;
    toWork(high.state, hire(high.state, hill.id, 1));
    ticks(high.state, 4 * H);
    expect(stockOf(hill, 'output', 'flour')).toBe(10);
  });

  it('stops when the output buffer is full', () => {
    const f = hamletFixture();
    const sawpit = building(f.state, f.b.sawpit);
    sawpit.rt!.input[good('logs')] = 40;
    sawpit.rt!.output[good('planks')] = 9;
    toWork(f.state, hire(f.state, sawpit.id, 2));
    ticks(f.state, 3 * H);
    expect(stockOf(sawpit, 'output', 'planks')).toBe(9);
    expect(sawpit.rt!.status & BuildingStatus.outputFull).toBeTruthy();
  });

  it('does nothing while paused', () => {
    const f = hamletFixture();
    const sawpit = building(f.state, f.b.sawpit);
    toWork(f.state, hire(f.state, sawpit.id, 2));
    run(f.state, { t: 'build.setPaused', id: sawpit.id, paused: true });
    ticks(f.state, 3 * H);
    expect(stockOf(sawpit, 'output', 'planks')).toBe(0);
    expect(sawpit.rt!.status & BuildingStatus.paused).toBeTruthy();
  });
});

describe('gathering', () => {
  it('cuts 2 stone per worker every 2 hours at the quarry', () => {
    for (const crew of [3, 1]) {
      const f = hamletFixture();
      const quarry = place(f.state, 'quarry', 120, 40);
      toWork(f.state, hire(f.state, quarry.id, crew));
      ticks(f.state, 2 * H);
      expect(stockOf(quarry, 'output', 'stone')).toBe(2 * crew);
    }
  });

  it('lands 2 fish per worker every 2 hours', () => {
    const f = hamletFixture();
    const hut = place(f.state, 'fishers-hut', 98, 70);
    toWork(f.state, hire(f.state, hut.id, 2));
    ticks(f.state, 2 * H);
    expect(stockOf(hut, 'output', 'fish')).toBe(4);
  });

  it('grows 3 vegetables every 4 hours', () => {
    const f = hamletFixture();
    const plot = place(f.state, 'vegetable-plot', 120, 60);
    toWork(f.state, hire(f.state, plot.id, 1));
    ticks(f.state, 4 * H);
    expect(stockOf(plot, 'output', 'vegetables')).toBe(3);
  });

  it('scales with mood: Glowing workers beat Miserable ones', () => {
    const output = (mood: number) => {
      const f = hamletFixture();
      const quarry = place(f.state, 'quarry', 120, 40);
      toWork(f.state, hire(f.state, quarry.id, 1, mood));
      ticks(f.state, 8 * H);
      return stockOf(quarry, 'output', 'stone');
    };
    expect(output(90)).toBe(8);
    expect(output(10)).toBe(4);
  });

  it('loses output in disrepair', () => {
    const f = hamletFixture();
    const quarry = place(f.state, 'quarry', 120, 40);
    quarry.rt!.condition = 30;
    toWork(f.state, hire(f.state, quarry.id, 1));
    ticks(f.state, 10 * H);
    // 70% speed: 7 cycles' work in 10 hours, 3 whole cycles of 2 stone.
    expect(stockOf(quarry, 'output', 'stone')).toBe(6);
  });

  it('writes the first bread into the Chronicle once', () => {
    const f = hamletFixture();
    const bakery = building(f.state, f.b.bakery);
    toWork(f.state, [...bakery.rt!.workers, ...hire(f.state, bakery.id, 1)]);
    ticks(f.state, 4 * H);
    const firsts = f.state.chronicle.filter((c) => c.kind === 'first-of');
    expect(firsts).toHaveLength(1);
    expect(firsts[0]!.text).toContain('bread');
    expect(f.state.economy.everProduced[good('bread')]).toBe(10);
  });
});

describe('forestry', () => {
  it('fells one mature tree per worker every 3 hours for 4 logs, thickest stand first', () => {
    const f = hamletFixture();
    const hut = place(f.state, 'woodcutter', 120, 80);
    const grove = [
      [124, 84],
      [125, 84],
      [124, 85],
    ];
    for (const [x, z] of grove) f.state.map.tree[z! * S + x!] = treeValue(TREE_SPECIES.oak, 3);
    f.state.map.tree[78 * S + 118] = treeValue(TREE_SPECIES.birch, 3);
    toWork(f.state, hire(f.state, hut.id, 1));
    const events = ticks(f.state, 3 * H);
    expect(stockOf(hut, 'output', 'logs')).toBe(4);
    // The lone birch by the door survives; one of the grove went.
    expect(f.state.map.tree[78 * S + 118]).not.toBe(0);
    expect(grove.filter(([x, z]) => f.state.map.tree[z! * S + x!] === 0)).toHaveLength(1);
    expect(events.some((e) => e.e === 'tiles.changed' && e.layers.includes('tree'))).toBe(true);
  });

  it('reports no trees once the woods in reach are gone', () => {
    const f = hamletFixture();
    const hut = place(f.state, 'woodcutter', 120, 80);
    f.state.map.tree[84 * S + 124] = treeValue(TREE_SPECIES.pine, 3);
    f.state.map.tree[84 * S + 127] = treeValue(TREE_SPECIES.pine, 1);
    toWork(f.state, hire(f.state, hut.id, 2));
    ticks(f.state, 5 * H);
    expect(stockOf(hut, 'output', 'logs')).toBe(4);
    expect(hut.rt!.status & BuildingStatus.noTrees).toBeTruthy();
    expect(f.state.map.tree[84 * S + 127]).not.toBe(0);
  });

  it('plants a sapling every 2 hours, beside other trees and clear of roads', () => {
    const f = hamletFixture();
    const lodge = place(f.state, 'foresters-lodge', 140, 80);
    f.state.map.tree[78 * S + 136] = treeValue(TREE_SPECIES.birch, 3);
    toWork(f.state, hire(f.state, lodge.id, 1));
    const before = countTrees(f.state);
    ticks(f.state, 6 * H);
    expect(countTrees(f.state)).toBe(before + 3);
    let saplings = 0;
    for (let z = 70; z <= 90; z++) {
      for (let x = 130; x <= 150; x++) {
        const v = f.state.map.tree[z * S + x]!;
        if (v && treeStage(v) === 0) saplings++;
      }
    }
    expect(saplings).toBe(3);
  });
});

function countTrees(state: WorldState): number {
  let n = 0;
  for (let i = 0; i < state.map.tree.length; i++) if (state.map.tree[i]) n++;
  return n;
}

describe('farms', () => {
  function farmWithFields(tiles: number, crew: number) {
    const f = hamletFixture();
    const farm = place(f.state, 'farmhouse', 130, 120);
    fertile(f.state, 124, 114, 137, 127);
    const want: [number, number][] = [];
    for (let k = 0; k < tiles; k++) want.push([125 + (k % 10), 114 + Math.floor(k / 10)]);
    expect(rejection(run(f.state, { t: 'field.paint', farm: farm.id, tiles: want }))).toBeUndefined();
    toWork(f.state, hire(f.state, farm.id, crew));
    return { f, farm };
  }

  it('grows painted fields and harvests 2 wheat per ripe tile, 12 tiles per farmer', () => {
    const { f, farm } = farmWithFields(20, 1);
    ticks(f.state, 10 * CROP_STEP_TICKS);
    const growing = () =>
      f.state.map.crop.filter((c, i) => c > 0 && f.state.map.fieldOwner[i] === farm.id).length;
    // One farmer tends the first 12 tiles; the other eight wait for help.
    expect(growing()).toBe(12);
    ticks(f.state, (Math.ceil(CROP_RIPE / 4) - 9) * CROP_STEP_TICKS);
    expect(stockOf(farm, 'output', 'wheat')).toBe(12 * CROP_YIELD);
  });

  it('works out to about one wheat per field tile per day of tending', () => {
    const { f, farm } = farmWithFields(12, 1);
    // Work days are 9 hours; 4 days of tending is 36 hours.
    let wheat = 0;
    ticks(f.state, 36 * H, () => {
      wheat += stockOf(farm, 'output', 'wheat');
      farm.rt!.output[good('wheat')] = 0;
    });
    const perTileDay = wheat / 12 / 4;
    expect(perTileDay).toBeGreaterThan(0.9);
    expect(perTileDay).toBeLessThan(1.3);
  });

  it('holds ripe wheat when the 30-unit buffer is full', () => {
    const { f, farm } = farmWithFields(20, 2);
    ticks(f.state, 70 * CROP_STEP_TICKS);
    expect(stockOf(farm, 'output', 'wheat')).toBe(30);
    expect(
      f.state.map.crop.filter((c, i) => c === CROP_RIPE && f.state.map.fieldOwner[i] === farm.id).length,
    ).toBe(5);
  });

  it('flags a farmhouse with no fields', () => {
    const f = hamletFixture();
    const farm = place(f.state, 'farmhouse', 130, 120);
    hire(f.state, farm.id, 1);
    ticks(f.state, H);
    expect(farm.rt!.status & BuildingStatus.noFields).toBeTruthy();
  });
});

describe('field painting', () => {
  it('paints fertile tiles in range, charges per tile, and skips the rest', () => {
    const f = hamletFixture();
    const farm = place(f.state, 'farmhouse', 130, 120);
    fertile(f.state, 124, 114, 140, 130);
    f.state.map.fertility[121 * S + 133] = 20;
    const before = f.state.economy.treasury;
    const ctx = run(f.state, {
      t: 'field.paint',
      farm: farm.id,
      tiles: [
        [133, 120],
        [133, 121],
        [134, 120],
        [139, 120],
        [130, 120],
      ],
    });
    expect(rejection(ctx)).toBeUndefined();
    const owner = (x: number, z: number) => f.state.map.fieldOwner[z * MAP_SIZE + x];
    expect(owner(133, 120)).toBe(farm.id);
    expect(owner(134, 120)).toBe(farm.id);
    expect(owner(133, 121)).toBe(0); // infertile
    expect(owner(139, 120)).toBe(0); // 8 tiles away
    expect(owner(130, 120)).toBe(0); // the farmhouse itself
    expect(before - f.state.economy.treasury).toBe(200);
    expect(ctx.events.some((e) => e.e === 'tiles.changed' && e.layers.includes('fieldOwner'))).toBe(true);
  });

  it('refuses when nothing could be painted, with the reason', () => {
    const f = hamletFixture();
    const farm = place(f.state, 'farmhouse', 130, 120);
    expect(rejection(run(f.state, { t: 'field.paint', farm: farm.id, tiles: [[133, 120]] }))).toBe(
      'NEEDS_FERTILITY',
    );
    expect(rejection(run(f.state, { t: 'field.paint', farm: farm.id, tiles: [[150, 120]] }))).toBe(
      'OUT_OF_RANGE',
    );
    expect(rejection(run(f.state, { t: 'field.paint', farm: f.b.bakery, tiles: [[133, 120]] }))).toBe(
      'NOT_FOUND',
    );
  });

  it('caps fields at 12 tiles per job', () => {
    const f = hamletFixture();
    const farm = place(f.state, 'farmhouse', 130, 120);
    fertile(f.state, 124, 114, 137, 127);
    const tiles: [number, number][] = [];
    for (let z = 114; z <= 127; z++) for (let x = 124; x <= 137; x++) tiles.push([x, z]);
    run(f.state, { t: 'field.paint', farm: farm.id, tiles });
    expect(f.state.map.fieldOwner.filter((o) => o === farm.id).length).toBe(36);
    expect(rejection(run(f.state, { t: 'field.paint', farm: farm.id, tiles: [[124, 127]] }))).toBe(
      'TOO_MANY',
    );
  });

  it('removes fields, and a removed farmhouse takes its fields with it', () => {
    const f = hamletFixture();
    const farm = place(f.state, 'farmhouse', 130, 120);
    fertile(f.state, 124, 114, 137, 127);
    run(f.state, {
      t: 'field.paint',
      farm: farm.id,
      tiles: [
        [133, 120],
        [134, 120],
      ],
    });
    run(f.state, { t: 'field.remove', tiles: [[133, 120]] });
    expect(f.state.map.fieldOwner[120 * S + 133]).toBe(0);
    expect(f.state.map.fieldOwner[120 * S + 134]).toBe(farm.id);
    run(f.state, { t: 'build.remove', ids: [farm.id] });
    expect(f.state.map.fieldOwner[120 * S + 134]).toBe(0);
    expect(f.state.map.terrain[120 * S + 134]).toBe(0);
  });
});
