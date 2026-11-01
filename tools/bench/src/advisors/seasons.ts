// The seasons advisor (C5A): winter in sight, it asks the planner for what a town needs to get
// through it. It never places anything itself; it proposes wants and sets the planner's winter
// flags, which the other advisors read when they rest their workplaces.
// - Firewood: from Summer day 3, while the woodpile (stores and pantries) is short of the winter
//   ahead, a chopping shed for every day's burn one shed can chop (households x 1 a day), a
//   woodcutter while the sheds and sawpits want more logs than the woodcutters fell, and
//   `woodShort`, so the sawpits leave logs for a shed waiting on them.
// - Food: from late spring to the thaw the peddler leaves eight days of food alone (nothing grows
//   in winter); in summer and autumn, while the larder is short of a winter, vegetable plots enough
//   to make it up before the frost, pressing, and `larderShort`, so a Hamlet rests its sawpits and
//   quarry while planks and stone are plentiful and their hands go to the plots.
// - Winter: plots, orchards, fishers' huts and fallow farms that can make nothing this season rest
//   until the thaw, so their hands go to the sheds and woodcutters, and a town with no farm asks for
//   one, so its fields are ready for the spring sowing and next winter has wheat.
// - A Village with a dozen homes and the coins asks for a Bath House, and while a flood is
//   forecast the planner keeps new buildings off the floodplain.
import { content } from '@qoti/content';
import {
  BuildingStatus,
  calendar,
  DAYS_PER_SEASON,
  isFrozen,
  larder,
  rankAtLeast,
  townStock,
  WARMTH_PER_HOUSEHOLD,
  winterDaysAhead,
  WORK_HOURS,
  type Building,
  type WorldState,
} from '@qoti/sim';
import { costOf, type Planner } from '../planner';
import { count, FOODS, G } from '../town';
import type { Advisor, AdvisorDef, Visit } from './types';

/** Days of firewood a household the advisor wants in town before winter (six to burn, a cold snap's two, two spare). */
export const WOOD_DAYS = 10;
/** Days of food a resident kept back from the peddler, and wanted in the larder, before winter. */
export const WINTER_FOOD_DAYS = 8;

const WORK_DAY = WORK_HOURS[1] - WORK_HOURS[0];

/** What a building's first method takes in (negative) or makes of `good` in a full work day. */
function perDay(def: string, good: string): number {
  const m = content.buildingById.get(def)?.methods?.[0];
  if (!m || m.hours <= 0) return 0;
  const crew = m.perWorker ? Math.max(1, m.workers) : 1;
  const out = m.outputs.find(([g]) => g === good)?.[1] ?? 0;
  const inp = m.inputs.find(([g]) => g === good)?.[1] ?? 0;
  return ((out - inp) * crew * WORK_DAY) / m.hours;
}

/** Firewood in the storehouses and in the households' pantries. */
export function firewoodInTown(w: WorldState): number {
  const g = G('firewood');
  let n = townStock(w)[g] ?? 0;
  for (const h of w.households) n += h.pantry[g] ?? 0;
  return n;
}

/**
 * Firewood the town wants in hand now: from Summer day 3 to the end of autumn WOOD_DAYS a
 * household; in winter the days left of it and a cold snap's extra two; none before.
 */
export function woodNeed(w: WorldState): number {
  const { season, day } = calendar(w.tick);
  const days =
    season === 3 ? DAYS_PER_SEASON - day + 1 + 2 : season === 2 || (season === 1 && day >= 3) ? WOOD_DAYS : 0;
  return w.households.length * WARMTH_PER_HOUSEHOLD * days;
}

/** True from a flood's forecast until it ends. */
export function floodInSight(w: WorldState): boolean {
  return w.weather.events.some((e) => e.event === 'flood' && e.forecastTick <= w.tick && e.end > w.tick);
}

/**
 * A workplace that can make nothing this season: a garden or orchard in winter, a fisher on the
 * ice, a farm whose fields lie fallow until the spring sowing.
 */
function idleThisSeason(w: WorldState, b: Building): boolean {
  const def = content.buildingById.get(b.def);
  const m = def?.methods?.[0];
  if (m?.kind === 'farm') return (b.rt!.status & BuildingStatus.fallow) !== 0 && calendar(w.tick).season >= 2;
  if (!def || !m || m.kind !== 'gather') return false;
  const first = m.outputs[0]?.[0];
  if (first === 'fish' && def.placement?.some((p) => p.kind === 'waterEdge') && isFrozen(w)) return true;
  const table = first ? content.goodById.get(first)?.seasons : undefined;
  return !!table && table[calendar(w.tick).season] === 0;
}

class Seasons implements Advisor {
  /** The food reserve before winter raised it, restored in spring. */
  private base: number | null = null;
  /** Gatherers rested for the season (reopened once they can work again). */
  private readonly resting = new Set<number>();

  constructor(readonly p: Planner) {}

