// R2A movement: the scaled A*, the evening route grid, round and barrow paths, footfall.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { FOOTFALL_MAX, TICKS_PER_HOUR } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { Flags, Road } from '../../src/map/layers';
import { deserialize, serialize } from '../../src/state/serialize';
import { movement } from '../../src/systems/movement';
import { requestMove } from '../../src/systems/movement/api';
import { findPath } from '../../src/systems/movement/astar';
import { walkGrid } from '../../src/systems/movement/grid';
import { pathBetween, pathFor, roundPathCacheStats } from '../../src/systems/movement/paths';
import { dropRouteGrid, fixRouteGrid, roundCost } from '../../src/systems/movement/routes';
import { tickOfDay } from '../../src/systems/residents/time';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { flatWorld } from '../helpers';
import { resident, tileOf } from '../residents/helpers';

const A = tileOf(50, 50);
const B = tileOf(60, 50);

function road(state: WorldState, tiles: number[], evening = false): void {
  for (const t of tiles) {
    state.map.road[t] = Road.lane;
    if (evening) state.map.flags[t]! |= Flags.evening;
  }
  state.networkVersion += 1;
}

function row(z: number, x0: number, x1: number): number[] {
  const out: number[] = [];
  for (let x = x0; x <= x1; x++) out.push(tileOf(x, z));
  return out;
}

/** A straight road A to B, and a detour of `up` tiles north (pleasant, charm 60). */
function detourWorld(up: number): { state: WorldState; detour: number[] } {
  const state = flatWorld();
  const detour: number[] = [];
  for (let k = 1; k <= up; k++) detour.push(tileOf(50, 50 - k));
  detour.push(...row(50 - up, 51, 60));
  for (let k = up - 1; k >= 1; k--) detour.push(tileOf(60, 50 - k));
  road(state, [...row(50, 50, 60), ...detour]);
  for (const t of detour) state.map.charm[t] = 60;
  return { state, detour };
}

/** Tick for a clock hour (tick 0 is 06:00). */
function tickAt(hour: number): number {
  return hour * TICKS_PER_HOUR - 6 * TICKS_PER_HOUR;
}

describe('findPath scale and cost layer', () => {
  it('scale 1 with the default layer is the plain search', () => {
    const state = flatWorld();
    road(state, row(50, 50, 60));
    const grid = walkGrid(state);
    for (const [from, to] of [
      [A, B],
      [A, tileOf(55, 58)],
      [tileOf(45, 45), tileOf(70, 52)],
      [tileOf(35, 35), tileOf(10, 10)],
    ] as const) {
      const base = findPath(grid, state.map.height, from, to);
      const same = findPath(grid, state.map.height, from, to, undefined, grid.cost, 1);
      expect(same).toEqual(base);
      expect(base).not.toBeNull();
    }
    expect(findPath(grid, state.map.height, A, B)).toEqual(row(50, 51, 60));
  });

  it('scales a layer without changing the shape of the answer', () => {
    const state = flatWorld();
    road(state, row(50, 50, 60));
    const grid = walkGrid(state);
    const big = grid.cost.map((c) => c * 4);
    const to = tileOf(57, 55);
    expect(findPath(grid, state.map.height, A, to, undefined, big, 4)).toEqual(
      findPath(grid, state.map.height, A, to),
    );
  });
});

