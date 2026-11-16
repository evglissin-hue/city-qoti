// Path cache keyed by (from, to, network epoch): a derived index, never saved or hashed. A path
// depends only on the walk grid and the heights, so a cached answer is the answer every client
// would compute; eviction only costs time. Cached arrays are shared and never mutated.
import { content } from '@qoti/content';
import { MAP_SIZE, TICKS_PER_HOUR } from '../../constants';
import type { WorldState } from '../../contracts';
import { Flags } from '../../map/layers';
import { tickOfDay } from '../residents/time';
import { findPath } from './astar';
import { walkGrid } from './grid';
import { ROUND_SCALE, roundCost } from './routes';

const N = MAP_SIZE * MAP_SIZE;
/** Cache entries per valley before it is cleared and refilled. */
const MAX_ENTRIES = 16384;
/** Marks a cached miss; compared by identity. */
const UNREACHABLE: number[] = [];

interface PathCache {
  epoch: number;
  paths: Map<number, number[]>;
  hits: number;
  misses: number;
}

const caches = new WeakMap<WorldState, PathCache>();

function cacheFor(state: WorldState): PathCache {
  const grid = walkGrid(state);
  let c = caches.get(state);
  if (!c) {
    c = { epoch: grid.epoch, paths: new Map(), hits: 0, misses: 0 };
    caches.set(state, c);
  } else if (c.epoch !== grid.epoch) {
    c.epoch = grid.epoch;
    c.paths.clear();
  }
  return c;
}

/** The path from one tile to another (tiles after `from`, ending at `to`), or null when unreachable. */
export function pathBetween(state: WorldState, from: number, to: number): number[] | null {
  if (from === to) return [];
  const c = cacheFor(state);
  const key = from * N + to;
  const hit = c.paths.get(key);
  if (hit) {
    c.hits++;
    return hit === UNREACHABLE ? null : hit;
  }
  c.misses++;
  const path = findPath(walkGrid(state), state.map.height, from, to);
  if (c.paths.size >= MAX_ENTRIES) c.paths.clear();
  c.paths.set(key, path ?? UNREACHABLE);
  return path;
}

/** Cache counters for tests and benches. */
export function pathCacheStats(state: WorldState): { size: number; hits: number; misses: number } {
  const c = caches.get(state);
  return { size: c?.paths.size ?? 0, hits: c?.hits ?? 0, misses: c?.misses ?? 0 };
}

/**
 * R2 (R2.0): how a walker weighs the grid (docs/spec/19-evenings.md, Routes and Evening streets).
 * 'walk' is the ordinary grid; 'round' adds the evening cost (pleasant tiles and evening streets as
 * they are, plain tiles and noisy ones dearer), fixed at 17:00 so lanterns and carts never throw the
 * evening's cached routes away; 'barrow' is a porter with a barrow, for whom evening streets are
 * closed from 17:00 to 21:00 (one with no other way waits at the edge).
 */
export type PathMode = 'walk' | 'round' | 'barrow';

// --- Round paths: keyed by (walk epoch, route string), never by charm, noise or the hour ---------

interface RoundCache {
  epoch: number;
  routes: string;
  paths: Map<number, number[]>;
  hits: number;
  misses: number;
}

const roundCaches = new WeakMap<WorldState, RoundCache>();

function roundPath(state: WorldState, layer: Uint8Array, from: number, to: number): number[] | null {
  if (from === to) return [];
  const grid = walkGrid(state);
  const routes = state.evenings.routes ?? '';
  let c = roundCaches.get(state);
  if (!c) {
    c = { epoch: grid.epoch, routes, paths: new Map(), hits: 0, misses: 0 };
    roundCaches.set(state, c);
  } else if (c.epoch !== grid.epoch || c.routes !== routes) {
    c.epoch = grid.epoch;
    c.routes = routes;
    c.paths.clear();
  }
  const key = from * N + to;
  const hit = c.paths.get(key);
  if (hit) {
    c.hits++;
    return hit === UNREACHABLE ? null : hit;
  }
  c.misses++;
  const path = findPath(grid, state.map.height, from, to, undefined, layer, ROUND_SCALE);
  if (c.paths.size >= MAX_ENTRIES) c.paths.clear();
  c.paths.set(key, path ?? UNREACHABLE);
  return path;
}

/** Round path cache counters for tests. */
export function roundPathCacheStats(state: WorldState): { size: number; hits: number; misses: number } {
  const c = roundCaches.get(state);
  return { size: c?.paths.size ?? 0, hits: c?.hits ?? 0, misses: c?.misses ?? 0 };
}

// --- Barrow paths: evening streets closed from the evening hour to the home hour -----------------

interface BarrowCache {
  epoch: number;
  sig: number;
  layer: Uint8Array;
  paths: Map<number, number[]>;
}

const barrowCaches = new WeakMap<WorldState, BarrowCache>();
const signatures = new WeakMap<WorldState, { tick: number; turn: number; sig: number }>();

/** A 32-bit hash of the live evening street tiles, recomputed at most once per (tick, turn). */
function eveningSignature(state: WorldState): number {
  const s = signatures.get(state);
  if (s && s.tick === state.tick && s.turn === state.lastTurn) return s.sig;
  const { road, flags } = state.map;
  let h = 0x811c9dc5;
  for (let i = 0; i < N; i++) {
    if (road[i] && flags[i]! & Flags.evening) {
      h = Math.imul(h ^ (i & 0xff), 0x01000193) >>> 0;
      h = Math.imul(h ^ (i >>> 8), 0x01000193) >>> 0;
    }
  }
  signatures.set(state, { tick: state.tick, turn: state.lastTurn, sig: h });
  return h;
}

function barrowPath(state: WorldState, from: number, to: number): number[] | null {
  if (from === to) return [];
  const grid = walkGrid(state);
  const sig = eveningSignature(state);
  let c = barrowCaches.get(state);
  if (!c || c.epoch !== grid.epoch || c.sig !== sig) {
    const layer = grid.cost.slice();
    const { road, flags } = state.map;
    for (let i = 0; i < N; i++) if (road[i] && flags[i]! & Flags.evening) layer[i] = 0;
    c = { epoch: grid.epoch, sig, layer, paths: new Map() };
    barrowCaches.set(state, c);
  }
  const key = from * N + to;
  const hit = c.paths.get(key);
  if (hit) return hit === UNREACHABLE ? null : hit;
  const path = findPath(grid, state.map.height, from, to, undefined, c.layer, 1);
  if (c.paths.size >= MAX_ENTRIES) c.paths.clear();
  c.paths.set(key, path ?? UNREACHABLE);
  return path;
}

/**
 * The path for a walker of this mode (tiles after `from`, ending at `to`), or null when unreachable.
 * R2B asks for 'barrow' and decides what a porter does with null.
 */
export function pathFor(state: WorldState, from: number, to: number, mode: PathMode): number[] | null {
  if (mode === 'round') {
    const layer = roundCost(state);
    return layer ? roundPath(state, layer, from, to) : pathBetween(state, from, to);
  }
  if (mode === 'barrow') {
    const t = tickOfDay(state.tick);
    const { eveningHour, homeHour } = content.places;
    if (t < eveningHour * TICKS_PER_HOUR || t >= homeHour * TICKS_PER_HOUR)
      return pathBetween(state, from, to);
    return barrowPath(state, from, to);
  }
  return pathBetween(state, from, to);
}
