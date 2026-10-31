// The seasons advisor (C5A): winter in sight, it asks the planner for what a town needs to get
// through it. From Summer day 3 it wants a chopping shed (one per twelve homes) while the woodpile
// is short of ten days a household (pressing once autumn comes), it keeps eight days of food back
// from the peddler from late spring to the thaw (nothing grows in winter), asks for vegetable plots
// in summer and autumn while the larder is short of a winter, and a
// Village with a dozen homes and the coins asks for a Bath House. It never places anything itself.
import { calendar, larder, rankAtLeast, townStock, type WorldState } from '@qoti/sim';
import { costOf, type Planner } from '../planner';
import { count, G } from '../town';
import type { Advisor, AdvisorDef, Visit } from './types';

/** Days of firewood a household the advisor wants in town before winter. */
export const WOOD_DAYS = 10;
/** Days of food kept back from the peddler through autumn and winter. */
export const WINTER_FOOD_DAYS = 8;

/** Firewood in the storehouses and in the households' pantries. */
export function firewoodInTown(w: WorldState): number {
  const g = G('firewood');
  let n = townStock(w)[g] ?? 0;
  for (const h of w.households) n += h.pantry[g] ?? 0;
  return n;
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
    const homes = w.households.length;
    const inSight = season >= 2 || (season === 1 && day >= 3);
    if (inSight && homes > 0 && firewoodInTown(w) < homes * WOOD_DAYS) {
      const sheds = count(w, 'chopping-shed');
      if (sheds < 1 + Math.floor(homes / 12)) {
        p.propose({
          def: 'chopping-shed',
          priority: season >= 2 ? 4 : 2,
          cost: costOf('chopping-shed'),
          pressing: season >= 2,
          essential: true,
        });
      }
    }
    // From late spring to the thaw the peddler leaves the winter's food alone.
    const putBy = season >= 1 || day >= 4;
    if (putBy) {
      this.base ??= p.foodReserveDays;
      p.foodReserveDays = Math.max(this.base, WINTER_FOOD_DAYS);
    } else if (this.base !== null) {
      p.foodReserveDays = this.base;
      this.base = null;
    }
    // Summer and autumn: short of a winter's larder, another vegetable plot (gardens grow until
    // the frost; nothing does after).
    const pop = w.residents.length;
    if ((season === 1 || season === 2) && pop > 0 && larder(w) < pop * WINTER_FOOD_DAYS) {
      const plots = count(w, 'vegetable-plot');
      if (plots < 2 + Math.floor(pop / 5)) {
        p.propose({
          def: 'vegetable-plot',
          priority: season === 2 ? 4 : 3,
          cost: costOf('vegetable-plot'),
          pressing: season === 2,
          essential: true,
        });
      }
    }
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
}

export const seasons: AdvisorDef = {
  id: 'seasons',
  // After the Hamlet's homes and food (50), before the Hearth's decor (60).
  slot: 55,
  plays: (_opts, w) => w.settings.mode === 'standard',
  create: (p) => new Seasons(p),
};
