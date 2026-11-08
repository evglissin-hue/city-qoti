// Cart movement API (C4.0 contract; C4B owns it). docs/spec/13-ledger.md, Streets and traffic.
// Carts drive on roads that allow carts (lanes and streets, never paths) at their def's ticks per
// tile; the traffic system advances them and counts passes per tile. C4C sends them on trips with
// requestCartMove and checks cartAt, as C3C does with residents (docs/build/i2-wave-notes.md).
// Tiles are indexes z * MAP_SIZE + x.
//
// C4B: routes are the quickest drive (Dijkstra over cart ticks per tile, so streets draw carts
// away from lanes), climbing at most one level per tile like walkers, cached by (from, to) until
// the network changes. The cache is a derived index: never saved, never hashed, and a route is a
// pure function of the map, so a cached answer is the answer every client would compute.
import { content } from '@qoti/content';
import { MAP_SIZE, TICKS_PER_HOUR, TRAFFIC_SLOWDOWN_MAX } from '../../constants';
import type { Cart, EntityId, WorldState } from '../../contracts';
import { findById } from '../../state/entities';

const S = MAP_SIZE;
const N = S * S;

/** Per road layer value (0 to 7): ticks per tile for route costs (0 = no carts), capacity per hour. */
const ROUTE_TICKS = new Uint8Array(8);
const CAPACITY = new Uint16Array(8);
const ROAD_NOISE = new Uint8Array(8);
for (const r of content.roads) {
  if (r.layerValue < 0 || r.layerValue > 7) continue;
  ROAD_NOISE[r.layerValue] = r.noise ?? 0;
  if (!r.carts) continue;
  CAPACITY[r.layerValue] = r.capacity ?? 0;
  // Route costs follow the first cart def (all carts share roads; their own speeds come later).
  let ticks = 4;
  for (const [id, t] of content.carts[0]?.ticksPerTile ?? []) if (id === r.id) ticks = t;
  ROUTE_TICKS[r.layerValue] = ticks;
}

/** Ticks per tile by cart def and road layer value (0 = may not drive there). */
const CART_TICKS = new Map<string, Uint8Array>();
for (const def of content.carts) {
  const table = new Uint8Array(8);
  for (const [id, ticks] of def.ticksPerTile) {
    const road = content.roadById.get(id);
    if (road?.carts && road.layerValue >= 0 && road.layerValue < 8) table[road.layerValue] = ticks;
  }
  CART_TICKS.set(def.id, table);
}

/** True when a cart may drive on a road layer value. */
export function cartRoad(roadValue: number): boolean {
  return (ROUTE_TICKS[roadValue] ?? 0) > 0;
}

/** True when a cart may drive on the tile. */
export function cartTile(state: WorldState, tile: number): boolean {
  return tile >= 0 && tile < N && cartRoad(state.map.road[tile]!);
}

/** Cart passes per hour a road layer value carries before carts slow (0 when carts may not use it). */
export function roadCapacity(roadValue: number): number {
  return CAPACITY[roadValue] ?? 0;
}

/** The charm noise a road layer value gives its own tile before traffic (content RoadDef.noise). */
export function roadNoise(roadValue: number): number {
  return ROAD_NOISE[roadValue] ?? 0;
}

// --- Routes -------------------------------------------------------------------------------------

const dist = new Int32Array(N);
const prev = new Int32Array(N);
const seen = new Uint32Array(N);
const done = new Uint32Array(N);
let search = 0;
let heap = new Float64Array(1024);
let heapSize = 0;

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

/** The quickest drive, uncached. Keys pack (cost, tile) so ties go to the lower tile index. */
function searchRoute(road: Uint8Array, height: Uint8Array, from: number, to: number): number[] | null {
  search = (search + 1) >>> 0;
  if (search === 0) {
    seen.fill(0);
    done.fill(0);
    search = 1;
  }
  const id = search;
  heapSize = 0;
  dist[from] = 0;
  prev[from] = -1;
  seen[from] = id;
  push(from);
  while (heapSize > 0) {
    const key = pop();
    const cur = key % N;
    if (done[cur] === id) continue;
    done[cur] = id;
    if (cur === to) {
      let n = 0;
      for (let t = to; t !== from; t = prev[t]!) n++;
      const path = new Array<number>(n);
      let k = n - 1;
      for (let t = to; t !== from; t = prev[t]!) path[k--] = t;
      return path;
    }
    const x = cur % S;
    const hc = height[cur]!;
    const dc = dist[cur]!;
    for (let k = 0; k < 4; k++) {
      let nb: number;
      if (k === 0) {
        if (x === S - 1) continue;
        nb = cur + 1;
      } else if (k === 1) {
        if (x === 0) continue;
        nb = cur - 1;
      } else if (k === 2) {
        nb = cur + S;
        if (nb >= N) continue;
      } else {
        nb = cur - S;
        if (nb < 0) continue;
      }
      if (done[nb] === id) continue;
      const step = ROUTE_TICKS[road[nb]!]!;
      if (step === 0) continue;
      const dh = height[nb]! - hc;
      if (dh > 1 || dh < -1) continue;
      const dn = dc + step;
      if (seen[nb] === id && dist[nb]! <= dn) continue;
      seen[nb] = id;
      dist[nb] = dn;
      prev[nb] = cur;
      push(dn * N + nb);
    }
  }
  return null;
}

