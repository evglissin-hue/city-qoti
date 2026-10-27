// Carts and traffic (docs/spec/13-ledger.md, Streets and traffic). Every tick, carts drive their
// routes at their def's ticks per tile (lane 4, street 3), slowed on tiles carrying more than the
// road's capacity per hour (at most TRAFFIC_SLOWDOWN_MAX times, so nothing ever stops: no
// gridlock, P28). Every tile entered counts a pass in the `traffic` layer, which empties at the
// top of each hour. A route the network no longer carries is planned again from where the cart
// stands; a cart whose road vanished from under it goes back to its shed. The system also lets
// the grass grow back over desire paths each night (./wear) and marks the chunks where carts are
// heard for the charm pass (./noise).
import { MAP_SIZE, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../constants';
import type { Cart, System, TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { findById } from '../../state/entities';
import { dailyOffset } from '../economy/time';
import { CHARM_OFFSET } from '../hearth/charm';
import { doorTile } from '../movement/api';
import { advance } from '../movement';
import { cartRoute, cartTicks, cartTile, routeStillOpen, slowdownPercent } from './api';
import { markNoisyChunks } from './noise';
import { clearTraffic, countPass } from './passes';
import { regrow } from './wear';

/** The nightly regrowth of worn grass. */
export const REGROW_OFFSET = dailyOffset(2, 30);

export const traffic: System = {
  id: 'traffic',
  order: 54,
  tick(state, ctx) {
    const hourTick = state.tick % TICKS_PER_HOUR;
    if (hourTick === 0) {
      if (isStandard(state)) markNoisyChunks(state, true);
      clearTraffic(state, ctx);
    }
    if (state.tick % TICKS_PER_DAY === REGROW_OFFSET && isStandard(state)) regrow(state, ctx);
    for (let k = 0; k < state.carts.length; k++) drive(state, ctx, state.carts[k]!);
    // The charm system runs later in this same tick when (tick - 1) hits its hourly offset.
    if (hourTick === CHARM_OFFSET + 1 && isStandard(state)) markNoisyChunks(state, false);
  },
};

/** One tick of driving for one cart. */
function drive(state: WorldState, ctx: TickCtx, cart: Cart): void {
  const m = cart.move;
  if (!m) return;
  if (m.version !== state.networkVersion) {
    if (!replan(state, cart)) return;
  }
  const move = cart.move!;
  const next = move.path[move.step];
  if (next === undefined) {
    cart.move = null;
    return;
  }
  const road = state.map.road[next]!;
  const ticks = cartTicks(cart, road) || 4;
  const T = Math.max(1, Math.round((ticks * slowdownPercent(state, next)) / 100));
  move.progress = advance(move.progress, T);
  if (move.progress < 256) return;
  move.progress = 0;
  const dx = (next % MAP_SIZE) - (cart.tile % MAP_SIZE);
  const dz = Math.floor(next / MAP_SIZE) - Math.floor(cart.tile / MAP_SIZE);
  cart.dir = dz < 0 ? 0 : dx > 0 ? 1 : dz > 0 ? 2 : 3;
  cart.tile = next;
  move.step++;
  countPass(state, ctx, next);
  if (move.step >= move.path.length) cart.move = null;
}

/**
 * The network changed since the route was planned: keep it if every tile ahead is still cart road,
 * else plan again from here. With no way on, the cart waits where it stands if that is still road
 * (its owner may send it elsewhere), or goes home to its shed if the road went from under it.
 * Returns false when the cart stopped.
 */
function replan(state: WorldState, cart: Cart): boolean {
  const m = cart.move!;
  if (routeStillOpen(state, m.path, m.step)) {
    m.version = state.networkVersion;
    return true;
  }
  const here = cartTile(state, cart.tile);
  const route = here ? cartRoute(state, cart.tile, m.target) : null;
  if (route && route.length > 0) {
    cart.move = { ...m, path: route.slice(), step: 0, progress: 0, version: state.networkVersion };
    return true;
  }
  cart.move = null;
  if (!here) sendHome(state, cart);
  return false;
}

/** Puts a stranded cart back in its shed (parked, not drawn), as if it took the long way round. */
function sendHome(state: WorldState, cart: Cart): void {
  const shed = findById(state.buildings, cart.home);
  if (!shed) return;
  cart.tile = doorTile(shed);
  cart.parked = true;
}
