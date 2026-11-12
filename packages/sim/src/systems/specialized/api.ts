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

/**
 * A building's reach, walked once: steps along roads (-1 where none) over the box of tiles it could
 * reach, and the road tiles of that box as they were, so a new building elsewhere (which bumps the
 * network version) does not make it walk again unless the roads in its box changed.
 */
interface ReachGrid {
  version: number;
  /** The door front tile the walk starts from. */
  door: number;
  def: string;
  x: number;
  z: number;
  rot: number;
  x0: number;
  z0: number;
  w: number;
  h: number;
  dist: Int16Array;
  roads: Uint8Array;
  map: Map<number, number> | null;
}

const cache = new WeakMap<WorldState, Map<EntityId, ReachGrid>>();

function reachOf(b: Building): number {
  const def = content.buildingById.get(b.def);
  if (!def) return 0;
  if (def.reach) return def.reach;
  return def.specialized && (def.enables?.length || def.stores?.length) ? DEFAULT_REACH : 0;
}

/** True when the box's road tiles are as the grid saw them. */
function sameRoads(state: WorldState, g: ReachGrid): boolean {
  const road = state.map.road;
  for (let z = 0; z < g.h; z++) {
    const row = (g.z0 + z) * S + g.x0;
    const at = z * g.w;
    for (let x = 0; x < g.w; x++) if ((road[row + x]! > 0 ? 1 : 0) !== g.roads[at + x]) return false;
  }
  return true;
}

/**
 * The network version at which the road layer last changed, worked out once per network version
 * (a new building bumps the version but leaves the roads alone): the version itself when the roads
 * differ from the last look, else the earlier one. Every grid looks when it is walked, so a grid
 * walked at the epoch or later saw the roads as they are now and still holds; the result is always
 * what walking again would give.
 */
const epochs = new WeakMap<WorldState, Map<string, { version: number; epoch: number; copy: Uint8Array }>>();

/** The network version at which a layer (as `read` sees it) last changed, as roadEpoch says. */
function layerEpoch(state: WorldState, name: string, n: number, read: (i: number) => number): number {
  const v = state.networkVersion;
  let perState = epochs.get(state);
  if (!perState) {
    perState = new Map();
    epochs.set(state, perState);
  }
  const hit = perState.get(name);
  if (hit && hit.version === v) return hit.epoch;
  if (hit) {
    let same = true;
    for (let i = 0; i < n; i++) {
      if (read(i) !== hit.copy[i]) {
        same = false;
        break;
      }
    }
    hit.version = v;
    if (!same) {
      hit.epoch = v;
      for (let i = 0; i < n; i++) hit.copy[i] = read(i);
    }
    return hit.epoch;
  }
  const copy = new Uint8Array(n);
  for (let i = 0; i < n; i++) copy[i] = read(i);
  perState.set(name, { version: v, epoch: v, copy });
  return v;
}

function roadEpoch(state: WorldState): number {
  const road = state.map.road;
  return layerEpoch(state, 'road', road.length, (i) => (road[i]! > 0 ? 1 : 0));
}

function heightEpoch(state: WorldState): number {
  const height = state.map.height;
  return layerEpoch(state, 'height', height.length, (i) => height[i]!);
}

/** The building's reach grid, walked again only when it moved or the roads in its box changed. */
function reachGrid(state: WorldState, b: Building): ReachGrid {
  let perState = cache.get(state);
  if (!perState) {
    perState = new Map();
    cache.set(state, perState);
  }
  const hit = perState.get(b.id);
  if (hit && hit.def === b.def && hit.x === b.x && hit.z === b.z && hit.rot === b.rot) {
    if (hit.version === state.networkVersion) return hit;
    // No road anywhere changed since it was walked, or none in its own box did.
    if (roadEpoch(state) <= hit.version || sameRoads(state, hit)) {
      hit.version = state.networkVersion;
      return hit;
    }
  }
  // Look at the roads now, so the epoch check above can trust this grid later (see roadEpoch).
  roadEpoch(state);
  const reach = reachOf(b);
  const door = doorTile(b);
  const dx0 = door % S;
  const dz0 = Math.floor(door / S);
  const span = reach + HOP;
  const x0 = Math.max(0, dx0 - span);
  const z0 = Math.max(0, dz0 - span);
  const w = Math.min(S, dx0 + span + 1) - x0;
  const h = Math.min(S, dz0 + span + 1) - z0;
  const dist = new Int16Array(w * h).fill(-1);
  const roads = new Uint8Array(w * h);
  const road = state.map.road;
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) roads[z * w + x] = road[(z0 + z) * S + x0 + x]! > 0 ? 1 : 0;
  if (reach > 0) {
    const buckets: number[][] = [];
    for (let k = 0; k <= reach; k++) buckets.push([]);
    for (let dz = -HOP; dz <= HOP; dz++) {
      for (let dx = -HOP + Math.abs(dz); dx <= HOP - Math.abs(dz); dx++) {
        const x = dx0 + dx - x0;
        const z = dz0 + dz - z0;
        if (x < 0 || z < 0 || x >= w || z >= h) continue;
        const i = z * w + x;
        const gap = Math.abs(dx) + Math.abs(dz);
        if (!roads[i] || gap > reach) continue;
        if (dist[i]! < 0 || gap < dist[i]!) {
          dist[i] = gap;
          buckets[gap]!.push(i);
        }
      }
    }
    for (let d = 0; d < reach; d++) {
      const bucket = buckets[d]!;
      for (let k = 0; k < bucket.length; k++) {
        const i = bucket[k]!;
        if (dist[i] !== d) continue;
        const x = i % w;
        const z = (i - x) / w;
        for (let n = 0; n < 4; n++) {
          const nx = x + (n === 0 ? 1 : n === 1 ? -1 : 0);
          const nz = z + (n === 2 ? 1 : n === 3 ? -1 : 0);
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          const j = nz * w + nx;
          if (!roads[j] || (dist[j]! >= 0 && dist[j]! <= d + 1)) continue;
          dist[j] = d + 1;
          buckets[d + 1]!.push(j);
        }
      }
    }
  }
  const g: ReachGrid = {
    version: state.networkVersion,
    door,
    def: b.def,
    x: b.x,
    z: b.z,
    rot: b.rot,
    x0,
    z0,
    w,
    h,
    dist,
    roads,
    map: null,
  };
  perState.set(b.id, g);
  return g;
}

