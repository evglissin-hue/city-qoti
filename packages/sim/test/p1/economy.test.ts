// Playtest round six: wheat from summer on, stone enough for the windmill, and a hamlet that can
// buy a little of what it lacks through the daily peddler.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { LEDGER_CATEGORIES } from '../../src/constants';
import type { SimEvent, WorldState } from '../../src/contracts';
import { insertBuilding } from '../../src/state/place';
import { PEDDLER_IMPORT_PERCENT, PEDDLER_IMPORT_UNITS } from '../../src/systems/economy';
import { START_GOODS } from '../../src/systems/economy/start';
import { overdraftLimit } from '../../src/systems/loans/credit';
import { CROP_STEP_TICKS, fieldPhase, fieldsOf } from '../../src/systems/production/fields';
import { shortages, slotPriority, STONE_RUSH } from '../../src/systems/residents/jobs';
import { postBuyPrice } from '../../src/systems/trade/caravans';
import { townStock } from '../../src/view/hamlet';
import { building, good, hire, stockOf, ticks, toWork, untilHour } from '../ledger/helpers';
import { hamletFixture } from '../fixtures/hamlet';
import { tickAt } from '../fixtures/seasonsPlace';
import { rejection, run, S } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';

const cat = (id: string) => LEDGER_CATEGORIES.findIndex((c) => c.id === id);

function farmWithFields(tiles: number) {
  const f = hamletFixture();
  const d = content.buildingById.get('farmhouse')!;
  const farm = insertBuilding(f.state, null, d, 130, 120, 0, 0, { site: false });
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

  it('a golden tile is cut in summer, so the windmill has wheat to grind', () => {
    const { f, farm, idx } = farmWithFields(4);
    for (const i of idx) f.state.map.crop[i] = 230;
    f.state.tick = tickAt(0, 1, 4, 9);
    ticks(f.state, 6 * CROP_STEP_TICKS);
    expect(stockOf(farm, 'output', 'wheat')).toBeGreaterThan(0);
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

  it('winter still cuts what is golden', () => {
    const { f, farm, idx } = farmWithFields(4);
    for (const i of idx) f.state.map.crop[i] = 230;
    f.state.tick = tickAt(0, 3, 2, 9);
    ticks(f.state, 6 * CROP_STEP_TICKS);
    expect(stockOf(farm, 'output', 'wheat')).toBeGreaterThan(0);
  });
});

describe('stone', () => {
  it('starts at 40, and the windmill and bakery ask for less', () => {
    expect(START_GOODS.find(([g]) => g === 'stone')?.[1]).toBe(40);
    const stone = (id: string) => content.buildingById.get(id)!.cost!.goods!.find(([g]) => g === 'stone')![1];
    expect(stone('windmill')).toBe(8);
    expect(stone('bakery')).toBe(10);
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

describe('the peddler as an importer', () => {
  function stoneOrder(f: ReturnType<typeof hamletFixture>, o: Partial<{ min: number; ceiling: number }>) {
    const full = { min: 40, max: 400, floor: 0, ceiling: 0, neighbor: '', ...o };
    expect(
      rejection(run(f.state, { t: 'trade.setStandingOrder', good: 'stone', order: full })),
    ).toBeUndefined();
  }
  const note = (events: SimEvent[]) =>
    events.find((e): e is Extract<SimEvent, { e: 'notify' }> => e.e === 'notify' && e.kind === 'peddler');
  const stone = (s: WorldState) => townStock(s)[good('stone')]!;

  it('fills an order for stone to its min the next morning and books imports', () => {
    const f = hamletFixture();
    const before = moneySnapshot(f.state);
    const had = stone(f.state);
    stoneOrder(f, { min: had + 12 });
    const books = f.state.economy.today.money[cat('imports')]!;
    const treasury = f.state.economy.treasury;
    const events = untilHour(f.state, 10);
    expect(stone(f.state)).toBe(had + 12);
    const spent = f.state.economy.today.money[cat('imports')]! - books;
    expect(spent).toBeGreaterThan(0);
    expect(f.state.economy.treasury).toBe(treasury - spent);
    expect(note(events)?.text).toMatch(/^The peddler left 12 stone and took .* coins? for it\.$/);
    expectMoneyInvariant(before, f.state);
  });

  it('brings at most 20 units a day across all orders', () => {
    const f = hamletFixture();
    const had = stone(f.state);
    stoneOrder(f, { min: had + 100 });
    untilHour(f.state, 10);
    expect(stone(f.state)).toBe(had + PEDDLER_IMPORT_UNITS);
  });

  it('honors the ceiling and buys nothing a neighbor does not sell', () => {
    const f = hamletFixture();
    const had = stone(f.state);
    stoneOrder(f, { min: had + 10, ceiling: 1 });
    untilHour(f.state, 10);
    expect(stone(f.state)).toBe(had);
    const g = hamletFixture();
    run(g.state, {
      t: 'trade.setStandingOrder',
      good: 'bread',
      order: { min: 500, max: 900, floor: 0, ceiling: 0, neighbor: '' },
    });
    const bread = townStock(g.state)[good('bread')]!;
    untilHour(g.state, 10);
    expect(townStock(g.state)[good('bread')]!).toBeLessThanOrEqual(bread);
  });

  it('stops at the credit line', () => {
    const f = hamletFixture();
    const had = stone(f.state);
    stoneOrder(f, { min: had + 20 });
    f.state.economy.treasury = -overdraftLimit(f.state) + 100;
    untilHour(f.state, 10);
    expect(stone(f.state)).toBeLessThan(had + 20);
    expect(f.state.economy.treasury).toBeGreaterThanOrEqual(-overdraftLimit(f.state));
  });

  it('charges 140 percent, dearer than the post would', () => {
    const f = hamletFixture();
    const post = postBuyPrice(f.state, 'stonecross', good('stone'));
    const peddler = postBuyPrice(f.state, 'stonecross', good('stone'), PEDDLER_IMPORT_PERCENT);
    expect(peddler!).toBeGreaterThan(post!);
  });
});
