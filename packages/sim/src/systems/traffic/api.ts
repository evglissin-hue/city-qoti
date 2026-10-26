// Cart movement API (C4.0 contract; C4B owns it). docs/spec/13-ledger.md, Streets and traffic.
// Carts drive on roads that allow carts (lanes and streets, never paths) at their def's ticks per
// tile; the traffic system advances them and counts passes per tile. C4C sends them on trips with
// requestCartMove and checks cartAt, as C3C does with residents (docs/build/i2-wave-notes.md).
// Tiles are indexes z * MAP_SIZE + x. C4B replaces the baseline route search (plain breadth-first)
// with a cached, congestion-aware one; the signatures stay.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Cart, EntityId, WorldState } from '../../contracts';
import { findById } from '../../state/entities';

const STEPS = [-MAP_SIZE, 1, MAP_SIZE, -1] as const;

/** Road layer values carts may use (content roads with `carts`). */
function cartRoads(): ReadonlySet<number> {
  return new Set(content.roads.filter((r) => r.carts).map((r) => r.layerValue));
}

/** True when a cart may drive on the tile. */
export function cartTile(state: WorldState, tile: number): boolean {
  return tile >= 0 && tile < MAP_SIZE * MAP_SIZE && cartRoads().has(state.map.road[tile]!);
}

/**
 * The cart route from one tile to another over lanes and streets (tiles after `from`, ending at
 * `to`), or null when either end is off the cart network or they are not connected.
 */
export function cartRoute(state: WorldState, from: number, to: number): number[] | null {
  if (!cartTile(state, from) || !cartTile(state, to)) return null;
  if (from === to) return [];
  const roads = cartRoads();
  const prev = new Int32Array(MAP_SIZE * MAP_SIZE).fill(-1);
  prev[from] = from;
  const queue: number[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head]!;
    const x = t % MAP_SIZE;
    for (let k = 0; k < 4; k++) {
      const n = t + STEPS[k]!;
      if (n < 0 || n >= MAP_SIZE * MAP_SIZE) continue;
      if ((k === 1 && x === MAP_SIZE - 1) || (k === 3 && x === 0)) continue;
      if (prev[n] !== -1 || !roads.has(state.map.road[n]!)) continue;
      prev[n] = t;
      if (n === to) {
        const path: number[] = [];
        for (let c = to; c !== from; c = prev[c]!) path.push(c);
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

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
  cart.move = { path, step: 0, progress: 0, target, reason: 'task', version: state.networkVersion };
  return 'driving';
}

/** True when the cart stands on `tile` and is not driving. */
export function cartAt(state: WorldState, cartId: EntityId, tile: number): boolean {
  const c = findById(state.carts, cartId);
  return !!c && c.move === null && c.tile === tile;
}

/** Ticks per tile for a cart def on a road layer value (lane 4, street 3; 0 when it may not drive there). */
export function cartTicks(cart: Cart, roadValue: number): number {
  const def = content.cartById.get(cart.def);
  const road = content.roads.find((r) => r.layerValue === roadValue);
  if (!def || !road?.carts) return 0;
  for (const [id, ticks] of def.ticksPerTile) if (id === road.id) return ticks;
  return 0;
}