/**
 * Walking distance along road tiles (tile index to steps) from a specialized building's door, for
 * every road tile within its reach (R1C's ring draws these).
 */
export function reachDistances(state: WorldState, b: Building): ReadonlyMap<number, number> {
  const g = reachGrid(state, b);
  if (!g.map) {
    g.map = new Map();
    for (let i = 0; i < g.dist.length; i++) {
      if (g.dist[i]! < 0) continue;
      const x = i % g.w;
      g.map.set((g.z0 + (i - x) / g.w) * S + g.x0 + x, g.dist[i]!);
    }
  }
  return g.map;
}

/**
 * withinReach for many tiles against one building: its reach grid found once (the growth pass asks a
 * windmill about every baker near it).
 */
export function reachTest(state: WorldState, specialized: Building): (tile: number) => boolean {
  const reach = reachOf(specialized);
  if (reach <= 0) return () => false;
  const g = reachGrid(state, specialized);
  const gx = g.door % S;
  const gz = Math.floor(g.door / S);
  return (tile) => {
    if (tile < 0 || tile >= S * S) return false;
    const tx = tile % S;
    const tz = Math.floor(tile / S);
    if (Math.abs(gx - tx) + Math.abs(gz - tz) > reach + 2 * HOP) return false;
    for (let dz = -HOP; dz <= HOP; dz++) {
      for (let dx = -HOP + Math.abs(dz); dx <= HOP - Math.abs(dz); dx++) {
        const x = tx + dx - g.x0;
        const z = tz + dz - g.z0;
        if (x < 0 || z < 0 || x >= g.w || z >= g.h) continue;
        const d = g.dist[z * g.w + x]!;
        if (d >= 0 && d + Math.abs(dx) + Math.abs(dz) <= reach) return true;
      }
    }
    return false;
  };
}

/** True when a tile (index) lies within the specialized building's walking reach of its door. */
export function withinReach(state: WorldState, specialized: Building, tile: number): boolean {
  const reach = reachOf(specialized);
  if (reach <= 0 || tile < 0 || tile >= S * S) return false;
  const g = reachGrid(state, specialized);
  // Walking along roads is never shorter than the Manhattan gap from the door, give or take a hop.
  const tx = tile % S;
  const tz = Math.floor(tile / S);
  if (Math.abs((g.door % S) - tx) + Math.abs(Math.floor(g.door / S) - tz) > reach + 2 * HOP) return false;
  for (let dz = -HOP; dz <= HOP; dz++) {
    for (let dx = -HOP + Math.abs(dz); dx <= HOP - Math.abs(dz); dx++) {
      const x = tx + dx - g.x0;
      const z = tz + dz - g.z0;
      if (x < 0 || z < 0 || x >= g.w || z >= g.h) continue;
      const d = g.dist[z * g.w + x]!;
      if (d >= 0 && d + Math.abs(dx) + Math.abs(dz) <= reach) return true;
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

const raised = new WeakMap<WorldState, Map<EntityId, { key: string; version: number; levels: number }>>();

/** levelsAbove, kept until the building moves or the ground changes (heightEpoch). */
function levelsAboveCached(state: WorldState, b: Building): number {
  let perState = raised.get(state);
  if (!perState) {
    perState = new Map();
    raised.set(state, perState);
  }
  const key = `${b.def}:${b.x}:${b.z}:${b.rot}`;
  const hit = perState.get(b.id);
  if (hit && hit.key === key && (hit.version === state.networkVersion || heightEpoch(state) <= hit.version)) {
    hit.version = state.networkVersion;
    return hit.levels;
  }
  heightEpoch(state);
  const levels = levelsAbove(state, b);
  perState.set(b.id, { key, version: state.networkVersion, levels });
  return levels;
}

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
  if (def.raisedCapacity && levelsAboveCached(state, specialized) >= def.raisedCapacity[0]) {
    cap = Math.max(cap, def.raisedCapacity[1]);
  }
  if (def.id === 'sawmill' && state.weather.river.frozen) cap -= 1;
  return Math.max(0, cap);
}