interface RouteCache {
  version: number;
  routes: Map<number, number[] | null>;
}

const caches = new WeakMap<WorldState, RouteCache>();
/** Entries per valley before the cache is emptied and refilled. */
const MAX_ROUTES = 4096;

/**
 * The cart route from one tile to another over lanes and streets (tiles after `from`, ending at
 * `to`), or null when either end is off the cart network or they are not connected. The array is
 * shared with the cache: copy it before changing it.
 */
export function cartRoute(state: WorldState, from: number, to: number): number[] | null {
  if (!cartTile(state, from) || !cartTile(state, to)) return null;
  if (from === to) return [];
  let c = caches.get(state);
  if (!c) {
    c = { version: state.networkVersion, routes: new Map() };
    caches.set(state, c);
  } else if (c.version !== state.networkVersion) {
    c.version = state.networkVersion;
    c.routes.clear();
  }
  const key = from * N + to;
  const hit = c.routes.get(key);
  if (hit !== undefined) return hit;
  const route = searchRoute(state.map.road, state.map.height, from, to);
  if (c.routes.size >= MAX_ROUTES) c.routes.clear();
  c.routes.set(key, route);
  return route;
}

/** True when every tile of a planned route is still cart road. */
export function routeStillOpen(state: WorldState, path: readonly number[], from: number): boolean {
  const road = state.map.road;
  for (let k = from; k < path.length; k++) if (!cartRoad(road[path[k]!]!)) return false;
  return true;
}

// --- Driving ------------------------------------------------------------------------------------

/** 'driving' (a route was found), 'arrived' (already there), 'unreachable' (no route; it stays put). */
export type CartMoveResult = 'driving' | 'arrived' | 'unreachable';

/** Sends a cart to a tile on the cart network. The cart leaves its shed. */
export function requestCartMove(state: WorldState, cartId: EntityId, target: number): CartMoveResult {
  const cart = findById(state.carts, cartId);
  if (!cart) return 'unreachable';
  cart.parked = false;
  if (cart.move?.target === target) return 'driving';
  cart.move = null;
  if (cart.tile === target) return 'arrived';
  const path = cartRoute(state, cart.tile, target);
  if (!path) return 'unreachable';
  cart.move = {
    path: path.slice(),
    step: 0,
    progress: 0,
    target,
    reason: 'task',
    version: state.networkVersion,
  };
  return 'driving';
}

/** True when the cart stands on `tile` and is not driving. */
export function cartAt(state: WorldState, cartId: EntityId, tile: number): boolean {
  const c = findById(state.carts, cartId);
  return !!c && c.move === null && c.tile === tile;
}

/** Ticks per tile for a cart def on a road layer value (lane 4, street 3; 0 when it may not drive there). */
export function cartTicks(cart: Cart, roadValue: number): number {
  return CART_TICKS.get(cart.def)?.[roadValue] ?? 0;
}

/**
 * Cart flow on a tile in passes per hour: the passes counted since the top of the hour, scaled to
 * a full hour (over at least a quarter of an hour, so the first carts of an hour never read as a
 * jam). The `traffic` layer empties on the hour, so this is the flow carts feel right now.
 */
export function trafficFlow(state: WorldState, tile: number): number {
  const passes = state.map.traffic[tile]!;
  if (passes === 0) return 0;
  const elapsed = Math.max(TICKS_PER_HOUR / 4, state.tick % TICKS_PER_HOUR);
  return Math.floor((passes * TICKS_PER_HOUR) / elapsed);
}

/**
 * How much slower carts drive on a tile, in percent of their ticks per tile: 100 up to the road's
 * capacity, then 100 * (1 + (flow - cap) / cap), at most TRAFFIC_SLOWDOWN_MAX times. Never more,
 * so a cart always gets where it is going: nothing on the road ever stops it (P28).
 */
export function slowdownPercent(state: WorldState, tile: number): number {
  const cap = CAPACITY[state.map.road[tile]!] ?? 0;
  if (cap === 0) return 100;
  const flow = trafficFlow(state, tile);
  if (flow <= cap) return 100;
  return Math.min(TRAFFIC_SLOWDOWN_MAX * 100, 100 + Math.floor(((flow - cap) * 100) / cap));
}