describe('round paths', () => {
  it('prefers a pleasant detour that is not much longer', () => {
    const { state, detour } = detourWorld(1);
    fixRouteGrid(state);
    const round = pathFor(state, A, B, 'round')!;
    expect(round).toContain(tileOf(55, 49));
    expect(round).not.toContain(tileOf(55, 50));
    expect(round.length).toBe(detour.length + 1);
    const walk = pathFor(state, A, B, 'walk')!;
    expect(walk).toEqual(row(50, 51, 60));
  });

  it('takes the plain road when the pleasant detour is much longer', () => {
    const { state } = detourWorld(3);
    fixRouteGrid(state);
    const round = pathFor(state, A, B, 'round')!;
    expect(round).toEqual(row(50, 51, 60));
  });

  it('falls back to the ordinary grid without a route grid', () => {
    const { state } = detourWorld(1);
    expect(roundCost(state)).toBeNull();
    expect(pathFor(state, A, B, 'round')).toEqual(pathBetween(state, A, B));
  });

  it('classes tiles in two bits: pleasant, plain, noisy and evening streets', () => {
    const { state } = detourWorld(1);
    state.map.charmNoise[tileOf(55, 50)] = content.places.noisyNoise;
    state.map.flags[tileOf(56, 50)]! |= Flags.evening;
    state.map.charm[tileOf(56, 50)] = 0;
    fixRouteGrid(state);
    const layer = roundCost(state)!;
    const cost = walkGrid(state).cost;
    expect(layer[tileOf(55, 49)]).toBe(cost[tileOf(55, 49)]! * 4);
    expect(layer[tileOf(54, 50)]).toBe(
      Math.ceil((cost[tileOf(54, 50)]! * 4 * content.places.plainCostPercent) / 100),
    );
    expect(layer[tileOf(55, 50)]).toBe(
      Math.ceil((cost[tileOf(55, 50)]! * 4 * content.places.noisyCostPercent) / 100),
    );
    expect(layer[tileOf(56, 50)]).toBe(cost[tileOf(56, 50)]! * 4);
    expect(layer[tileOf(100, 5)]).toBe(0);
  });

  it('is not thrown away by charm or noise changing, but is by a new road', () => {
    const { state } = detourWorld(1);
    fixRouteGrid(state);
    const first = pathFor(state, A, B, 'round')!;
    const stats = roundPathCacheStats(state);
    expect(stats.misses).toBe(1);
    // A lantern lights and a cart passes: charm and noise move, the routes do not.
    state.map.charm.fill(0);
    state.map.charmNoise.fill(9);
    state.tick = tickAt(18);
    const second = pathFor(state, A, B, 'round')!;
    expect(second).toBe(first);
    expect(roundPathCacheStats(state)).toEqual({ size: 1, hits: 1, misses: 1 });
    // A new road changes the walk grid.
    road(state, [tileOf(70, 70)]);
    pathFor(state, A, B, 'round');
    expect(roundPathCacheStats(state).misses).toBe(2);
    expect(roundPathCacheStats(state).size).toBe(1);
  });

  it('routes the same on a copy loaded from a save made mid-evening', () => {
    const { state } = detourWorld(1);
    fixRouteGrid(state);
    state.tick = tickAt(19);
    const copy = deserialize(serialize(state));
    expect(copy.evenings.routes).toBe(state.evenings.routes);
    for (const [from, to] of [
      [A, B],
      [tileOf(50, 49), tileOf(60, 49)],
      [A, tileOf(58, 53)],
    ] as const) {
      expect(pathFor(copy, from, to, 'round')).toEqual(pathFor(state, from, to, 'round'));
    }
  });
});

describe('barrow paths', () => {
  function barrowWorld(): WorldState {
    const state = flatWorld();
    road(state, [...row(50, 50, 60), ...row(49, 50, 60)]);
    for (const t of row(50, 51, 59)) state.map.flags[t]! |= Flags.evening;
    return state;
  }

  it('avoids an evening street from 17:00 to 21:00 and uses it outside', () => {
    const state = barrowWorld();
    state.tick = tickAt(17);
    expect(tickOfDay(state.tick)).toBe(17 * TICKS_PER_HOUR);
    const inside = pathFor(state, A, B, 'barrow')!;
    for (const t of row(50, 51, 59)) expect(inside).not.toContain(t);
    expect(inside).toContain(B);
    state.tick = tickAt(21) - 1;
    expect(pathFor(state, A, B, 'barrow')!).toEqual(inside);
    state.tick = tickAt(21);
    expect(pathFor(state, A, B, 'barrow')).toEqual(row(50, 51, 60));
    state.tick = tickAt(12);
    expect(pathFor(state, A, B, 'barrow')).toEqual(row(50, 51, 60));
  });

  it('has no way when the evening street is the only one', () => {
    const state = flatWorld();
    // The river is the only crossing: a bridge on the evening street.
    road(state, row(50, 95, 105));
    state.map.height[tileOf(100, 50)] = 2;
    state.map.height[tileOf(101, 50)] = 2;
    state.map.flags[tileOf(100, 50)]! |= Flags.evening;
    state.map.flags[tileOf(101, 50)]! |= Flags.evening;
    const from = tileOf(95, 50);
    const to = tileOf(105, 50);
    state.tick = tickAt(12);
    expect(pathFor(state, from, to, 'barrow')).not.toBeNull();
    state.tick = tickAt(18);
    expect(pathFor(state, from, to, 'barrow')).toBeNull();
    state.tick = tickAt(21);
    expect(pathFor(state, from, to, 'barrow')).not.toBeNull();
  });

  it('notices a street marked mid-evening', () => {
    const state = flatWorld();
    road(state, [...row(50, 50, 60), ...row(49, 50, 60)]);
    state.tick = tickAt(18);
    const before = pathFor(state, A, B, 'barrow')!;
    expect(before).toEqual(row(50, 51, 60));
    for (const t of row(50, 51, 59)) state.map.flags[t]! |= Flags.evening;
    state.lastTurn += 1; // the command that marked it ran in a turn
    const after = pathFor(state, A, B, 'barrow')!;
    for (const t of row(50, 51, 59)) expect(after).not.toContain(t);
  });

  it('answers the same from a cold cache as from a warm one', () => {
    const state = barrowWorld();
    state.tick = tickAt(18);
    const warm = pathFor(state, A, B, 'barrow');
    const copy = deserialize(serialize(state));
    expect(pathFor(copy, A, B, 'barrow')).toEqual(warm);
  });
});

