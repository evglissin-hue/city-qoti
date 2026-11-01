// C5A: arrivals weigh the winter (docs/spec/11-residents.md, Arrival and departure; 14-challenge.md,
// Seasons, As built): from autumn to the thaw a family moves in only while the larder could see the
// town, them included, through the winter, and while it could not the jobs system puts the gardens
// first; the chopping sheds come first while the woodpile could not. The days are read from the
// seasons API and the bakery's rate from content, not pinned.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, WARMTH_PER_HOUSEHOLD, WORK_HOURS } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { rngFromSeed } from '../../src/rng/streams';
import { createTickCtx } from '../../src/turn';
import { shortages } from '../../src/systems/residents/jobs';
import { arrivals } from '../../src/systems/residents/lifecycle';
import { larderWelcomes, THAW_DAYS, winterDaysAhead, woodpileShort } from '../../src/systems/seasons/api';
import { larderWithin } from '../../src/systems/seasons/stores';
import { hamletFixture } from '../fixtures/hamlet';
import { tickAt } from '../fixtures/seasonsPlace';
import { placeBuilding } from '../residents/helpers';

const G = (id: string) => content.goodIndex.get(id)!;
const GRAIN = new Set([G('wheat'), G('flour')]);

/** Empties the town's food, grain and firewood, then stores `food` vegetables and `wheat` wheat. */
function stock(state: WorldState, food: number, wheat = 0, firewood = 0): void {
  for (const b of state.buildings) {
    if (!b.rt) continue;
    for (let g = 0; g < content.goods.length; g++) {
      if (!content.goods[g]!.food && !GRAIN.has(g) && g !== G('firewood')) continue;
      b.rt.store[g] = 0;
      b.rt.output[g] = 0;
    }
  }
  for (const h of state.households) h.pantry = h.pantry.map(() => 0);
  const store = state.buildings.find((b) => b.def === 'storehouse')!;
  store.rt!.store[G('vegetables')] = food;
  store.rt!.store[G('wheat')] = wheat;
  store.rt!.store[G('firewood')] = firewood;
}

/** Bread a bakery bakes in a full work day, from its content method. */
function bakeryDay(): number {
  const m = content.buildingById.get('bakery')!.methods![0]!;
  const bread = m.outputs.find(([g]) => g === 'bread')![1];
  return (bread * (WORK_HOURS[1] - WORK_HOURS[0]) * (m.perWorker ? m.workers : 1)) / m.hours;
}

describe('arrivals weigh the winter', () => {
  it('ask nothing of the larder in spring and summer', () => {
    const { state } = hamletFixture();
    stock(state, 0);
    for (const season of [0, 1]) {
      state.tick = tickAt(0, season, 3, 10);
      expect(winterDaysAhead(state)).toBe(0);
      expect(larderWelcomes(state, 4)).toBe(true);
    }
  });

  it("want a winter's eating and the thaw's in hand through autumn, for the newcomers too", () => {
    const { state } = hamletFixture();
    state.tick = tickAt(0, 2, 2, 10);
    const days = DAYS_PER_SEASON + THAW_DAYS[0];
    expect(winterDaysAhead(state)).toBe(days);
    const need = (state.residents.length + 4) * days;
    stock(state, need - 1);
    expect(larderWelcomes(state, 4)).toBe(false);
    expect(larderWelcomes(state, 0)).toBe(true);
    stock(state, need);
    expect(larderWelcomes(state, 4)).toBe(true);
  });

  it('count wheat in autumn only as far as the bakeries can bake it by the thaw', () => {
    const { state } = hamletFixture();
    state.tick = tickAt(0, 2, 1, 10);
    const bakeries = state.buildings.filter((b) => b.def === 'bakery').length;
    expect(bakeries).toBeGreaterThan(0);
    const days = winterDaysAhead(state);
    const bakeable = Math.floor(bakeries * bakeryDay() * days);
    stock(state, 30, bakeable + 500);
    expect(larderWithin(state, days)).toBe(30 + bakeable);
    stock(state, 30, 20);
    expect(larderWithin(state, days)).toBe(50);
  });

  it('in winter want the days left and the thaw, from what is on the shelves', () => {
    const { state } = hamletFixture();
    state.tick = tickAt(0, 3, 4, 10);
    const days = DAYS_PER_SEASON - 4 + 1 + THAW_DAYS[1];
    expect(winterDaysAhead(state)).toBe(days);
    const need = (state.residents.length + 1) * days;
    // A barn full of wheat feeds no newcomer this winter.
    stock(state, need - 1, 10_000);
    expect(larderWelcomes(state, 1)).toBe(false);
    stock(state, need);
    expect(larderWelcomes(state, 1)).toBe(true);
  });

  it('hold families at the gate until the larder can see them through, each counting its own', () => {
    const f = hamletFixture();
    const s = f.state;
    for (let i = 0; i < 6; i++) placeBuilding(s, 'cottage', 76 + 3 * i, 52 + (i % 2) * 6);
    s.tick = tickAt(0, 2, 3, 10);
    s.stats.attractiveness = 100;
    const ctx = createTickCtx(s);
    const before = s.residents.length;
    stock(s, (before + 1) * winterDaysAhead(s) - 1);
    expect(arrivals(s, ctx, rngFromSeed('gate'))).toBe(0);
    expect(s.residents.length).toBe(before);
    stock(s, 10_000);
    expect(arrivals(s, ctx, rngFromSeed('gate'))).toBeGreaterThan(0);
    expect(s.residents.length).toBeGreaterThan(before);
  });

  it('put the gardens first in autumn while a family waits, and the sheds while the woodpile is short', () => {
    const { state } = hamletFixture();
    state.tick = tickAt(0, 2, 2, 10);
    stock(state, 0);
    expect(shortages(state).winter).toBe(true);
    expect(woodpileShort(state)).toBe(true);
    expect(shortages(state).goods.has('firewood')).toBe(true);
    const days = winterDaysAhead(state);
    stock(state, 10_000, 0, state.households.length * WARMTH_PER_HOUSEHOLD * days);
    expect(shortages(state).winter).toBe(false);
    expect(woodpileShort(state)).toBe(false);
    expect(shortages(state).goods.has('firewood')).toBe(false);
    // Summer: nothing is held back for the winter yet.
    state.tick = tickAt(0, 1, 2, 10);
    stock(state, 0);
    expect(shortages(state).winter).toBe(false);
    expect(woodpileShort(state)).toBe(false);
  });
});
