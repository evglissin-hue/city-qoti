// R2X: newcomers follow good evenings (docs/spec/19-evenings.md, The loop: "Good evenings make
// friends, couples, bonds and, in time, masters. Masters and newcomers make the workforce"). Past
// `growthFreeHouseholds` a town builds homes for newcomers only as fast as its recent fair evenings
// send folk out, so a town with nowhere to go fills the jobs it has and stops there (the lanes test,
// docs/spec/22-quality.md). Pure reads of saved state: the evening tallies.
import { content } from '@qoti/content';
import { TICKS_PER_HOUR } from '../../constants';
import type { EveningTally, WorldState } from '../../contracts';
import { tickOfDay } from '../economy/time';

/**
 * The share of grown-ups out on the town's recent fair evenings (the tallies kept, and tonight's once
 * it has closed), percent; null while none was fair.
 */
export function recentOutShare(state: WorldState): number | null {
  const P = content.places;
  const ev = state.evenings;
  let out = 0;
  let grown = 0;
  const add = (t: EveningTally): void => {
    if (t.day < 0 || t.weather !== 'fair' || t.grownups <= 0) return;
    out += t.out;
    grown += t.grownups;
  };
  for (const t of ev.history) add(t);
  const tod = tickOfDay(state.tick);
  const open = tod >= P.eveningHour * TICKS_PER_HOUR && tod < P.homeHour * TICKS_PER_HOUR;
  if (!open) add(ev.tonight);
  return grown > 0 ? Math.round((out * 100) / grown) : null;
}

/** How fast homes come, percent of the jobs' pace: 100 under the free households or before any fair evening. */
export function homesPace(state: WorldState): number {
  const P = content.places;
  const free = P.growthFreeHouseholds;
  const full = P.growthFullOutPercent;
  if (free === undefined || !full || state.households.length < free) return 100;
  const share = recentOutShare(state);
  if (share === null) return 100;
  return Math.min(100, Math.floor((share * 100) / full));
}

/** R2X: true when the town's growth waits on its evenings (past the free households, under full pace). */
export function growthWaitsOnEvenings(state: WorldState): boolean {
  return homesPace(state) < 100;
}
