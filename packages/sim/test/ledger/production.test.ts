import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { BuildingStatus, DAYS_PER_YEAR, MAP_SIZE, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { TREE_SPECIES, treeStage, treeValue } from '../../src/map/layers';
import { insertBuilding } from '../../src/state/place';
import {
  CROP_GROWTH,
  CROP_RIPE,
  CROP_STEP_TICKS,
  cropGrowth,
  DRILL_STEP,
  fieldsOf,
  frostFields,
  HARVEST_MIN,
  HARVEST_STEP,
  tendFields,
  tileHarvest,
} from '../../src/systems/production/fields';
import { createTickCtx } from '../../src/turn';
import { tickAt } from '../fixtures/seasonsPlace';
import { soilPermille } from '../../src/systems/production/soil';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run, S } from '../helpers';
import { building, good, hire, stockOf, ticks, toWork } from './helpers';

const H = TICKS_PER_HOUR;

function place(state: WorldState, def: string, x: number, z: number): Building {
  const d = content.buildingById.get(def)!;
  // Gardens yield by their soil (production/soil.ts): these tests count a full crop, on rich loam.
  if (d.tags?.includes('soil')) fertile(state, x, z, x + d.size[0] - 1, z + d.size[1] - 1, 100);
  return insertBuilding(state, null, d, x, z, 0, 0, { site: false });
}

function fertile(state: WorldState, x0: number, z0: number, x1: number, z1: number, f = 60): void {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) state.map.fertility[z * S + x] = f;
}

