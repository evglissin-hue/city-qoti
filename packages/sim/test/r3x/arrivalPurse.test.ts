// R3X (experiment): a household arriving from outside brings `arrivalPurse` coins per grown-up,
// paid from outside, and the money invariant holds. Off (0) by default.
import { content } from '@qoti/content';
import { afterEach, describe, expect, it } from 'vitest';
import { PENNIES_PER_COIN } from '../../src/constants';
import { arrivals } from '../../src/systems/residents/lifecycle';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { placeBuilding } from '../residents/helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';

const settler = content.basketByTier.get('settler')!;

describe('arrival purse', () => {
  afterEach(() => {
    delete settler.arrivalPurse;
  });

  function arrive(coins: number | undefined) {
    if (coins !== undefined) settler.arrivalPurse = coins;
    const { state } = hamletFixture();
    for (let i = 0; i < 6; i++) placeBuilding(state, 'cottage', 76 + 3 * i, 52 + (i % 2) * 6);
    state.stats.attractiveness = 100;
    const before = moneySnapshot(state);
    const known = new Set(state.households.map((h) => h.id));
    const ctx = createTickCtx(state);
    arrivals(state, ctx, ctx.rng('residents'));
    const fresh = state.households.filter((h) => !known.has(h.id));
    return { state, before, fresh };
  }

  it('brings nothing by default', () => {
    const { fresh } = arrive(undefined);
    for (const h of fresh) expect(h.savings).toBe(0);
  });

  it('pays each grown-up from outside and keeps the money invariant', () => {
    const { state, before, fresh } = arrive(4);
    expect(fresh.length).toBeGreaterThan(0);
    for (const h of fresh) {
      const grown = h.members.filter((id) => {
        const r = state.residents.find((x) => x.id === id)!;
        return r.stage === 'adult' || r.stage === 'elder';
      }).length;
      expect(h.savings).toBe(grown * 4 * PENNIES_PER_COIN);
    }
    expectMoneyInvariant(before, state);
  });
});
