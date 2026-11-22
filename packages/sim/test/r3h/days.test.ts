// R3H: each good day by example (levels/specialized.ts, specializedDay): counters and state are set
// by hand and the verdict read, so a rule that drifts shows up here before the climb does.
import { describe, expect, it } from 'vitest';
import { specializedDay, STALL_CUSTOMERS } from '../../src/systems/levels/specialized';
import { sum } from '../../src/systems/logistics/stores';
import { hamletFixture } from '../fixtures/hamlet';
import { building, hire } from '../ledger/helpers';
import { good, plantWoods, plenty, spot, today } from './helpers';

describe('carried', () => {
  it('four fifths carried off is good', () => {
    const { state } = hamletFixture();
    const q = spot(state, 'quarry', 120, 100);
    today(q, { madeToday: 10, soldToday: 8 });
    expect(specializedDay(state, q)).toBe('good');
  });

  it('goods the town has no use for: quiet at level 1, failing above it', () => {
    const { state } = hamletFixture();
    const q = spot(state, 'quarry', 120, 100);
    plenty(state, 'stone', 500);
    today(q, { madeToday: 10, soldToday: 10 });
    expect(specializedDay(state, q)).toBe('quiet');
    q.level = 2;
    expect(specializedDay(state, q)).toBe('failing');
  });

  it('made but not carried is failing', () => {
    const { state } = hamletFixture();
    const q = spot(state, 'quarry', 120, 100);
    today(q, { madeToday: 10, soldToday: 7 });
    expect(specializedDay(state, q)).toBe('failing');
    today(q, { madeToday: 10, soldToday: 0 });
    expect(specializedDay(state, q)).toBe('failing');
  });

  it('short of its raw good is failing, even with the rest carried', () => {
    const { state } = hamletFixture();
    const w = spot(state, 'brickworks', 120, 100);
    today(w, { madeToday: 6, soldToday: 6, shortToday: true });
    expect(specializedDay(state, w)).toBe('failing');
    today(w, { madeToday: 0, soldToday: 0, shortToday: true });
    expect(specializedDay(state, w)).toBe('failing');
    today(w, { madeToday: 6, soldToday: 6 });
    expect(specializedDay(state, w)).toBe('good');
  });

  it('nothing made is a quiet day', () => {
    const { state } = hamletFixture();
    const q = spot(state, 'quarry', 120, 100);
    today(q, {});
    expect(specializedDay(state, q)).toBe('quiet');
  });

  it('a Lodge with thin woods is quiet however well its timber moved; with its woods it is good', () => {
    const { state } = hamletFixture();
    const lodge = spot(state, 'foresters-lodge', 120, 80);
    today(lodge, { madeToday: 8, soldToday: 8 });
    expect(specializedDay(state, lodge)).toBe('quiet');
    plantWoods(state, 120, 80, 14);
    expect(specializedDay(state, lodge)).toBe('good');
  });

  it('a Fishery rests while the river is frozen, whatever its counters say', () => {
    const { state } = hamletFixture();
    const f = spot(state, 'fishery', 120, 100);
    today(f, { madeToday: 10, soldToday: 0 });
    expect(specializedDay(state, f)).toBe('failing');
    state.weather.river.frozen = true;
    expect(specializedDay(state, f)).toBe('resting');
  });
});

describe('customers', () => {
  it('eight customers is good at level 1 and seven is quiet', () => {
    const { state } = hamletFixture();
    const s = spot(state, 'market-stall', 120, 100);
    today(s, { customersToday: STALL_CUSTOMERS[0]! });
    expect(specializedDay(state, s)).toBe('good');
    today(s, { customersToday: STALL_CUSTOMERS[0]! - 1 });
    expect(specializedDay(state, s)).toBe('quiet');
  });

  it('at level 2 twelve is good toward level 3, eight holds, under eight is failing', () => {
    const { state } = hamletFixture();
    const s = spot(state, 'market-stall', 120, 100, 2);
    today(s, { customersToday: STALL_CUSTOMERS[1]! });
    expect(specializedDay(state, s)).toBe('good');
    today(s, { customersToday: STALL_CUSTOMERS[0]! });
    expect(specializedDay(state, s)).toBe('quiet');
    today(s, { customersToday: STALL_CUSTOMERS[0]! - 1 });
    expect(specializedDay(state, s)).toBe('failing');
  });

  it('at the top level twelve holds and fewer is failing; it is never good', () => {
    const { state } = hamletFixture();
    const s = spot(state, 'market-stall', 120, 100, 3);
    today(s, { customersToday: 30 });
    expect(specializedDay(state, s)).toBe('quiet');
    today(s, { customersToday: STALL_CUSTOMERS[1]! - 1 });
    expect(specializedDay(state, s)).toBe('failing');
  });
});

describe('served', () => {
  it('a Windmill whose baker went short is failing, whose bakers had grain is good', () => {
    const { state, b } = hamletFixture();
    const mill = building(state, b.windmill);
    const baker = building(state, b.bakery);
    today(baker, { shortToday: true });
    expect(specializedDay(state, mill)).toBe('failing');
    today(baker, { madeToday: 6, soldToday: 6 });
    expect(specializedDay(state, mill)).toBe('good');
  });

  it('a Windmill that serves nobody is quiet', () => {
    const { state } = hamletFixture();
    const mill = spot(state, 'windmill', 150, 130);
    expect(specializedDay(state, mill)).toBe('quiet');
  });
});

describe('full', () => {
  it('half full at the level with every porter is good; a seat empty makes it quiet', () => {
    const { state } = hamletFixture();
    const g = spot(state, 'granary', 120, 100);
    g.rt!.store[good('grain')] = 600;
    expect(sum(g.rt!.store)).toBe(600);
    hire(state, g.id, 1);
    expect(specializedDay(state, g)).toBe('quiet');
    hire(state, g.id, 1);
    expect(specializedDay(state, g)).toBe('good');
    g.rt!.store[good('grain')] = 599;
    expect(specializedDay(state, g)).toBe('quiet');
  });

  it('at level 2 half of 1,680 is good; under half of the level below (1,200) is failing', () => {
    const { state } = hamletFixture();
    const g = spot(state, 'granary', 120, 100, 2);
    hire(state, g.id, 3);
    g.rt!.store[good('grain')] = 840;
    expect(specializedDay(state, g)).toBe('good');
    g.rt!.store[good('grain')] = 700;
    expect(specializedDay(state, g)).toBe('quiet');
    g.rt!.store[good('grain')] = 599;
    expect(specializedDay(state, g)).toBe('failing');
  });
});

describe('a building without levels', () => {
  it('is quiet', () => {
    const { state, b } = hamletFixture();
    expect(specializedDay(state, building(state, b.well))).toBe('quiet');
  });
});
