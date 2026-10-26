// C4B traffic: carts on lanes and streets, congestion, replanning, street rules and street noise
// (docs/spec/13-ledger.md, Streets and traffic). Carts are put in state by hand (C4C owns the cart
// shed); the traffic system runs on its own with the other systems switched off where it matters.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR, TRAFFIC_SLOWDOWN_MAX } from '../../src/constants';
import type { Cart, WorldState } from '../../src/contracts';
import { Flags, Road } from '../../src/map/layers';
import { rngFromSeed } from '../../src/rng/streams';
import { pipeline, withoutSystems } from '../../src/systems';
import { recomputeDirty } from '../../src/systems/hearth/charm';
import {
  cartAt,
  cartRoute,
  requestCartMove,
  slowdownPercent,
  trafficFlow,
} from '../../src/systems/traffic/api';
import { streetNoise } from '../../src/systems/traffic/noise';
import { advanceTo, createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { flatWorld, rejection, run, S } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';

const OTHERS = pipeline.map((s) => s.id).filter((id) => id !== 'clock' && id !== 'traffic');

function addCart(state: WorldState, tile: number, home = 0): Cart {
  const cart: Cart = {
    id: state.nextId++,
    def: 'cart',
    home,
    tile,
    move: null,
    load: [],
    job: 0,
    dir: 1,
    parked: false,
  };
  state.carts.push(cart);
  return cart;
}

function drive(state: WorldState, ticks: number): void {
  const ctx = createTickCtx(state);
  withoutSystems(OTHERS, () => advanceTo(state, state.tick + ticks, ctx));
}

describe('congestion', () => {
  it('slows carts only above the road capacity, by 1 + (flow - cap) / cap, at most 2x', () => {
    const s = flatWorld();
    s.settings.mode = 'standard';
    const t = 50 * S + 50;
    s.map.road[t] = Road.lane;
    s.tick = TICKS_PER_HOUR * 10 + TICKS_PER_HOUR / 2; // half an hour in
    const cap = content.roadById.get('lane')!.capacity!;
    s.map.traffic[t] = cap / 2;
    expect(trafficFlow(s, t)).toBe(cap);
    expect(slowdownPercent(s, t)).toBe(100);
    // 24 passes in half an hour is 48 an hour on a lane of 30: 1 + 18 / 30.
    s.map.traffic[t] = 24;
    expect(slowdownPercent(s, t)).toBe(160);
    s.map.traffic[t] = 255;
    expect(slowdownPercent(s, t)).toBe(TRAFFIC_SLOWDOWN_MAX * 100);
    // The first carts of an hour never read as a jam: flow counts over at least a quarter hour.
    s.tick = TICKS_PER_HOUR * 11 + 1;
    s.map.traffic[t] = 2;
    expect(trafficFlow(s, t)).toBe(8);
    // Streets carry more before they slow.
    s.map.road[t] = Road.street;
    s.tick = TICKS_PER_HOUR * 11 + TICKS_PER_HOUR / 2;
    s.map.traffic[t] = 30;
    expect(slowdownPercent(s, t)).toBe(100);
  });

  it('a crowd of carts on one lane arrives later than one cart alone, never more than twice as late', () => {
    const world = (): WorldState => {
      const w = flatWorld();
      w.settings.mode = 'standard';
      for (let x = 10; x <= 90; x++) w.map.road[60 * S + x] = Road.lane;
      return w;
    };
    const lone = world();
    const crowd = world();
    const from = 60 * S + 10;
    const to = 60 * S + 90;
    const one = addCart(lone, from);
    requestCartMove(lone, one.id, to);
    const many = Array.from({ length: 60 }, () => addCart(crowd, from));
    for (const c of many) requestCartMove(crowd, c.id, to);
    let soloTicks = 0;
    while (!cartAt(lone, one.id, to)) {
      drive(lone, 1);
      soloTicks++;
    }
    let crowdTicks = 0;
    while (!many.every((c) => cartAt(crowd, c.id, to))) {
      drive(crowd, 1);
      crowdTicks++;
      expect(crowdTicks).toBeLessThan(soloTicks * TRAFFIC_SLOWDOWN_MAX + 10);
    }
    expect(soloTicks).toBe(80 * 4);
    expect(crowdTicks).toBeGreaterThan(soloTicks);
  });
});

describe('no gridlock (property)', () => {
  it('every cart on a random network reaches its target within twice its free-flow time', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = rngFromSeed(`traffic-${seed}`);
      const s = flatWorld();
      s.settings.mode = 'standard';
      // A grid of lanes and streets with a few gaps.
      const lines = 4 + rng.int(4);
      for (let k = 0; k < lines; k++) {
        const z = 30 + k * 8;
        const x = 30 + k * 8;
        const kind = rng.chance(0.4) ? Road.street : Road.lane;
        for (let a = 30; a <= 30 + (lines - 1) * 8; a++) {
          if (rng.chance(0.03)) continue;
          s.map.road[z * S + a] = kind;
          s.map.road[a * S + x] = kind;
        }
      }
      const tiles: number[] = [];
      for (let i = 0; i < S * S; i++) if (s.map.road[i]) tiles.push(i);
      const carts: [Cart, number, number][] = [];
      for (let n = 0; n < 40 + rng.int(80); n++) {
        const from = tiles[rng.int(tiles.length)]!;
        const to = tiles[rng.int(tiles.length)]!;
        const route = cartRoute(s, from, to);
        if (!route) continue;
        const c = addCart(s, from);
        expect(requestCartMove(s, c.id, to)).toBe(from === to ? 'arrived' : 'driving');
        carts.push([c, to, route.length * 4 * TRAFFIC_SLOWDOWN_MAX + 2]);
      }
      const longest = Math.max(...carts.map(([, , t]) => t));
      for (let t = 0; t <= longest; t++) {
        drive(s, 1);
        for (const [c, to, limit] of carts)
          if (t >= limit) expect(cartAt(s, c.id, to), `seed ${seed}`).toBe(true);
      }
    }
  });
});

