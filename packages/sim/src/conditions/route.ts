// Walking routes for the named predicates (lanternRoute, pathRoute). A small Dial's-algorithm
// search over the tile grid with integer costs: roads are cheap, open ground dearer, buildings and
// water impassable. It mirrors how residents prefer roads without depending on C3A's pathfinder,
// so wish checks stay cheap and stable. Buffers are reused between searches.
import { MAP_SIZE } from '../constants';
import type { WorldState } from '../contracts';

const N = MAP_SIZE * MAP_SIZE;
const ROAD_COST = 2;
const GROUND_COST = 5;
const BUCKETS = GROUND_COST + 1;

const dist = new Int32Array(N);
const prev = new Int32Array(N);
const stamp = new Uint32Array(N);
let generation = 0;
const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);
const STEPS = [1, -1, MAP_SIZE, -MAP_SIZE] as const;

/**
 * The cheapest route from `from` to `to` (tile indexes, both included, from first), or null when
 * none exists. `roadsOnly` walks road tiles only.
 */
export function findRoute(state: WorldState, from: number, to: number, roadsOnly: boolean): number[] | null {
  if (from < 0 || to < 0 || from >= N || to >= N) return null;
  const m = state.map;
  const passable = (i: number): boolean =>
    roadsOnly ? m.road[i]! > 0 : m.occupant[i] === 0 && m.water[i] === 0;
  if (!passable(from) || !passable(to)) return null;
  generation = (generation + 1) >>> 0;
  if (generation === 0) {
    stamp.fill(0);
    generation = 1;
  }
  for (const b of buckets) b.length = 0;
  stamp[from] = generation;
  dist[from] = 0;
  prev[from] = -1;
  buckets[0]!.push(from);
  let pending = 1;
  let d = 0;
  while (pending > 0) {
    const bucket = buckets[d % BUCKETS]!;
    while (bucket.length > 0) {
      const i = bucket.pop()!;
      pending--;
      if (dist[i] !== d) continue;
      if (i === to) return unwind(to);
      const x = i % MAP_SIZE;
      for (let k = 0; k < 4; k++) {
        const j = i + STEPS[k]!;
        if (k === 0 && x === MAP_SIZE - 1) continue;
        if (k === 1 && x === 0) continue;
        if (j < 0 || j >= N || !passable(j)) continue;
        const nd = d + (m.road[j]! > 0 ? ROAD_COST : GROUND_COST);
        if (stamp[j] === generation && dist[j]! <= nd) continue;
        stamp[j] = generation;
        dist[j] = nd;
        prev[j] = i;
        buckets[nd % BUCKETS]!.push(j);
        pending++;
      }
    }
    d++;
  }
  return null;
}

function unwind(to: number): number[] {
  const path: number[] = [];
  for (let i = to; i >= 0; i = prev[i]!) path.push(i);
  path.reverse();
  return path;
}
