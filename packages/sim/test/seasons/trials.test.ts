// C5A: the trial machinery and the Village's first winter (docs/spec/15-progression.md, Ranks and
// Charters; i3-wave-notes.md, Decisions): announced after the claim, run through the winter,
// weathered or failed, and a failed trial returns the next winter and costs nothing else.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { createTickCtx } from '../../src/turn';
import { larder, stepTrial, TRIAL_RENOWN } from '../../src/systems/trials';
import { trialOutcome } from '../../src/systems/seasons/api';
import { tickAt } from '../fixtures/seasonsPlace';
import { villageFixture } from '../fixtures/village';
import { winterFixture } from '../fixtures/winter';

describe('trials', () => {
  it('opens the Village trial for the next winter once the rank is claimed', () => {
    const { state } = villageFixture();
    state.trial = null;
    state.tick = tickAt(0, 1, 3, 0) + 8;
    const ctx = createTickCtx(state);
    stepTrial(state, ctx);
    expect(state.trial).toMatchObject({
      kind: 'winter',
      charter: 'village',
      season: 3,
      year: 0,
      status: 'upcoming',
    });
    expect(ctx.events.some((e) => e.e === 'trial.updated')).toBe(true);
    expect(ctx.events.some((e) => e.e === 'notify' && e.kind === 'letter')).toBe(true);
    // Claimed in winter: the trial is next winter.
    const late = villageFixture().state;
    late.trial = null;
    late.tick = tickAt(0, 3, 2, 0) + 8;
    stepTrial(late, createTickCtx(late));
    expect(late.trial).toMatchObject({ year: 1 });
  });

  it('runs through its winter, measuring the cold and the larder', () => {
    const { state } = villageFixture();
    state.trial = null;
    state.tick = tickAt(0, 2, 2, 0) + 8;
    stepTrial(state, createTickCtx(state));
    state.tick = tickAt(0, 3, 1, 0) + 8;
    stepTrial(state, createTickCtx(state));
    expect(trialOutcome(state)).toBe('running');
    const names = state.trial!.measured.map(([k]) => k);
    expect(names).toContain('coldHouseholds');
    expect(names).toContain('larder');
  });

  it('a weathered winter seals the Charter: renown, a Chronicle page and a letter', () => {
    const f = winterFixture();
    const s = f.state;
    s.warmth = { winter: 1, coldHouseholdDays: 0, coldHouseholds: [] };
    expect(larder(s)).toBeGreaterThan(0);
    const renown = s.renown.points;
    s.tick = tickAt(2, 0, 1, 0) + 8;
    const ctx = createTickCtx(s);
    stepTrial(s, ctx);
    expect(trialOutcome(s)).toBe('passed');
    expect(s.renown.points).toBe(renown + TRIAL_RENOWN);
    expect(s.chronicle.some((c) => c.kind === 'trial-passed')).toBe(true);
    expect(ctx.events.some((e) => e.e === 'notify' && e.kind === 'letter')).toBe(true);
    // Sealed: nothing more happens.
    s.tick = tickAt(2, 3, 1, 0) + 8;
    stepTrial(s, createTickCtx(s));
    expect(trialOutcome(s)).toBe('passed');
  });

  it('a failed winter returns the next winter and loses nothing else', () => {
    const f = winterFixture();
    const s = f.state;
    s.warmth = { winter: 1, coldHouseholdDays: 6, coldHouseholds: [...f.cold] };
    const rank = s.charter.rank;
    const unlocked = [...s.hearth.unlocked];
    const treasury = s.economy.treasury;
    s.tick = tickAt(2, 0, 1, 0) + 8;
    stepTrial(s, createTickCtx(s));
    expect(trialOutcome(s)).toBe('failed');
    expect(s.chronicle.some((c) => c.kind === 'trial-failed')).toBe(true);
    expect(s.charter.rank).toBe(rank);
    expect(s.hearth.unlocked).toEqual(unlocked);
    expect(s.economy.treasury).toBe(treasury);
    s.tick = tickAt(2, 1, 1, 0) + 8;
    stepTrial(s, createTickCtx(s));
    expect(s.trial).toMatchObject({ status: 'upcoming', season: 3, year: 2 });
  });

  it('every Charter trial kind content names has a row', () => {
    for (const c of content.charters)
      if (c.trial) expect(['winter', 'raid', 'flood']).toContain(c.trial.kind);
  });
});
