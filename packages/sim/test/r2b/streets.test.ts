// R2B: evening streets for carts and barrows (docs/spec/19-evenings.md, Evening streets). From 17:00
// to 21:00 road tiles flagged Flags.evening are closed to carts: they go round, or wait at the edge
// (the shed says so) and deliver at 21:00; no cart noise falls on them; a stall on the stretch gets no
// delivery; carters keep the porters' hours. The village fixture has one lane between lane A and
// street B (x 32); these tests add a second one at x 48 and mark one or the other.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { BuildingStatus, MAP_SIZE, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { Flags, Road } from '../../src/map/layers';
import { findById } from '../../src/state/entities';
import { FOOD_GOODS } from '../../src/state/zones';
import { doorTile } from '../../src/systems/movement/api';
import { goalFor } from '../../src/systems/residents/schedule';
import { Block, at } from '../../src/systems/residents/time';
import { refreshStatus } from '../../src/systems/production/status';
import { cartRoute } from '../../src/systems/traffic/api';
import { streetNoise } from '../../src/systems/traffic/noise';
import { businessView } from '../../src/view/businesses';
import { createTickCtx } from '../../src/turn';
import { buildingDetail } from '../../src/view/inspect';
import { everyoneToWork, ticks, ticksUntil, toWork } from '../ledger/helpers';
import { flatWorld, run } from '../helpers';
import { place, staff, villageWith } from '../village/helpers';

const H = TICKS_PER_HOUR;
const S = MAP_SIZE;
const P = content.places;
/** Tick of an hour of day one (tick 0 is 06:00). */
const hour = (h: number) => (h - 6) * H;

/** The village with one cart shed, the porters paused and the carrier off: this is about the cart. */
function cartTown(): { state: WorldState; shed: Building; stall: Building; store: Building } {
  const f = villageWith();
  const state = f.state;
  for (const id of f.b.storehouses) findById(state.buildings, id)!.rt!.paused = true;
  for (const fam of state.carrier.families) fam.rule = 'never';
  const shed = place(state, 'cart-shed', 88, 47); // door at (89, 50), on lane A
  toWork(state, staff(state, shed, 1));
  const stall = findById(state.buildings, f.b.stalls[1])!;
  const store = findById(state.buildings, f.b.granary)!;
  store.rt!.paused = false;
  store.rt!.workers.length = 0;
  return { state, shed, stall, store };
}

/** A lane joining lane A and street B at column x (z 51 to 69). */
function connector(state: WorldState, x: number): [number, number][] {
  const tiles: [number, number][] = [];
  for (let z = 51; z < 70; z++) {
    state.map.road[z * S + x] = Road.lane;
    tiles.push([x, z]);
  }
  state.networkVersion++;
  return tiles;
}

function setEvening(state: WorldState, tiles: [number, number][], on: boolean): void {
  run(state, { t: 'road.setEvening', tiles, on });
}

const isEveningTile = (state: WorldState, tile: number) => (state.map.flags[tile]! & Flags.evening) !== 0;