  visit(v: Visit): void {
    if (v.afternoon) return;
    const p = this.p;
    const w = p.w;
    const { season, day } = calendar(w.tick);
    // Once a flood is forecast, and until it drains, nothing new goes on the floodplain.
    p.keepOffFloodplain = floodInSight(w);
    this.firewood(season);
    this.food(season, day);
    this.winter();
    // Wheat for next winter: a farmhouse goes up in winter, when the plots rest and hands are free,
    // so its fields are ready for the spring sowing (one built after Spring day 3 grows no wheat that
    // year, and next winter has only what the gardens put by). It rests while they lie fallow (below).
    if (season === 3 && w.residents.length >= 20 && count(w, 'farmhouse') === 0) {
      p.propose({
        def: 'farmhouse',
        priority: 4,
        cost: costOf('farmhouse'),
        pressing: true,
        essential: true,
      });
    }
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

  /** Sheds for the winter's burn, and logs for the sheds, while the woodpile is short. */
  private firewood(season: number): void {
    const p = this.p;
    const w = p.w;
    const homes = w.households.length;
    const need = woodNeed(w);
    p.woodShort = need > 0 && firewoodInTown(w) < need;
    if (!p.woodShort) return;
    const autumn = season >= 2;
    const sheds = count(w, 'chopping-shed');
    // Sized by what winter burns: a household's firewood a day, one shed's full day's chopping each.
    // The first goes up early: a woodpile takes a season to build.
    if (sheds < Math.ceil((homes * WARMTH_PER_HOUSEHOLD) / perDay('chopping-shed', 'firewood'))) {
      p.propose({
        def: 'chopping-shed',
        priority: autumn || sheds === 0 ? 4 : 2,
        cost: costOf('chopping-shed'),
        pressing: autumn || sheds === 0,
        essential: true,
      });
    }
    // Logs for the sheds and sawpits standing: a woodcutter while they want more than the
    // woodcutters fell (a shed with no logs chops nothing).
    const want = -w.buildings.reduce(
      (n, b) => n + (b.stage === 'built' && !b.rt?.paused ? Math.min(0, perDay(b.def, 'logs')) : 0),
      0,
    );
    const felled = count(w, 'woodcutter') * perDay('woodcutter', 'logs');
    const chopping = w.buildings.some(
      (b) => b.def === 'chopping-shed' && b.stage === 'built' && b.rt?.paused === false,
    );
    if (chopping && felled < want && townStock(w)[G('logs')]! < 16) {
      p.propose({
        def: 'woodcutter',
        priority: autumn ? 4 : 3,
        cost: costOf('woodcutter'),
        pressing: autumn,
        essential: true,
      });
    }
  }

  /** The winter's larder: kept from the peddler, and plots enough to fill it before the frost. */
  private food(season: number, day: number): void {
    const p = this.p;
    const w = p.w;
    // From late spring to the thaw the peddler leaves the winter's food alone.
    const putBy = season >= 1 || day >= 4;
    if (putBy) {
      this.base ??= p.foodReserveDays;
      p.foodReserveDays = Math.max(this.base, WINTER_FOOD_DAYS);
    } else if (this.base !== null) {
      p.foodReserveDays = this.base;
      this.base = null;
    }
    const pop = w.residents.length;
    this.bread(season, pop);
    const behind = pop * WINTER_FOOD_DAYS - larder(w);
    // Summer and autumn: short of a winter's larder, the plots should make it up before the frost
    // (gardens grow until winter; nothing does after).
    p.larderShort = (season === 1 || season === 2) && pop > 0 && behind > 0;
    if (!p.larderShort) return;
    const daysLeft = (season === 1 ? DAYS_PER_SEASON : 0) + DAYS_PER_SEASON - day + 1;
    const made = FOODS.reduce((n, g) => n + (w.economy.yesterday.produced[g] ?? 0), 0);
    // The last two days of autumn are too late for a new plot to pay for its planks.
    const late = season === 2 && day >= DAYS_PER_SEASON - 1;
    if (!late && made < pop + behind / daysLeft && count(w, 'vegetable-plot') < 2 + Math.floor(pop / 3)) {
      p.propose({
        def: 'vegetable-plot',
        priority: season === 2 ? 4 : 3,
        cost: costOf('vegetable-plot'),
        pressing: true,
        essential: true,
      });
    }
  }

  /**
   * Wheat put by is bread only as fast as the mills and bakeries make it: from the harvest to the
   * thaw, while the barn holds more than the bakeries can bake by spring and the rest of the larder
   * is short of what is left of the winter, another mill or bakery (a Village of 66 ate short beside
   * 400 wheat with one of each).
   */
  private bread(season: number, pop: number): void {
    const p = this.p;
    const w = p.w;
    const days = winterDaysAhead(w);
    if (season < 2 || days === 0 || count(w, 'farmhouse', true) === 0) return;
    const stock = townStock(w);
    const grain = stock[G('wheat')]! + stock[G('flour')]!;
    const food = larder(w) - grain;
    const bakeries = count(w, 'bakery');
    if (grain <= bakeries * perDay('bakery', 'bread') * days || food >= pop * days) return;
    // A mill grinds enough for two bakeries.
    const def = count(w, 'windmill') * 2 <= bakeries ? 'windmill' : 'bakery';
    p.propose({ def, priority: 4, cost: costOf(def), pressing: true, essential: true });
  }

  /** Gatherers with nothing to do this season rest, so their hands go where there is work. */
  private winter(): void {
    const p = this.p;
    for (const b of p.w.buildings) {
      if (b.stage !== 'built' || !b.rt) continue;
      const idle = idleThisSeason(p.w, b);
      if (idle === b.rt.paused || (!idle && !this.resting.has(b.id))) continue;
      if (idle) this.resting.add(b.id);
      else this.resting.delete(b.id);
      p.do(`${idle ? 'rest' : 'reopen'} the ${b.def} for the season`, [
        { t: 'build.setPaused', id: b.id, paused: idle },
      ]);
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
