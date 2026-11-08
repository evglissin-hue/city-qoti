// Callings (docs/spec/15-progression.md, Callings): what the map suggests. Each calling scores a few
// map factors once, when the Village Charter is claimed; the two best fits are offered and the
// offer never changes. All integer math, a pure function of the map layers and the valley gate.
import { MAP_SIZE } from '../../constants';
import type { WorldState } from '../../contracts';
import { Deposit, Terrain, Water } from '../../map/layers';

const S = MAP_SIZE;
/** Height level from which land counts as high ground (the hills that grow stone and look down on the weather). */
const HIGH_GROUND = 8;

/** Raw counts and spans read off the map, before they are scaled. */
export interface MapFacts {
  /** Stone and clay deposit tiles in open land (no tree on them, no water). */
  deposits: number;
  /** River tiles. */
  river: number;
  meadow: number;
  /** Land tiles with fertility 70 or more. */
  richSoil: number;
  /** Pond tiles plus land tiles beside any water. */
  waterEdge: number;
  /** Land tiles at height 8 or more (high ground). */
  high: number;
  /** Tiles with a tree on them. */
  forest: number;
  /** Chebyshev tiles from the valley gate to the first highest tile. */
  summitWalk: number;
}

/**
 * What a factor's raw count must reach to score the full 1000. Tuned on a sweep of valley seeds so
 * the three callings land in a comparable range and every one is offered somewhere.
 */
export const SCALE = {
  deposits: 4500,
  river: 1152,
  meadow: 6500,
  richSoil: 18000,
  waterEdge: 768,
  high: 30000,
  forest: 11500,
  summitWalk: 192,
} as const;

/** The scaled factors (0 to 1000) of each calling, in the order of its content `reasons`. */
export interface CallingScore {
  id: string;
  /** 0 to 1000: the mean of the factors. */
  score: number;
  factors: number[];
}

const scaled = (raw: number, full: number): number => Math.min(1000, Math.floor((raw * 1000) / full));

export function readMap(state: WorldState): MapFacts {
  const m = state.map;
  const f: MapFacts = {
    deposits: 0,
    river: 0,
    meadow: 0,
    richSoil: 0,
    waterEdge: 0,
    high: 0,
    forest: 0,
    summitWalk: 0,
  };
  let hi = -1;
  let hiAt = 0;
  for (let i = 0; i < S * S; i++) {
    const water = m.water[i]!;
    const x = i % S;
    const z = (i - x) / S;
    if (water !== Water.none) {
      if (water === Water.river || water === Water.riverDeep) f.river++;
      else if (water === Water.pond) f.waterEdge++;
      continue;
    }
    const h = m.height[i]!;
    if (h > hi) {
      hi = h;
      hiAt = i;
    }
    if (h >= HIGH_GROUND) f.high++;
    const tree = m.tree[i]! !== 0;
    if (tree) f.forest++;
    const dep = m.deposit[i]!;
    if (!tree && (dep === Deposit.stone || dep === Deposit.clay)) f.deposits++;
    if (m.terrain[i] === Terrain.meadow) f.meadow++;
    if (m.fertility[i]! >= 70) f.richSoil++;
    if (
      (x > 0 && m.water[i - 1]) ||
      (x < S - 1 && m.water[i + 1]) ||
      (z > 0 && m.water[i - S]) ||
      (z < S - 1 && m.water[i + S])
    )
      f.waterEdge++;
  }
  if (hi >= 0) {
    const [gx, gz] = state.meta.valleyGate;
    const hx = hiAt % S;
    const hz = (hiAt - hx) / S;
    f.summitWalk = Math.max(Math.abs(hx - gx), Math.abs(hz - gz));
  }
  return f;
}

/** Every calling's score from the map, best first (ties by id). */
export function scoreCallings(state: WorldState): CallingScore[] {
  const f = readMap(state);
  const mean = (list: number[]) => Math.floor(list.reduce((a, b) => a + b, 0) / list.length);
  const table: [string, number[]][] = [
    ['garden-village', [
      scaled(f.meadow, SCALE.meadow),
      scaled(f.richSoil, SCALE.richSoil),
      scaled(f.waterEdge, SCALE.waterEdge),
    ]],
    ['mill-town', [scaled(f.deposits, SCALE.deposits), scaled(f.river, SCALE.river)]],
    ['pilgrims-rest', [
      scaled(f.high, SCALE.high),
      scaled(f.forest, SCALE.forest),
      scaled(f.summitWalk, SCALE.summitWalk),
    ]],
  ];
  return table
    .map(([id, factors]) => ({ id, score: mean(factors), factors }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}
