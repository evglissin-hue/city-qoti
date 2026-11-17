// The evening route grid (docs/spec/19-evenings.md, The round: Routes). At 17:00 every tile is
// classed once (pleasant, plain, noisy or an evening street) and the classes are saved in
// `state.evenings.routes`; the round's A* weighs the walk grid by them. Lanterns lighting and carts
// passing change charm and noise, never the grid, so a route fixed at 17:00 stays the route all
// evening and a seat joining from a snapshot routes exactly as its partner does.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { WorldState } from '../../contracts';
import { Flags } from '../../map/layers';
import { base64ToBytes, bytesToBase64 } from '../../state/base64';
import { walkGrid } from './grid';

const N = MAP_SIZE * MAP_SIZE;

/** Route classes, 2 bits a tile. */
export const RouteClass = { pleasant: 0, plain: 1, noisy: 2, street: 3 } as const;

/** Cost scale of the round layer: a plain step on the walk grid costs this much (one unit = 1/4 step). */
export const ROUND_SCALE = 4;

/** Classes every tile as the map stands now and saves them; call at the start of the evening. */
export function fixRouteGrid(state: WorldState): void {
  const { road, flags, charm, charmNoise } = state.map;
  const { pleasantCharm, noisyNoise } = content.places;
  const bytes = new Uint8Array(N >> 2);
  for (let i = 0; i < N; i++) {
    let cls: number;
    if (road[i] && flags[i]! & Flags.evening) cls = RouteClass.street;
    else if (charmNoise[i]! >= noisyNoise) cls = RouteClass.noisy;
    else if (charm[i]! >= pleasantCharm) cls = RouteClass.pleasant;
    else cls = RouteClass.plain;
    bytes[i >> 2]! |= cls << ((i & 3) * 2);
  }
  state.evenings.routes = bytesToBase64(bytes);
}

/** Forgets the route grid (the 04:00 halving); rounds walk the ordinary grid until the next 17:00. */
export function dropRouteGrid(state: WorldState): void {
  delete state.evenings.routes;
}

interface RoundEntry {
  epoch: number;
  routes: string;
  layer: Uint8Array;
}

const layers = new WeakMap<WorldState, RoundEntry>();

/**
 * The derived cost layer for rounds at `ROUND_SCALE`, or null when no route grid is fixed. Keyed on
 * the walk grid's epoch and the saved route string only (never charm, noise or the hour).
 */
export function roundCost(state: WorldState): Uint8Array | null {
  const routes = state.evenings.routes;
  if (routes === undefined) return null;
  const grid = walkGrid(state);
  const e = layers.get(state);
  if (e && e.epoch === grid.epoch && e.routes === routes) return e.layer;
  const bytes = base64ToBytes(routes);
  const { plainCostPercent, noisyCostPercent } = content.places;
  const layer = new Uint8Array(N);
  const cost = grid.cost;
  for (let i = 0; i < N; i++) {
    const c = cost[i]!;
    if (c === 0) continue;
    const cls = ((bytes[i >> 2] ?? 0) >> ((i & 3) * 2)) & 3;
    const base = c * ROUND_SCALE;
    if (cls === RouteClass.plain) layer[i] = Math.floor((base * plainCostPercent + 99) / 100);
    else if (cls === RouteClass.noisy) layer[i] = Math.floor((base * noisyCostPercent + 99) / 100);
    else layer[i] = base;
  }
  layers.set(state, { epoch: grid.epoch, routes, layer });
  return layer;
}
