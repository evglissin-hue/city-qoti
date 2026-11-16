// Path cache keyed by (from, to, network epoch): a derived index, never saved or hashed. A path
// depends only on the walk grid and the heights, so a cached answer is the answer every client
// would compute; eviction only costs time. Cached arrays are shared and never mutated.
import { MAP_SIZE } from '../../constants';
import type { WorldState } from '../../contracts';
import { findPath } from './astar';
import { walkGrid } from './grid';

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

/**
 * The path for a walker of this mode (tiles after `from`, ending at `to`), or null when unreachable.
 * R2A owns the evening cost ('round'); R2B asks for 'barrow' and decides what a porter does with null.
 *
 * R2 stand-in (R2A): every mode walks the ordinary grid.
 */
export function pathFor(state: WorldState, from: number, to: number, _mode: PathMode): number[] | null {
  return pathBetween(state, from, to);
}
