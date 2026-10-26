// Carts and traffic (docs/spec/13-ledger.md, Streets and traffic). C4.0 baseline: carts drive their
// routes at their def's ticks per tile and every tile entered counts a pass in the `traffic` layer,
// which empties at the top of each hour. C4B adds congestion (slower above capacity, never
// gridlock), replans on network changes and cart noise in charm.
import { MAP_SIZE, TICKS_PER_HOUR } from '../../constants';
import type { Rect, System, TickCtx, WorldState } from '../../contracts';
import { cartTicks } from './api';

export const traffic: System = {
  id: 'traffic',
  order: 54,
  tick(state, ctx) {
    if (state.tick % TICKS_PER_HOUR === 0) clearTraffic(state, ctx);
    for (const cart of state.carts) {
      const m = cart.move;
      if (!m) continue;
      const next = m.path[m.step];
      if (next === undefined) {
        cart.move = null;
        continue;
      }
      const ticks = cartTicks(cart, state.map.road[next]!) || 4;
      m.progress += Math.ceil(256 / ticks);
      if (m.progress < 256) continue;
      m.progress = 0;
      const dx = (next % MAP_SIZE) - (cart.tile % MAP_SIZE);
      const dz = Math.floor(next / MAP_SIZE) - Math.floor(cart.tile / MAP_SIZE);
      cart.dir = dz < 0 ? 0 : dx > 0 ? 1 : dz > 0 ? 2 : 3;
      cart.tile = next;
      m.step++;
      countPass(state, ctx, next);
      if (m.step >= m.path.length) cart.move = null;
    }
  },
};

function countPass(state: WorldState, ctx: TickCtx, tile: number): void {
  const t = state.map.traffic;
  if (t[tile]! < 255) t[tile]! += 1;
  const x = tile % MAP_SIZE;
  const z = Math.floor(tile / MAP_SIZE);
  ctx.dirty.mark('traffic', [x, z, x, z]);
}

function clearTraffic(state: WorldState, ctx: TickCtx): void {
  const t = state.map.traffic;
  let x0 = MAP_SIZE;
  let z0 = MAP_SIZE;
  let x1 = -1;
  let z1 = -1;
  for (let i = 0; i < t.length; i++) {
    if (!t[i]) continue;
    t[i] = 0;
    const x = i % MAP_SIZE;
    const z = Math.floor(i / MAP_SIZE);
    if (x < x0) x0 = x;
    if (z < z0) z0 = z;
    if (x > x1) x1 = x;
    if (z > z1) z1 = z;
  }
  if (x1 >= 0) {
    const rect: Rect = [x0, z0, x1, z1];
    ctx.dirty.mark('traffic', rect);
  }
}
