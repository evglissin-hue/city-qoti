// Playtest round four: planning a festival leads somewhere. Plans too late say TOO_LATE, a plan made
// after the menu hour puts its menu by at once, the festival's start is announced, and every new
// season tells the mirror its festival.
import { describe, expect, it } from 'vitest';
import { FESTIVAL } from '../../src/constants';
import type { Command } from '../../src/contracts';
import { tidyFestival } from '../../src/systems/festivals/index';
import { createTickCtx } from '../../src/turn';
import { feastFixture, good, runUntil, stock, todayAt } from '../festivals/helpers';
import { tickAt } from '../fixtures/seasonsPlace';
import { rejection, run } from '../helpers';

const plan = (): Command => ({
  t: 'festival.plan',
  site: { rect: [51, 52, 57, 58] },
  menu: [['pies', 10]],
  twist: '',
  music: 'none',
});

describe('late festival plans', () => {
  it('are rejected from 18:00 on the festival day, and accepted before', () => {
    const { state } = feastFixture(6, FESTIVAL.from);
    state.festival.plan = null;
    expect(rejection(run(state, plan()))).toBe('TOO_LATE');
    state.tick = todayAt(state, 23);
    expect(rejection(run(state, plan()))).toBe('TOO_LATE');
    state.tick = tickAt(1, 3, 6, FESTIVAL.from - 1);
    expect(rejection(run(state, plan()))).toBeUndefined();
    state.tick = tickAt(1, 3, 5, 20);
    expect(rejection(run(state, plan()))).toBeUndefined();
  });

  it('put the menu by at once when made between noon and the evening', () => {
    const { state } = feastFixture(6, 14);
    state.festival.plan = null;
    stock(state, 'pies', 30);
    expect(rejection(run(state, plan()))).toBeUndefined();
    expect(state.festival.plan!.reserved.find(([g]) => g === good('pies'))?.[1]).toBe(10);
  });

  it('wait for noon when made on the festival morning', () => {
    const { state } = feastFixture(6, 9);
    state.festival.plan = null;
    stock(state, 'pies', 30);
    expect(rejection(run(state, plan()))).toBeUndefined();
    expect(state.festival.plan!.reserved).toEqual([]);
  });
});

describe('festival announcements', () => {
  it('notifies at the site when the festival starts', () => {
    const { state } = feastFixture(6, 11);
    const events = runUntil(state, todayAt(state, FESTIVAL.from) + 1);
    const n = events.find((e) => e.e === 'notify' && e.kind === 'festival');
    expect(n && n.e === 'notify' && n.at).toBeTruthy();
    expect(n && n.e === 'notify' && n.text).toMatch(/has begun/);
  });

  it('refreshes the festival view on day 1 of a season even with nothing planned', () => {
    const { state } = feastFixture(6, 11);
    state.festival.plan = null;
    state.tick = tickAt(2, 0, 1, 4);
    const ctx = createTickCtx(state);
    tidyFestival(state, ctx);
    expect(ctx.events.some((e) => e.e === 'festival.updated')).toBe(true);
  });
});
