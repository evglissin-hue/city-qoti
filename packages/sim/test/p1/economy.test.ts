// Playtest round six: wheat from summer on, stone enough for the windmill, and a hamlet that can
// buy a little of what it lacks through the daily peddler. R1: the wheat is grain from a farmstead's
// grain farm, and the peddler is the carrier stand-in, buying what open sites wait for.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import {
  DAYS_PER_SEASON,
  LEDGER_CATEGORIES,
  PEDDLER_TERMS,
  TICKS_PER_HOUR,
  TRADE_BUY_PERCENT,
} from '../../src/constants';
import type { SimEvent, WorldState } from '../../src/contracts';
import { insertBuilding } from '../../src/state/place';
import { carrierBuyPrice } from '../../src/systems/carrier/terms';
import { START_GOODS } from '../../src/systems/economy/start';
import { overdraftLimit } from '../../src/systems/loans/credit';
import {
  CROP_STEP_TICKS,
  fieldPhase,
  fieldsOf,
  HARVEST_MIN,
  HARVEST_STEP,
  tileHarvest,
} from '../../src/systems/production/fields';
import { shortages, slotPriority, STONE_RUSH } from '../../src/systems/residents/jobs';
import { townStock } from '../../src/view/hamlet';
import { building, good, hire, stockOf, ticks, toWork, untilHour } from '../ledger/helpers';
import { hamletFixture } from '../fixtures/hamlet';
import { tickAt } from '../fixtures/seasonsPlace';
import { rejection, run, S } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';

const cat = (id: string) => LEDGER_CATEGORIES.findIndex((c) => c.id === id);

function farmWithFields(tiles: number) {
  const f = hamletFixture();
  const d = content.buildingById.get('farmstead')!;
  const farm = insertBuilding(f.state, null, d, 130, 120, 0, 0, { site: false, trade: 'grain-farm' });
  for (let z = 114; z <= 127; z++) for (let x = 124; x <= 137; x++) f.state.map.fertility[z * S + x] = 60;
  const want: [number, number][] = [];
  for (let k = 0; k < tiles; k++) want.push([125 + (k % 10), 114 + Math.floor(k / 10)]);
  expect(rejection(run(f.state, { t: 'field.paint', farm: farm.id, tiles: want }))).toBeUndefined();
  toWork(f.state, hire(f.state, farm.id, 1));
  const idx = fieldsOf(f.state, farm, d);
  return { f, farm, idx };
}

