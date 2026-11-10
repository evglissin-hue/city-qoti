// The seasons advisor (C5A): winter in sight, it asks the planner for what a town needs to get
// through it. It never places anything itself; it proposes wants and sets the planner's flags.
// - Food: from late spring to the thaw the festival menu leaves eight days of food a resident alone
//   (nothing grows in winter); in summer and autumn, while the larder is short of a winter, a
//   fishery while the river is open, pressing, and `larderShort`.
// - A Village with a dozen homes and the coins asks for a Bath House, and while a flood is
//   forecast the planner keeps new buildings off the floodplain.
// R1.0: firewood, the winter farm, the bread chain and resting idle gatherers are gone with the
// chains: the carrier buys Fuel and Food short of their reserves by itself, the Forester's Lodge
// cuts toward the season plan's Fuel mark (R1B), and a business with nothing to do rests by itself
// (labor needs no lever). R1 stand-in (R1F): R1F's season plan advisor tends the plan instead.
import { calendar, DAYS_PER_SEASON, larder, rankAtLeast, type WorldState } from '@qoti/sim';
import { costOf, type Planner } from '../planner';
import { count, FOODS } from '../town';
import type { Advisor, AdvisorDef, Visit } from './types';

/** Days of food a resident the menu leaves, and wanted in the larder, before winter. */
export const WINTER_FOOD_DAYS = 8;

/** True from a flood's forecast until it ends. */
export function floodInSight(w: WorldState): boolean {
  return w.weather.events.some((e) => e.event === 'flood' && e.forecastTick <= w.tick && e.end > w.tick);
}

class Seasons implements Advisor {
  /** The food reserve before winter raised it, restored in spring. */
  private base: number | null = null;

  constructor(readonly p: Planner) {}

  visit(v: Visit): void {
    if (v.afternoon) return;
    const p = this.p;
    const w = p.w;
    const { season, day } = calendar(w.tick);
    // Once a flood is forecast, and until it drains, nothing new goes on the floodplain.
    p.keepOffFloodplain = floodInSight(w);
    this.food(season, day);
    const homes = w.households.length;
    if (rankAtLeast(w, 'village') && homes >= 12 && count(w, 'bath-house') < 1 + Math.floor(homes / 30)) {
      p.propose({
        def: 'bath-house',
        priority: 2,
        cost: costOf('bath-house', 10),
        pressing: false,
        essential: false,
      });
    }
  }

  /** The winter's larder: kept from the menu, and a fishery to help fill it before the frost. */
  private food(season: number, day: number): void {
    const p = this.p;
    const w = p.w;
    // From late spring to the thaw the menu leaves the winter's food alone.
    const putBy = season >= 1 || day >= 4;
    if (putBy) {
      this.base ??= p.foodReserveDays;
      p.foodReserveDays = Math.max(this.base, WINTER_FOOD_DAYS);
    } else if (this.base !== null) {
      p.foodReserveDays = this.base;
      this.base = null;
    }
    const pop = w.residents.length;
    const behind = pop * WINTER_FOOD_DAYS - larder(w);
    p.larderShort = (season === 1 || season === 2) && pop > 0 && behind > 0;
    if (!p.larderShort) return;
    const daysLeft = (season === 1 ? DAYS_PER_SEASON : 0) + DAYS_PER_SEASON - day + 1;
    const made = FOODS.reduce((n, g) => n + (w.economy.yesterday.produced[g] ?? 0), 0);
    // The last two days of autumn are too late for a new fishery to pay for its timber.
    const late = season === 2 && day >= DAYS_PER_SEASON - 1;
    const def = p.foodBuilding();
    if (def && !late && made < pop + behind / daysLeft && count(w, def) < 1 + Math.floor(pop / 8)) {
      p.propose({
        def,
        priority: season === 2 ? 4 : 3,
        cost: costOf(def),
        pressing: true,
        essential: true,
      });
    }
  }
}

export const seasons: AdvisorDef = {
  id: 'seasons',
  // After the Hamlet's homes and food (50), before the Hearth's decor (60).
  slot: 55,
  plays: (_opts, w) => w.settings.mode === 'standard',
  create: (p) => new Seasons(p),
};
