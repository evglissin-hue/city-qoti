// Street and traffic noise for charm (docs/spec/13-ledger.md, Streets and traffic: traffic adds
// noise to charm). A road gives its own tile its content noise (cobbles and bustle) plus the noise
// of the carts on it, and half of that to the four tiles beside it. Charm reads it when a chunk is
// recomputed (systems/hearth/charm/compute.ts); the traffic system marks the chunks where carts
// came or went, so the noise follows the carts hour by hour. Halves may be fractional;
// charm rounds each tile before it is stored.
import { MAP_SIZE } from '../../constants';
import type { WorldState } from '../../contracts';
import { markChunks } from '../hearth/charm/dirty';
import { roadNoise, trafficFlow } from './api';
import { countedTiles } from './passes';

/** Noise per TRAFFIC_NOISE_FLOW cart passes per hour on a tile, and the most traffic adds. */
export const TRAFFIC_NOISE_FLOW = 10;
export const TRAFFIC_NOISE_MAX = 6;

const S = MAP_SIZE;

/** Noise of one road tile on itself: the road's own plus its traffic. */
function tileNoise(state: WorldState, i: number): number {
  const road = state.map.road[i]!;
  if (!road) return 0;
  let n = roadNoise(road);
  if (state.map.traffic[i])
    n += Math.min(TRAFFIC_NOISE_MAX, Math.floor(trafficFlow(state, i) / TRAFFIC_NOISE_FLOW));
  return n;
}

/** Street and traffic noise at a tile: its own road's in full, its neighbors' at half. */
export function streetNoise(state: WorldState, x: number, z: number): number {
  const i = z * S + x;
  let half = 0;
  if (x > 0) half += tileNoise(state, i - 1);
  if (x < S - 1) half += tileNoise(state, i + 1);
  if (z > 0) half += tileNoise(state, i - S);
  if (z < S - 1) half += tileNoise(state, i + S);
  return tileNoise(state, i) + half / 2;
}

/**
 * Marks for charm the chunks where carts are loud enough to count: at the top of the hour, before
 * the counts are cleared, the chunks the last hour was heard in (so their noise fades if the carts
 * stopped); just before the hourly charm pass, the chunks heard so far this hour.
 */
export function markNoisyChunks(state: WorldState, full: boolean): void {
  const t = state.map.traffic;
  // Passes on a tile that make at least one point of noise: a whole hour's, or a quarter's.
  const least = full ? TRAFFIC_NOISE_FLOW : Math.ceil(TRAFFIC_NOISE_FLOW / 4);
  const mark = (i: number) => {
    if (t[i]! < least) return;
    const x = i % S;
    const z = (i - x) / S;
    // The noise reaches one tile, which may lie in the next chunk.
    markChunks(state, [x - 1, z - 1, x + 1, z + 1]);
  };
  const list = countedTiles(state);
  if (list) for (const i of list) mark(i);
  else for (let i = 0; i < t.length; i++) mark(i);
}
