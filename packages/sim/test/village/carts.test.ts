// C4C: carts. A cart shed keeps one cart; with its carter at work the cart takes a long haul (8 to
// 16 units, door to door 12+ tiles, both doors on lanes or streets) from the porters' needs, drives
// on C4B's traffic system, delivers and parks again. Logistics and traffic run; residents do not.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { BuildingStatus, CART_CAPACITY, MAP_SIZE, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { refreshStatus } from '../../src/systems/production/status';
import { CART_MIN_LOAD } from '../../src/systems/logistics/carts';
import { createTickCtx } from '../../src/turn';
import { ticks, ticksUntil, toWork } from '../ledger/helpers';
import { run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { place, staff, villageWith } from './helpers';

const H = TICKS_PER_HOUR;

function cartTown(): { state: WorldState; shed: Building; stall: Building; store: Building } {
  const f = villageWith();
  const state = f.state;
  // Keep the porters out of it: this is about the cart.
  for (const id of f.b.storehouses) findById(state.buildings, id)!.rt!.paused = true;
  const shed = place(state, 'cart-shed', 88, 47); // door at (89, 50), on lane A
  toWork(state, staff(state, shed, 1));
  const stall = findById(state.buildings, f.b.stalls[1])!;
  const store = findById(state.buildings, f.b.storehouses[0])!;
  store.rt!.paused = false;
  store.rt!.workers.length = 0;
  state.tick = 2 * H; // 08:00
  return { state, shed, stall, store };
}

describe('carts', { timeout: 60_000 }, () => {
  it('keeps one cart per shed, parked at its door', () => {
    const { state, shed } = cartTown();
    state.tick = 12 * H; // 18:00: no trips
    ticks(state, 30);
    expect(state.carts.length).toBe(1);
    const c = state.carts[0]!;
    expect(c.home).toBe(shed.id);
    expect(c.parked).toBe(true);
    expect(c.tile).toBe(50 * MAP_SIZE + 89);
    ticks(state, 30);
    expect(state.carts.length).toBe(1);
  });

  it('hauls a cartload of food from the far storehouse to the stall and comes home', () => {
    const { state, stall, store } = cartTown();
    const before = moneySnapshot(state);
    const stalls = state.buildings.filter((b) => b.def === 'market-stall');
    const stallFood = () =>
      stalls.reduce(
        (m, b) => m + content.goods.reduce((n, g, i) => n + (g.food ? b.rt!.store[i]! : 0), 0),
        0,
      );
    const food0 = stallFood();
    const storeFood = () => content.goods.reduce((n, g, i) => n + (g.food ? store.rt!.store[i]! : 0), 0);
    const storeFood0 = storeFood();
    let rolled = false;
    ticksUntil(
      state,
      (s) => {
        const c = s.carts[0];
        if (c && c.load.length) {
          rolled = true;
          expect(c.load[0]![1]).toBeGreaterThanOrEqual(CART_MIN_LOAD);
          expect(c.load[0]![1]).toBeLessThanOrEqual(CART_CAPACITY);
        }
        return rolled && !!c?.parked;
      },
      4 * H,
    );
    expect(rolled).toBe(true);
    expect(stallFood()).toBeGreaterThan(food0 + CART_MIN_LOAD - 1);
    expect(storeFood()).toBeLessThan(storeFood0);
    // The delivery shows on the flows overlay, and nothing stays promised.
    expect(state.logistics.flows.some(([f, t]) => f === store.id && stalls.some((x) => x.id === t))).toBe(
      true,
    );
    expect(stall.def).toBe('market-stall');
    expect(state.logistics.jobs).toEqual([]);
    expect(store.rt!.reservedOut.every((n) => n === 0)).toBe(true);
    expectMoneyInvariant(before, state);
  });

  it('stays home without its carter, and after hours', () => {
    const a = cartTown();
    a.shed.rt!.workers.length = 0;
    a.shed.rt!.present = 0;
    ticks(a.state, H);
    expect(a.state.logistics.jobs).toEqual([]);
    expect(a.state.carts[0]!.parked).toBe(true);

    const b = cartTown();
    b.state.tick = 12 * H; // 18:00
    ticks(b.state, H);
    expect(b.state.carts[0]!.parked).toBe(true);
  });

  it('says so when the shed has no lane or street at its door, and never leaves', () => {
    const { state } = cartTown();
    const off = place(state, 'cart-shed', 44, 36);
    toWork(state, staff(state, off, 1));
    refreshStatus(state, createTickCtx(state), off);
    expect(off.rt!.status & BuildingStatus.noCartRoad).toBeTruthy();
    ticks(state, 2 * H);
    const cart = state.carts.find((c) => c.home === off.id)!;
    expect(cart.job).toBe(0);
    expect(cart.move).toBeNull();
  });

  it('a removed shed takes its cart, and the load goes to a storehouse', () => {
    const { state, shed, store } = cartTown();
    ticksUntil(state, (s) => (s.carts[0]?.load.length ?? 0) > 0, 4 * H);
    const load = state.carts[0]!.load[0]!;
    const stored = () =>
      state.buildings.filter((b) => b.def === 'storehouse').reduce((n, b) => n + b.rt!.store[load[0]]!, 0);
    const before = stored();
    expect(store.id).toBeGreaterThan(0);
    run(state, { t: 'build.remove', ids: [shed.id] });
    ticks(state, 30);
    expect(state.carts).toEqual([]);
    expect(state.logistics.jobs).toEqual([]);
    expect(stored()).toBe(before + load[1]);
  });
});