describe('routes', () => {
  it('take the quicker street over a shorter lane, and only use cart roads', () => {
    const s = flatWorld();
    // Straight along a lane (30 tiles at 4 ticks) or round by a street (34 tiles at 3).
    for (let x = 10; x <= 40; x++) s.map.road[50 * S + x] = Road.lane;
    for (let x = 10; x <= 40; x++) s.map.road[53 * S + x] = Road.street;
    for (const x of [10, 40]) for (let z = 51; z <= 52; z++) s.map.road[z * S + x] = Road.street;
    const route = cartRoute(s, 50 * S + 10, 50 * S + 40)!;
    expect(route.length).toBe(36);
    expect(route.filter((t) => s.map.road[t] === Road.street).length).toBe(35);
    // A path is no road for a cart.
    for (let x = 41; x <= 45; x++) s.map.road[50 * S + x] = Road.path;
    expect(cartRoute(s, 50 * S + 10, 50 * S + 45)).toBeNull();
  });

  it('replans around a removed road, and sends a stranded cart home to its shed', () => {
    const f = villageFixture();
    const s = f.state;
    const home = f.b.storehouses[0];
    const c = addCart(s, 50 * S + 40, home);
    const to = 50 * S + 90;
    requestCartMove(s, c.id, to);
    drive(s, 20);
    // Cut lane A ahead of it; the way round is the x = 32 lane, street B and... nothing back up, so
    // add a link at x = 96 between the two.
    for (let z = 51; z < 70; z++) s.map.road[z * S + 96] = Road.lane;
    run(s, { t: 'road.remove', tiles: [[70, 50]] });
    drive(s, 2000);
    expect(cartAt(s, c.id, to)).toBe(true);
    // Now take the road from under a cart: it goes home.
    const c2 = addCart(s, 70 * S + 50, home);
    requestCartMove(s, c2.id, 70 * S + 90);
    drive(s, 3);
    run(s, {
      t: 'road.remove',
      tiles: [
        [50, 70],
        [51, 70],
        [52, 70],
      ],
    });
    drive(s, 5);
    expect(c2.parked).toBe(true);
    expect(c2.move).toBeNull();
    expect(c2.tile).not.toBe(70 * S + 50);
  });
});

