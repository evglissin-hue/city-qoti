import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { BuildingStatus, DAYS_PER_YEAR, MAP_SIZE, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { TREE_SPECIES, treeValue } from '../../src/map/layers';
import { insertBuilding } from '../../src/state/place';
import {
  CROP_GROWTH,
  CROP_RIPE,
  CROP_STEP_TICKS,
  cropGrowth,
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

// R1: a business (workshop or farmstead) takes its trade; specialized buildings run their def's
// one method.
function place(state: WorldState, def: string, x: number, z: number, trade?: string): Building {
  const d = content.buildingById.get(def)!;
  // Gardens yield by their soil (production/soil.ts): these tests count a full crop, on rich loam.
  if (d.tags?.includes('soil')) fertile(state, x, z, x + d.size[0] - 1, z + d.size[1] - 1, 100);
  return insertBuilding(state, null, d, x, z, 0, 0, { site: false, ...(trade !== undefined && { trade }) });
}

/** A grain farm: a farmstead business with trade 'grain-farm'. */
function grainFarm(state: WorldState, x: number, z: number): Building {
  return place(state, 'farmstead', x, z, 'grain-farm');
}

function fertile(state: WorldState, x0: number, z0: number, x1: number, z1: number, f = 60): void {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) state.map.fertility[z * S + x] = f;
}

describe('crafting', () => {
  it('fires 6 brick from a firewood every 4 hours with the full crew', () => {
    const f = hamletFixture();
    const works = place(f.state, 'brickworks', 120, 100);
    works.rt!.input[good('firewood')] = 2;
    toWork(f.state, hire(f.state, works.id, 3));
    ticks(f.state, 4 * H);
    expect(stockOf(works, 'output', 'brick')).toBe(6);
    expect(stockOf(works, 'input', 'firewood')).toBe(1);
    expect(f.state.economy.today.produced[good('brick')]).toBe(6);
    expect(f.state.economy.today.consumed[good('firewood')]).toBe(1);
  });

  it('takes three times as long with a third of the crew', () => {
    const f = hamletFixture();
    const works = place(f.state, 'brickworks', 120, 100);
    works.rt!.input[good('firewood')] = 2;
    toWork(f.state, hire(f.state, works.id, 1));
    ticks(f.state, 4 * H);
    expect(stockOf(works, 'output', 'brick')).toBe(0);
    ticks(f.state, 8 * H);
    expect(stockOf(works, 'output', 'brick')).toBe(6);
  });

  it("bakes 3 bread from 2 grain every 2 hours at a baker's, and waits when the grain runs out", () => {
    const f = hamletFixture();
    // R1X: the carrier collects surplus at a maker's door; this test counts the oven, not trade.
    f.state.carrier.families[0]!.sell = false;
    const bakery = building(f.state, f.b.bakery);
    toWork(f.state, bakery.rt!.workers);
    ticks(f.state, 4 * H);
    expect(stockOf(bakery, 'output', 'bread')).toBe(6);
    expect(stockOf(bakery, 'input', 'grain')).toBe(0);
    ticks(f.state, 2 * H);
    expect(stockOf(bakery, 'output', 'bread')).toBe(6);
    expect(bakery.rt!.status & BuildingStatus.missingInput).toBeTruthy();
  });

  it('stops when the output buffer is full', () => {
    const f = hamletFixture();
    const bakery = building(f.state, f.b.bakery);
    bakery.rt!.input[good('grain')] = 40;
    bakery.rt!.output[good('bread')] = 8;
    toWork(f.state, bakery.rt!.workers);
    ticks(f.state, 3 * H);
    expect(stockOf(bakery, 'output', 'bread')).toBe(8);
    expect(bakery.rt!.status & BuildingStatus.outputFull).toBeTruthy();
  });

  it('does nothing while paused', () => {
    const f = hamletFixture();
    const bakery = building(f.state, f.b.bakery);
    toWork(f.state, bakery.rt!.workers);
    run(f.state, { t: 'build.setPaused', id: bakery.id, paused: true });
    ticks(f.state, 3 * H);
    expect(stockOf(bakery, 'output', 'bread')).toBe(0);
    expect(bakery.rt!.status & BuildingStatus.paused).toBeTruthy();
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

  it('lands 2 fish per worker every 2 hours at the fishery', () => {
    const f = hamletFixture();
    const hut = place(f.state, 'fishery', 98, 70);
    toWork(f.state, hire(f.state, hut.id, 2));
    ticks(f.state, 2 * H);
    expect(stockOf(hut, 'output', 'fish')).toBe(4);
  });

  it('grows 3 vegetables every 4 hours in a market garden', () => {
    const f = hamletFixture();
    const plot = place(f.state, 'farmstead', 120, 60, 'market-garden');
    toWork(f.state, hire(f.state, plot.id, 1));
    ticks(f.state, 4 * H);
    expect(stockOf(plot, 'output', 'vegetables')).toBe(3);
  });

  it('grows anywhere, less on thin soil (playtest round six)', () => {
    const crop = (soil: number) => {
      const f = hamletFixture();
      const plot = place(f.state, 'farmstead', 120, 60, 'market-garden');
      fertile(f.state, 120, 60, 122, 62, soil);
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
    toWork(f.state, bakery.rt!.workers);
    ticks(f.state, 4 * H);
    const firsts = f.state.chronicle.filter((c) => c.kind === 'first-of');
    expect(firsts).toHaveLength(1);
    expect(firsts[0]!.text).toContain('bread');
    expect(f.state.economy.everProduced[good('bread')]).toBe(6);
  });
});

/** A full woodpile, so a lodge makes timber (it cuts firewood while the town is under its Fuel target). */
function fullWoodpile(f: ReturnType<typeof hamletFixture>): void {
  building(f.state, f.b.stall).rt!.store[good('firewood')] = 500;
}

describe('forestry', () => {
  /**
   * R1X: a Lodge plants rather than fells while its wood holds fewer trees than its rule (12 within
   * 8 tiles): saplings along the far edge of its reach make it a wood, away from the trees a test fells.
   */
  function youngWood(f: ReturnType<typeof hamletFixture>): void {
    let n = 0;
    for (const z of [72, 73])
      for (let x = 112; x <= 130 && n < 12; x++) {
        const i = z * S + x;
        if (f.state.map.occupant[i] || f.state.map.road[i] || f.state.map.tree[i]) continue;
        f.state.map.tree[i] = treeValue(TREE_SPECIES.oak, 0);
        n++;
      }
  }

  it("fells one mature tree per worker every 3 hours for 4 timber at a Forester's Lodge, thickest stand first", () => {
    const f = hamletFixture();
    fullWoodpile(f);
    const hut = place(f.state, 'foresters-lodge', 120, 80);
    youngWood(f);
    const grove = [
      [124, 84],
      [125, 84],
      [124, 85],
    ];
    for (const [x, z] of grove) f.state.map.tree[z! * S + x!] = treeValue(TREE_SPECIES.oak, 3);
    f.state.map.tree[78 * S + 118] = treeValue(TREE_SPECIES.birch, 3);
    toWork(f.state, hire(f.state, hut.id, 1));
    const events = ticks(f.state, 3 * H);
    expect(stockOf(hut, 'output', 'timber')).toBe(4);
    // The lone birch by the door survives; one of the grove went.
    expect(f.state.map.tree[78 * S + 118]).not.toBe(0);
    expect(grove.filter(([x, z]) => f.state.map.tree[z! * S + x!] === 0)).toHaveLength(1);
    expect(events.some((e) => e.e === 'tiles.changed' && e.layers.includes('tree'))).toBe(true);
  });

  it('reports no trees once the woods in reach are gone', () => {
    const f = hamletFixture();
    fullWoodpile(f);
    const hut = place(f.state, 'foresters-lodge', 120, 80);
    youngWood(f);
    f.state.map.tree[84 * S + 124] = treeValue(TREE_SPECIES.pine, 3);
    f.state.map.tree[84 * S + 127] = treeValue(TREE_SPECIES.pine, 1);
    toWork(f.state, hire(f.state, hut.id, 2));
    ticks(f.state, 5 * H);
    expect(stockOf(hut, 'output', 'timber')).toBe(4);
    expect(hut.rt!.status & BuildingStatus.noTrees).toBeTruthy();
    expect(f.state.map.tree[84 * S + 127]).not.toBe(0);
  });

  it('plants rather than fells while its wood is thinner than its rule (R1X)', () => {
    const f = hamletFixture();
    fullWoodpile(f);
    const hut = place(f.state, 'foresters-lodge', 120, 80);
    // Three grown trees left of a wood the town built into.
    for (const [x, z] of [
      [124, 84],
      [125, 84],
      [124, 85],
    ])
      f.state.map.tree[z! * S + x!] = treeValue(TREE_SPECIES.oak, 3);
    const trees = () => f.state.map.tree.reduce((n, v) => n + (v ? 1 : 0), 0);
    const before = trees();
    toWork(f.state, hire(f.state, hut.id, 1));
    ticks(f.state, 3 * H);
    expect(stockOf(hut, 'output', 'timber')).toBe(0);
    expect(trees()).toBeGreaterThan(before);
  });
});

describe('farms', () => {
  function farmWithFields(tiles: number, crew: number) {
    const f = hamletFixture();
    const farm = grainFarm(f.state, 130, 120);
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
    expect(stockOf(farm, 'output', 'grain')).toBe(0);
  });

  it('brings in golden grain as it ripens (here in autumn), 2 grain a step, and a ripe tile gives about a year of I2 tending', () => {
    const { f, farm } = farmWithFields(12, 1);
    const tiles = fieldsOf(f.state, farm, content.buildingById.get('farmstead')!);
    for (const i of tiles) f.state.map.crop[i] = CROP_RIPE;
    f.state.tick = tickAt(0, 2, 1, 9);
    let wheat = 0;
    ticks(f.state, 40 * CROP_STEP_TICKS, () => {
      wheat += stockOf(farm, 'output', 'grain');
      farm.rt!.output[good('grain')] = 0;
    });
    expect(wheat).toBe(12 * tileHarvest(HARVEST_STEP));
    for (const i of tiles) expect(f.state.map.crop[i]).toBe(0);
    // About one wheat a tile a day over the year, as in I2.
    expect(tileHarvest(HARVEST_STEP) / DAYS_PER_YEAR).toBeGreaterThan(0.9);
    expect(tileHarvest(HARVEST_STEP) / DAYS_PER_YEAR).toBeLessThan(1.3);
  });

  // R1: a farmstead keeps the default 10-unit output buffer (the farmhouse kept 30).
  it('holds standing grain in the field when the 10-unit buffer is full', () => {
    const { f, farm } = farmWithFields(20, 2);
    for (const i of fieldsOf(f.state, farm, content.buildingById.get('farmstead')!))
      f.state.map.crop[i] = CROP_RIPE;
    f.state.tick = tickAt(0, 2, 2, 9);
    ticks(f.state, 20 * CROP_STEP_TICKS);
    expect(stockOf(farm, 'output', 'grain')).toBe(10);
    expect(
      f.state.map.crop.filter((c, i) => c >= HARVEST_MIN && f.state.map.fieldOwner[i] === farm.id).length,
    ).toBe(20);
    expect(farm.rt!.status & BuildingStatus.outputFull).toBeTruthy();
  });

  it('grows from the spring sowing to the first summer cut on good soil, and rests in winter', () => {
    const { f, farm } = farmWithFields(12, 1);
    const def = content.buildingById.get('farmstead')!;
    const wheat = good('grain');
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
    // Sown on Spring day 1, the wheat is cut as it ripens from the first days of summer.
    expect(stockOf(farm, 'output', 'grain')).toBeGreaterThan(0);
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
    const tiles = fieldsOf(f.state, farm, content.buildingById.get('farmstead')!);
    for (const i of tiles) f.state.map.crop[i] = 230;
    f.state.tick = tickAt(1, 0, 2, 9);
    ticks(f.state, 2 * CROP_STEP_TICKS);
    for (const i of tiles) expect(f.state.map.crop[i]).toBeLessThan(HARVEST_MIN);
  });

  it('a farm that missed the sowing grows vegetables and says its fields lie ready', () => {
    const { f, farm } = farmWithFields(12, 1);
    f.state.tick = tickAt(0, 1, 4, 8);
    ticks(f.state, 24 * H);
    expect(farm.rt!.status & BuildingStatus.fallow).toBeTruthy();
    expect(stockOf(farm, 'output', 'vegetables')).toBeGreaterThan(0);
    expect(stockOf(farm, 'output', 'grain')).toBe(0);
  });

  it('an early frost halves what still stands', () => {
    const { f, farm } = farmWithFields(2, 1);
    const tiles = fieldsOf(f.state, farm, content.buildingById.get('farmstead')!);
    f.state.map.crop[tiles[0]!] = CROP_RIPE;
    f.state.map.crop[tiles[1]!] = 100;
    frostFields(f.state, createTickCtx(f.state));
    const left = f.state.map.crop[tiles[0]!]! - HARVEST_MIN;
    expect(left).toBe((CROP_RIPE - HARVEST_MIN) >> 1);
    expect(f.state.map.crop[tiles[1]!]).toBe(50);
  });

  it('flags a grain farm with no fields', () => {
    const f = hamletFixture();
    const farm = grainFarm(f.state, 130, 120);
    hire(f.state, farm.id, 1);
    ticks(f.state, H);
    expect(farm.rt!.status & BuildingStatus.noFields).toBeTruthy();
  });
});

describe('field painting', () => {
  it('paints fertile tiles in range, charges per tile, and skips the rest', () => {
    const f = hamletFixture();
    const farm = grainFarm(f.state, 130, 120);
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
    expect(owner(130, 120)).toBe(0); // the farmstead itself
    expect(before - f.state.economy.treasury).toBe(200);
    // Walkers route on the network; fields change it.
    expect(f.state.networkVersion).toBeGreaterThan(network);
    expect(ctx.events.some((e) => e.e === 'tiles.changed' && e.layers.includes('fieldOwner'))).toBe(true);
  });

  it('sows thin soil too, where the wheat grows more slowly', () => {
    const f = hamletFixture();
    const farm = grainFarm(f.state, 130, 120);
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
    const farm = grainFarm(f.state, 130, 120);
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

  // R1: a level 1 grain farm wants two hands (its trade's crew), so it keeps 24 tiles.
  it('caps fields at 12 tiles per hand', () => {
    const f = hamletFixture();
    const farm = grainFarm(f.state, 130, 120);
    fertile(f.state, 124, 114, 137, 127);
    const tiles: [number, number][] = [];
    for (let z = 114; z <= 127; z++) for (let x = 124; x <= 137; x++) tiles.push([x, z]);
    run(f.state, { t: 'field.paint', farm: farm.id, tiles });
    expect(f.state.map.fieldOwner.filter((o) => o === farm.id).length).toBe(24);
    expect(rejection(run(f.state, { t: 'field.paint', farm: farm.id, tiles: [[124, 127]] }))).toBe(
      'TOO_MANY',
    );
  });

  it('removes fields, and a removed grain farm takes its fields with it', () => {
    const f = hamletFixture();
    const farm = grainFarm(f.state, 130, 120);
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

describe('every producer at full and partial staffing', () => {
  // [building, trade, crew, hours, good made, units]: R1's specialized buildings and the trades of
  // content/trades.ts (13-ledger.md). Grain farms tend fields (see 'farms').
  const cases: [string, string | undefined, number, number, string, number][] = [
    ['brickworks', undefined, 3, 4, 'brick', 6],
    ['brickworks', undefined, 1, 12, 'brick', 6],
    ['quarry', undefined, 3, 2, 'stone', 6],
    ['quarry', undefined, 2, 2, 'stone', 4],
    ['fishery', undefined, 2, 2, 'fish', 4],
    ['fishery', undefined, 1, 2, 'fish', 2],
    ['foresters-lodge', undefined, 2, 3, 'timber', 8],
    ['foresters-lodge', undefined, 1, 3, 'timber', 4],
    ['workshop', 'baker', 1, 2, 'bread', 3],
    ['workshop', 'carpenter', 1, 3, 'furniture', 1],
    ['workshop', 'chandler', 1, 1, 'candles', 3],
    ['workshop', 'cider-maker', 1, 1, 'cider', 2],
    ['workshop', 'weaver', 1, 3, 'cloth', 2],
    ['farmstead', 'dairy', 2, 3, 'cheese', 2],
    ['farmstead', 'market-garden', 1, 4, 'vegetables', 3],
    ['farmstead', 'sheep-run', 2, 3, 'wool', 4],
  ];
  for (const [def, trade, crew, hours, made, units] of cases) {
    it(`${trade ?? def} with ${crew} at work makes ${units} ${made} in ${hours} h`, () => {
      const f = hamletFixture();
      fullWoodpile(f);
      const b = place(f.state, def, 120, 100, trade);
      for (const id of ['grain', 'timber', 'honey', 'fruit', 'wool', 'firewood']) b.rt!.input[good(id)] = 20;
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

  it('covers every trade that makes something and every specialized building with a method', () => {
    const covered = new Set(cases.map(([def, trade]) => trade ?? def));
    // Hives yield by the pollinators around them and an orchard bears only from summer, both through
    // the yield hook (the nature and seasons tests), so neither runs at a plain rate here.
    for (const t of content.trades) {
      if (t.method && t.method.kind !== 'farm' && !['hives', 'orchard'].includes(t.id)) {
        expect(covered, t.id).toContain(t.id);
      }
    }
    for (const d of content.buildings) {
      if (d.specialized && d.methods?.length) expect(covered, d.id).toContain(d.id);
    }
  });
});
