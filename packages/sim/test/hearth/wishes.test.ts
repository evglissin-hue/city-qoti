// Wishes: every I1 template is generated and granted in the hamlet, plus caps, expiry, rewards,
// letters and the system's daily schedule.
import { content, type WishTemplate } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, ResidentFlags, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, Household, Wish, WorldState } from '../../src/contracts';
import { evaluate } from '../../src/conditions';
import { findRoute } from '../../src/conditions/route';
import { goodsArray } from '../../src/state/hamlet';
import { findById, removeById } from '../../src/state/entities';
import { doorTileOf } from '../../src/systems/movement/api';
import { checkWishes, generateWishes, makeWish, wishBinding, wishCap } from '../../src/systems/hearth/wishes';
import { wishProgress } from '../../src/systems/hearth/wishes/progress';
import { createTickCtx, type SimCtx } from '../../src/turn';
import { type HamletFixture, hamletFixture } from '../fixtures/hamlet';
import { build, decor, events, road, runHours, S, settle, tree } from './helpers';

function homeOf(s: WorldState, w: Wish): Building {
  return findById(s.buildings, w.home)!;
}

/** Moves a household into a new cottage at (x, z). */
function rehouse(f: HamletFixture, household: number, x: number, z: number): Building {
  const b = build(f.state, 'cottage', x, z);
  findById(f.state.households, household)!.homeId = b.id;
  return b;
}

function removeBuilding(s: WorldState, id: number): void {
  const b = removeById(s.buildings, id)!;
  for (let i = 0; i < s.map.occupant.length; i++) if (s.map.occupant[i] === b.id) s.map.occupant[i] = 0;
}

interface Case {
  /** Makes the hamlet a place where this wish is wanted (and not yet granted). */
  setup?: (f: HamletFixture) => void;
  /** Builds whatever grants it. */
  grant: (f: HamletFixture, w: Wish) => void;
}

const CASES: Record<string, Case> = {
  'a-garden-plot': {
    grant: (f, w) => build(f.state, 'vegetable-plot', homeOf(f.state, w).x, homeOf(f.state, w).z - 2),
  },
  'a-proper-path': {
    setup: (f) => {
      // Hazel's bakery moves out to a spot whose door opens onto grass.
      const shop = build(f.state, 'bakery', 80, 53);
      findById(f.state.residents, f.residents[0]![1]!)!.jobId = shop.id;
    },
    grant: (f) => road(f.state, 'path', 81, 51, 81, 55),
  },
  'a-well-closer': {
    grant: (f, w) => build(f.state, 'well', homeOf(f.state, w).x, homeOf(f.state, w).z - 2),
  },
  'bakery-nearby': {
    setup: (f) => {
      rehouse(f, f.households[2], 140, 140);
    },
    grant: (f) => build(f.state, 'bakery', 143, 140),
  },
  'flowers-on-the-lane': {
    grant: (f, w) => {
      const h = homeOf(f.state, w);
      for (let i = 0; i < 3; i++) decor(f.state, 'planter', h.x + i, h.z - 1);
    },
  },
  'fresh-fish': {
    grant: (f) => {
      findById(f.state.buildings, f.b.stall)!.rt!.store[content.goodIndex.get('fish')!] = 3;
    },
  },
  'lantern-on-my-way-home': {
    grant: (f, w) => {
      const route = findRoute(f.state, doorTileOf(f.state, w.work), doorTileOf(f.state, w.home), false)!;
      for (let i = 0; i < route.length; i += 2) {
        decor(f.state, 'lantern', route[i]! % MAP_SIZE, Math.floor(route[i]! / MAP_SIZE));
      }
    },
  },
  neighbors: {
    grant: (f, w) => {
      const h = homeOf(f.state, w);
      const b = build(f.state, 'cottage', h.x - 3, h.z - 3);
      const hh: Household = {
        id: f.state.nextId++,
        family: 'Fernsby',
        members: [],
        homeId: b.id,
        pantry: goodsArray(),
        recentFoods: [],
        savings: 0,
        tier: 'settler',
        arrivedDay: 0,
        lowMoodDays: 0,
      };
      f.state.households.push(hh);
    },
  },
  'quiet-please': {
    setup: (f) => {
      build(f.state, 'quarry', 53, 44);
      settle(f.state);
    },
    grant: (f) => {
      removeBuilding(f.state, f.state.buildings.find((b) => b.def === 'quarry')!.id);
      settle(f.state);
    },
  },
  'river-bench': {
    setup: (f) => {
      rehouse(f, f.households[1], 90, 40);
    },
    grant: (f) => decor(f.state, 'bench', 98, 42),
  },
  'somewhere-to-sit': {
    grant: (f, w) => decor(f.state, 'bench', homeOf(f.state, w).x, homeOf(f.state, w).z - 1),
  },
  'tree-by-my-window': {
    grant: (f, w) => tree(f.state, homeOf(f.state, w).x, homeOf(f.state, w).z - 1, 1),
  },
};