describe('wheat windows', () => {
  it('sows from Spring day 1 to Summer day 3 and cuts from the first day of summer', () => {
    const at = (s: number, d: number) => {
      const f = hamletFixture();
      f.state.tick = tickAt(0, s, d, 9);
      return fieldPhase(f.state);
    };
    expect(at(0, 1).sow).toBe(true);
    expect(at(0, 6).sow).toBe(true);
    expect(at(0, 6).harvest).toBe(false);
    expect(at(1, 3)).toMatchObject({ sow: true, harvest: true });
    expect(at(1, 4)).toMatchObject({ sow: false, harvest: true });
    expect(at(2, 1)).toMatchObject({ sow: false, harvest: true });
    expect(at(3, 2)).toMatchObject({ sow: false, harvest: true });
  });

  it('a golden tile is cut in summer, so the bakers have grain', () => {
    const { f, farm, idx } = farmWithFields(4);
    for (const i of idx) f.state.map.crop[i] = 230;
    f.state.tick = tickAt(0, 1, 4, 9);
    ticks(f.state, 6 * CROP_STEP_TICKS);
    expect(stockOf(farm, 'output', 'grain')).toBeGreaterThan(0);
  });

  it('sows a bare tile on Summer day 2 but not on Summer day 4', () => {
    const a = farmWithFields(4);
    a.f.state.tick = tickAt(0, 1, 2, 9);
    ticks(a.f.state, 2 * CROP_STEP_TICKS);
    for (const i of a.idx) expect(a.f.state.map.crop[i]).toBeGreaterThan(0);
    const b = farmWithFields(4);
    b.f.state.tick = tickAt(0, 1, 4, 9);
    ticks(b.f.state, 2 * CROP_STEP_TICKS);
    for (const i of b.idx) expect(b.f.state.map.crop[i]).toBe(0);
  });

  // The class check for a P1 slip the bench found: spring's longer sowing ploughed this year's crop
  // under as it turned golden, and a tile cut the hour it turned golden gave 2 wheat, not 26. A farm
  // made a quarter of its old harvest while every window test passed. So: a whole year's yield.
  it('a year of tending brings in at least a full crop a tile, from summer on', () => {
    const { f, farm, idx } = farmWithFields(12);
    const wheat = content.goodIndex.get('grain')!;
    const crew = [...farm.rt!.workers];
    f.state.tick = tickAt(0, 0, 1, 0);
    const bySeason = [0, 0, 0, 0];
    let goldenBySpringEnd = 0;
    for (let h = 0; h < 24 * 24; h++) {
      if (h % 24 === 7) toWork(f.state, crew);
      ticks(f.state, TICKS_PER_HOUR);
      bySeason[Math.floor(h / (24 * DAYS_PER_SEASON))]! += farm.rt!.output[wheat]!;
      farm.rt!.output[wheat] = 0;
      if (h === 24 * DAYS_PER_SEASON - 1)
        goldenBySpringEnd = idx.filter((i) => f.state.map.crop[i]! >= HARVEST_MIN).length;
    }
    // Nothing ploughed under: the spring sowing stands golden at the end of spring.
    expect(goldenBySpringEnd).toBe(idx.length);
    const year = bySeason.reduce((a, b) => a + b, 0);
    expect(year).toBeGreaterThanOrEqual(idx.length * tileHarvest(HARVEST_STEP));
    // The bakers have grain in summer (the owner's playtest).
    expect(bySeason[1]).toBeGreaterThanOrEqual(idx.length * tileHarvest(HARVEST_STEP));
  });

  it('winter still cuts what is golden', () => {
    const { f, farm, idx } = farmWithFields(4);
    for (const i of idx) f.state.map.crop[i] = 230;
    f.state.tick = tickAt(0, 3, 2, 9);
    ticks(f.state, 6 * CROP_STEP_TICKS);
    expect(stockOf(farm, 'output', 'grain')).toBeGreaterThan(0);
  });
});

describe('stone', () => {
  // P1 dead-end hunt: 30 as before, not 40. The cheaper windmill and bakery answer "stone scarce at
  // the windmill" (two more homes, a farmhouse and the windmill now take 26); 40 moved every
  // valley's first days, and willow's guide closed on its food step.
  it('starts at 30, and the windmill asks for less', () => {
    expect(START_GOODS.find(([g]) => g === 'stone')?.[1]).toBe(30);
    const stone = (id: string) => content.buildingById.get(id)!.cost!.goods!.find(([g]) => g === 'stone')![1];
    expect(stone('windmill')).toBe(8);
  });

  it("puts the quarry's first hand ahead while stone is low and a site needs it", () => {
    const quarry = content.buildingById.get('quarry')!;
    const calm = { food: false, goods: new Set<string>() };
    expect(slotPriority(quarry, 0, { ...calm, stoneRush: true })).toBe(-1);
    expect(slotPriority(quarry, 1, { ...calm, stoneRush: true })).toBeGreaterThanOrEqual(0);
    expect(slotPriority(quarry, 0, calm)).toBe(2);

    const f = hamletFixture();
    const store = building(f.state, f.b.storehouse);
    store.rt!.store[good('stone')] = STONE_RUSH - 1;
    expect(shortages(f.state).stoneRush).toBe(false);
    const d = content.buildingById.get('windmill')!;
    const site = insertBuilding(f.state, null, d, 90, 90, 0, 0, { site: true });
    expect(site.rt!.construction!.needs[good('stone')]).toBe(8);
    expect(shortages(f.state).stoneRush).toBe(true);
    store.rt!.store[good('stone')] = STONE_RUSH + 5;
    expect(shortages(f.state).stoneRush).toBe(false);
  });
});

