// R3B, the masters' day (19-evenings.md, Masters): working days by trade, counted from the crews at
// 23:45. An apprentice under a master counts double; a day resting out of season counts nothing and
// loses nothing; days are kept across a change of work.
import { content, MASTERY } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, ResidentFlags, TICKS_PER_DAY } from '../../src/constants';
import { emptyCounters } from '../../src/state/zones';
import { hamletFixture } from '../fixtures/hamlet';
import { place } from '../village/helpers';
import { hire, ticksUntil } from '../ledger/helpers';
import { craftOf, mastersDay, masterWorld, res, today } from './masterFixture';

describe('the masters day: working days', () => {
  it('adds one day to the trade of every hand on a crew', () => {
    const { state, crew } = masterWorld();
    mastersDay(state);
    mastersDay(state);
    for (const id of crew) expect(craftOf(res(state, id), 'baker')).toBe(2);
  });

  it('counts an apprentice under a master double, and not once the apprenticeship is over', () => {
    const { state, bakery, crew } = masterWorld();
    const a = res(state, crew[1]!);
    a.apprentice = { at: bakery.id, trade: 'baker', untilDay: today(state) + 2, master: crew[0]! };
    mastersDay(state);
    mastersDay(state);
    expect(craftOf(a, 'baker')).toBe(2 * MASTERY.apprenticeWeight);
    // The apprenticeship ended on the day it names: from then on a day is one, and an own day.
    mastersDay(state);
    expect(craftOf(a, 'baker')).toBe(2 * MASTERY.apprenticeWeight + 1);
    expect(a.apprentice!.ownDays).toBe(1);
  });

  it('counts an apprentice of no master (the school path) as one', () => {
    const { state, bakery, crew } = masterWorld();
    const a = res(state, crew[1]!);
    a.apprentice = { at: bakery.id, trade: 'baker', untilDay: today(state) + 5 };
    mastersDay(state);
    expect(craftOf(a, 'baker')).toBe(1);
    expect(a.apprentice.ownDays).toBeUndefined();
  });

  it('counts nothing out of season and loses nothing', () => {
    const { state } = hamletFixture();
    const cider = place(state, 'workshop', 60, 30, 0, 'cider-maker');
    const [id] = hire(state, cider.id, 1);
    const r = res(state, id!);
    r.craft = [['cider-maker', 7]];
    state.tick = (3 * DAYS_PER_SEASON + 1) * TICKS_PER_DAY;
    for (let d = 0; d < 4; d++) mastersDay(state);
    expect(craftOf(r, 'cider-maker')).toBe(7);
    // In season again the same days count.
    state.tick = (1 * DAYS_PER_SEASON + 1) * TICKS_PER_DAY;
    mastersDay(state);
    expect(craftOf(r, 'cider-maker')).toBe(8);
  });

  it('counts nothing for a hand on their way out or at a paused building', () => {
    const { state, bakery, crew } = masterWorld();
    res(state, crew[2]!).flags |= ResidentFlags.leaving;
    mastersDay(state);
    expect(craftOf(res(state, crew[2]!), 'baker')).toBe(0);
    bakery.rt!.paused = true;
    mastersDay(state);
    expect(craftOf(res(state, crew[0]!), 'baker')).toBe(1);
  });

  it('keeps the list sorted by trade and the days across a change of work', () => {
    const { state, bakery, crew } = masterWorld();
    const r = res(state, crew[0]!);
    r.craft = [['weaver', 3]];
    mastersDay(state);
    expect(r.craft).toEqual([
      ['baker', 1],
      ['weaver', 3],
    ]);
    // They take a job at the orchard: baker days stay, orchard days start.
    const orchard = place(state, 'farmstead', 70, 30, 0, 'orchard');
    bakery.rt!.workers = bakery.rt!.workers.filter((id) => id !== r.id);
    r.jobId = orchard.id;
    orchard.rt!.workers.push(r.id);
    mastersDay(state);
    expect(r.craft).toEqual([
      ['baker', 1],
      ['orchard', 1],
      ['weaver', 3],
    ]);
  });

  it('only counts where the key has masters (a town hall crew gains nothing)', () => {
    const { state } = masterWorld();
    mastersDay(state);
    const hall = state.buildings.find((b) => b.def === 'town-hall')!;
    expect(content.masterByOf.has(hall.trade ?? hall.def)).toBe(false);
    for (const id of hall.rt!.workers) expect(res(state, id).craft).toBeUndefined();
  });

  it('counts a specialized building under its def id', () => {
    const { state, windmill } = masterWorld();
    const [id] = hire(state, windmill.id, 1);
    windmill.counters = emptyCounters();
    mastersDay(state);
    expect(craftOf(res(state, id!), 'windmill')).toBe(1);
  });

  it('runs from the clock with every other system on: a day of ticks adds one day', () => {
    const { state, crew } = masterWorld();
    const before = state.tick;
    ticksUntil(state, (s) => res(s, crew[1]!).craft !== undefined, TICKS_PER_DAY + 10);
    expect(craftOf(res(state, crew[1]!), 'baker')).toBe(1);
    expect(state.tick - before).toBeLessThanOrEqual(TICKS_PER_DAY);
  });
});
