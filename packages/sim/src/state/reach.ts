// The town's reach for a state (playtest round three), cached until the walkable network or the
// buildings change: a derived index, never saved or hashed (see rules/reach.ts).
import type { Building, WorldState } from '../contracts';
import { doorFront, reachesTile, townReach, townSources } from '../rules/reach';
import { worldIndex } from './worldIndex';

interface Cached {
  version: number;
  buildings: number;
  last: number;
  reach: Uint8Array;
}

const cache = new WeakMap<WorldState, Cached>();

export function reachOf(state: WorldState): Uint8Array {
  const n = state.buildings.length;
  const last = n ? state.buildings[n - 1]!.id : 0;
  const c = cache.get(state);
  if (c && c.version === state.networkVersion && c.buildings === n && c.last === last) return c.reach;
  const reach = townReach(worldIndex(state).reader, townSources(state.buildings));
  cache.set(state, { version: state.networkVersion, buildings: n, last, reach });
  return reach;
}

/** True when the town can walk to this building's door (always, before there is a town). */
export function townReachesDoor(state: WorldState, b: Pick<Building, 'def' | 'x' | 'z' | 'rot'>): boolean {
  if (!state.buildings.some((x) => x.stage === 'built')) return true;
  const reach = reachOf(state);
  if (!reach.some((v) => v === 1)) return true;
  return reachesTile(reach, worldIndex(state).reader, doorFront(b));
}
