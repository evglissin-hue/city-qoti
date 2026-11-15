// R1.0 commands: the carrier's levers, the season plan and pinning a business's trade validate
// (good and bad input, NOT_ALLOWED in a sandbox) and apply through the normal turn path.
import { describe, expect, it } from 'vitest';
import { PENNIES_PER_COIN } from '../../src/constants';
import type { Command, WorldState } from '../../src/contracts';
import { hamletFixture } from '../fixtures/hamlet';
import { flatWorld, rejection, run } from '../helpers';

function standard(): WorldState {
  return hamletFixture().state;
}

/** Runs one command; returns the rejection reason, or undefined when it applied. */
function tryCmd(state: WorldState, cmd: Command): string | undefined {
  return rejection(run(state, cmd));
}

function events(state: WorldState, cmd: Command): string[] {
  return run(state, cmd).events.map((e) => e.e);
}

describe('carrier.setRule', () => {
  it('sets a family rule and marks it set by hand', () => {
    const state = standard();
    expect(events(state, { t: 'carrier.setRule', family: 'food', rule: 'never', sell: false })).toContain(
      'balances.updated',
    );
    expect(state.carrier.families[0]).toMatchObject({ rule: 'never', sell: false, set: true });
  });

  it('refuses a bad family, rule or sell flag, and a sandbox', () => {
    const state = standard();
    const bad: unknown[] = [
      { t: 'carrier.setRule', family: 'gold', rule: 'always', sell: true },
      { t: 'carrier.setRule', family: 'food', rule: 'sometimes', sell: true },
      { t: 'carrier.setRule', family: 'food', rule: 'always', sell: 'yes' },
    ];
    for (const cmd of bad) expect(tryCmd(state, cmd as Command)).toBe('INVALID');
    expect(state.carrier.families[0]!.set).toBeUndefined();
    expect(tryCmd(flatWorld(), { t: 'carrier.setRule', family: 'food', rule: 'never', sell: false })).toBe(
      'NOT_ALLOWED',
    );
  });
});

describe('carrier.setReserve', () => {
  it('sets days of cover, or units for Materials', () => {
    const state = standard();
    expect(tryCmd(state, { t: 'carrier.setReserve', family: 'food', reserve: 5 })).toBeUndefined();
    expect(tryCmd(state, { t: 'carrier.setReserve', family: 'materials', reserve: 500 })).toBeUndefined();
    expect(state.carrier.families[0]!.reserve).toBe(5);
    expect(state.carrier.families[2]!.reserve).toBe(500);
  });

  it('refuses out-of-range or fractional reserves, and a sandbox', () => {
    const state = standard();
    for (const reserve of [-1, 31, 2.5]) {
      expect(tryCmd(state, { t: 'carrier.setReserve', family: 'food', reserve })).toBe('INVALID');
    }
    expect(tryCmd(state, { t: 'carrier.setReserve', family: 'materials', reserve: 501 })).toBe('INVALID');
    expect(tryCmd(flatWorld(), { t: 'carrier.setReserve', family: 'food', reserve: 5 })).toBe('NOT_ALLOWED');
  });
});

describe('carrier.setBudget', () => {
  it('sets the daily budget in coins (kept in pennies)', () => {
    const state = standard();
    expect(tryCmd(state, { t: 'carrier.setBudget', coins: 100 })).toBeUndefined();
    expect(state.carrier.budget).toBe(100 * PENNIES_PER_COIN);
  });

  it('refuses a budget out of range, and a sandbox', () => {
    const state = standard();
    for (const coins of [-1, 1001, 1.5])
      expect(tryCmd(state, { t: 'carrier.setBudget', coins })).toBe('INVALID');
    expect(tryCmd(flatWorld(), { t: 'carrier.setBudget', coins: 10 })).toBe('NOT_ALLOWED');
  });
});

describe('season.setPlan', () => {
  it('changes only the answers given', () => {
    const state = standard();
    expect(tryCmd(state, { t: 'season.setPlan', plan: { reserve: 10 } })).toBeUndefined();
    expect(tryCmd(state, { t: 'season.setPlan', plan: { food: 12, buildFirst: 'farms' } })).toBeUndefined();
    expect(state.seasonPlan).toMatchObject({
      reserve: 10,
      food: 12,
      fuel: null,
      buildFirst: 'farms',
      deal: null,
    });
    expect(tryCmd(state, { t: 'season.setPlan', plan: { food: null } })).toBeUndefined();
    expect(state.seasonPlan.food).toBeNull();
  });

  it('refuses days out of range, an unknown deal or zone, and a sandbox', () => {
    const state = standard();
    const bad: unknown[] = [{ reserve: 31 }, { fuel: -1 }, { deal: 'nope' }, { buildFirst: 'moon' }, null];
    for (const plan of bad) expect(tryCmd(state, { t: 'season.setPlan', plan } as Command)).toBe('INVALID');
    expect(tryCmd(flatWorld(), { t: 'season.setPlan', plan: { reserve: 10 } })).toBe('NOT_ALLOWED');
  });
});

describe('build.pinRecipe', () => {
  it('pins a business to another trade of its zone and unpins it', () => {
    const f = hamletFixture();
    const bakery = f.state.buildings.find((b) => b.id === f.b.bakery)!;
    expect(bakery.trade).toBe('baker');
    const names = events(f.state, { t: 'build.pinRecipe', id: bakery.id, trade: 'chandler' });
    expect(names).toContain('business.updated');
    expect(bakery.trade).toBe('chandler');
    expect(bakery.pinned).toBe(true);
    expect(tryCmd(f.state, { t: 'build.pinRecipe', id: bakery.id, trade: null })).toBeUndefined();
    expect(bakery.pinned).toBeUndefined();
    expect(bakery.trade).toBe('chandler');
  });

  it('refuses a trade of another zone, an unknown trade or building, a non-business and a sandbox', () => {
    const f = hamletFixture();
    const id = f.b.bakery;
    expect(tryCmd(f.state, { t: 'build.pinRecipe', id, trade: 'grain-farm' })).toBe('INVALID');
    expect(tryCmd(f.state, { t: 'build.pinRecipe', id, trade: 'nope' })).toBe('INVALID');
    expect(tryCmd(f.state, { t: 'build.pinRecipe', id: 999999, trade: 'baker' })).toBe('NOT_FOUND');
    expect(tryCmd(f.state, { t: 'build.pinRecipe', id: f.b.storehouse, trade: 'baker' })).toBe('NOT_ALLOWED');
    expect(tryCmd(flatWorld(), { t: 'build.pinRecipe', id, trade: 'baker' })).toBe('NOT_ALLOWED');
  });
});
