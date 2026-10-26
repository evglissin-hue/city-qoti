// Story arcs (C4D): each arc can be completed in the village fixture, from arrival to finale, with
// every letter rendered from content (deterministic text, {town} filled in), rewards paid and the
// money invariant kept. Goals are met by changing the fixture directly (a sawpit by the river, a
// request resolved, lanterns by the door), then advanceStories runs as the hourly pass would. The
// school and the Trading Post are stand-in defs until C4C's buildings land.
import { content, type StoryArc } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { ResidentFlags, TICKS_PER_DAY } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { unlockInnovation } from '../../src/systems/innovations/api';
import { morningPass } from '../../src/systems/residents/lifecycle';
import { advanceStories, SETTLE_TICKS, STEP_GAP, stories } from '../../src/systems/stories';
import { createTickCtx, type SimCtx } from '../../src/turn';
import { villageFixture, type VillageFixture } from '../fixtures/village';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import {
  eventsOf,
  exec,
  placeDecorNear,
  placeTest,
  resident,
  skip,
  skipToHour,
  testDef,
  withTestBuilding,
} from './helpers';

interface Scene {
  f: VillageFixture;
  s: WorldState;
  ctx: SimCtx;
  /** The character's home. */
  home: () => { x: number; z: number };
}

const fill = (s: WorldState, text: string) => text.split('{town}').join(s.settings.townName);

/** What the town does to meet each step's goal, in order. */
const SATISFY: Record<string, ((t: Scene) => void)[]> = {
  inventor: [
    ({ s }) => {
      s.economy.everProduced[content.goodIndex.get('bread')!] = 40;
    },
    ({ s, home }) => {
      expect(placeDecorNear(s, 'lantern', home().x, home().z, 2)).toBe(true);
    },
    ({ s }) => {
      insertBuilding(s, null, content.buildingById.get('sawpit')!, 97, 60, 0, 0, { site: false });
    },
    ({ s }) => {
      insertBuilding(s, null, content.buildingById.get('woodcutter')!, 110, 60, 0, 0, { site: false });
      insertBuilding(s, null, content.buildingById.get('windmill')!, 110, 64, 0, 0, { site: false });
    },
    ({ s, ctx }) => {
      unlockInnovation(s, ctx, 'wheelbarrows');
    },
  ],
  merchant: [
    () => {
      // The fixture's stalls already hold bread, vegetables, fish, cheese and firewood.
    },
    ({ f, s }) => {
      expect(exec(s, { t: 'request.resolve', id: f.request, status: 'done' })).toBe(true);
    },
    ({ s }) => {
      expect(placeDecorNear(s, 'bench', 77, 51, 1)).toBe(true);
      expect(placeDecorNear(s, 'flower-bed', 77, 52, 1)).toBe(true);
      expect(placeDecorNear(s, 'flower-bed', 77, 52, 1)).toBe(true);
    },
    () => {
      // The fixture is a village already.
    },
    ({ s }) => {
      placeTest(s, content.buildingById.get('test-post')!, 110, 70);
    },
    () => {
      // The fixture has a standing order for planks.
    },
  ],
  musician: [
    ({ s, home }) => {
      const { x, z } = home();
      for (let dz = -5; dz <= 6; dz++)
        for (let dx = -5; dx <= 6; dx++) s.map.charm[(z + dz) * 192 + x + dx] = 40;
    },
    ({ f, s }) => {
      expect(exec(s, { t: 'plan.approve', id: f.plan }, 1)).toBe(true);
    },
    ({ s }) => {
      s.village.weddings = 1;
    },
    ({ s }) => {
      discover(s, 4);
    },
    ({ s, home }) => {
      for (let i = 0; i < 4; i++) expect(placeDecorNear(s, 'lantern', home().x, home().z, 4)).toBe(true);
    },
  ],
};

/** A second vacant home (the fixture has one, the grown cottage), east of the river. */
function spareHome(s: WorldState): void {
  insertBuilding(s, null, content.buildingById.get('cottage')!, 110, 80, 0, 0, { site: false });
}

function discover(s: WorldState, n: number): void {
  for (const p of content.patterns) {
    if (s.hearth.discovered.length >= n) return;
    if (s.hearth.discovered.some((d) => d.pattern === p.id)) continue;
    s.hearth.discovered.push({ pattern: p.id, tick: s.tick, seat: 0, together: false, anchor: 0 });
  }
}

/** Only `arc` is still to come: the others count as told already. */
function only(s: WorldState, arc: string): void {
  for (const st of s.stories) {
    if (st.arc === arc) continue;
    st.residentId = 999_999;
    st.step = content.storyById.get(st.arc)!.steps.length;
  }
}

function lettersOf(ctx: SimCtx) {
  return eventsOf(ctx.events, 'story.step').map((e) => e.letter);
}