describe('evening streets: carts', { timeout: 120_000 }, () => {
  it('routes round an evening street and arrives within twice the free-flow time', () => {
    const haul = (closed: boolean) => {
      const { state } = cartTown();
      const tiles = connector(state, 48);
      state.tick = hour(17);
      setEvening(state, tiles, closed);
      const start = state.tick;
      let rolled = false;
      let onEvening = 0;
      ticksUntil(
        state,
        (s) => {
          const c = s.carts[0];
          if (c?.load.length) rolled = true;
          if (c && !c.parked && isEveningTile(s, c.tile) && s.tick < hour(21)) onEvening++;
          return rolled && !!c?.parked;
        },
        20 * H,
      );
      expect(rolled).toBe(true);
      return { took: state.tick - start, onEvening };
    };
    const free = haul(false);
    const round = haul(true);
    expect(round.onEvening).toBe(0);
    expect(round.took).toBeGreaterThan(free.took);
    expect(round.took).toBeLessThanOrEqual(2 * free.took);
  });

  it('uses the evening street as any street outside 17:00 to 21:00', () => {
    const { state } = cartTown();
    const tiles = connector(state, 48);
    state.tick = hour(12);
    setEvening(state, tiles, true);
    let onConnector = false;
    ticksUntil(
      state,
      (s) => {
        const c = s.carts[0];
        if (c && c.tile % S === 48 && c.tile >= 51 * S && c.tile < 70 * S) onConnector = true;
        return onConnector;
      },
      4 * H,
    );
    expect(onConnector).toBe(true);
    // And the cart route planner agrees at noon and not at 18:00.
    const from = 50 * S + 89;
    const to = 70 * S + 66;
    const noon = cartRoute(state, from, to)!;
    expect(noon.some((t) => t % S === 48 && t >= 51 * S && t < 70 * S)).toBe(true);
    state.tick = hour(18);
    const dusk = cartRoute(state, from, to)!;
    expect(dusk.some((t) => isEveningTile(state, t))).toBe(false);
    state.tick = hour(21);
    expect(cartRoute(state, from, to)).toEqual(noon);
  });

  it('waits at the edge when there is no other way, says so, and delivers after 21:00', () => {
    const { state, shed, stall, store } = cartTown();
    const link = (): [number, number][] => {
      const t: [number, number][] = [];
      for (let z = 51; z < 70; z++) t.push([32, z]);
      return t;
    };
    state.tick = hour(12);
    setEvening(state, link(), true);
    const stalls = state.buildings.filter((b) => b.def === 'market-stall');
    const food = () => stalls.reduce((m, b) => m + FOOD_GOODS.reduce((n, g) => n + b.rt!.store[g]!, 0), 0);
    const food0 = food();
    ticksUntil(state, (s) => !!s.carts[0]?.job, 3 * H);
    const cart = state.carts[0]!;
    expect(cart.job).not.toBe(0);
    const jobId = cart.job;
    // Dusk falls with the haul just begun: the only way across is closed.
    state.tick = hour(17);
    ticks(state, 60);
    expect(cart.job).toBe(jobId);
    expect(cart.move).toBeNull();
    expect(isEveningTile(state, cart.tile)).toBe(false);
    const where = cart.tile;
    refreshStatus(state, createTickCtx(state), shed);
    expect(shed.rt!.status & BuildingStatus.eveningWait).toBeTruthy();
    expect(buildingDetail(state, shed.id)!.status).toContain(
      'Waiting at the edge of an evening street until 21:00',
    );
    // It stands there to the last tick of the evening, load and promises kept.
    ticksUntil(state, (s) => s.tick >= hour(21) - 2, 5 * H);
    expect(cart.tile).toBe(where);
    expect(cart.job).toBe(jobId);
    expect(state.logistics.jobs.some((j) => j.id === jobId)).toBe(true);
    // At 21:00 it goes on, delivers, and the shed's note goes.
    ticksUntil(state, (s) => s.logistics.jobs.length === 0 && !!s.carts[0]?.parked, 12 * H);
    expect(state.logistics.jobs).toEqual([]);
    expect(food()).toBeGreaterThan(food0);
    expect(store.id).toBeGreaterThan(0);
    expect(stall.def).toBe('market-stall');
    refreshStatus(state, createTickCtx(state), shed);
    expect(shed.rt!.status & BuildingStatus.eveningWait).toBe(0);
  });

  it('deadlocks nowhere: carts and porters across a closed stretch all finish by the morning', () => {
    const f = villageWith();
    const state = f.state;
    for (const fam of state.carrier.families) fam.rule = 'never';
    const shed = place(state, 'cart-shed', 88, 47);
    staff(state, shed, 1);
    everyoneToWork(state);
    const tiles: [number, number][] = [];
    for (let z = 51; z < 70; z++) tiles.push([32, z]);
    state.tick = hour(15);
    setEvening(state, tiles, true);
    ticksUntil(state, (s) => s.tick >= hour(24 + 7), 18 * H);
    expect(state.logistics.jobs).toEqual([]);
    for (const c of state.carts) expect(c.move).toBeNull();
    for (const r of state.residents) expect(r.activity.kind === 'task' && r.activity.taskId > 0).toBe(false);
    for (const b of state.buildings) {
      if (!b.rt) continue;
      expect(b.rt.reservedOut.every((n) => n === 0)).toBe(true);
      expect(b.rt.reservedIn.every((n) => n === 0)).toBe(true);
    }
  });

  it('plans fresh routes after road.setEvening flips (the cache never serves the other rule)', () => {
    const { state } = cartTown();
    const tiles = connector(state, 48);
    const from = 50 * S + 89;
    const to = 70 * S + 66;
    state.tick = hour(18);
    const open = cartRoute(state, from, to)!;
    expect(open.some((t) => t % S === 48 && t >= 51 * S && t < 70 * S)).toBe(true);
    setEvening(state, tiles, true);
    state.tick = hour(18);
    const closed = cartRoute(state, from, to)!;
    expect(closed.some((t) => isEveningTile(state, t))).toBe(false);
    setEvening(state, tiles, false);
    state.tick = hour(18);
    expect(cartRoute(state, from, to)).toEqual(open);
  });
});

