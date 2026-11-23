// Achievements: each I1 achievement unlocks in the hamlet, credited to the right seats, with a
// Chronicle line, an event and a notice; and they are checked each in-game hour.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { SeatId, WorldState } from '../../src/contracts';
import { checkAchievements } from '../../src/systems/achievements';
import { dayIndex } from '../../src/systems/economy/time';
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
      s.economy.everProduced[content.goodIndex.get('timber')!] = 4;
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
  // I3 (C5.0): the counters the I3 tracks keep.
  [
    'field-notes',
    (s) => {
      for (let i = 0; i < 10; i++)
        s.nature.guide.push({ species: `s${i}`, firstTick: 0, seats: [0], count: 1 });
    },
  ],
  [
    'five-stars',
    (s) => {
      s.seasons.bestStars = 5;
    },
  ],
  [
    'the-first-winter',
    (s) => {
      s.trial = { kind: 'winter', charter: 'village', season: 3, year: 0, status: 'passed', measured: [] };
    },
  ],
  [
    'the-gate-held',
    (s) => {
      s.seasons.raidsHeld = 1;
    },
  ],
  [
    'the-river-runs-clean',
    (s) => {
      s.nature.guide.push({ species: 'kingfisher', firstTick: 0, seats: [0, 1], count: 1 });
    },
  ],
  [
    'warm-hearths',
    (s) => {
      s.seasons.warmWinters = 1;
    },
  ],
  // R1 (R1D): the zones-first feats.
  [
    'a-town-that-builds-itself',
    (s) => {
      for (let i = 0; i < 10; i++)
        build(s, 'workshop', 120 + (i % 5) * 4, 120 + Math.floor(i / 5) * 4, 0, 0, 'baker').lot = i + 1;
    },
  ],
  [
    'a-winter-without-imports',
    (s) => {
      s.seasons.importFreeWinters = 1;
    },
  ],
  [
    'market-day',
    (s) => {
      const stall = s.buildings.find((b) => b.def === 'market-stall')!;
      for (const g of content.goods)
        if (g.family === 'food' && g.raw) stall.rt!.store[content.goodIndex.get(g.id)!] = 2;
    },
  ],
  [
    'porridge-no-more',
    (s) => {
      // Three Food flavors each household saw today (R1A's sightings).
      const foods = ['grain', 'fish', 'vegetables'].map((g) => content.goodIndex.get(g)!);
      for (const h of s.households) {
        h.seen = new Array<number>(content.goods.length).fill(-1);
        for (const g of foods) h.seen[g] = dayIndex(s.tick);
      }
    },
  ],
  // R3 (R3B): the first master made.
  [
    'master-of-the-house',
    (s) => {
      s.masters.made = 1;
    },
  ],
  // R2 (R2C): the evening feats read the runs and the gaps the gaps pass keeps (test/r2c).
  [
    'out-of-an-evening',
    (s) => {
      s.evenings.allOut = 1;
    },
  ],
  [
    'a-seat-for-everyone',
    (s) => {
      s.evenings.seatedSeasons = 1;
    },
  ],
  // R3 (R3C): a Town Book page credited to both seats.
  [
    'made-together',
    (s) => {
      s.townBook.pages.push({
        id: s.nextId++,
        kind: 'custom',
        def: 'green-evenings',
        place: 'site:village-green:1',
        dayOfSeason: 1,
        name: 'Evenings on the Green',
        day: 0,
        seats: [0, 1],
        leaning: 'gardens',
      });
    },
  ],
  [
    'mind-the-gap',
    (s) => {
      s.gaps.closedCount = 10;
      s.gaps.closedBySeat = [3, 7, 0, 0];
    },
  ],
  // R3 (R3A): a season settled with every lantern lit counts for the lamplighter's round.
  [
    'lamplighters-round',
    (s) => {
      s.supplies.roundSeasons = 1;
    },
  ],
]);

// R3 (R3.0): each R3 feat read a counter whose stand-in (R3.0) always gave 0. R3A (lampSeasons, The
// Lamplighter's Round), R3B (Master of the House) and R3C (Made Together) replaced them, so every feat
// has its setup now and none is pending.
const PENDING = new Set<string>();

describe('every achievement', () => {
  it('has a setup, or is pending on its R3 stand-in', () => {
    expect([...SETUPS.keys(), ...PENDING].sort()).toEqual(content.achievements.map((a) => a.id).sort());
    for (const id of PENDING)
      expect(SETUPS.has(id), `${id} has a setup now: take it off PENDING`).toBe(false);
  });

  it('does not unlock a pending feat on the stand-ins', () => {
    const s = hamletFixture().state;
    expect(checkAchievements(s, createTickCtx(s))).not.toEqual(expect.arrayContaining([...PENDING]));
    for (const id of PENDING) expect(s.achievements.some((x) => x.id === id)).toBe(false);
  });

  for (const a of content.achievements.filter((x) => !PENDING.has(x.id))) {
    it(`${a.id}: unlocks once, with a plaque, a line and a notice`, () => {
      const f = hamletFixture();
      const s = f.state;
      // Without its households, nothing in the fixture has earned a plaque yet.
      const households = s.households.splice(0);
      expect(checkAchievements(s, createTickCtx(s))).toEqual([]);
      if (a.id === 'first-footsteps' || a.id === 'porridge-no-more') s.households.push(...households);
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
