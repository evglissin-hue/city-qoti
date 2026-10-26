import { describe, expect, it } from 'vitest';
import { MAX_PATH_EXPANSIONS, ResidentFlags } from '../../src/constants';
import { Road } from '../../src/map/layers';
import { findPath } from '../../src/systems/movement/astar';
import { walkGrid, type WalkGrid } from '../../src/systems/movement/grid';
import { advance, movement, tileTicks, walkTicks } from '../../src/systems/movement';
import { isAt, isWalking, requestMove, stopMove } from '../../src/systems/movement/api';
import { pathBetween, pathCacheStats } from '../../src/systems/movement/paths';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { flatWorld, rejection, run } from '../helpers';
import { resident, S, tileOf } from './helpers';

/** Step cost of a path from `from`, as A* counts it. */
function pathCost(grid: WalkGrid, h: Uint8Array, from: number, path: readonly number[], to: number): number {
  let cost = 0;
  let cur = from;
  for (const t of path) {
    let step = grid.cost[t]! || (t === to ? 1 : Infinity);
    if (h[t]! > h[cur]!) step += 1;
    cost += step;
    cur = t;
  }
  return cost;
}

/**
 * An independent reference: Dijkstra-ordered A* with a plain sorted open list and the same
 * tie-breaks (lower f, then lower h, then lower tile index).
 */
function referencePath(grid: WalkGrid, h: Uint8Array, from: number, to: number): number[] | null {
  const tx = to % S;
  const tz = Math.floor(to / S);
  const hOf = (t: number) => Math.abs((t % S) - tx) + Math.abs(Math.floor(t / S) - tz);
  const g = new Map<number, number>([[from, 0]]);
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  let open: [f: number, h: number, t: number][] = [[hOf(from), hOf(from), from]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const [, , cur] = open.shift()!;
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (cur === to) {
      const out: number[] = [];
      for (let t = to; t !== from; t = parent.get(t)!) out.unshift(t);
      return out;
    }
    const x = cur % S;
    for (const nb of [x < S - 1 ? cur + 1 : -1, x > 0 ? cur - 1 : -1, cur + S, cur - S]) {
      if (nb < 0 || nb >= S * S || closed.has(nb)) continue;
      let step = grid.cost[nb]!;
      if (step === 0) {
        if (nb !== to) continue;
        step = 1;
      }
      const dh = h[nb]! - h[cur]!;
      if (Math.abs(dh) >= 2) continue;
      if (dh > 0) step += 1;
      const gn = g.get(cur)! + step;
      if (g.has(nb) && g.get(nb)! <= gn) continue;
      g.set(nb, gn);
      parent.set(nb, cur);
      open = open.filter((o) => o[2] !== nb);
      open.push([gn + hOf(nb), hOf(nb), nb]);
    }
  }
  return null;
}

