// R3B, becoming a master: four hearts and 20 days in one trade, in a business of level 2 or more or at
// a specialized building; one a trade a season, apprentices included; by days then id; the sign
// (`Building.masterId`) follows the crew; the words; and what a master unlocks.
import { content, MASTERY } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, ResidentFlags, TICKS_PER_DAY } from '../../src/constants';
import { findById } from '../../src/state/entities';
import { isMaster, masterOf } from '../../src/systems/masters/api';
import { release } from '../../src/systems/residents/jobs';
import { createTickCtx } from '../../src/turn';
import { hire } from '../ledger/helpers';
import { mastersDay, masterWorld, qualify, res, today } from './masterFixture';

describe('the rule', () => {
  it('keeps the numbers in content: one a trade a season', () => {
    expect(MASTERY.perTradeSeason).toBe(1);
    expect(MASTERY.hearts).toBe(4);
    expect(MASTERY.days).toBe(16);
  });

  it('makes a master of four hearts and the working days, with the sign, the words and a count', () => {
    const { state, bakery, crew } = masterWorld();
    const r = res(state, crew[1]!);
    qualify(r, 'baker');
    const events = mastersDay(state, false);
    expect(isMaster(r)).toBe(true);
    expect(r.mastery).toBe('baker');
    expect(state.masters.made).toBe(1);
    expect(state.masters.lastMade).toEqual([['baker', Math.floor(today(state) / DAYS_PER_SEASON)]]);
    expect(bakery.masterId).toBe(r.id);
    expect(masterOf(state, bakery)).toBe(r.id);
    expect(state.chronicle.some((c) => c.kind === 'master-made' && c.text.includes('master baker'))).toBe(
      true,
    );
    expect(
      events.some((e) => e.e === 'notify' && e.kind === 'letter' && e.text.includes('master baker')),
    ).toBe(true);
    expect(events.some((e) => e.e === 'life.event' && e.kind === 'master' && e.residents[0] === r.id)).toBe(
      true,
    );
    // The sign goes up tonight: the building and its business are told.
    expect(
      events.some((e) => e.e === 'building.updated' && e.b.id === bakery.id && e.b.master === true),
    ).toBe(true);
    expect(events.some((e) => e.e === 'business.updated' && e.b.id === bakery.id)).toBe(true);
  });

  it('asks four hearts and twenty days', () => {
    const { state, crew } = masterWorld();
    qualify(res(state, crew[0]!), 'baker', MASTERY.days, MASTERY.hearts - 1);
    // Tonight's day is counted first, so 18 days make 19 and 19 make 20.
    qualify(res(state, crew[1]!), 'baker', MASTERY.days - 2);
    mastersDay(state, false);
    expect(state.masters.made).toBe(0);
  });

  it('counts the day just worked: 19 days become 20 tonight', () => {
    const { state, crew } = masterWorld();
    qualify(res(state, crew[1]!), 'baker', MASTERY.days - 1);
    mastersDay(state, false);
    expect(isMaster(res(state, crew[1]!))).toBe(true);
  });

  it('asks a business of level 2 or more, but a specialized building at any level', () => {
    const { state, bakery, crew, windmill } = masterWorld();
    bakery.level = 1;
    qualify(res(state, crew[1]!), 'baker');
    const [miller] = hire(state, windmill.id, 1);
    qualify(res(state, miller!), 'windmill');
    mastersDay(state, false);
    expect(isMaster(res(state, crew[1]!))).toBe(false);
    expect(isMaster(res(state, miller!))).toBe(true);
    expect(res(state, miller!).mastery).toBe('windmill');
  });

  it('asks a grown, working resident who is not a story character', () => {
    const { state, crew } = masterWorld(4);
    const [a, b, c, d] = crew.slice(1).map((id) => res(state, id));
    for (const r of [a!, b!, c!, d!]) qualify(r, 'baker');
    a!.stage = 'child';
    b!.retired = true;
    c!.flags |= ResidentFlags.story;
    d!.flags |= ResidentFlags.leaving;
    mastersDay(state, false);
    expect(state.masters.made).toBe(0);
  });

  it('makes one a trade a season, the most days first and then the lowest id, no dice', () => {
    const { state, crew } = masterWorld(3);
    const [, a, b, c] = crew.map((id) => res(state, id));
    qualify(a!, 'baker', 25);
    qualify(b!, 'baker', 30);
    qualify(c!, 'baker', 30);
    mastersDay(state);
    expect(isMaster(b!)).toBe(true);
    expect(isMaster(a!) || isMaster(c!)).toBe(false);
    // The rest of the season: no second master, however many days pass.
    for (let d = 0; d < 3; d++) mastersDay(state);
    expect(state.masters.made).toBe(1);
    // The next season, the next in line: days again, so the 30-day hand first.
    state.tick = (Math.floor(today(state) / DAYS_PER_SEASON) + 1) * DAYS_PER_SEASON * TICKS_PER_DAY;
    mastersDay(state);
    expect(isMaster(c!)).toBe(true);
    expect(isMaster(a!)).toBe(false);
  });

  it('counts an apprentice against the same season', () => {
    const { state, bakery, crew } = masterWorld();
    const hand = res(state, crew[1]!);
    qualify(hand, 'baker');
    const trainee = res(state, crew[2]!);
    trainee.bond = 1;
    trainee.apprentice = {
      at: bakery.id,
      trade: 'baker',
      untilDay: today(state) - 3,
      master: crew[0]!,
      ownDays: MASTERY.apprenticeDays,
    };
    trainee.craft = [['baker', 40]];
    mastersDay(state, false);
    // The apprentice has more days, so they take the season's place; the hand with hearts waits.
    expect(isMaster(trainee)).toBe(true);
    expect(isMaster(hand)).toBe(false);
    expect(state.masters.made).toBe(1);
  });

  it('keeps Building.masterId in step: set, kept, cleared when the master leaves the crew, with events only on a change', () => {
    const { state, bakery, crew } = masterWorld();
    const r = res(state, crew[1]!);
    qualify(r, 'baker');
    mastersDay(state);
    expect(bakery.masterId).toBe(r.id);
    expect(mastersDay(state).some((e) => e.e === 'building.updated' || e.e === 'business.updated')).toBe(
      false,
    );
    release(state, r);
    const events = mastersDay(state);
    expect(bakery.masterId).toBeUndefined();
    expect(events.some((e) => e.e === 'building.updated' && e.b.id === bakery.id && !e.b.master)).toBe(true);
    expect(events.some((e) => e.e === 'business.updated' && e.b.id === bakery.id)).toBe(true);
    // A retired master keeps the flag and the title.
    expect(isMaster(r)).toBe(true);
  });

  it('puts up the sign for a master already on a crew with none (the lowest id when several)', () => {
    const { state, bakery, crew } = masterWorld();
    for (const id of [crew[2]!, crew[1]!]) {
      const r = res(state, id);
      r.flags |= ResidentFlags.master;
      r.mastery = 'baker';
    }
    mastersDay(state);
    expect(bakery.masterId).toBe(Math.min(crew[1]!, crew[2]!));
  });

  it('applies a master def’s unlocks generically, once', () => {
    const { state, crew } = masterWorld();
    const def = content.masterByOf.get('baker') as { unlocks?: string[] };
    try {
      def.unlocks = ['test-piece'];
      qualify(res(state, crew[1]!), 'baker');
      mastersDay(state);
      expect(state.hearth.unlocked.filter((u) => u === 'test-piece')).toHaveLength(1);
      state.tick = (Math.floor(today(state) / DAYS_PER_SEASON) + 1) * DAYS_PER_SEASON * TICKS_PER_DAY;
      qualify(res(state, crew[2]!), 'baker');
      mastersDay(state);
      expect(state.masters.made).toBe(2);
      expect(state.hearth.unlocked.filter((u) => u === 'test-piece')).toHaveLength(1);
    } finally {
      delete def.unlocks;
    }
  });

  it('does nothing outside a standard valley', () => {
    const { state, crew } = masterWorld();
    qualify(res(state, crew[1]!), 'baker');
    state.settings.mode = 'sandbox';
    mastersDay(state, false);
    expect(state.masters.made).toBe(0);
    expect(findById(state.residents, crew[1]!)!.mastery).toBeUndefined();
    expect(createTickCtx(state).events).toEqual([]);
  });
});