describe('every template', () => {
  it('has a test case', () => {
    for (const t of content.wishes) expect(CASES[t.id], t.id).toBeDefined();
    expect(content.wishes).toHaveLength(12);
  });

  for (const t of content.wishes) {
    it(`${t.id}: is wished for, then granted`, () => {
      const f = hamletFixture();
      const s = f.state;
      const c = CASES[t.id]!;
      c.setup?.(f);
      const ctx = createTickCtx(s);
      expect(generateWishes(s, ctx, [t])).toBeGreaterThanOrEqual(1);
      const w = s.wishes.find((x) => x.template === t.id)!;
      expect(w).toBeDefined();
      const r = findById(s.residents, w.residentId)!;
      expect(r.wishId).toBe(w.id);
      expect(events(ctx, 'wish.added')[0]!.w.text).toContain(r.given);
      expect(evaluate(s, t.target, wishBinding(w))).toBe(false);
      expect(checkWishes(s, ctx)).toEqual([0, 0]);

      c.grant(f, w);
      const bond = r.bond;
      const after = createTickCtx(s);
      const [granted] = checkWishes(s, after);
      expect(granted).toBeGreaterThanOrEqual(1);
      expect(s.wishes.find((x) => x.id === w.id)).toBeUndefined();
      expect(r.wishId).toBe(0);
      expect(r.bond).toBe(bond + t.reward.bond);
      expect(r.flags & ResidentFlags.hop).toBeTruthy();
      expect(r.modifiers.find((m) => m.kind === 'wish-granted')!.value).toBe(t.reward.mood);
      expect(events(after, 'wish.granted').map((e) => e.id)).toContain(w.id);
      const letter = events(after, 'notify').find((e) => e.kind === 'letter')!;
      expect(letter.text).toContain(r.given);
      expect(s.stats.digest.some(([id, tid]) => id === r.id && tid === t.id)).toBe(true);
    });
  }
});

describe('generation', () => {
  it('caps active wishes at 2 + population / 15, at most 12', () => {
    expect(wishCap(0)).toBe(2);
    expect(wishCap(9)).toBe(2);
    expect(wishCap(15)).toBe(3);
    expect(wishCap(44)).toBe(4);
    expect(wishCap(1000)).toBe(12);
    const f = hamletFixture();
    const ctx = createTickCtx(f.state);
    expect(generateWishes(f.state, ctx)).toBe(2);
    expect(generateWishes(f.state, ctx)).toBe(0);
    expect(f.state.wishes).toHaveLength(2);
  });

  it('never wishes for what is already there, or twice at one home', () => {
    const f = hamletFixture();
    const s = f.state;
    const sit = content.wishById.get('somewhere-to-sit')!;
    for (const c of f.b.cottages) {
      const h = findById(s.buildings, c)!;
      decor(s, 'bench', h.x, h.z - 1);
    }
    expect(generateWishes(s, createTickCtx(s), [sit])).toBe(0);
    const garden = content.wishById.get('a-garden-plot')!;
    const ctx = createTickCtx(s);
    expect(generateWishes(s, ctx, [garden])).toBe(2);
    const homes = s.wishes.map((w) => w.home);
    expect(new Set(homes).size).toBe(2);
  });

  it('skips residents at bond 5, with a wish, or leaving', () => {
    const f = hamletFixture();
    const s = f.state;
    for (const r of s.residents) r.bond = 5;
    expect(generateWishes(s, createTickCtx(s))).toBe(0);
    for (const r of s.residents) r.flags |= ResidentFlags.leaving;
    s.residents[0]!.bond = 1;
    expect(generateWishes(s, createTickCtx(s))).toBe(0);
  });

  it('runs at 07:00 each day and is deterministic', () => {
    const one = hamletFixture();
    const two = hamletFixture();
    runHours(one.state, 2);
    runHours(two.state, 2);
    expect(one.state.wishes).toHaveLength(2);
    expect(one.state.wishes.every((w) => w.createdTick === TICKS_PER_HOUR + 1)).toBe(true);
    expect(one.state.wishes).toEqual(two.state.wishes);
  });
});

