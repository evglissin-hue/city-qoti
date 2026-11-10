// C5B: a whole autumn with every C5B flow at once (a festival, a market day, a commission met and
// the carrier at the gate; R1: the dock's own orders are gone), every system running: the money
// invariant holds to the penny.
import { describe, expect, it } from 'vitest';
import { LEDGER_CATEGORIES, MAP_SIZE } from '../../src/constants';
import { createTickCtx } from '../../src/turn';
import { offerNeighbor } from '../../src/systems/commissions';
import { placeFree, tickAt } from '../fixtures/seasonsPlace';
import { run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { feastFixture, good, runUntil, stock } from './helpers';

describe('a season of festivals, market days, commissions and the carrier', () => {
  it('keeps the money invariant', { timeout: 120_000 }, () => {
    const { state } = feastFixture(1, 6);
    // Autumn of year 2, the river open, the weather fair.
    state.tick = tickAt(1, 2, 1, 7);
    state.weather.river = { frozen: false, frozenTick: -1 };
    state.weather.today = 'clear';
    state.weather.forecast = [];
    for (const h of state.households) delete h.warmth;
    state.renown.level = 1;
    state.renown.points = 10;
    placeFree(state, 'river-dock', 98, 60);
    stock(state, 'timber', 200);
    stock(state, 'bread', 80);
    stock(state, 'vegetables', 60);
    state.festival.history = state.festival.history.map((h) => ({ ...h, twist: 'costume-parade' }));
    const before = moneySnapshot(state);
    run(state, {
      t: 'festival.plan',
      site: { pattern: 'well-gathering-place', anchor: 52 * MAP_SIZE + 60 },
      menu: [
        ['bread', 20],
        ['vegetables', 20],
      ],
      twist: 'harvest-display',
      music: 'resident',
    });
    expect(state.festival.plan?.festival).toBe('harvest-supper');
    run(state, { t: 'ledger.setMarketDay', day: 3 });
    state.economy.everProduced = state.economy.everProduced.map(() => 0);
    state.economy.everProduced[good('bread')] = 1;
    const c = offerNeighbor(state, createTickCtx(state))!;
    run(state, { t: 'commission.accept', id: c.id });
    state.economy.everProduced[good('timber')] = 1;
    runUntil(state, tickAt(1, 2, 6, 23));
    expect(state.festival.history[state.festival.history.length - 1]!.festival).toBe('harvest-supper');
    // The carrier came by and traded (its money is in the invariant below).
    expect(state.trade.log.length).toBeGreaterThan(0);
    expect(state.commissions.list.find((x) => x.id === c.id)!.status).toBe('done');
    // The market day's stall fees were paid.
    expect(state.economy.season.money[LEDGER_CATEGORIES.findIndex((x) => x.id === 'fees')]).toBeGreaterThan(
      0,
    );
    expectMoneyInvariant(before, state);
  });
});