describe('pathfinding', () => {
  it('breaks ties exactly as the spec says, every time', () => {
    const w = flatWorld();
    const grid = walkGrid(w);
    for (const [a, b] of [
      [tileOf(10, 60), tileOf(16, 64)],
      [tileOf(16, 64), tileOf(10, 60)],
      [tileOf(30, 40), tileOf(30, 52)],
      [tileOf(15, 25), tileOf(35, 27)],
    ] as const) {
      const p1 = findPath(grid, w.map.height, a, b)!;
      const p2 = findPath(grid, w.map.height, a, b)!;
      expect(p1).toEqual(p2);
      expect(p1).toEqual(referencePath(grid, w.map.height, a, b));
      expect(p1[p1.length - 1]).toBe(b);
    }
  });

  it('finds the cheapest route: lanes beat grass', () => {
    const f = hamletFixture();
    const grid = walkGrid(f.state);
    const from = tileOf(42, 52);
    const to = tileOf(88, 52);
    const path = findPath(grid, f.state.map.height, from, to)!;
    const ref = referencePath(grid, f.state.map.height, from, to)!;
    expect(pathCost(grid, f.state.map.height, from, path, to)).toBe(
      pathCost(grid, f.state.map.height, from, ref, to),
    );
    const onLane = path.filter((t) => f.state.map.road[t] === Road.lane).length;
    expect(onLane).toBeGreaterThan(30);
  });

  it('charges a step for climbing and routes round cliffs', () => {
    const w = flatWorld();
    // Many routes are equally short; a one-level bump on some of them costs +1, so they lose.
    w.map.height[tileOf(59, 70)] = 3;
    const grid = walkGrid(w);
    const p = findPath(grid, w.map.height, tileOf(58, 70), tileOf(60, 72))!;
    expect(p).not.toContain(tileOf(59, 70));
    expect(pathCost(grid, w.map.height, tileOf(58, 70), p, tileOf(60, 72))).toBe(8);
    // Straight over a bump costs one more than flat ground, and still beats going round.
    const over = findPath(grid, w.map.height, tileOf(59, 69), tileOf(59, 71))!;
    expect(over).toEqual([tileOf(59, 70), tileOf(59, 71)]);
    expect(pathCost(grid, w.map.height, tileOf(59, 69), over, tileOf(59, 71))).toBe(5);
    // The cliff block (height 6 next to 2) is never entered.
    const around = findPath(grid, w.map.height, tileOf(15, 25), tileOf(35, 25))!;
    for (const t of around) {
      const x = t % S;
      const z = Math.floor(t / S);
      expect(x >= 20 && x < 30 && z >= 20 && z < 30).toBe(false);
    }
  });

  it('cannot cross the river without a bridge, and uses one when there is', () => {
    const w = flatWorld();
    const a = tileOf(96, 10);
    const b = tileOf(105, 10);
    expect(findPath(walkGrid(w), w.map.height, a, b, 4000)).toBeNull();
    // A bridge is road on water; the banks are at height 2 and the river bed at 0, so lift it.
    for (const x of [100, 101]) {
      w.map.road[tileOf(x, 12)] = Road.lane;
      w.map.height[tileOf(x, 12)] = 2;
    }
    w.networkVersion += 1;
    const p = findPath(walkGrid(w), w.map.height, a, b)!;
    expect(p).toContain(tileOf(100, 12));
  });

  it('keeps out of buildings and blocking decor, except to reach a destination', () => {
    const f = hamletFixture();
    const grid = walkGrid(f.state);
    const occ = f.state.map.occupant;
    const p = findPath(grid, f.state.map.height, tileOf(42, 52), tileOf(80, 44))!;
    expect(p.every((t) => !occ[t])).toBe(true);
    const inside = tileOf(66, 49);
    expect(occ[inside]).toBeGreaterThan(0);
    const toInside = findPath(grid, f.state.map.height, tileOf(66, 52), inside)!;
    expect(toInside[toInside.length - 1]).toBe(inside);
    // A hedge on the path: the walk grid blocks its tile.
    const hedgeAt = tileOf(70, 56);
    const before = findPath(walkGrid(f.state), f.state.map.height, tileOf(70, 54), tileOf(70, 58))!;
    expect(before).toContain(hedgeAt);
    expect(
      rejection(
        run(f.state, { t: 'decor.place', def: 'hedge', fx: 70 * 256 + 128, fz: 56 * 256 + 128, rot: 0 }),
      ),
    ).toBeUndefined();
    const after = findPath(walkGrid(f.state), f.state.map.height, tileOf(70, 54), tileOf(70, 58))!;
    expect(after).not.toContain(hedgeAt);
  });

  it('gives up after the expansion cap', () => {
    const w = flatWorld();
    expect(findPath(walkGrid(w), w.map.height, tileOf(96, 10), tileOf(105, 180))).toBeNull();
    expect(findPath(walkGrid(w), w.map.height, tileOf(1, 1), tileOf(90, 190), 50)).toBeNull();
    expect(MAX_PATH_EXPANSIONS).toBe(20000);
  });
});

describe('path cache', () => {
  it('reuses paths until the network changes, then plans again', () => {
    const w = flatWorld();
    const a = tileOf(40, 80);
    const b = tileOf(60, 80);
    const first = pathBetween(w, a, b)!;
    expect(pathBetween(w, a, b)).toBe(first);
    expect(pathCacheStats(w).hits).toBe(1);
    // A path a little to the south is cheaper than grass: painting it changes the answer.
    const tiles: [number, number][] = [];
    for (let x = 40; x <= 60; x++) tiles.push([x, 81]);
    expect(rejection(run(w, { t: 'road.paint', kind: 'path', tiles }))).toBeUndefined();
    const second = pathBetween(w, a, b)!;
    expect(second).not.toBe(first);
    expect(second.filter((t) => w.map.road[t]).length).toBeGreaterThan(15);
    expect(pathCacheStats(w).size).toBe(1);
  });

  it('notices walkability changes even without a version bump', () => {
    const w = flatWorld();
    const before = walkGrid(w).epoch;
    w.decor.push({
      id: w.nextId++,
      def: 'hedge',
      fx: 10 * 256 + 128,
      fz: 10 * 256 + 128,
      rot: 0,
      builtBy: 0,
    });
    expect(walkGrid(w).epoch).not.toBe(before);
    expect(walkGrid(w).cost[tileOf(10, 10)]).toBe(0);
  });
});