describe('story arcs', () => {
  it('ships three arcs of four to six steps, with the inventor first (the Water Wheel names arc 0)', () => {
    expect(content.stories.map((a) => a.id)).toEqual(['inventor', 'merchant', 'musician']);
    for (const a of content.stories) {
      expect(a.steps.length, a.id).toBeGreaterThanOrEqual(4);
      expect(a.steps.length, a.id).toBeLessThanOrEqual(6);
    }
    expect(SATISFY.inventor).toHaveLength(content.storyById.get('inventor')!.steps.length);
  });

  for (const arc of content.stories as StoryArc[]) {
    const who = `${arc.character.given} ${arc.character.family}`;
    it(`${who}: arrives, writes every letter and reaches the finale`, () => {
      const restore = withTestBuilding(testDef('test-post', ['trading-post']));
      try {
        const f = villageFixture();
        const s = f.state;
        only(s, arc.id);
        discover(s, 2);
        spareHome(s);
        const ctx = createTickCtx(s);
        const before = moneySnapshot(s);
        const st = s.stories.find((x) => x.arc === arc.id)!;
        const home = () => {
          const r = resident(s, st.residentId);
          const b = findById(s.buildings, findById(s.households, r.householdId)!.homeId)!;
          return { x: b.x, z: b.z };
        };
        const scene: Scene = { f, s, ctx, home };
        skipToHour(s, 10);

        // Arrival: a household of one, marked as a story character, and the hello letter.
        expect(advanceStories(s, ctx)).toBe(arc.id);
        const r = resident(s, st.residentId);
        expect(r.given).toBe(arc.character.given);
        expect(r.family).toBe(arc.character.family);
        expect(r.species).toBe(arc.character.species);
        expect(r.traits).toEqual(arc.character.traits);
        expect(r.story).toBe(arc.id);
        expect(r.flags & ResidentFlags.story).toBeTruthy();
        expect(findById(s.households, r.householdId)!.members).toEqual([r.id]);
        expect(s.chronicle.some((c) => c.kind === 'story-arrived' && c.text.includes(who))).toBe(true);
        expect(lettersOf(ctx).at(-1)).toMatchObject({ step: -1, text: fill(s, arc.hello), from: who });

        // A few hours later the first step opens.
        expect(advanceStories(s, ctx)).toBeNull();
        skip(s, SETTLE_TICKS);
        expect(advanceStories(s, ctx)).toBe(arc.id);
        expect(st.step).toBe(0);
        expect(lettersOf(ctx).at(-1)!.text).toBe(fill(s, arc.steps[0]!.letter));

        arc.steps.forEach((step, i) => {
          SATISFY[arc.id]![i]!(scene);
          // Never two letters back to back, even when the goal is already met.
          expect(advanceStories(s, ctx)).toBeNull();
          skip(s, STEP_GAP);
          expect(advanceStories(s, ctx), `${arc.id} step ${i}`).toBe(arc.id);
          expect(st.step).toBe(i + 1);
          const next = i + 1 < arc.steps.length ? arc.steps[i + 1]!.letter : arc.finale.letter;
          expect(lettersOf(ctx).at(-1)!.text).toBe(fill(s, next));
          for (const u of step.reward.unlock ?? []) expect(s.hearth.unlocked).toContain(u);
          for (const id of step.reward.innovation ?? []) {
            expect(s.innovations.find((x) => x.id === id)!.unlockedTick).toBeGreaterThanOrEqual(0);
          }
        });
        for (const u of arc.finale.unlock ?? []) expect(s.hearth.unlocked).toContain(u);
        expect(s.chronicle.some((c) => c.kind === 'story-finale' && c.text.includes(who))).toBe(true);
        expect(r.bond).toBeGreaterThanOrEqual(3);
        expect(lettersOf(ctx)).toHaveLength(arc.steps.length + 2);
        for (const l of lettersOf(ctx)) expect(l.text).not.toMatch(/\{\w+\}/);
        // Finished: nothing more to send.
        skip(s, STEP_GAP);
        expect(advanceStories(s, ctx)).toBeNull();
        expectMoneyInvariant(before, s);
      } finally {
        restore();
      }
    });
  }

  it('waits for a vacant home, sends one letter an hour, and only by day', () => {
    const f = villageFixture();
    const s = f.state;
    // One vacant home is not enough: characters never take the last one.
    s.households.push({
      id: s.nextId++,
      family: 'Lodger',
      members: [],
      homeId: f.b.grown,
      pantry: s.households[0]!.pantry.map(() => 0),
      recentFoods: [],
      savings: 0,
      tier: 'settler',
      arrivedDay: 0,
      lowMoodDays: 0,
    });
    const ctx = createTickCtx(s);
    skipToHour(s, 10);
    expect(advanceStories(s, ctx)).toBeNull();
    s.households.pop();
    spareHome(s);
    // The hourly pass at night does nothing; by day the inventor arrives, alone.
    skipToHour(s, 23);
    stories.tick(s, ctx);
    expect(s.stories.every((x) => x.residentId === 0)).toBe(true);
    skipToHour(s, 9);
    stories.tick(s, ctx);
    expect(s.stories.filter((x) => x.residentId !== 0).map((x) => x.arc)).toEqual(['inventor']);
    expect(eventsOf(ctx.events, 'story.step')).toHaveLength(1);
  });

  it('story characters never leave, however glum', () => {
    const f = villageFixture();
    const s = f.state;
    only(s, 'inventor');
    spareHome(s);
    const ctx = createTickCtx(s);
    skipToHour(s, 10);
    advanceStories(s, ctx);
    const r = resident(s, s.stories.find((x) => x.arc === 'inventor')!.residentId);
    for (let d = 0; d < 5; d++) {
      r.mood = 2;
      skip(s, TICKS_PER_DAY);
      morningPass(s);
    }
    expect(r.flags & ResidentFlags.leaving).toBe(0);
  });
});