describe('footfall', () => {
  function walker() {
    const f = hamletFixture();
    const r = resident(f.state, f.residents[0]![0]!);
    r.inside = 0;
    r.tile = tileOf(60, 50);
    return { state: f.state, r, ctx: createTickCtx(f.state) };
  }

  function walk(w: ReturnType<typeof walker>, reason: 'round' | 'schedule', to = tileOf(64, 50)): number[] {
    expect(requestMove(w.state, w.r.id, to, reason)).toBe('walking');
    const path = [...w.r.move!.path];
    for (let i = 0; i < 400 && w.r.move; i++) movement.tick(w.state, w.ctx);
    return path;
  }

  it('a round adds to the evening layer only, a day walk to the day layer only', () => {
    const w = walker();
    const day0 = w.state.map.footfallDay.slice();
    const eve0 = w.state.map.footfallEve.slice();
    const path = walk(w, 'round');
    for (const t of path) {
      expect(w.state.map.footfallEve[t]).toBe(eve0[t]! + 1);
      expect(w.state.map.footfallDay[t]).toBe(day0[t]);
    }
    const eveAfter = w.state.map.footfallEve.slice();
    const path2 = walk(w, 'schedule', tileOf(60, 50));
    for (const t of path2) {
      expect(w.state.map.footfallDay[t]).toBe(day0[t]! + 1);
      expect(w.state.map.footfallEve[t]).toBe(eveAfter[t]);
    }
  });

  it('saturates at FOOTFALL_MAX', () => {
    const w = walker();
    const path: number[] = [];
    for (let x = 61; x <= 64; x++) path.push(tileOf(x, 50));
    for (const t of path) w.state.map.footfallEve[t] = FOOTFALL_MAX;
    walk(w, 'round');
    for (const t of path) expect(w.state.map.footfallEve[t]).toBe(FOOTFALL_MAX);
  });

  it('halves both layers at 04:00, drops the routes and emits the layers', () => {
    const w = walker();
    w.state.map.footfallDay[5] = 9;
    w.state.map.footfallEve[5] = 1001;
    w.state.evenings.routes = 'AAAA';
    w.state.tick = tickAt(4 + 24) - 1;
    expect(tickOfDay(w.state.tick + 1)).toBe(4 * TICKS_PER_HOUR);
    w.state.tick += 1;
    movement.tick(w.state, w.ctx);
    expect(w.state.map.footfallDay[5]).toBe(4);
    expect(w.state.map.footfallEve[5]).toBe(500);
    expect(w.state.evenings.routes).toBeUndefined();
    const ev = w.ctx.events.filter((e) => e.e === 'footfall.updated');
    expect(ev).toHaveLength(1);
    const f = (ev[0] as { f: { day: Uint16Array; eve: Uint16Array } }).f;
    expect(f.day[5]).toBe(4);
    expect(f.eve[5]).toBe(500);
    // A second tick in the same hour does not halve again.
    w.state.tick += 1;
    movement.tick(w.state, w.ctx);
    expect(w.state.map.footfallEve[5]).toBe(500);
    dropRouteGrid(w.state);
  });

  it('emits the layers at the top of each hour from 17:00 to 21:00 and at no other hour', () => {
    const w = walker();
    const hours: number[] = [];
    for (let h = 0; h < 24; h++) {
      w.ctx.events.length = 0;
      w.state.tick = tickAt(h) + (h < 6 ? 24 * TICKS_PER_HOUR : 0);
      movement.tick(w.state, w.ctx);
      if (w.ctx.events.some((e) => e.e === 'footfall.updated')) hours.push(h);
    }
    expect(hours).toEqual([4, 17, 18, 19, 20, 21]);
    w.ctx.events.length = 0;
    w.state.tick = tickAt(17) + 1;
    movement.tick(w.state, w.ctx);
    expect(w.ctx.events).toHaveLength(0);
  });
});
