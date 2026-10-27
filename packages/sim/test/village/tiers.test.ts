// C4C: Craftsfolk. A Settler household that meets the Craftsfolk basket (on the shelves), with the
// tavern and herbalist in reach, charm and savings, counts days up; after TIER_UP_DAYS its cottage
// asks for materials, and when porters bring them it becomes a townhouse. Failing for
// TIER_DOWN_DAYS slides a household back. Skilled jobs need Craftsfolk.
import { content, villagePhrases } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { BuildingStatus, TIER_DOWN_DAYS, TIER_UP_DAYS, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, Household, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { assignJobs } from '../../src/systems/residents/jobs';
import { deliverUpgrade, tierProgress } from '../../src/systems/tiers/api';
import { updateTiers } from '../../src/systems/tiers';
import { createTickCtx } from '../../src/turn';
import { residentDetail } from '../../src/view/residentDetail';
import { buildingDetail } from '../../src/view/inspect';
import { ticks, toWork } from '../ledger/helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { good, place, staff, stocked } from './helpers';
import { villageFixture } from '../fixtures/village';

interface Town {
  state: WorldState;
  h: Household;
  cottage: Building;
}

/** The village with a tavern and a herbalist by the cottages, charm, savings and a varied table. */
function aspiringTown(): Town {
  const f = villageFixture();
  const state = f.state;
  const tavern = place(state, 'tavern', 46, 43);
  const herbalist = place(state, 'herbalist', 52, 43);
  staff(state, tavern, 2);
  staff(state, herbalist, 1);
  const cottage = findById(state.buildings, f.b.cottages[2]!)!;
  const h = state.households.find((x) => x.homeId === cottage.id)!;
  h.savings = 40 * 100;
  h.recentFoods = [good('bread'), good('vegetables'), good('bread')];
  state.map.charm.fill(40);
  // Cider for the treats on a shelf.
  stocked(findById(state.buildings, f.b.storehouses[1])!, 'store', [['cider', 10]]);
  return { state, h, cottage };
}

function days(state: WorldState, n: number): void {
  const ctx = createTickCtx(state);
  for (let i = 0; i < n; i++) updateTiers(state, ctx);
}

describe('moving up', () => {
  it('starts the upgrade after three days that meet the Craftsfolk basket', () => {
    const { state, h, cottage } = aspiringTown();
    expect(tierProgress(state, h)!.missing).toEqual([]);
    days(state, TIER_UP_DAYS - 1);
    expect(h.tierDays).toBe(TIER_UP_DAYS - 1);
    expect(cottage.rt!.upgrade ?? null).toBeNull();
    days(state, 1);
    const up = content.buildingById.get('cottage')!.upgradesTo!;
    for (const [g, q] of up.goods) expect(cottage.rt!.upgrade![good(g)]).toBe(q);
    expect(cottage.rt!.status & BuildingStatus.upgrading).toBeTruthy();
    expect(buildingDetail(state, cottage.id)!.status.join(' ')).toMatch(/townhouse/);
    expect(h.tier).toBe('settler');
  });

  it('becomes a townhouse when the materials are in: the household and its members are Craftsfolk', () => {
    const { state, h, cottage } = aspiringTown();
    days(state, TIER_UP_DAYS);
    const ctx = createTickCtx(state);
    for (const [g, q] of content.buildingById.get('cottage')!.upgradesTo!.goods) {
      expect(deliverUpgrade(state, ctx, cottage, good(g), q + 3)).toBe(q);
    }
    expect(cottage.def).toBe('townhouse');
    expect(cottage.rt!.upgrade).toBeNull();
    expect(cottage.rt!.tier).toBe('craftsfolk');
    expect(h.tier).toBe('craftsfolk');
    for (const id of h.members) expect(findById(state.residents, id)!.tier).toBe('craftsfolk');
    expect(ctx.events.some((e) => e.e === 'notify' && e.kind === 'tier')).toBe(true);
    expect(ctx.events.some((e) => e.e === 'building.updated' && e.b.def === 'townhouse')).toBe(true);
  });

  it('porters bring the bricks and planks from the storehouse', { timeout: 60_000 }, () => {
    const { state, h, cottage } = aspiringTown();
    const store = findById(state.buildings, state.buildings.find((b) => b.def === 'storehouse')!.id)!;
    stocked(store, 'store', [
      ['bricks', 20],
      ['planks', 60],
    ]);
    const before = moneySnapshot(state);
    days(state, TIER_UP_DAYS);
    toWork(state, store.rt!.workers);
    state.tick = 2 * TICKS_PER_HOUR; // 08:00
    ticks(state, 6 * TICKS_PER_HOUR);
    expect(cottage.def).toBe('townhouse');
    expect(h.tier).toBe('craftsfolk');
    expectMoneyInvariant(before, state);
  });

  it('names what is missing, and resets the count when something is', () => {
    const { state, h } = aspiringTown();
    days(state, 2);
    h.savings = 0;
    state.map.charm.fill(5);
    const missing = tierProgress(state, h)!.missing;
    expect(missing).toContain(villagePhrases.missing.savings);
    expect(missing).toContain(villagePhrases.missing.charm);
    days(state, 1);
    expect(h.tierDays).toBe(0);
    const r = findById(state.residents, h.members[0]!)!;
    expect(residentDetail(state, r.id)!.tierProgress).toMatchObject({
      next: 'craftsfolk',
      days: 0,
      needed: TIER_UP_DAYS,
    });
  });

  it('wants the tavern and the herbalist in reach, and firewood and cloth on the shelves', () => {
    const { state, h } = aspiringTown();
    for (const b of state.buildings) if (b.def === 'tavern') b.rt!.workers.length = 0;
    for (const b of state.buildings) if (b.rt) b.rt.store[good('firewood')] = 0;
    const missing = tierProgress(state, h)!.missing;
    expect(missing).toContain(villagePhrases.missing.social);
    expect(missing).toContain('firewood');
    expect(missing).not.toContain(villagePhrases.missing.health);
  });

  it('does nothing before the Village unlocks Craftsfolk', () => {
    const { state, h, cottage } = aspiringTown();
    state.hearth.unlocked = state.hearth.unlocked.filter((u) => u !== 'craftsfolk');
    days(state, TIER_UP_DAYS + 1);
    expect(h.tierDays ?? 0).toBe(0);
    expect(cottage.rt!.upgrade ?? null).toBeNull();
  });
});

describe('sliding back', () => {
  it('slides back after four days without, keeps the house, and moves up again without new bricks', () => {
    const { state, h, cottage } = aspiringTown();
    days(state, TIER_UP_DAYS);
    const ctx = createTickCtx(state);
    for (const [g, q] of content.buildingById.get('cottage')!.upgradesTo!.goods)
      deliverUpgrade(state, ctx, cottage, good(g), q);
    expect(h.tier).toBe('craftsfolk');
    // The tavern closes: Craftsfolk fail their own basket.
    const tavern = state.buildings.find((b) => b.def === 'tavern')!;
    const workers = [...tavern.rt!.workers];
    tavern.rt!.workers.length = 0;
    days(state, TIER_DOWN_DAYS - 1);
    expect(h.tier).toBe('craftsfolk');
    expect(h.tierDays).toBe(-(TIER_DOWN_DAYS - 1));
    days(state, 1);
    expect(h.tier).toBe('settler');
    expect(cottage.def).toBe('townhouse');
    expect(cottage.rt!.tier).toBe('settler');
    for (const id of h.members) expect(findById(state.residents, id)!.tier).toBe('settler');
    // It reopens: three good days later they are Craftsfolk again, in the same house.
    tavern.rt!.workers.push(...workers);
    days(state, TIER_UP_DAYS);
    expect(h.tier).toBe('craftsfolk');
    expect(cottage.rt!.upgrade ?? null).toBeNull();
  });

  it("reads C4A's basket satisfaction for a household's own tier", () => {
    const { state, h, cottage } = aspiringTown();
    days(state, TIER_UP_DAYS);
    const ctx = createTickCtx(state);
    for (const [g, q] of content.buildingById.get('cottage')!.upgradesTo!.goods)
      deliverUpgrade(state, ctx, cottage, good(g), q);
    const basket = content.basketByTier.get('craftsfolk')!;
    h.basket = basket.groups.map(() => 100);
    days(state, 1);
    expect(h.tierDays).toBe(0);
    h.basket = basket.groups.map((g) => (g.id === 'cloth' ? 10 : 100));
    days(state, 1);
    expect(h.tierDays).toBe(-1);
  });
});

describe('skilled jobs', () => {
  it('Settlers cannot take a skilled job; Craftsfolk can, and take basic ones too', () => {
    const { state } = villageFixture();
    const smithy = place(state, 'smithy', 46, 40);
    const kiln = place(state, 'chopping-shed', 50, 40);
    for (const r of state.residents) {
      if (r.stage === 'child' || r.jobId) continue;
      if (r.tier === 'settler') r.jobId = -1; // keep the settlers busy elsewhere for this test
    }
    assignJobs(state, createTickCtx(state));
    for (const id of smithy.rt!.workers) expect(findById(state.residents, id)!.tier).toBe('craftsfolk');
    expect(smithy.rt!.workers.length).toBe(1);
    expect(kiln.rt!.workers.length).toBe(1);
  });

  it('leaves a skilled job open while only Settlers are looking', () => {
    const { state } = villageFixture();
    for (const r of state.residents) if (r.tier === 'craftsfolk') r.jobId = -1;
    const smithy = place(state, 'smithy', 46, 40);
    assignJobs(state, createTickCtx(state));
    expect(smithy.rt!.workers).toEqual([]);
  });
});
