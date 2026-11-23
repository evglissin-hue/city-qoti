// P3A (meals): why a household missed breakfast. The owner's first complaint was "lack of food": at
// Village rank households with savings, in towns with food on the shelves, went without breakfast on
// 20 to 50 of 70 days. `MealTrace` watches every household through the day (hourly looks), and at
// 08:00 `classifyHungry` names the cause of each household that missed this morning's meal, from what
// the household did since the last 08:00: whether it walked to a shelf, what it could pay, what it
// carried home. `npm run newcomer` uses it (MEALS=1 prints the shares and the sample households), and
// the audit's `meals-missed` health kind reads the same condition (packages/sim/src/view/health.ts).
import { content } from '@qoti/content';
import {
  doorTile,
  foodIndexes,
  nearestOutletWithFood,
  outletFree,
  outletsWith,
  pantryFood,
  rankAtLeast,
  tillPrice,
  wageBill,
  type Household,
  type WorldState,
} from '@qoti/sim';
import { HUNGRY_BELOW } from './newcomer';

/** Why a household missed breakfast, as far as the day's record shows. */
export type MealCause =
  /** No outlet holds food it may shop at. */
  | 'noOutlet'
  /** Nobody went shopping and nothing came home, with a purse that could have paid for food. */
  | 'noTrip'
  /** The purse never held the price of the cheapest food on any shelf. */
  | 'purseEmpty'
  /** A trip found nothing it could pay for on its shelf while food it could pay for sat on another. */
  | 'cheaperElsewhere'
  /** A trip bought some food, fewer units than the household eats in a day. */
  | 'fewerUnits'
  /** A trip bought enough for a day and the household still missed (timing, a pantry kept low). */
  | 'other';

export const MEAL_CAUSES: readonly MealCause[] = [
  'noOutlet',
  'noTrip',
  'purseEmpty',
  'cheaperElsewhere',
  'fewerUnits',
  'other',
];

/** What one household did between two 08:00 looks. */
export interface MealWindow {
  /** Units of food that came into the pantry (every rise between looks). */
  gained: number;
  /** Pennies the household's purse lost between looks (what it paid at the till). */
  spent: number;
  /** Someone was seen walking to a shelf. */
  sawShop: boolean;
  /** The highest purse seen in the window, pennies. */
  maxSavings: number;
  lastSavings: number;
  lastPantry: number;
  /** Hourly looks in the window with the pantry under two days of food (the trigger for a trip). */
  lowLooks: number;
}

export interface MealCase {
  household: number;
  members: number;
  workers: number;
  cause: MealCause;
  /** The purse now, and the window's highest, pennies. */
  savings: number;
  maxSavings: number;
  /** Today's gross wage, pennies (0 with nobody in work). */
  wage: number;
  gained: number;
  spent: number;
  /** Hourly looks with the pantry under two days (a trip was wanted). */
  lowLooks: number;
  /** The nearest shelf with food: its building id, and each food on it as [name, price, free units]. */
  shelf: number;
  shelfGoods: [string, number, number][];
  /** The cheapest food in the town's shops, pennies (Infinity when no shelf holds food). */
  cheapest: number;
}

export function freshWindow(h: Household): MealWindow {
  return {
    gained: 0,
    spent: 0,
    sawShop: false,
    maxSavings: h.savings,
    lastSavings: h.savings,
    lastPantry: pantryFood(h),
    lowLooks: 0,
  };
}

/** Cheapest food (till price) on any outlet's shelf, pennies. */
export function cheapestFood(w: WorldState): number {
  let best = Infinity;
  for (const g of foodIndexes()) if (outletsWith(w, g).length > 0) best = Math.min(best, tillPrice(w, g));
  return best;
}

/** True when some outlet other than `not` holds a food at a till price within `purse`. */
function affordableElsewhere(w: WorldState, purse: number, not: number): boolean {
  for (const g of foodIndexes()) {
    if (tillPrice(w, g) > purse) continue;
    if (outletsWith(w, g).some((id) => id !== not)) return true;
  }
  return false;
}