describe('walking', () => {
  it('walks at the spec speeds: road 5, grass 10 ticks a tile, Sporty x0.8', () => {
    for (const [ticks, pct, expected] of [
      [5, 100, 5],
      [10, 100, 10],
      [15, 100, 15],
      [20, 100, 20],
      [5, 80, 4],
      [10, 80, 8],
    ] as const) {
      const T = tileTicks(ticks, pct);
      expect(T).toBe(expected);
      let p = 0;
      let n = 0;
      while (p < 256) {
        p = advance(p, T);
        n++;
      }
      expect(n).toBe(expected);
    }

    const f = hamletFixture();
    const hazel = resident(f.state, f.residents[0]![1]!); // shy, bookish
    const pip = resident(f.state, f.residents[0]![2]!); // curious, sporty
    const ctx = createTickCtx(f.state);
    const target = tileOf(80, 50);
    for (const r of [hazel, pip]) {
      r.tile = tileOf(60, 50);
      r.inside = 0;
      expect(requestMove(f.state, r.id, target, 'schedule')).toBe('walking');
    }
    expect(walkTicks(f.state, hazel, hazel.move!.path)).toBe(100);
    let t = 0;
    while (isWalking(f.state, hazel.id) && t < 500) {
      movement.tick(f.state, ctx);
      t++;
    }
    expect(t).toBe(100);
    expect(isAt(f.state, pip.id, target)).toBe(true);
  });

  it('retargets mid-step without snapping back', () => {
    const f = hamletFixture();
    const r = resident(f.state, f.residents[0]![0]!);
    const ctx = createTickCtx(f.state);
    r.inside = 0;
    r.tile = tileOf(60, 50);
    requestMove(f.state, r.id, tileOf(70, 50), 'schedule');
    for (let i = 0; i < 3; i++) movement.tick(f.state, ctx);
    const progress = r.move!.progress;
    const next = r.move!.path[r.move!.step]!;
    expect(progress).toBeGreaterThan(0);
    requestMove(f.state, r.id, tileOf(61, 54), 'schedule');
    expect(r.move!.path[0]).toBe(next);
    expect(r.move!.progress).toBe(progress);
  });

  it('replans when the way ahead closes, and marks the walker stuck when no way is left', () => {
    const f = hamletFixture();
    const r = resident(f.state, f.residents[0]![0]!);
    const ctx = createTickCtx(f.state);
    r.inside = 0;
    r.tile = tileOf(70, 54);
    const target = tileOf(70, 60);
    requestMove(f.state, r.id, target, 'schedule');
    // A hedge across the way at z 57: the walk goes round it.
    run(f.state, { t: 'decor.place', def: 'hedge', fx: 70 * 256 + 128, fz: 57 * 256 + 128, rot: 0 });
    for (let i = 0; i < 400 && isWalking(f.state, r.id); i++) movement.tick(f.state, ctx);
    expect(isAt(f.state, r.id, target)).toBe(true);
    // Now box the walker in on a little island of grass and send them off again.
    for (const [x, z] of [
      [69, 60],
      [71, 60],
      [70, 59],
      [70, 61],
    ] as const) {
      f.state.map.occupant[tileOf(x, z)] = 999;
    }
    f.state.networkVersion += 1;
    expect(requestMove(f.state, r.id, tileOf(40, 60), 'schedule')).toBe('unreachable');
    expect(r.move).toBeNull();
  });

  it('stops where asked', () => {
    const f = hamletFixture();
    const r = resident(f.state, f.residents[0]![0]!);
    r.inside = 0;
    requestMove(f.state, r.id, tileOf(80, 50), 'task');
    stopMove(f.state, r.id);
    expect(isWalking(f.state, r.id)).toBe(false);
    expect(r.flags & ResidentFlags.stuck).toBe(0);
  });
});
