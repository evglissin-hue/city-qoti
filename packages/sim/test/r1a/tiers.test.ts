// R1A (E1): tiers read amount and variety; no tier names a single good
// (docs/spec/13-ledger.md, Population tiers).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TIER_DOWN_DAYS, TIER_UP_DAYS } from '../../src/constants';
import type { Household, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { dayIndex } from '../../src/systems/economy/time';
import { markSeen } from '../../src/systems/market/balances';
import { basketGroups } from '../../src/systems/market/baskets';
import { deliverUpgrade, tierProgress } from '../../src/systems/tiers/api';
import { updateTiers } from '../../src/systems/tiers';
import { createTickCtx } from '../../src/turn';
import { good, place, staff, stocked } from '../village/helpers';
import { villageFixture } from '../fixtures/village';

interface Town {
  state: WorldState;
  h: Household;
  storehouse: number;
}

/** The village with a tavern, a herbalist, charm and savings; the food is whatever the test names. */
function town(food: [string, number][]): Town {
  const f = villageFixture();
  const state = f.state;
  staff(state, place(state, 'tavern', 46, 43), 2);
  staff(state, place(state, 'herbalist', 52, 43), 1);
  const cottage = findById(state.buildings, f.b.cottages[2]!)!;
  const h = state.households.find((x) => x.homeId === cottage.id)!;
  h.savings = 40 * 100;
  state.map.charm.fill(40);
  // No food anywhere but what the test lists (no bread in the valley unless it says so).
  for (const b of state.buildings) {
    if (!b.rt) continue;
    for (const id of ['grain', 'vegetables', 'fruit', 'fish', 'cheese', 'bread']) {
      b.rt.store[good(id)] = 0;
      b.rt.output[good(id)] = 0;
    }
  }
  for (const x of state.households) {
    for (const id of ['grain', 'vegetables', 'fruit', 'fish', 'cheese', 'bread']) x.pantry[good(id)] = 0;
    delete x.seen;
  }
  const store = findById(state.buildings, f.b.storehouses[1])!;
  stocked(store, 'store', [['cider', 10], ...food]);
  markSeen(state);
  return { state, h, storehouse: store.id };
}

function days(state: WorldState, n: number): void {
  const ctx = createTickCtx(state);
  for (let i = 0; i < n; i++) updateTiers(state, ctx);
}

describe('moving up by variety', () => {
  it('a Settler household with plenty of food but two flavors seen does not count days', () => {
    const { state, h } = town([
      ['bread', 40],
      ['vegetables', 40],
    ]);
    const missing = tierProgress(state, h)!.missing;
    expect(missing).toEqual(['food (2 of 3 kinds)']);
    days(state, TIER_UP_DAYS + 1);
    expect(h.tierDays).toBe(0);
  });

  it('grain, fish and cheese on the shelves (no bread anywhere) count days and start the upgrade', () => {
    const { state, h } = town([
      ['grain', 10],
      ['fish', 10],
      ['cheese', 10],
    ]);
    expect(state.buildings.some((b) => (b.rt?.store[good('bread')] ?? 0) > 0)).toBe(false);
    expect(tierProgress(state, h)!.missing).toEqual([]);
    days(state, TIER_UP_DAYS);
    const home = findById(state.buildings, h.homeId)!;
    expect(h.tierDays).toBe(TIER_UP_DAYS);
    expect(home.rt!.upgrade).toBeTruthy();
  });

  it('the amount is the family together, not one good: three goods each short of a day add up', () => {
    const { state, h } = town([
      ['grain', 1],
      ['fish', 1],
      ['cheese', 1],
    ]);
    const need = Math.ceil(h.members.length);
    // Three units in all against a household of four: short in amount, though all three are seen.
    expect(need).toBeGreaterThan(3);
    expect(tierProgress(state, h)!.missing).toEqual(['food']);
    stocked(findById(state.buildings, state.buildings.find((b) => b.def === 'storehouse')!.id)!, 'store', [
      ['grain', 2],
      ['fish', 2],
      ['cheese', 2],
    ]);
    const missing = tierProgress(state, h)!.missing;
    expect(missing).not.toContain('food');
  });
});

describe('staying by variety', () => {
  it('a Craftsfolk household whose variety falls to two slides back after TIER_DOWN_DAYS', () => {
    const { state, h } = town([
      ['grain', 10],
      ['fish', 10],
      ['cheese', 10],
    ]);
    const cottage = findById(state.buildings, h.homeId)!;
    days(state, TIER_UP_DAYS);
    const ctx = createTickCtx(state);
    for (const [g, q] of content.buildingById.get('cottage')!.upgradesTo!.goods)
      deliverUpgrade(state, ctx, cottage, good(g), q);
    expect(h.tier).toBe('craftsfolk');
    h.basket = basketGroups(content.basketByTier.get('craftsfolk')!).map(() => 100);
    days(state, 1);
    expect(h.tierDays).toBe(0);
    // The cheese is gone and unseen: two kinds are left.
    h.seen![good('cheese')] = dayIndex(state.tick) - 5;
    for (const b of state.buildings) if (b.rt) b.rt.store[good('cheese')] = 0;
    days(state, TIER_DOWN_DAYS - 1);
    expect(h.tier).toBe('craftsfolk');
    days(state, 1);
    expect(h.tier).toBe('settler');
  });
});
