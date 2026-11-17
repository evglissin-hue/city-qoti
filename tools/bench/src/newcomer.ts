// P3A: the newcomer profile (docs/build/cycle-p3a-hands-food.md). The tuned autoplayer never meets
// the owner's spiral ("lack of workers, lack of food as a result") because it plays in the ideal
// order: homes zoned on the first morning, a workplace only while hands to spare, two sites a visit,
// places from the first evening. A newcomer pair plays as people do: the workplaces first (the guide's
// first letter takes the lane to the first work), Homes zoned on the third morning, the zone bars
// answered every few days in a lump, no places and no dressing for the first evenings, several sites
// at once and no labor sums. `autoplay(seed, days, { newcomer: true })` plays it; this module holds
// its numbers and what a run of it measures (hands, food, hunger, how long the first sites took).
import { content } from '@qoti/content';
import {
  BuildingStatus,
  doorTile,
  jobsOf,
  methodOf,
  nearestOutletWithFood,
  rankAtLeast,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type Building,
  type WorldState,
} from '@qoti/sim';

/** The workplaces a newcomer pair sets down on the first morning, all at once. */
export const NEWCOMER_FIRST_WORK: readonly string[] = [
  'quarry',
  'fishery',
  'foresters-lodge',
  'market-stall',
  'windmill',
];
/** The morning a newcomer pair first zones Homes (and first answers a bar). */
export const NEWCOMER_ZONES_FROM = 3;
/** Days between a newcomer pair's looks at the zone bars (each look zones in a lump). */
export const NEWCOMER_LUMP_EVERY = 3;
/** The first day the newcomer's Hearth composes places and dresses the town. */
export const NEWCOMER_HEARTH_FROM = 6;
/** The advisors that wait for NEWCOMER_HEARTH_FROM. */
export const NEWCOMER_LATE: readonly string[] = ['hearth', 'places', 'nature'];

/** A resident counts as hungry while their food need is under this (one missed breakfast: 80 - 35). */
export const HUNGRY_BELOW = 60;

/** Hour of the day (0 to 23) at a tick. */
export function hourAt(tick: number): number {
  return Math.floor(((tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY) / TICKS_PER_HOUR);
}

/** True when the building's method grows or makes Food. */
export function feedsTown(b: Pick<Building, 'def' | 'trade'>): boolean {
  const m = methodOf(b);
  if (!m) return false;
  if (m.kind === 'farm') return true;
  return m.outputs.some(([g]) => content.goodById.get(g)?.family === 'food');
}

/** Hands and jobs at one moment. */
export interface HandsNow {
  /** Working-age residents with a home and no job. */
  idle: number;
  /** Residents at work, by kind of work. */
  food: number;
  haul: number;
  other: number;
  /** Open job slots: at buildings that feed the town, and everywhere else (built, not paused or resting). */
  foodOpen: number;
  otherOpen: number;
  /** Food workplaces built with nobody at work (not resting). */
  foodEmpty: number;
}

export function handsNow(w: WorldState): HandsNow {
  const byId = new Map(w.buildings.map((b) => [b.id, b]));
  const out: HandsNow = { idle: 0, food: 0, haul: 0, other: 0, foodOpen: 0, otherOpen: 0, foodEmpty: 0 };
  for (const r of w.residents) {
    const b = r.jobId ? byId.get(r.jobId) : undefined;
    if (!b) {
      if (r.stage === 'young' || r.stage === 'adult') out.idle++;
      continue;
    }
    const role = content.buildingById.get(b.def)?.jobs?.role;
    if (role === 'porter' || role === 'builder') out.haul++;
    else if (feedsTown(b)) out.food++;
    else out.other++;
  }
  for (const b of w.buildings) {
    if (b.stage !== 'built' || !b.rt || b.rt.paused) continue;
    if (b.rt.status & BuildingStatus.resting) continue;
    const def = content.buildingById.get(b.def);
    const slots = b.trade ? jobsOf(b) : (def?.jobs?.count ?? 0);
    const open = Math.max(0, slots - b.rt.workers.length);
    if (feedsTown(b)) {
      out.foodOpen += open;
      if (open > 0 && b.rt.workers.length === 0) out.foodEmpty++;
    } else out.otherOpen += open;
  }
  return out;
}

/** Residents and households who missed a meal, and why the households did, as far as it shows. */
export interface Hunger {
  residents: number;
  households: number;
  /** Hungry households with no outlet with food they may shop at. */
  noOutlet: number;
  /** Hungry households at Village rank whose purse holds less than the cheapest food. */
  broke: number;
}

/** Residents and households whose food need says they missed a meal. */
export function hungerNow(w: WorldState): Hunger {
  const out: Hunger = { residents: 0, households: 0, noOutlet: 0, broke: 0 };
  const byId = new Map(w.residents.map((r) => [r.id, r]));
  const village = rankAtLeast(w, 'village');
  let cheapest = Infinity;
  content.goods.forEach((g, i) => {
    if (g.family === 'food') cheapest = Math.min(cheapest, w.market.prices[i] ?? Infinity);
  });
  for (const h of w.households) {
    let any = false;
    for (const id of h.members) {
      const r = byId.get(id);
      if (r && (r.needs[0] ?? 100) < HUNGRY_BELOW) {
        out.residents++;
        any = true;
      }
    }
    if (!any) continue;
    out.households++;
    const home = w.buildings.find((b) => b.id === h.homeId);
    if (home && !nearestOutletWithFood(w, doorTile(home))) out.noOutlet++;
    else if (village && h.savings < cheapest) out.broke++;
  }
  return out;
}

/** How long sites took: the hour each grown or placed building was first seen going up, and built. */
export class SiteClock {
  private readonly seen = new Map<number, { def: string; trade?: string; from: number; built?: number }>();

  look(w: WorldState): void {
    const hour = Math.floor(w.tick / TICKS_PER_HOUR);
    for (const b of w.buildings) {
      let s = this.seen.get(b.id);
      if (!s && b.stage === 'construction') this.seen.set(b.id, (s = { def: b.def, from: hour }));
      if (s && b.stage === 'built' && s.built === undefined) {
        s.built = hour;
        s.trade = b.trade;
      }
    }
  }

  /** The first `n` sites of `pick` to finish: [hours from first seen to built, day it was built]. */
  first(pick: (def: string, trade?: string) => boolean, n: number): [hours: number, day: number][] {
    const done = [...this.seen.values()]
      .filter((s) => s.built !== undefined && pick(s.def, s.trade))
      .sort((a, b) => a.built! - b.built!);
    return done
      .slice(0, n)
      .map((s) => [s.built! - s.from, Math.floor((s.built! * TICKS_PER_HOUR) / TICKS_PER_DAY) + 1]);
  }
}

/** True for a home def (grown or placed). */
export function isHomeDef(def: string): boolean {
  return !!content.buildingById.get(def)?.housing && !content.buildingById.get(def)?.jobs;
}
