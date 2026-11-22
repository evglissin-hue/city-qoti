// R3C part B: festivals and the Town Book: Pilgrims' Rest's guests and renown, specialties as dishes of
// their own, and custom twists. Pages and callings are set by hand.
import { content, festivalTuning } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/constants';
import type { Rect, TownBookPage, WorldState } from '../../src/contracts';
import { attendChance, specialtyDishes } from '../../src/systems/festivals/api';
import { grantFestival } from '../../src/systems/festivals/rewards';
import { menuPart, twistPart } from '../../src/systems/festivals/score';
import { twistOffered, twistsOffered } from '../../src/systems/festivals/twists';
import { createTickCtx } from '../../src/turn';
import { feastFixture, good } from '../festivals/helpers';

function page(s: WorldState, p: Partial<TownBookPage> & Pick<TownBookPage, 'kind' | 'def' | 'name'>): void {
  s.townBook.pages.push({
    id: s.nextId++,
    place: 'site:x:0',
    day: 1,
    seats: [0],
    leaning: 'gardens',
    ...p,
  });
}

describe("Pilgrims' Rest at a festival", () => {
  const def = content.callingById.get('pilgrims-rest')!.festival!;

  it('raises the chance by its permille, and only with the calling', () => {
    const { state } = feastFixture();
    const r = state.residents[0]!;
    const base = attendChance(state, r);
    expect(base).toBeGreaterThan(0);
    state.townBook.callings.push('pilgrims-rest');
    expect(attendChance(state, r)).toBe(Math.trunc((base * (1000 + def.guestsPermille)) / 1000));
    expect(attendChance(state, r)).toBeGreaterThan(base);
    state.townBook.callings = ['garden-village', 'mill-town'];
    expect(attendChance(state, r)).toBe(base);
  });

  it('adds one renown at 2 stars or better, not at 1', () => {
    const grant = (stars: number, calling: boolean): number => {
      const { state } = feastFixture();
      if (calling) state.townBook.callings.push('pilgrims-rest');
      const plan = state.festival.plan!;
      const rect: Rect = [51, 52, 57, 58];
      const before = state.renown.log.length;
      grantFestival(
        state,
        createTickCtx(state),
        plan,
        rect,
        {
          attendance: 3,
          joy: { site: 0, variety: 0, menu: 0, music: 0, twist: 0 },
          stars,
          invited: 3,
          score: 0,
        },
        [],
      );
      return state.renown.log
        .slice(before)
        .filter((e) => e.source === 'calling')
        .reduce((n, e) => n + e.points, 0);
    };
    expect(grant(def.minStars, true)).toBe(def.renown);
    expect(grant(5, true)).toBe(def.renown);
    expect(grant(def.minStars - 1, true)).toBe(0);
    expect(grant(def.minStars, false)).toBe(0);
  });
});

describe('a specialty is a dish of its own', () => {
  it('names the specialty on the menu and lifts the menu part', () => {
    const { state } = feastFixture();
    const plan = state.festival.plan!;
    plan.reserved = [[good('bread'), 5]];
    expect(specialtyDishes(state, plan)).toEqual([]);
    page(state, {
      kind: 'specialty',
      def: 'orchard-path-cider',
      name: 'Orchard Walk Cider',
      good: good('cider'),
    });
    expect(specialtyDishes(state, plan)).toEqual([]);
    plan.reserved = [
      [good('bread'), 5],
      [good('cider'), 5],
    ];
    expect(specialtyDishes(state, plan)).toEqual(['Orchard Walk Cider']);
    // A good reserved at zero is not on the menu.
    plan.reserved = [[good('cider'), 0]];
    expect(specialtyDishes(state, plan)).toEqual([]);
    plan.reserved = [[good('bread'), 5]];
    expect(menuPart(plan, 10, 1)).toBeGreaterThan(menuPart(plan, 10));
    expect(menuPart(plan, 10, 0)).toBe(menuPart(plan, 10));
  });
});

describe('custom twists', () => {
  it('has one per content custom, with a custom and no goal', () => {
    for (const c of content.customs) {
      const t = content.twistById.get(`custom-${c.id}`);
      expect(t, c.id).toBeDefined();
      expect(t!.custom).toBe(c.id);
      expect(t!.goal).toBeUndefined();
      expect(t!.blurb).not.toContain('—');
    }
    expect(content.twists.filter((t) => t.custom !== undefined)).toHaveLength(content.customs.length);
    expect(content.twistById.get('custom-winter-fires')!.seasons).toEqual([3]);
  });

  it('is offered only once its page is found', () => {
    const { state } = feastFixture();
    expect(twistOffered(state, 'custom-market-night')).toBe(false);
    expect(twistsOffered(state)).not.toContain('custom-market-night');
    page(state, { kind: 'custom', def: 'market-night', name: 'Market Night', dayOfSeason: 3 });
    expect(twistOffered(state, 'custom-market-night')).toBe(true);
    expect(twistsOffered(state)).toContain('custom-market-night');
    // Winter fires is for winter only: the fixture is in winter, so a page offers it; a spring tick does not.
    page(state, { kind: 'custom', def: 'winter-fires', name: 'The Winter Fires' });
    expect(twistOffered(state, 'custom-winter-fires')).toBe(true);
  });

  it("holds only when the festival ground covers the custom's place", () => {
    const { state } = feastFixture();
    const plan = state.festival.plan!;
    plan.twist = 'custom-market-night';
    const anchor = 54 * MAP_SIZE + 54;
    page(state, {
      kind: 'custom',
      def: 'market-night',
      name: 'Market Night',
      place: `site:market-cross:${anchor}`,
    });
    const covers: Rect = [51, 52, 57, 58];
    const elsewhere: Rect = [80, 80, 86, 86];
    expect(twistPart(state, plan, covers)).toBe(festivalTuning.twist);
    expect(twistPart(state, plan, elsewhere)).toBe(0);
    expect(twistPart(state, plan)).toBe(0);
    // Another custom's page does not hold this twist.
    plan.twist = 'custom-square-night';
    expect(twistPart(state, plan, covers)).toBe(0);
  });
});