/** The cause for one household that missed breakfast, from its window. Pure given the state. */
export function classifyMeal(
  w: WorldState,
  h: Household,
  win: MealWindow,
  wage = wageBill(w).get(h.id) ?? 0,
): MealCase {
  const home = w.buildings.find((b) => b.id === h.homeId);
  const shelf = home ? nearestOutletWithFood(w, doorTile(home)) : 0;
  const shelfGoods: [string, number, number][] = [];
  if (shelf)
    for (const g of foodIndexes()) {
      const free = outletFree(w, shelf, g);
      if (free > 0) shelfGoods.push([content.goods[g]!.id, tillPrice(w, g), free]);
    }
  const cheapest = cheapestFood(w);
  const members = h.members.length;
  const tripped = win.gained > 0 || win.sawShop;
  let cause: MealCause;
  if (!shelf) cause = 'noOutlet';
  else if (win.maxSavings < cheapest) cause = 'purseEmpty';
  else if (!tripped) cause = 'noTrip';
  else if (win.gained === 0 && affordableElsewhere(w, win.maxSavings, shelf)) cause = 'cheaperElsewhere';
  else if (win.gained < members) cause = 'fewerUnits';
  else cause = 'other';
  return {
    household: h.id,
    members,
    workers: 0,
    cause,
    savings: h.savings,
    maxSavings: win.maxSavings,
    wage,
    gained: win.gained,
    spent: win.spent,
    lowLooks: win.lowLooks,
    shelf,
    shelfGoods,
    cheapest,
  };
}

/** Watches households hourly; `classifyHungry` reads and resets the windows at 08:00. */
export class MealTrace {
  private readonly windows = new Map<number, MealWindow>();

  /** An hourly look: what changed in each purse and pantry since the last. */
  look(w: WorldState): void {
    for (const h of w.households) {
      const win = this.windows.get(h.id) ?? freshWindow(h);
      this.windows.set(h.id, win);
      const pantry = pantryFood(h);
      if (pantry > win.lastPantry) win.gained += pantry - win.lastPantry;
      if (h.savings < win.lastSavings) win.spent += win.lastSavings - h.savings;
      if (pantry < 2 * Math.max(1, h.members.length)) win.lowLooks++;
      win.lastPantry = pantry;
      win.lastSavings = h.savings;
      win.maxSavings = Math.max(win.maxSavings, h.savings);
      for (const id of h.members) {
        const r = w.residents.find((x) => x.id === id);
        if (r?.activity.kind === 'shop') win.sawShop = true;
      }
    }
  }

  /**
   * At 08:00: the households whose food need says they missed breakfast, each with its cause, at
   * Village rank only (before it food is free and nobody is short for want of coin). Starts new windows.
   */
  classifyHungry(w: WorldState): MealCase[] {
    this.look(w);
    const out: MealCase[] = [];
    const bill = wageBill(w);
    const village = rankAtLeast(w, 'village');
    for (const h of w.households) {
      const win = this.windows.get(h.id)!;
      const hungry = h.members.some((id) => {
        const r = w.residents.find((x) => x.id === id);
        return r && (r.needs[0] ?? 100) < HUNGRY_BELOW;
      });
      if (hungry && village) {
        const c = classifyMeal(w, h, win, bill.get(h.id) ?? 0);
        c.workers = h.members.filter((id) => (w.residents.find((x) => x.id === id)?.jobId ?? 0) !== 0).length;
        out.push(c);
      }
      this.windows.set(h.id, freshWindow(h));
    }
    for (const id of [...this.windows.keys()])
      if (!w.households.some((h) => h.id === id)) this.windows.delete(id);
    return out;
  }
}

/** Counts by cause (every cause present). */
export function mealShares(cases: readonly MealCase[]): Record<MealCause, number> {
  const out = Object.fromEntries(MEAL_CAUSES.map((c) => [c, 0])) as Record<MealCause, number>;
  for (const c of cases) out[c.cause]++;
  return out;
}

/** One case in words, for the trace. */
export function describeMeal(c: MealCase): string {
  const shelf = c.shelfGoods.map(([g, p, n]) => `${g} ${p}p x${n}`).join(', ') || 'no food';
  return (
    `hh${c.household} ${c.members} members (${c.workers} in work) ${c.cause}: purse ${c.savings}p ` +
    `(peak ${c.maxSavings}p), wage ${c.wage}p, bought ${c.gained} units for ${c.spent}p (${c.lowLooks} low-pantry hours), ` +
    `shelf #${c.shelf} [${shelf}], cheapest in town ${c.cheapest === Infinity ? 'none' : `${c.cheapest}p`}`
  );
}
