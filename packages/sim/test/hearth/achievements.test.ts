// Achievements: each I1 achievement unlocks in the hamlet, credited to the right seats, with a
// Chronicle line, an event and a notice; and they are checked each in-game hour.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { SeatId, WorldState } from '../../src/contracts';
import { checkAchievements } from '../../src/systems/achievements';
import { runPatterns } from '../../src/systems/hearth/patterns/engine';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { build, decor, events, runHours, standardWorld, tree } from './helpers';

const SETUPS = new Map<string, (s: WorldState) => void>([
  [
    'balanced-books',
    (s) => {
      s.economy.seasonsInSurplus = 1;
    },
  ],
  [
    'bread-on-the-table',
    (s) => {
      s.economy.everProduced[content.goodIndex.get('bread')!] = 5;
    },
  ],
  ['built-together', (s) => runPatterns(s, createTickCtx(s))],
  [
    'every-door-a-name',
    (s) => {
      const base = s.residents[0]!;
      for (let i = 0; i < 11; i++) s.residents.push({ ...base, id: s.nextId++ });
    },
  ],
  ['first-footsteps', () => {}],
  ['hearth-and-home', (s) => runPatterns(s, createTickCtx(s))],
  [
    'plank-by-plank',
    (s) => {
      s.economy.everProduced[content.goodIndex.get('planks')!] = 4;
    },
  ],
  [
    'the-long-walk-home',
    (s) => {
      decor(s, 'lantern', 65, 51);
      runPatterns(s, createTickCtx(s));
    },
  ],
  ['well-met', (s) => runPatterns(s, createTickCtx(s))],
  [
    'wishes-granted',
    (s) => {
      s.stats.wishesGranted = 5;
    },
  ],
]);

describe('every achievement', () => {
  it('has a setup', () => {
    expect([...SETUPS.keys()].sort()).toEqual(content.achievements.map((a) => a.id).sort());
  });

  for (const a of content.achievements) {
    it(`${a.id}: unlocks once, with a plaque, a line and a notice`, () => {
      const f = hamletFixture();
      const s = f.state;
      // Without its households, nothing in the fixture has earned a plaque yet.
      const households = s.households.splice(0);
      expect(checkAchievements(s, createTickCtx(s))).toEqual([]);
      if (a.id === 'first-footsteps') s.households.push(...households);
      SETUPS.get(a.id)!(s);
      const ctx = createTickCtx(s);
      expect(checkAchievements(s, ctx)).toContain(a.id);
      const state = s.achievements.find((x) => x.id === a.id)!;
      expect(state.seats.length).toBeGreaterThan(0);
      expect(events(ctx, 'achievement.unlocked').map((e) => e.a.id)).toContain(a.id);
      expect(events(ctx, 'notify').some((e) => e.kind === 'achievement' && e.text.includes(a.name))).toBe(
        true,
      );
      const line = s.chronicle.find((c) => c.kind === 'achievement' && c.text.includes(a.name))!;
      expect(line.text).toContain(a.description.slice(0, 20));
      expect(checkAchievements(s, createTickCtx(s))).not.toContain(a.id);
    });
  }
});

describe('credit', () => {
  function wellWorld(seat: SeatId) {
    const w = standardWorld();
    build(w, 'well', 130, 40, 0, seat);
    decor(w, 'bench', 129, 41, seat);
    decor(w, 'bench', 131, 41, seat);
    tree(w, 130, 43);
    for (const [x, z] of [
      [125, 36],
      [133, 36],
      [126, 44],
    ] as const) {
      build(w, 'cottage', x, z, 0, seat);
    }
    return w;
  }

  it('goes to the seat credited with the discovery behind it', () => {
    const w = wellWorld(1);
    runPatterns(w, createTickCtx(w));
    checkAchievements(w, createTickCtx(w));
    expect(w.achievements.find((a) => a.id === 'well-met')!.seats).toEqual([1]);
    expect(w.achievements.find((a) => a.id === 'hearth-and-home')!.seats).toEqual([1]);
    expect(w.achievements.find((a) => a.id === 'built-together')).toBeUndefined();
  });

  it('goes to both seats for Built Together, and to the connected seats otherwise', () => {
    const f = hamletFixture();
    runPatterns(f.state, createTickCtx(f.state));
    f.state.time.connected = [1];
    checkAchievements(f.state, createTickCtx(f.state));
    const seats = (id: string) => f.state.achievements.find((a) => a.id === id)!.seats;
    expect(seats('built-together')).toEqual([0, 1]);
    expect(seats('first-footsteps')).toEqual([1]);
  });

  it('is checked each in-game hour', () => {
    const f = hamletFixture();
    runHours(f.state, 1);
    expect(f.state.achievements.map((a) => a.id)).toEqual([
      'built-together',
      'first-footsteps',
      'hearth-and-home',
      'well-met',
    ]);
    expect(f.state.achievements.every((a) => a.tick === 151)).toBe(true);
  });
});
