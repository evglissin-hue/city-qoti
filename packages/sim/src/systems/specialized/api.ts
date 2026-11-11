// Specialized buildings' reach and capacity (docs/spec/13-ledger.md, Land and specialized buildings;
// docs/build/r1-wave-notes.md, Cross-track APIs). Signatures fixed by R1.0, insides by R1B.
// R1C's ghost ring and Businesses book, R1A's granary draw and the growth pass read these.
//
// Reach is walking distance along road tiles from the building's door front, with a short hop
// (Manhattan HOP tiles) from a road tile to a door or lot that does not stand on one.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, EntityId, WorldState } from '../../contracts';
import { footprintTiles } from '../../rules/footprint';
import { findById } from '../../state/entities';
import { hasTag } from '../../state/zones';
import { doorTile } from '../movement/api';

const S = MAP_SIZE;
/** A door or lot may sit this many tiles (Manhattan) off the nearest road tile and still count. */
const HOP = 3;
/** Reach when a specialized building's def names none but it enables a trade or stores goods. */
const DEFAULT_REACH = 24;

interface DistEntry {
  version: number;
  def: string;
  x: number;
  z: number;
  rot: number;
  dist: Map<number, number>;
}

const cache = new WeakMap<WorldState, Map<EntityId, DistEntry>>();

function reachOf(b: Building): number {
  const def = content.buildingById.get(b.def);
  if (!def) return 0;
  if (def.reach) return def.reach;
  return def.specialized && (def.enables?.length || def.stores?.length) ? DEFAULT_REACH : 0;
}

/**
 * Walking distance along road tiles (tile index to steps) from a specialized building's door, for
 * every road tile within its reach. Cached per building on the network version.
 */
export function reachDistances(state: WorldState, b: Building): ReadonlyMap<number, number> {
  let perState = cache.get(state);
  if (!perState) {
    perState = new Map();
    cache.set(state, perState);
  }
  const hit = perState.get(b.id);
  if (
    hit &&
    hit.version === state.networkVersion &&
    hit.def === b.def &&
    hit.x === b.x &&
    hit.z === b.z &&
    hit.rot === b.rot
  ) {
    return hit.dist;
  }
  const dist = new Map<number, number>();
  const reach = reachOf(b);
  if (reach > 0) {
    const door = doorTile(b);
    const dx0 = door % S;
    const dz0 = Math.floor(door / S);
    const buckets: number[][] = [];
    for (let k = 0; k <= reach; k++) buckets.push([]);
    for (let dz = -HOP; dz <= HOP; dz++) {
      for (let dx = -HOP + Math.abs(dz); dx <= HOP - Math.abs(dz); dx++) {
        const x = dx0 + dx;
        const z = dz0 + dz;
        if (x < 0 || z < 0 || x >= S || z >= S) continue;
        const i = z * S + x;
        const gap = Math.abs(dx) + Math.abs(dz);
        if (!state.map.road[i] || gap > reach) continue;
        const old = dist.get(i);
        if (old === undefined || gap < old) {
          dist.set(i, gap);
          buckets[gap]!.push(i);
        }
      }
    }
    for (let d = 0; d <= reach; d++) {
      const bucket = buckets[d]!;
      for (let h = 0; h < bucket.length; h++) {
        const i = bucket[h]!;
        if (dist.get(i) !== d || d >= reach) continue;
        const x = i % S;
        const z = (i - x) / S;
        for (let k = 0; k < 4; k++) {
          const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const nz = z + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
          const n = nz * S + nx;
          if (!state.map.road[n]) continue;
          const old = dist.get(n);
          if (old !== undefined && old <= d + 1) continue;
          dist.set(n, d + 1);
          buckets[d + 1]!.push(n);
        }
      }
    }
  }
  perState.set(b.id, { version: state.networkVersion, def: b.def, x: b.x, z: b.z, rot: b.rot, dist });
  return dist;
}