describe('crafting', () => {
  it('saws 2 logs into 4 planks every 2 hours with the full crew', () => {
    const f = hamletFixture();
    const sawpit = building(f.state, f.b.sawpit);
    toWork(f.state, hire(f.state, sawpit.id, 2));
    ticks(f.state, 2 * H);
    expect(stockOf(sawpit, 'output', 'planks')).toBe(4);
    expect(stockOf(sawpit, 'input', 'logs')).toBe(2);
    expect(f.state.economy.today.produced[good('planks')]).toBe(4);
    expect(f.state.economy.today.consumed[good('logs')]).toBe(2);
  });

  it('takes twice as long with half the crew', () => {
    const f = hamletFixture();
    const sawpit = building(f.state, f.b.sawpit);
    toWork(f.state, hire(f.state, sawpit.id, 1));
    ticks(f.state, 2 * H);
    expect(stockOf(sawpit, 'output', 'planks')).toBe(0);
    ticks(f.state, 2 * H);
    expect(stockOf(sawpit, 'output', 'planks')).toBe(4);
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

  it('grows anywhere, less on thin soil (playtest round six)', () => {
    const crop = (soil: number) => {
      const f = hamletFixture();
      const plot = place(f.state, 'vegetable-plot', 120, 60);
      fertile(f.state, 120, 60, 121, 61, soil);
      toWork(f.state, hire(f.state, plot.id, 1));
      ticks(f.state, 16 * H);
      return stockOf(plot, 'output', 'vegetables');
    };
    expect(soilPermille(0)).toBe(600);
    expect(soilPermille(80)).toBe(1000);
    expect(crop(10)).toBeLessThan(crop(90));
    expect(crop(10)).toBeGreaterThan(0);
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

  it('sows bare fields in the spring window, 12 tiles per farmer', () => {
    const { f, farm } = farmWithFields(20, 1);
    f.state.tick = tickAt(0, 0, 1, 9);
    ticks(f.state, 10 * CROP_STEP_TICKS);
    const growing = () =>
      f.state.map.crop.filter((c, i) => c > 0 && f.state.map.fieldOwner[i] === farm.id).length;
    // One farmer tends the first 12 tiles; the other eight wait for help.
    expect(growing()).toBe(12);
    expect(stockOf(farm, 'output', 'wheat')).toBe(0);
  });

  it('brings in golden wheat from Autumn day 1, 2 wheat a step, and a ripe tile gives about a year of I2 tending', () => {
    const { f, farm } = farmWithFields(12, 1);
    const tiles = fieldsOf(f.state, farm, content.buildingById.get('farmhouse')!);
    for (const i of tiles) f.state.map.crop[i] = CROP_RIPE;
    // Summer: golden, but not yet.
    f.state.tick = tickAt(0, 1, 5, 9);
    ticks(f.state, 4 * CROP_STEP_TICKS);
    expect(stockOf(farm, 'output', 'wheat')).toBe(0);
    f.state.tick = tickAt(0, 2, 1, 9);
    let wheat = 0;
    ticks(f.state, 40 * CROP_STEP_TICKS, () => {
      wheat += stockOf(farm, 'output', 'wheat');
      farm.rt!.output[good('wheat')] = 0;
    });
    expect(wheat).toBe(12 * tileHarvest(HARVEST_STEP));
    for (const i of tiles) expect(f.state.map.crop[i]).toBe(0);
    // About one wheat a tile a day over the year, as in I2.
    expect(tileHarvest(HARVEST_STEP) / DAYS_PER_YEAR).toBeGreaterThan(0.9);
    expect(tileHarvest(HARVEST_STEP) / DAYS_PER_YEAR).toBeLessThan(1.3);
    // The Seed Drill takes smaller bites: a fifth more.
    expect(tileHarvest(DRILL_STEP) / tileHarvest(HARVEST_STEP)).toBeGreaterThan(1.15);
  });

  it('holds standing wheat in the field when the 30-unit buffer is full', () => {
    const { f, farm } = farmWithFields(20, 2);
    for (const i of fieldsOf(f.state, farm, content.buildingById.get('farmhouse')!))
      f.state.map.crop[i] = CROP_RIPE;
    f.state.tick = tickAt(0, 2, 2, 9);
    ticks(f.state, 20 * CROP_STEP_TICKS);
    expect(stockOf(farm, 'output', 'wheat')).toBe(30);
    expect(
      f.state.map.crop.filter((c, i) => c >= HARVEST_MIN && f.state.map.fieldOwner[i] === farm.id).length,
    ).toBe(20);
    expect(farm.rt!.status & BuildingStatus.outputFull).toBeTruthy();
  });

  it('grows from the spring sowing to golden by the autumn on good soil, and rests in winter', () => {
    const { f, farm } = farmWithFields(12, 1);
    const def = content.buildingById.get('farmhouse')!;
    const wheat = good('wheat');
    const ctx = createTickCtx(f.state);
    // Tend every work step from Spring day 1 to the end of summer, straight through the hook.
    for (let day = 0; day < 12; day++) {
      for (let h = 8; h < 17; h++) {
        for (let q = 0; q < 4; q++) {
          f.state.tick = tickAt(0, 0, 1, 8) + day * TICKS_PER_DAY + (h - 8) * H + q * CROP_STEP_TICKS;
          tendFields(f.state, ctx, farm, def, 100, wheat);
        }
      }
    }
    const tiles = fieldsOf(f.state, farm, def);
    for (const i of tiles) expect(f.state.map.crop[i]).toBeGreaterThanOrEqual(HARVEST_MIN);
    // Winter: green wheat stays as it is.
    f.state.map.crop[tiles[0]!] = 100;
    for (let q = 0; q < 40; q++) {
      f.state.tick = tickAt(0, 3, 3, 9) + q * CROP_STEP_TICKS;
      tendFields(f.state, ctx, farm, def, 100, wheat);
    }
    expect(f.state.map.crop[tiles[0]!]).toBe(100);
  });

  it("ploughs last year's standing sheaves back in at the spring sowing", () => {
    const { f, farm } = farmWithFields(4, 1);
    const tiles = fieldsOf(f.state, farm, content.buildingById.get('farmhouse')!);
    for (const i of tiles) f.state.map.crop[i] = 230;
    f.state.tick = tickAt(1, 0, 2, 9);
    ticks(f.state, 2 * CROP_STEP_TICKS);
    for (const i of tiles) expect(f.state.map.crop[i]).toBeLessThan(HARVEST_MIN);
  });

  it('a farm that missed the sowing grows vegetables and says its fields lie ready', () => {
    const { f, farm } = farmWithFields(12, 1);
    f.state.tick = tickAt(0, 1, 2, 8);
    ticks(f.state, 24 * H);
    expect(farm.rt!.status & BuildingStatus.fallow).toBeTruthy();
    expect(stockOf(farm, 'output', 'vegetables')).toBeGreaterThan(0);
    expect(stockOf(farm, 'output', 'wheat')).toBe(0);
  });

  it('an early frost halves what still stands', () => {
    const { f, farm } = farmWithFields(2, 1);
    const tiles = fieldsOf(f.state, farm, content.buildingById.get('farmhouse')!);
    f.state.map.crop[tiles[0]!] = CROP_RIPE;
    f.state.map.crop[tiles[1]!] = 100;
    frostFields(f.state, createTickCtx(f.state));
    const left = f.state.map.crop[tiles[0]!]! - HARVEST_MIN;
    expect(left).toBe((CROP_RIPE - HARVEST_MIN) >> 1);
    expect(f.state.map.crop[tiles[1]!]).toBe(50);
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
    f.state.map.fertility[121 * S + 133] = 10;
    const before = f.state.economy.treasury;
    const network = f.state.networkVersion;
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
    // Walkers route on the network; fields change it.
    expect(f.state.networkVersion).toBeGreaterThan(network);
    expect(ctx.events.some((e) => e.e === 'tiles.changed' && e.layers.includes('fieldOwner'))).toBe(true);
  });

  it('sows thin soil too, where the wheat grows more slowly', () => {
    const f = hamletFixture();
    const farm = place(f.state, 'farmhouse', 130, 120);
    fertile(f.state, 124, 114, 140, 130, 30);
    expect(rejection(run(f.state, { t: 'field.paint', farm: farm.id, tiles: [[133, 120]] }))).toBeUndefined();
    expect(f.state.map.fieldOwner[120 * S + 133]).toBe(farm.id);
    expect(cropGrowth(30)).toBeLessThan(CROP_GROWTH);
    expect(cropGrowth(18)).toBeLessThan(cropGrowth(30));
    expect(cropGrowth(18)).toBeGreaterThan(0);
    // Good soil grows exactly as before.
    expect(cropGrowth(40)).toBe(CROP_GROWTH);
    expect(cropGrowth(95)).toBe(CROP_GROWTH);
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

describe('every I1 producer at full and partial staffing', () => {
  // [building, crew, hours, good made, units]: the spec's numbers (13-ledger.md, I1 buildings).
  const cases: [string, number, number, string, number][] = [
    ['sawpit', 2, 2, 'planks', 4],
    ['sawpit', 1, 4, 'planks', 4],
    ['bakery', 2, 2, 'bread', 5],
    ['bakery', 1, 4, 'bread', 5],
    ['windmill', 1, 1, 'flour', 2],
    ['quarry', 3, 2, 'stone', 6],
    ['quarry', 2, 2, 'stone', 4],
    ['fishers-hut', 2, 2, 'fish', 4],
    ['fishers-hut', 1, 2, 'fish', 2],
    ['vegetable-plot', 1, 4, 'vegetables', 3],
    ['woodcutter', 2, 3, 'logs', 8],
    ['woodcutter', 1, 3, 'logs', 4],
  ];
  for (const [def, crew, hours, made, units] of cases) {
    it(`${def} with ${crew} at work makes ${units} ${made} in ${hours} h`, () => {
      const f = hamletFixture();
      const b = place(f.state, def, 120, 100);
      b.rt!.input[good('logs')] = 20;
      b.rt!.input[good('flour')] = 20;
      b.rt!.input[good('wheat')] = 20;
      for (let z = 96; z < 108; z++) {
        for (let x = 116; x < 128; x++) {
          if (!f.state.map.occupant[z * S + x]) f.state.map.tree[z * S + x] = treeValue(TREE_SPECIES.oak, 3);
        }
      }
      toWork(f.state, hire(f.state, b.id, crew));
      ticks(f.state, hours * H - 1);
      expect(stockOf(b, 'output', made)).toBeLessThan(units);
      ticks(f.state, 1);
      expect(stockOf(b, 'output', made)).toBe(units);
    });
  }
});
