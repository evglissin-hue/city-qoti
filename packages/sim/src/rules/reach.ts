// What the town can walk to (playtest round three): a flood over the walk rules from the doors of
// the town hall and the storehouses, where porters and builders set out. Ground beyond a cliff or
// across water with no bridge is cut off, and a building whose door lies there would never be
// built. A pure function of a MapReader, so the sim refuses such sites and the client's build
// ghost says so before the click. The same steps as the walk grid: buildings and water block
// (roads cross water as bridges), and a step of two levels or more is a cliff.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../constants';
import type { MapReader, Rot4 } from '../contracts';
import { entranceTiles } from './footprint';

/** A building as far as reach cares (BuildingView and Building both fit). */
export interface ReachBuilding {
  def: string;
  x: number;
  z: number;
  rot: Rot4;
  stage: string;
}

/** The tile in front of a building's door. */
export function doorFront(b: Omit<ReachBuilding, 'stage'>): number {
  const def = content.buildingById.get(b.def);
  if (!def) return b.z * MAP_SIZE + b.x;
  const { front } = entranceTiles(def, b.x, b.z, b.rot);
  return front[1] * MAP_SIZE + front[0];
}

/** Where porters and builders set out from: built town halls, storehouses and builder's yards. */
export function townSources(buildings: Iterable<ReachBuilding>): number[] {
  const out: number[] = [];
  for (const b of buildings) {
    if (b.stage !== 'built') continue;
    const def = content.buildingById.get(b.def);
    if (!def) continue;
    if (def.id === 'town-hall' || def.category === 'storage' || def.jobs?.role === 'builder')
      out.push(doorFront(b));
  }
  return out;
}

/** Reachable tiles (1) from `sources` (tile indexes), walking as residents do. */
export function townReach(reader: MapReader, sources: readonly number[]): Uint8Array {
  const S = MAP_SIZE;
  const out = new Uint8Array(S * S);
  const open = (x: number, z: number) =>
    !reader.occupant(x, z) && (reader.road(x, z) > 0 || reader.water(x, z) === 0);
  const queue: number[] = [];
  for (const t of sources) {
    if (t < 0 || t >= S * S || out[t]) continue;
    out[t] = 1;
    queue.push(t);
  }
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i]!;
    const x = t % S;
    const z = (t - x) / S;
    const h = reader.height(x, z);
    for (let k = 0; k < 4; k++) {
      const nx = k === 0 ? x + 1 : k === 1 ? x - 1 : x;
      const nz = k === 2 ? z + 1 : k === 3 ? z - 1 : z;
      if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
      const n = nz * S + nx;
      if (out[n] || !open(nx, nz)) continue;
      const dh = reader.height(nx, nz) - h;
      if (dh >= 2 || dh <= -2) continue;
      out[n] = 1;
      queue.push(n);
    }
  }
  return out;
}

/**
 * True when a walker can stand at `tile` (a door's front): it is reached, or it is a tile walkers
 * may step onto as a destination from a reached neighbor no more than a level away.
 */
export function reachesTile(reach: Uint8Array, reader: MapReader, tile: number): boolean {
  const S = MAP_SIZE;
  if (tile < 0 || tile >= S * S) return false;
  if (reach[tile]) return true;
  const x = tile % S;
  const z = (tile - x) / S;
  const h = reader.height(x, z);
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x + 1 : k === 1 ? x - 1 : x;
    const nz = k === 2 ? z + 1 : k === 3 ? z - 1 : z;
    if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
    if (!reach[nz * S + nx]) continue;
    const dh = reader.height(nx, nz) - h;
    if (dh < 2 && dh > -2) return true;
  }
  return false;
}
