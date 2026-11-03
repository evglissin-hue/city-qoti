// Code predicates for Barnaby Ashcombe's arc (C5D; registered in conditions/code.ts).
import type { WorldState } from '../../contracts';

/** A raid has been telegraphed (its signs are up) or one has already come. */
export function raidSeen(state: WorldState): boolean {
  const r = state.threats.scheduled;
  return state.threats.history.length > 0 || (r !== null && state.tick >= r.telegraphTick);
}

/** The Watch has a guard point and at least two members. */
export function watchPosted(state: WorldState): boolean {
  return state.watch.posture.length > 0 && state.watch.members.length >= 2;
}

/** A built stone wall wears a module (ivy, a flower box) the Hearth put on it. */
export function dressedWall(state: WorldState): boolean {
  for (const b of state.buildings) {
    if (b.stage !== 'built' || b.def !== 'stone-wall') continue;
    if ((b.rt?.modules?.length ?? 0) > 0) return true;
  }
  return false;
}

/** A road crosses water somewhere (a bridge). */
export function bridgeBuilt(state: WorldState): boolean {
  const { road, water } = state.map;
  for (let i = 0; i < road.length; i++) if (road[i] && water[i]) return true;
  return false;
}
