// P3A (meals): the classifier of missed breakfasts (newcomerMeals.ts) and the money advisor's guard
// (no wage trims while households in work miss meals). One short autoplay gives a Village-rank town;
// each case then sets the household and the shelves by hand.
import { content } from '@qoti/content';
import { outletsWith, rankAtLeast, type Household, type WorldState } from '@qoti/sim';
import { beforeAll, describe, expect, it } from 'vitest';
import { workingHungry } from './advisors/money';
import { autoplay } from './autoplay';
import {
  classifyMeal,
  describeMeal,
  freshWindow,
  mealShares,
  MealTrace,
  MEAL_CAUSES,
  type MealWindow,
} from './newcomerMeals';

const VEG = content.goodIndex.get('vegetables')!;
const FOOD = content.goods.map((g, i) => (g.family === 'food' ? i : -1)).filter((i) => i >= 0);

let w: WorldState;
let h: Household;

beforeAll(() => {
  w = autoplay('willow', 16, { village: true, villageDay: 6 }).hamlet.world;
  h = w.households.find((x) => x.homeId && x.members.length >= 2)!;
}, 120_000);

/** Every outlet empty of food, then `ids` hold `n` vegetables at 100 pennies. */
function shelves(ids: number[], n = 20): void {
  for (const b of w.buildings) if (b.rt) for (const g of FOOD) b.rt.store[g] = 0;
  for (const id of ids) w.buildings.find((b) => b.id === id)!.rt!.store[VEG] = n;
  w.market.prices[VEG] = 100;
  w.levers.priceCaps[VEG] = 0;
  w.levers.subsidies[VEG] = 0;
}

const win = (over: Partial<MealWindow>): MealWindow => ({ ...freshWindow(h), ...over });

describe('classifyMeal', () => {
  it('starts from a Village', () => {
    expect(rankAtLeast(w, 'village')).toBe(true);
    expect(outletsWith(w, -1).length).toBeGreaterThan(1);
  });

  it('names each cause from the day the household had', () => {
    const outlets = outletsWith(w, -1);
    shelves([]);
    expect(classifyMeal(w, h, win({ maxSavings: 5000 })).cause).toBe('noOutlet');
    shelves(outlets);
    const members = h.members.length;
    expect(classifyMeal(w, h, win({ maxSavings: 50 })).cause).toBe('purseEmpty');
    expect(classifyMeal(w, h, win({ maxSavings: 5000 })).cause).toBe('noTrip');
    expect(classifyMeal(w, h, win({ maxSavings: 5000, gained: 1 })).cause).toBe('fewerUnits');
    expect(classifyMeal(w, h, win({ maxSavings: 5000, gained: members })).cause).toBe('other');
    // A trip that brought nothing home while food it could pay for sat on another shelf.
    expect(classifyMeal(w, h, win({ maxSavings: 5000, sawShop: true })).cause).toBe('cheaperElsewhere');
  });

  it('describes the case with the shelf and the prices', () => {
    shelves(outletsWith(w, -1));
    const c = classifyMeal(w, h, win({ maxSavings: 5000, gained: 1, spent: 100 }), 280);
    expect(c.wage).toBe(280);
    expect(c.shelfGoods[0]?.[0]).toBe('vegetables');
    expect(describeMeal(c)).toContain('vegetables 100p');
    expect(describeMeal(c)).toContain('fewerUnits');
  });

  it('counts the shares by cause', () => {
    shelves([]);
    const none = classifyMeal(w, h, win({ maxSavings: 5000 }));
    const sh = mealShares([none, none]);
    expect(sh.noOutlet).toBe(2);
    expect(MEAL_CAUSES.reduce((n, c) => n + sh[c], 0)).toBe(2);
  });
});

describe('MealTrace', () => {
  it('reads what a household did between two 08:00 looks, and only the hungry at Village rank', () => {
    shelves(outletsWith(w, -1));
    h.savings = 2000;
    for (const x of w.households) for (const g of FOOD) x.pantry[g] = 0;
    for (const r of w.residents) r.needs[0] = 80;
    const trace = new MealTrace();
    trace.look(w);
    // The household buys two units over the day: purse down, pantry up.
    h.savings = 1800;
    h.pantry[VEG] = 2;
    trace.look(w);
    for (const id of h.members) w.residents.find((r) => r.id === id)!.needs[0] = 20;
    const cases = trace.classifyHungry(w);
    expect(cases.map((c) => c.household)).toEqual([h.id]);
    expect(cases[0]).toMatchObject({ gained: 2, spent: 200, cause: 'fewerUnits' });
    // The window starts again: nothing hungry-read twice, nothing carried over.
    for (const r of w.residents) r.needs[0] = 80;
    expect(trace.classifyHungry(w)).toEqual([]);
  });
});

describe('the money advisor and hungry workers', () => {
  it('counts households with somebody in work whose food need says they missed breakfast', () => {
    for (const r of w.residents) r.needs[0] = 80;
    expect(workingHungry(w)).toBe(0);
    const worker = w.residents.find((r) => r.jobId && r.householdId)!;
    worker.needs[0] = 20;
    expect(workingHungry(w)).toBe(1);
    // A hungry household with nobody in work is the slate's, not the wage's.
    const jobless = w.households.find((x) =>
      x.members.every((id) => !w.residents.find((r) => r.id === id)!.jobId),
    );
    if (jobless) {
      worker.needs[0] = 80;
      for (const id of jobless.members) w.residents.find((r) => r.id === id)!.needs[0] = 20;
      expect(workingHungry(w)).toBe(0);
    }
  });
});