/** True when a tile (index) lies within the specialized building's walking reach of its door. */
export function withinReach(state: WorldState, specialized: Building, tile: number): boolean {
  const reach = reachOf(specialized);
  if (reach <= 0 || tile < 0 || tile >= S * S) return false;
  const dist = reachDistances(state, specialized);
  const direct = dist.get(tile);
  if (direct !== undefined) return true;
  const tx = tile % S;
  const tz = Math.floor(tile / S);
  for (let dz = -HOP; dz <= HOP; dz++) {
    for (let dx = -HOP + Math.abs(dz); dx <= HOP - Math.abs(dz); dx++) {
      const x = tx + dx;
      const z = tz + dz;
      if (x < 0 || z < 0 || x >= S || z >= S) continue;
      const d = dist.get(z * S + x);
      if (d !== undefined && d + Math.abs(dx) + Math.abs(dz) <= reach) return true;
    }
  }
  return false;
}

/** Ids (ascending) of the businesses of the trades it enables whose door is in its reach. */
export function servedIds(state: WorldState, specialized: Building): EntityId[] {
  const def = content.buildingById.get(specialized.def);
  if (!def?.enables?.length) return [];
  const ids: EntityId[] = [];
  for (const b of state.buildings) {
    if (b.id === specialized.id || !def.enables.some((t) => hasTag(b, t))) continue;
    if (withinReach(state, specialized, doorTile(b))) ids.push(b.id);
  }
  return ids.sort((a, b) => a - b);
}

/** Businesses of the trades it enables standing in its reach, built and going up alike. */
export function served(state: WorldState, specialized: Building): number {
  return servedIds(state, specialized).length;
}

/**
 * True when the business has a place under the capacity: it is in reach and among the first
 * `capacityOf` served (by id), or, for a business not in the town yet, there is a place left.
 */
export function hasRoomFor(state: WorldState, specialized: Building, businessId: EntityId): boolean {
  const ids = servedIds(state, specialized);
  const cap = capacityOf(state, specialized);
  if (!findById(state.buildings, businessId)) return ids.length < cap;
  const at = ids.indexOf(businessId);
  return at >= 0 && at < cap;
}

/** Tiles (Chebyshev) from the footprint where the ground around a windmill is measured. */
const GROUND_NEAR = 2;
const GROUND_FAR = 6;

/** Levels the footprint's lowest tile stands above the floor of the average ground 2 to 6 tiles around it. */
function levelsAbove(state: WorldState, b: Building): number {
  const def = content.buildingById.get(b.def);
  if (!def) return 0;
  const tiles = footprintTiles(def, b.x, b.z, b.rot as 0 | 1 | 2 | 3);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  let low = Infinity;
  for (const [x, z] of tiles) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
    low = Math.min(low, state.map.height[z * S + x]!);
  }
  let sum = 0;
  let n = 0;
  for (let z = z0 - GROUND_FAR; z <= z1 + GROUND_FAR; z++) {
    for (let x = x0 - GROUND_FAR; x <= x1 + GROUND_FAR; x++) {
      if (x < 0 || z < 0 || x >= S || z >= S) continue;
      const cheb = Math.max(x0 - x, x - x1, z0 - z, z - z1);
      if (cheb < GROUND_NEAR) continue;
      sum += state.map.height[z * S + x]!;
      n++;
    }
  }
  return n === 0 ? 0 : low - Math.floor(sum / n);
}

/**
 * How many it may serve: the def's capacity; the Windmill's raised capacity when it stands the
 * given number of levels above the ground around it; a frozen river takes one carpenter from the
 * Sawmill (its wheel is stopped).
 */
export function capacityOf(state: WorldState, specialized: Building): number {
  const def = content.buildingById.get(specialized.def);
  if (!def) return 0;
  let cap = def.capacity ?? 0;
  if (def.raisedCapacity && levelsAbove(state, specialized) >= def.raisedCapacity[0]) {
    cap = Math.max(cap, def.raisedCapacity[1]);
  }
  if (def.id === 'sawmill' && state.weather.river.frozen) cap -= 1;
  return Math.max(0, cap);
}