describe('expiry and cleanup', () => {
  function oneWish(): { f: HamletFixture; w: Wish; t: WishTemplate; ctx: SimCtx } {
    const f = hamletFixture();
    const t = content.wishById.get('tree-by-my-window')!;
    const r = f.state.residents[0]!;
    const ctx = createTickCtx(f.state);
    const w = makeWish(f.state, ctx, r, t);
    return { f, w, t, ctx };
  }

  it('fades quietly after six days, no penalty', () => {
    const { f, w } = oneWish();
    const r = findById(f.state.residents, w.residentId)!;
    expect(w.expiresTick).toBe(6 * TICKS_PER_DAY);
    const mood = r.mood;
    f.state.tick = w.expiresTick - 1;
    expect(checkWishes(f.state, createTickCtx(f.state))).toEqual([0, 0]);
    f.state.tick = w.expiresTick;
    const ctx = createTickCtx(f.state);
    expect(checkWishes(f.state, ctx)).toEqual([0, 1]);
    expect(events(ctx, 'wish.expired')).toHaveLength(1);
    expect(events(ctx, 'resident.updated')[0]!.r.wishId).toBe(0);
    expect(r.wishId).toBe(0);
    expect(r.mood).toBe(mood);
    expect(r.modifiers).toHaveLength(0);
    expect(f.state.stats.wishesExpired).toBe(1);
  });

  it('drops wishes whose resident or home is gone', () => {
    const { f, w } = oneWish();
    removeById(f.state.residents, w.residentId);
    expect(checkWishes(f.state, createTickCtx(f.state))).toEqual([0, 1]);
    expect(f.state.wishes).toHaveLength(0);
  });

  it('a curious resident adds a postscript with a hint', () => {
    const f = hamletFixture();
    const pippa = f.state.residents.find((r) => r.given === 'Pippa')!;
    const t = content.wishById.get('tree-by-my-window')!;
    const ctx = createTickCtx(f.state);
    const w = makeWish(f.state, ctx, pippa, t);
    tree(f.state, homeOf(f.state, w).x, homeOf(f.state, w).z - 1);
    checkWishes(f.state, ctx);
    const letter = events(ctx, 'notify').find((e) => e.kind === 'letter')!;
    expect(letter.text).toMatch(/P\.S\./);
    // An extra hint: the Well Gathering Place is not among the three the Book shows.
    expect(f.state.hearth.hints).not.toContain('well-gathering-place');
    expect(letter.text).toMatch(/fetch water/);
    expect(letter.text.split('\n')).toHaveLength(3);
    expect(letter.at).toEqual([homeOf(f.state, w).x, homeOf(f.state, w).z]);
  });
});

describe('wish views', () => {
  it('fill names and places and point at the target area', () => {
    const f = hamletFixture();
    const ctx = createTickCtx(f.state);
    const r = f.state.residents[0]!;
    makeWish(f.state, ctx, r, content.wishById.get('somewhere-to-sit')!, undefined, 2);
    const view = events(ctx, 'wish.added')[0]!.w;
    expect(view.text).toBe(
      'Clover would like a bench by the cottage, for sitting, thinking, and sometimes only sitting.',
    );
    expect(view.area).toEqual({ x: 54, z: 49, radius: 4 });
    const lantern = makeWish(
      f.state,
      ctx,
      f.state.residents[1]!,
      content.wishById.get('lantern-on-my-way-home')!,
    );
    const lv = events(ctx, 'wish.added')[1]!.w;
    expect(lv.text).toContain('Hazel');
    expect(lantern.work).toBe(f.b.bakery);
    expect(lv.area!.radius).toBeGreaterThan(2);
    expect(S).toBe(MAP_SIZE);
  });
});

describe('what a wish still wants (playtest round six)', () => {
  it('counts what is near the home and how much of the walk is grass or dark', () => {
    const f = hamletFixture();
    const s = f.state;
    const ctx = createTickCtx(s);
    const r = s.residents.find((x) => x.jobId)!;
    const sit = makeWish(s, ctx, r, content.wishById.get('somewhere-to-sit')!);
    const flowers = makeWish(s, ctx, r, content.wishById.get('flowers-on-the-lane')!);
    const path = makeWish(s, ctx, r, content.wishById.get('a-proper-path')!);
    const lantern = makeWish(s, ctx, r, content.wishById.get('lantern-on-my-way-home')!);
    const home = homeOf(s, sit);
    decor(s, 'flower-bed', home.x - 1, home.z);
    const wants = new Map(wishProgress(s).map((p) => [p.id, p.wants]));
    expect(wants.get(sit.id)).toBe('a bench within 3 steps of the home');
    expect(wants.get(flowers.id)).toBe('1 of 3 flowers within 3 steps of the home');
    if (wants.has(path.id)) expect(wants.get(path.id)).toContain('a path all the way');
    expect(wants.get(lantern.id)).toMatch(/^lanterns along 50% of the walk home from work \(\d+% lit now\)$/);
    // Granted conditions say nothing.
    decor(s, 'bench', home.x - 1, home.z + 1);
    expect(wishProgress(s).some((p) => p.id === sit.id)).toBe(false);
  });
});