describe('evening streets: noise', () => {
  it('adds no cart noise on an evening tile, and none to its neighbors', () => {
    const state = flatWorld();
    const i = 40 * S + 40;
    for (let x = 38; x <= 42; x++) state.map.road[40 * S + x] = Road.lane;
    const quiet = streetNoise(state, 40, 40);
    const quietNext = streetNoise(state, 41, 40);
    state.map.traffic[i] = 60;
    expect(streetNoise(state, 40, 40)).toBeGreaterThan(quiet);
    state.map.flags[i] = Flags.evening;
    expect(streetNoise(state, 40, 40)).toBe(quiet);
    expect(streetNoise(state, 41, 40)).toBe(quietNext);
    // The road's own noise stays.
    expect(streetNoise(state, 40, 40)).toBe(streetNoise(state, 40, 40));
  });
});

describe('evening streets: deliveries', { timeout: 120_000 }, () => {
  it('gives a stall on the stretch no delivery from 17:00 to 21:00, says so, and serves it again', () => {
    const { state, stall } = cartTown();
    // The other stall is full, so every haul wants this one.
    const other = state.buildings.find((b) => b.def === 'market-stall' && b.id !== stall.id)!;
    for (const g of FOOD_GOODS) other.rt!.store[g] = 12;
    setEvening(state, [[doorTile(stall) % S, Math.floor(doorTile(stall) / S)]], true);
    // The lane tile at its door is the stretch; carts keep off it all evening.
    state.tick = hour(17);
    let touched = false;
    ticks(state, 4 * H - 1, (s) => {
      if (s.logistics.jobs.some((j) => j.from === stall.id || j.to === stall.id)) touched = true;
    });
    expect(touched).toBe(false);
    expect(state.tick).toBeLessThan(hour(21));
    refreshStatus(state, createTickCtx(state), stall);
    expect(stall.rt!.status & BuildingStatus.eveningStreet).toBeTruthy();
    expect(buildingDetail(state, stall.id)!.status).toContain(
      'On an evening street: no deliveries from 17:00 to 21:00',
    );
    // The inspector of a specialized building reads the Businesses book's line (the player's chair).
    expect(businessView(state, stall).status).toBe('Waiting till 21:00: no deliveries on an evening street');
    // After 21:00 the status goes, and the next working day a cart brings it food.
    ticksUntil(state, (s) => s.tick >= hour(21) + 5, H);
    refreshStatus(state, createTickCtx(state), stall);
    expect(stall.rt!.status & BuildingStatus.eveningStreet).toBe(0);
    ticksUntil(
      state,
      (s) => {
        if (s.logistics.jobs.some((j) => j.to === stall.id)) touched = true;
        return touched;
      },
      20 * H,
    );
    expect(touched).toBe(true);
  });
});

describe('evening streets: carters', () => {
  it('keep the porters hours: at work until 19:00, then off', () => {
    const { state, shed } = cartTown();
    const carter = findById(state.residents, shed.rt!.workers[0]!)!;
    expect(goalFor(state, carter, Block.evening, at(17.5))).toBe('work');
    expect(goalFor(state, carter, Block.evening, at(18.9))).toBe('work');
    expect(goalFor(state, carter, Block.evening, at(19.5))).toBe('outing');
    const baker = state.residents.find((r) => {
      const j = findById(state.buildings, r.jobId);
      return j?.def === 'bakery' || j?.def === 'windmill';
    });
    if (baker) expect(goalFor(state, baker, Block.evening, at(17.5))).toBe('outing');
    expect(P.eveningHour).toBe(17);
  });
});
