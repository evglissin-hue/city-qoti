// A* over the tile grid (docs/spec/11-residents.md, Movement). Four neighbors, step cost from the
// walk grid plus 1 when entering a higher tile, cliffs (a height difference of 2 or more) block.
// Manhattan heuristic; ties are broken by lower f, then lower h, then lower tile index, so the same
// question always gets the same path on every machine. Buffers are allocated once and reused.
import { MAP_SIZE, MAX_PATH_EXPANSIONS } from '../../constants';
import type { WalkGrid } from './grid';

const S = MAP_SIZE;
const N = S * S;
/** Heap keys pack (f, h, tile) into one double: ((f * 512) + h) * 65536 + tile. */
const H_SLOTS = 512;
const TILE_SLOTS = 65536;

const g = new Int32Array(N);
const parent = new Int32Array(N);
/** Search id when g and parent of a tile are valid for the current search. */
const seen = new Uint32Array(N);
/** Search id when a tile was expanded. */
const closed = new Uint32Array(N);
let heap = new Float64Array(4096);
let heapSize = 0;
let search = 0;

/** Expansions of the last search (tests and benches). */
export let lastExpansions = 0;

function push(key: number): void {
  if (heapSize === heap.length) {
    const bigger = new Float64Array(heap.length * 2);
    bigger.set(heap);
    heap = bigger;
  }
  let i = heapSize++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p]! <= key) break;
    heap[i] = heap[p]!;
    i = p;
  }
  heap[i] = key;
}

function pop(): number {
  const top = heap[0]!;
  const last = heap[--heapSize]!;
  let i = 0;
  const half = heapSize >> 1;
  while (i < half) {
    let c = 2 * i + 1;
    if (c + 1 < heapSize && heap[c + 1]! < heap[c]!) c++;
    if (heap[c]! >= last) break;
    heap[i] = heap[c]!;
    i = c;
  }
  if (heapSize > 0) heap[i] = last;
  return top;
}

/**
 * The cheapest path from `from` to `to` as tiles after `from` (ending with `to`), [] when they are
 * the same tile, or null when unreachable within MAX_PATH_EXPANSIONS. The start and target tiles
 * are always enterable, so walkers can leave and reach building doors.
 */
export function findPath(
  grid: WalkGrid,
  height: Uint8Array,
  from: number,
  to: number,
  maxExpansions = MAX_PATH_EXPANSIONS,
): number[] | null {
  if (from === to) return [];
  if (from < 0 || to < 0 || from >= N || to >= N) return null;
  const cost = grid.cost;
  search = (search + 1) >>> 0;
  if (search === 0) {
    seen.fill(0);
    closed.fill(0);
    search = 1;
  }
  const id = search;
  heapSize = 0;
  const tx = to % S;
  const tz = (to - tx) / S;
  const hOf = (t: number): number => {
    const x = t % S;
    const z = (t - x) / S;
    return (x > tx ? x - tx : tx - x) + (z > tz ? z - tz : tz - z);
  };
  g[from] = 0;
  parent[from] = -1;
  seen[from] = id;
  const h0 = hOf(from);
  push((h0 * H_SLOTS + h0) * TILE_SLOTS + from);
  let expansions = 0;
  while (heapSize > 0) {
    const key = pop();
    const cur = key % TILE_SLOTS;
    if (closed[cur] === id) continue;
    closed[cur] = id;
    if (cur === to) {
      lastExpansions = expansions;
      return reconstruct(from, to);
    }
    if (++expansions > maxExpansions) break;
    const cx = cur % S;
    const gc = g[cur]!;
    const hc = height[cur]!;
    for (let k = 0; k < 4; k++) {
      let nb: number;
      if (k === 0) {
        if (cx === S - 1) continue;
        nb = cur + 1;
      } else if (k === 1) {
        if (cx === 0) continue;
        nb = cur - 1;
      } else if (k === 2) {
        nb = cur + S;
        if (nb >= N) continue;
      } else {
        nb = cur - S;
        if (nb < 0) continue;
      }
      if (closed[nb] === id) continue;
      let step = cost[nb]!;
      if (step === 0) {
        if (nb !== to) continue;
        step = 1;
      }
      const hn = height[nb]!;
      const dh = hn - hc;
      if (dh >= 2 || dh <= -2) continue;
      if (dh > 0) step += 1;
      const gn = gc + step;
      if (seen[nb] === id && g[nb]! <= gn) continue;
      seen[nb] = id;
      g[nb] = gn;
      parent[nb] = cur;
      const h = hOf(nb);
      push(((gn + h) * H_SLOTS + h) * TILE_SLOTS + nb);
    }
  }
  lastExpansions = expansions;
  return null;
}

function reconstruct(from: number, to: number): number[] {
  let n = 0;
  for (let t = to; t !== from; t = parent[t]!) n++;
  const path = new Array<number>(n);
  let i = n - 1;
  for (let t = to; t !== from; t = parent[t]!) path[i--] = t;
  return path;
}