// R1.0 stand-in: R1A/R1B rewrites this. The carrier buys Materials an open site waits for beyond
// stock (Essentials), Food and Fuel to their reserves, 20 units a day at 140% of a neighbor's price.
describe('the carrier as an importer', () => {
  const note = (events: SimEvent[]) =>
    events.find((e): e is Extract<SimEvent, { e: 'notify' }> => e.e === 'notify' && e.kind === 'carrier');
  const stone = (s: WorldState) => townStock(s)[good('stone')]!;
  /** The hamlet with 2 stone in store and a windmill site waiting for 8. */
  function stoneShort() {
    const f = hamletFixture();
    building(f.state, f.b.storehouse).rt!.store[good('stone')] = 2;
    const d = content.buildingById.get('windmill')!;
    insertBuilding(f.state, null, d, 90, 90, 0, 0, { site: true });
    return f;
  }
  const carried = (s: WorldState, side: 'bought' | 'sold' = 'bought') => {
    const last = s.carrier.bought.length - 1;
    let n = 0;
    for (let g = 0; g < content.goods.length; g++) n += s.carrier[side][last]![g]!;
    return n;
  };

  it('brings the stone a site waits for at 10:00 and books imports', () => {
    const f = stoneShort();
    const before = moneySnapshot(f.state);
    const treasury = f.state.economy.treasury;
    const events = untilHour(f.state, 11);
    expect(stone(f.state)).toBe(2 + 6);
    const money = f.state.economy.today.money;
    const spent = money[cat('imports')]!;
    expect(spent).toBeGreaterThan(0);
    expect(f.state.economy.treasury).toBe(treasury - spent + money[cat('exports')]!);
    expect(note(events)?.text).toMatch(/^The carrier left (.* )?6 stone.* at the gate and took .* for it\./);
    expectMoneyInvariant(before, f.state);
  });

  // R1X: the cart carries its load each way, so a day's buying never leaves nothing to sell.
  it('carries at most 20 units in a day, and at most 20 out', () => {
    const f = stoneShort();
    run(f.state, { t: 'carrier.setBudget', coins: 1000 });
    run(f.state, { t: 'carrier.setRule', family: 'materials', rule: 'always', sell: false });
    run(f.state, { t: 'carrier.setReserve', family: 'materials', reserve: 200 });
    untilHour(f.state, 11);
    expect(carried(f.state)).toBe(PEDDLER_TERMS.units);
    expect(carried(f.state, 'sold')).toBeLessThanOrEqual(PEDDLER_TERMS.units);
  });

  it('buys nothing a neighbor does not sell', () => {
    const f = hamletFixture();
    // A month of Food wanted and none in town: no neighbor sells bread, so none comes.
    run(f.state, { t: 'carrier.setReserve', family: 'food', reserve: 30 });
    for (const b of f.state.buildings)
      if (b.rt) for (let g = 0; g < content.goods.length; g++) b.rt.store[g] = 0;
    untilHour(f.state, 11);
    const bought = f.state.carrier.bought[f.state.carrier.bought.length - 1]!;
    expect(bought[good('bread')]).toBe(0);
    expect(bought[good('grain')]! + bought[good('vegetables')]! + bought[good('fruit')]!).toBeGreaterThan(0);
  });

  it('stops at the credit line', () => {
    const f = stoneShort();
    f.state.economy.treasury = -overdraftLimit(f.state) + 100;
    untilHour(f.state, 11);
    expect(stone(f.state)).toBeLessThan(2 + 6);
    expect(f.state.economy.treasury).toBeGreaterThanOrEqual(-overdraftLimit(f.state));
  });

  it('charges 140 percent, dearer than the post would', () => {
    const f = hamletFixture();
    const post = carrierBuyPrice(f.state, 'stonecross', good('stone'), TRADE_BUY_PERCENT);
    const carrier = carrierBuyPrice(f.state, 'stonecross', good('stone'));
    expect(PEDDLER_TERMS.buy).toBe(140);
    expect(carrier!).toBeGreaterThan(post!);
  });
});
