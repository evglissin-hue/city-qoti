// C5B: the River Dock (docs/spec/13-ledger.md, Trade): boats to Millhaven on the dock's own orders,
// bigger loads and better prices than the caravans, a few days there and back, no boats while the
// river is frozen, and the money crossing the valley's edge with book('dock').
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { CARAVAN_UNITS, postSellPrice } from '../../src/systems/trade/caravans';
import { BOAT_DAYS, BOAT_UNITS, dockDay, dockSellPrice } from '../../src/systems/dock';
import { createTickCtx } from '../../src/turn';
import { placeFree, tickAt } from '../fixtures/seasonsPlace';
import { villageFixture } from '../fixtures/village';
import { rejection, run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { good, inTown, stock } from './helpers';

function dockTown(): WorldState {
  const { state } = villageFixture();
  state.tick = tickAt(0, 1, 1, 8);
  state.renown.level = 1;
  state.renown.points = 8;
  placeFree(state, 'river-dock', 98, 60);
  return state;
}

const order = (good: string, min: number, max: number) =>
  ({
    t: 'trade.setStandingOrder',
    good,
    via: 'dock',
    order: { min, max, floor: 0, ceiling: 0, neighbor: '' },
  }) as const;

describe('the River Dock', () => {
  it('sends a boat with more than a caravan carries, on better terms', () => {
    const state = dockTown();
    expect(BOAT_UNITS).toBeGreaterThan(CARAVAN_UNITS);
    expect(dockSellPrice(state, good('planks'))!).toBeGreaterThan(
      postSellPrice(state, 'millhaven', good('planks'))!,
    );
    expect(rejection(run(state, order('planks', 0, 10)))).toBeUndefined();
    stock(state, 'planks', 200);
    const planks = inTown(state, 'planks');
    const before = moneySnapshot(state);
    const external = state.economy.external;
    const ctx = createTickCtx(state);
    dockDay(state, ctx);
    expect(state.dock.boats).toHaveLength(1);
    const sold = state.dock.boats[0]!.selling[0]![1];
    expect(sold).toBe(BOAT_UNITS);
    expect(inTown(state, 'planks')).toBe(planks - sold);
    expect(state.economy.external).toBeGreaterThan(external);
    expect(state.chronicle[state.chronicle.length - 1]!.kind).toBe('first-boat');
    expectMoneyInvariant(before, state);
  });

  it('buys what runs short and brings it home a few days later', () => {
    const state = dockTown();
    for (const b of state.buildings) if (b.rt) b.rt.store[good('wheat')] = 0;
    run(state, order('wheat', 30, 200));
    const before = moneySnapshot(state);
    dockDay(state, createTickCtx(state));
    expect(state.dock.boats[0]!.buying).toEqual([[good('wheat'), 30]]);
    expect(inTown(state, 'wheat')).toBe(0);
    // No second boat while one is away.
    state.tick += TICKS_PER_DAY;
    dockDay(state, createTickCtx(state));
    expect(state.dock.boats).toHaveLength(1);
    state.tick = state.dock.boats[0]!.arriveTick;
    dockDay(state, createTickCtx(state));
    expect(inTown(state, 'wheat')).toBe(30);
    expect(BOAT_DAYS).toBeGreaterThan(1);
    expectMoneyInvariant(before, state);
  });

  it('freezes in winter: no boats sail, one downstream waits for the thaw, and orders say FROZEN', () => {
    const state = dockTown();
    run(state, order('planks', 0, 10));
    stock(state, 'planks', 200);
    dockDay(state, createTickCtx(state));
    const boat = state.dock.boats[0]!;
    state.weather.river.frozen = true;
    state.tick = boat.arriveTick;
    dockDay(state, createTickCtx(state));
    expect(state.dock.boats).toEqual([boat]);
    expect(rejection(run(state, order('stone', 0, 10)))).toBe('FROZEN');
    state.weather.river.frozen = false;
    dockDay(state, createTickCtx(state));
    // The thaw: the boat comes home and the next one sails with the surplus.
    expect(state.dock.boats).toHaveLength(1);
    expect(state.dock.boats[0]!.id).not.toBe(boat.id);
  });

  it('needs a dock for its orders', () => {
    const { state } = villageFixture();
    expect(rejection(run(state, order('planks', 0, 10)))).toBe('NOT_FOUND');
  });
});
