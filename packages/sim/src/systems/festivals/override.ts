// The festival evening's schedule override (C5B; the schedule hook, priority 50: below the bell and
// storms, above Watch duty, skating and leisure). Tonight's guests walk to a spot on the site from
// 18:00 (finishing a shopping trip first) and stay until 22:00; then the day table sends them home.
import type { Activity, Resident, WorldState } from '../../contracts';
import { FESTIVAL } from '../../constants';
import { currentSite } from './api';
import { standTile } from './site';

export const FESTIVAL_PRIORITY = 50;

export function festivalGuest(state: WorldState, r: Resident, hour: number): Activity | null {
  const f = state.festival;
  if (!f.live || !f.guests || hour < FESTIVAL.from || hour >= FESTIVAL.to) return null;
  if (!binaryHas(f.guests, r.id)) return null;
  // An errand under way is finished first: the pantry still wants filling.
  if (r.activity.kind === 'shop') return null;
  const rect = currentSite(state);
  if (!rect) return null;
  const tile = standTile(state, rect, r.id);
  return tile < 0 ? null : { kind: 'leisure', tile };
}

function binaryHas(list: readonly number[], id: number): boolean {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid]!;
    if (v === id) return true;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

/** True while a resident is a guest standing on the festival site (the agent frame's flag). */
export function atFestival(state: WorldState, r: Resident): boolean {
  const f = state.festival;
  return f.live && !!f.guests && r.activity.kind === 'leisure' && binaryHas(f.guests, r.id);
}
