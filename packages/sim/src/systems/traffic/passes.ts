// Cart passes in the `traffic` layer: counted as carts enter tiles, cleared at the top of each
// hour. The tiles counted this hour are also kept in a list (a derived index, never saved), so the
// hourly clear and the noise marking touch only those; on a state this module has not seen yet
// (just loaded) the first clear scans the whole layer and starts the list, so both ways agree.
import { MAP_SIZE } from '../../constants';
import type { Rect, TickCtx, WorldState } from '../../contracts';

const counted = new WeakMap<WorldState, number[]>();

/** One cart entered `tile`. */
export function countPass(state: WorldState, ctx: TickCtx, tile: number): void {
  const t = state.map.traffic;
  const v = t[tile]!;
  if (v === 0) counted.get(state)?.push(tile);
  if (v < 255) t[tile] = v + 1;
  const x = tile % MAP_SIZE;
  const z = (tile - x) / MAP_SIZE;
  ctx.dirty.mark('traffic', [x, z, x, z]);
}

/** Tiles with passes this hour, or null when this state's list is not known yet. */
export function countedTiles(state: WorldState): readonly number[] | null {
  return counted.get(state) ?? null;
}

/** Empties the layer (the top of the hour). */
export function clearTraffic(state: WorldState, ctx: TickCtx): void {
  const t = state.map.traffic;
  let x0 = MAP_SIZE;
  let z0 = MAP_SIZE;
  let x1 = -1;
  let z1 = -1;
  const clear = (i: number) => {
    if (!t[i]) return;
    t[i] = 0;
    const x = i % MAP_SIZE;
    const z = (i - x) / MAP_SIZE;
    if (x < x0) x0 = x;
    if (z < z0) z0 = z;
    if (x > x1) x1 = x;
    if (z > z1) z1 = z;
  };
  const list = counted.get(state);
  if (list) {
    for (const i of list) clear(i);
    list.length = 0;
  } else {
    for (let i = 0; i < t.length; i++) clear(i);
    counted.set(state, []);
  }
  if (x1 >= 0) {
    const rect: Rect = [x0, z0, x1, z1];
    ctx.dirty.mark('traffic', rect);
  }
}