describe('streets', () => {
  it('need Cobbles, cost stone from the storehouses as well as coins, also over a lane', () => {
    const f = villageFixture();
    const s = f.state;
    const before = moneySnapshot(s);
    const stone = content.goodIndex.get('stone')!;
    const stock = () => s.buildings.reduce((n, b) => n + (b.rt?.store[stone] ?? 0), 0);
    const had = stock();
    const coins = s.economy.treasury;
    // Cobbling over four tiles of lane A.
    const ctx = run(s, {
      t: 'road.paint',
      kind: 'street',
      tiles: [
        [40, 50],
        [41, 50],
        [42, 50],
        [43, 50],
      ],
    });
    expect(rejection(ctx)).toBeUndefined();
    expect(s.map.road[50 * S + 41]).toBe(Road.street);
    expect(stock()).toBe(had - 4);
    expect(s.economy.treasury).toBeLessThan(coins);
    expectMoneyInvariant(before, s);
    // Without Cobbles: locked.
    s.innovations.find((i) => i.id === 'cobbles')!.unlockedTick = -1;
    s.hearth.unlocked = s.hearth.unlocked.filter((u) => u !== 'street');
    expect(rejection(run(s, { t: 'road.paint', kind: 'street', tiles: [[44, 50]] }))).toBe('LOCKED');
    // Out of stone: refused.
    s.innovations.find((i) => i.id === 'cobbles')!.unlockedTick = 0;
    for (const b of s.buildings) if (b.rt) b.rt.store[stone] = 0;
    expect(rejection(run(s, { t: 'road.paint', kind: 'street', tiles: [[44, 50]] }))).toBe('CANNOT_AFFORD');
  });

  it('are heard: street noise, and more of it where the carts are', () => {
    const f = villageFixture();
    const s = f.state;
    const quiet = streetNoise(s, 50, 50);
    const street = streetNoise(s, 50, 70);
    expect(street).toBeGreaterThan(quiet);
    expect(streetNoise(s, 50, 71)).toBeGreaterThan(0);
    s.tick = TICKS_PER_HOUR * 3 + 100;
    s.map.traffic[70 * S + 50] = 60;
    expect(streetNoise(s, 50, 70)).toBeGreaterThan(street);
    // The charm pass picks it up.
    s.hearth.dirtyChunks.push(...Array.from({ length: 144 }, (_, k) => k));
    recomputeDirty(s, null);
    expect(s.map.charmNoise[70 * S + 50]).toBeGreaterThan(s.map.charmNoise[50 * S + 50]!);
  });

  it('gives a path stairs where it climbs a level', () => {
    const s = flatWorld();
    for (let x = 60; x <= 65; x++) s.map.height[40 * S + x] = 3;
    const ctx = run(s, {
      t: 'road.paint',
      kind: 'path',
      tiles: [57, 58, 59, 60, 61].map((x) => [x, 40] as [number, number]),
    });
    expect(rejection(ctx)).toBeUndefined();
    expect(s.map.flags[40 * S + 59]! & Flags.stairs).toBe(Flags.stairs);
    expect(s.map.flags[40 * S + 60]! & Flags.stairs).toBe(0);
    expect(s.map.flags[40 * S + 58]! & Flags.stairs).toBe(0);
    run(s, { t: 'road.remove', tiles: [[60, 40]] });
    expect(s.map.flags[40 * S + 59]! & Flags.stairs).toBe(0);
  });
});
