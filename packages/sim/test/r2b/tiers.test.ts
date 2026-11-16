// R2B: tiers ask for good evenings, not charm and a tavern (docs/spec/13-ledger.md, Population
// tiers; docs/spec/19-evenings.md, Good evenings).
import { content, villagePhrases } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TIER_DOWN_DAYS } from '../../src/constants';
import type { Household, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { EVENINGS_NEED } from '../../src/state/evenings';
import { markSeen } from '../../src/systems/market/balances';
import { tierProgress } from '../../src/systems/tiers/api';
import { updateTiers } from '../../src/systems/tiers';
import { createTickCtx } from '../../src/turn';
import { good, place, staff, stocked } from '../village/helpers';
import { villageFixture } from '../fixtures/village';

const P = content.places;

/** A settler household with everything but evenings met: no tavern, no charm, a herbalist near. */
function town(): { state: WorldState; h: Household } {
  const f = villageFixture();
  const state = f.state;
  staff(state, place(state, 'herbalist', 52, 43), 1);
  const cottage = findById(state.buildings, f.b.cottages[2]!)!;
  const h = state.households.find((x) => x.homeId === cottage.id)!;
  h.savings = 40 * 100;
  h.recentFoods = [good('bread'), good('vegetables'), good('bread')];
  state.map.charm.fill(0);
  stocked(findById(state.buildings, f.b.storehouses[1])!, 'store', [['cider', 10]]);
  markSeen(state);
  return { state, h };
}

function setEvenings(state: WorldState, h: Household, value: number): void {
  for (const id of h.members) {
    const r = findById(state.residents, id)!;
    if (r.stage !== 'child') r.needs[EVENINGS_NEED] = value;
  }
}

function days(state: WorldState, n: number): void {
  const ctx = createTickCtx(state);
  for (let i = 0; i < n; i++) updateTiers(state, ctx);
}

describe('the Craftsfolk basket', () => {
  it('names evenings and no tavern or charm', () => {
    const b = content.basketByTier.get('craftsfolk')!;
    expect(b.evenings).toBe(50);
    expect(b.services).toEqual(['health']);
    expect(b.charm).toBe(0);
  });
});

describe('moving up on evenings', () => {
  it('moves up after tierDays days at 55 with no charm and no tavern', () => {
    const { state, h } = town();
    setEvenings(state, h, 55);
    expect(tierProgress(state, h)).toMatchObject({ missing: [], needed: P.tierDays });
    days(state, P.tierDays - 1);
    expect(h.tier).toBe('settler');
    days(state, 1);
    const home = findById(state.buildings, h.homeId)!;
    expect(home.rt!.upgrade).toBeTruthy();
  });

  it('does not at 45, and says what is missing', () => {
    const { state, h } = town();
    setEvenings(state, h, 45);
    expect(tierProgress(state, h)!.missing).toEqual([villagePhrases.missing.evenings]);
    days(state, P.tierDays + 1);
    expect(h.tierDays).toBe(0);
    expect(findById(state.buildings, h.homeId)!.rt!.upgrade ?? null).toBeNull();
  });
});

describe('staying Craftsfolk', () => {
  function craftsfolk(): { state: WorldState; h: Household } {
    const t = town();
    t.h.tier = 'craftsfolk';
    for (const id of t.h.members) findById(t.state.residents, id)!.tier = 'craftsfolk';
    findById(t.state.buildings, t.h.homeId)!.rt!.tier = 'craftsfolk';
    return t;
  }

  it('asks a household of elders alone for its evenings too (a lone elder once passed unasked)', () => {
    const { state, h } = town();
    for (const id of h.members) findById(state.residents, id)!.stage = 'elder';
    setEvenings(state, h, 21);
    expect(tierProgress(state, h)!.missing).toContain(villagePhrases.missing.evenings);
    days(state, P.tierDays + 1);
    expect(findById(state.buildings, h.homeId)!.rt!.upgrade).toBeFalsy();
  });

  it('holds just above the ask less the slack, slides after TIER_DOWN_DAYS just below it', () => {
    const { state, h } = craftsfolk();
    // R2X tunes the slack (content.places.eveningsSlack); the ask is the basket's evenings.
    const floor = content.basketByTier.get('craftsfolk')!.evenings! - content.places.eveningsSlack;
    setEvenings(state, h, floor + 2);
    days(state, TIER_DOWN_DAYS + 1);
    expect(h.tier).toBe('craftsfolk');
    setEvenings(state, h, floor - 2);
    days(state, TIER_DOWN_DAYS - 1);
    expect(h.tier).toBe('craftsfolk');
    days(state, 1);
    expect(h.tier).toBe('settler');
  });
});
