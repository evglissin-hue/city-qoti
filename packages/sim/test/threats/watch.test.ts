// C5D: the Watch (14-challenge.md, The Watch): volunteers, duty, training, morale, posture, stipend.
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, TICKS_PER_HOUR } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { dayIndex } from '../../src/systems/economy/time';
import { scheduleOverride } from '../../src/systems/residents/overrides';
import { watchStrength } from '../../src/systems/threats/api';
import { DUTY_EVERY, rosterDay, watchMorale } from '../../src/systems/watch';
import { createTickCtx, runTick } from '../../src/turn';
import { rejection, run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { placeFree, tickAt } from '../fixtures/seasonsPlace';
import { threatFixture } from '../fixtures/threat';
import { villageFixture } from '../fixtures/village';

const S = MAP_SIZE;

function withHouse(): { s: WorldState; house: number } {
  const s = villageFixture().state;
  s.tick = tickAt(0, 1, 2, 5) + 100;
  const house = placeFree(s, 'watch-house', 90, 47).id;
  for (const r of s.residents) r.bond = 1;
  return { s, house };
}

describe('volunteers', () => {
  it('adults with bond 2 or more sign on once a Watch House stands, up to the target', () => {
    const { s } = withHouse();
    const adults = s.residents.filter((r) => r.stage === 'adult');
    adults[0]!.bond = 3;
    adults[1]!.bond = 2;
    adults[2]!.bond = 2;
    adults[3]!.bond = 4;
    s.residents.find((r) => r.stage === 'child')!.bond = 5;
    s.watch.target = 3;
    rosterDay(s, createTickCtx(s));
    expect(s.watch.members).toEqual([adults[0]!.id, adults[1]!.id, adults[3]!.id].sort((a, b) => a - b));
    for (const id of s.watch.members) expect(findById(s.residents, id)!.watch).toBeTruthy();
    // The target falls: the newest (highest id) go back to civilian life.
    s.watch.target = 1;
    rosterDay(s, createTickCtx(s));
    expect(s.watch.members).toHaveLength(1);
    expect(findById(s.residents, adults[3]!.id)!.watch ?? null).toBe(
      adults[3]!.id === s.watch.members[0] ? findById(s.residents, adults[3]!.id)!.watch : null,
    );
  });

  it('nobody signs on without a Watch House, and the Watch stands down if it goes', () => {
    const s = villageFixture().state;
    for (const r of s.residents) r.bond = 5;
    s.watch.target = 4;
    rosterDay(s, createTickCtx(s));
    expect(s.watch.members).toEqual([]);
    const { s: t, house } = withHouse();
    for (const r of t.residents) r.bond = 5;
    t.watch.target = 4;
    rosterDay(t, createTickCtx(t));
    expect(t.watch.members).toHaveLength(4);
    expect(rejection(run(t, { t: 'build.remove', ids: [house] }))).toBeUndefined();
    rosterDay(t, createTickCtx(t));
    expect(t.watch.members).toEqual([]);
    expect(t.residents.some((r) => r.watch)).toBe(false);
  });
});

describe('duty and turn-out', () => {
  it('one day in four on duty at the Watch House, away from the job', () => {
    const { s, house } = withHouse();
    for (const r of s.residents) r.bond = 5;
    s.watch.target = 8;
    const seen = new Map<number, number>();
    for (let d = 0; d < 8; d++) {
      s.tick = tickAt(0, 1, 1, 5) + d * 24 * TICKS_PER_HOUR + 100;
      rosterDay(s, createTickCtx(s));
      for (const id of s.watch.duty) seen.set(id, (seen.get(id) ?? 0) + 1);
      for (const id of s.watch.duty) expect((dayIndex(s.tick) + id) % DUTY_EVERY).toBe(0);
    }
    for (const id of s.watch.members) expect(seen.get(id)).toBe(2);
    const id = s.watch.duty[0] ?? s.watch.members[0]!;
    if (!s.watch.duty.includes(id)) s.watch.duty = [id];
    const r = findById(s.residents, id)!;
    expect(scheduleOverride(s, r, 10)).toEqual({ kind: 'work', at: house });
    expect(scheduleOverride(s, r, 19)).toBeNull();
  });

  it('everyone turns out on a raid day from 17:00 and nobody has duty', () => {
    const f = threatFixture();
    const s = f.state;
    s.tick = tickAt(0, 2, 4, 5) + 100;
    for (const id of f.watch) findById(s.residents, id)!.bond = 3;
    rosterDay(s, createTickCtx(s));
    expect(s.watch.duty).toEqual([]);
    const r = findById(s.residents, s.watch.members[0]!)!;
    expect(scheduleOverride(s, r, 16)?.kind).not.toBe('leisure');
    s.tick = tickAt(0, 2, 4, 17) + 10;
    expect(scheduleOverride(s, r, 17)).toEqual({ kind: 'leisure', tile: s.watch.posture[0] });
  });
});

describe('strength', () => {
  it('training rises with the stipend, paid with pay() so the money stays in the valley', () => {
    const { s } = withHouse();
    for (const r of s.residents) r.bond = 5;
    s.watch.target = 2;
    expect(rejection(run(s, { t: 'watch.setBudget', coins: 3 }))).toBeUndefined();
    const before = moneySnapshot(s);
    const t0 = s.watch.training;
    rosterDay(s, createTickCtx(s));
    expect(s.watch.training).toBe(t0 + 2);
    expectMoneyInvariant(before, s);
    run(s, { t: 'watch.setBudget', coins: 1 });
    rosterDay(s, createTickCtx(s));
    expect(s.watch.training).toBe(t0 + 3);
    run(s, { t: 'watch.setBudget', coins: 0 });
    for (let i = 0; i < 100; i++) rosterDay(s, createTickCtx(s));
    expect(s.watch.training).toBe(t0 + 3);
    // A town that can afford it (the stipend waits while the treasury cannot cover a day).
    s.economy.treasury = 1e7;
    run(s, { t: 'watch.setBudget', coins: 50 });
    for (let i = 0; i < 100; i++) rosterDay(s, createTickCtx(s));
    expect(s.watch.training).toBe(160);
  });

  it('morale follows mood, festivals, friendships among members and past victories', () => {
    const { s } = withHouse();
    for (const r of s.residents) r.bond = 5;
    s.watch.target = 3;
    rosterDay(s, createTickCtx(s));
    const base = watchMorale(s);
    s.festival.history.push({ season: 0, year: 0, festival: 'blossom-fair', stars: 5, twist: '' });
    expect(watchMorale(s)).toBeGreaterThan(base);
    s.festival.history = [];
    const [a, b] = s.watch.members.map((id) => findById(s.residents, id)!);
    a!.friends = [{ id: b!.id, level: 2, points: 0, lastMet: 0 }];
    expect(watchMorale(s)).toBe(Math.min(100, base + 3));
    a!.friends = [];
    s.threats.history.push({ tick: 0, band: 'small', side: 'n', stolen: 0, captured: 1, repelled: true });
    expect(watchMorale(s)).toBe(Math.min(100, base + 4));
    s.threats.history = [{ tick: 0, band: 'small', side: 'n', stolen: 9, captured: 0, repelled: false }];
    expect(watchMorale(s)).toBe(Math.max(0, base - 4));
    for (const r of s.residents) r.mood = 20;
    expect(watchMorale(s)).toBeLessThan(base);
  });

  it('strength = members x training x morale; posture up to three guard points', () => {
    const f = threatFixture();
    const s = f.state;
    expect(watchStrength(s)).toBe(Math.round((5 * 120 * 70) / 10000));
    expect(
      rejection(
        run(s, {
          t: 'watch.setPosture',
          guards: [
            [1, 1],
            [2, 2],
            [3, 3],
            [4, 4],
          ],
        }),
      ),
    ).toBe('TOO_MANY');
    expect(
      rejection(
        run(s, {
          t: 'watch.setPosture',
          guards: [
            [40, 50],
            [70, 50],
          ],
        }),
      ),
    ).toBeUndefined();
    expect(s.watch.posture).toEqual([50 * S + 40, 50 * S + 70]);
  });

  it('keeps the money invariant across a season of stipends and a raid', () => {
    const f = threatFixture();
    const s = f.state;
    for (const id of f.watch) findById(s.residents, id)!.bond = 3;
    s.watch.budget = 500;
    const before = moneySnapshot(s);
    for (let d = 0; d < 6; d++) rosterDay(s, createTickCtx(s));
    expectMoneyInvariant(before, s);
    s.tick = tickAt(0, 2, 4, 18);
    const ctx = createTickCtx(s);
    for (let i = 0; i < 12 * TICKS_PER_HOUR && (i < 10 || s.raid); i++) runTick(s, ctx);
    expect(s.raid).toBeNull();
    expect(s.threats.history).toHaveLength(1);
    expectMoneyInvariant(before, s);
  }, 120000);
});
