import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MOOD_PRODUCTIVITY, MOOD_TAX, TICKS_PER_DAY } from '../../src/constants';
import { findById } from '../../src/state/entities';
import { moodBand } from '../../src/view/hamlet';
import {
  addBond,
  addMoodModifier,
  moodTaxPercent,
  productivityPercent,
  removeMoodModifier,
} from '../../src/systems/residents/api';
import { settleHousehold } from '../../src/systems/residents/lifecycle';
import {
  computeMood,
  eatBreakfast,
  Need,
  pantryFood,
  updateHouseholdNeeds,
  waterServed,
} from '../../src/systems/residents/needs';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { placeBuilding, resident, runner, ticks, untilHour } from './helpers';

describe('food', () => {
  it('eats one food each at 07:00, the kind eaten least lately first, and books it', () => {
    const f = hamletFixture();
    const ctx = createTickCtx(f.state);
    const h = findById(f.state.households, f.households[0])!;
    const bread = content.goodIndex.get('bread')!;
    const veg = content.goodIndex.get('vegetables')!;
    expect(pantryFood(h)).toBe(6);
    eatBreakfast(f.state, ctx);
    expect(pantryFood(h)).toBe(3);
    // Three meals: bread, then vegetables (eaten less), then bread again.
    expect(h.recentFoods).toEqual([bread, veg, bread]);
    expect(f.state.economy.today.consumed[bread]).toBe(2 + 2 + 2);
    expect(f.state.economy.today.consumed[veg]).toBe(3);
    for (const id of h.members) expect(resident(f.state, id).needs[Need.food]).toBe(90);
    expect(ctx.events.some((e) => e.e === 'household.updated')).toBe(true);
  });

  it('goes hungry on an empty pantry, and gains the variety bonus only with two kinds', () => {
    const f = hamletFixture();
    const ctx = createTickCtx(f.state);
    const h = findById(f.state.households, f.households[0])!;
    h.pantry.fill(0);
    const clover = resident(f.state, h.members[0]!);
    clover.needs[Need.food] = 70;
    eatBreakfast(f.state, ctx);
    expect(clover.needs[Need.food]).toBe(35);
    h.pantry[content.goodIndex.get('fish')!] = 3;
    h.recentFoods = [];
    eatBreakfast(f.state, ctx);
    expect(clover.needs[Need.food]).toBe(80);
  });
});

describe('water, shelter, belonging and beauty', () => {
  it('serves households from the well up to its capacity', () => {
    const f = hamletFixture();
    expect(waterServed(f.state).size).toBe(3);
    // Seven more families of four around the well: 9 + 28 = 37 residents for a well of 30.
    const ctx = createTickCtx(f.state);
    for (let i = 0; i < 7; i++) {
      const home = placeBuilding(f.state, 'cottage', 50 + 3 * i, 55);
      settleHousehold(f.state, ctx, home.id, 'mouse', ['adult', 'adult', 'child', 'child']);
    }
    const served = waterServed(f.state);
    expect(served.size).toBeLessThan(f.state.households.length);
    let n = 0;
    for (const h of f.state.households) if (served.has(h.id)) n += h.members.length;
    expect(n).toBeLessThanOrEqual(30);
  });

  it('moves needs toward their targets each hour and recomputes mood', () => {
    const f = hamletFixture();
    const h = findById(f.state.households, f.households[0])!;
    const hazel = resident(f.state, h.members[1]!);
    hazel.needs[Need.water] = 20;
    hazel.needs[Need.shelter] = 60;
    updateHouseholdNeeds(f.state, h);
    expect(hazel.needs[Need.water]).toBe(40);
    expect(hazel.needs[Need.shelter]).toBe(70);
    // No friends yet: belonging drifts toward 35.
    expect(hazel.needs[Need.belonging]).toBeLessThan(70);
    expect(hazel.mood).toBe(computeMood(f.state, hazel));
  });

  it('finds beauty in charm around the home, with the species nudging it', () => {
    const f = hamletFixture();
    const h = findById(f.state.households, f.households[0])!;
    const clover = resident(f.state, h.members[0]!);
    for (let i = 0; i < 20; i++) updateHouseholdNeeds(f.state, h);
    const plain = clover.needs[Need.beauty]!;
    f.state.map.charm.fill(30);
    for (let i = 0; i < 20; i++) updateHouseholdNeeds(f.state, h);
    expect(clover.needs[Need.beauty]!).toBeGreaterThan(plain + 30);
  });
});

describe('mood', () => {
  it('is the weighted needs plus traits and modifiers, clamped, with bands and effects', () => {
    const f = hamletFixture();
    const clover = resident(f.state, f.residents[0]![0]!); // Cheerful +5
    const wendell = resident(f.state, f.residents[1]![0]!); // Grumpy -5, Practical +5% work
    clover.needs = [100, 100, 100, 100, 100];
    wendell.needs = [100, 100, 100, 100, 100];
    expect(computeMood(f.state, clover)).toBe(100);
    expect(computeMood(f.state, wendell)).toBe(95);
    clover.needs = [50, 50, 50, 50, 50];
    expect(computeMood(f.state, clover)).toBe(55);
    addMoodModifier(f.state, clover.id, { kind: 'wish-granted', value: 15, ticks: 3 * TICKS_PER_DAY });
    expect(computeMood(f.state, clover)).toBe(70);
    removeMoodModifier(f.state, clover.id, 'wish-granted');
    addMoodModifier(f.state, clover.id, { kind: 'lean-times', value: -5, ticks: 0 });
    expect(computeMood(f.state, clover)).toBe(50);
    clover.needs = [0, 0, 0, 0, 0];
    expect(computeMood(f.state, clover)).toBe(0);

    for (const [mood, band] of [
      [10, 0],
      [25, 1],
      [45, 2],
      [65, 3],
      [85, 4],
    ] as const) {
      wendell.mood = mood;
      expect(moodBand(mood)).toBe(band);
      expect(productivityPercent(f.state, wendell.id)).toBe(MOOD_PRODUCTIVITY[band] + 5);
      expect(moodTaxPercent(f.state, wendell.id)).toBe(MOOD_TAX[band]);
    }
  });

  it('decays modifiers linearly and drops them when they run out', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const clover = resident(f.state, f.residents[0]![0]!);
    addMoodModifier(f.state, clover.id, { kind: 'new-friend', value: 5, ticks: 400 });
    ticks(r, 200);
    expect(clover.modifiers.find((m) => m.kind === 'new-friend')!.value).toBe(5);
    // The household's next hourly pass after it ends drops it.
    ticks(r, 420);
    expect(clover.modifiers.some((m) => m.kind === 'new-friend')).toBe(false);
  });

  it('spreads cheer: a Cheerful friend adds 2', () => {
    const f = hamletFixture();
    const hazel = resident(f.state, f.residents[0]![1]!);
    const finn = resident(f.state, f.residents[1]![2]!); // Cheerful
    hazel.needs = [50, 50, 50, 50, 50];
    const before = computeMood(f.state, hazel);
    hazel.friends.push({ id: finn.id, level: 1, points: 12, lastMet: 0 });
    expect(computeMood(f.state, hazel)).toBe(before + 2);
  });

  it('keeps mood steady in a well-run hamlet over two days', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    ticks(r, 2 * TICKS_PER_DAY);
    for (const p of f.state.residents) {
      expect(p.mood, p.given).toBeGreaterThanOrEqual(40);
      expect(p.needs[Need.food], p.given).toBeGreaterThanOrEqual(80);
      expect(p.needs[Need.water], p.given).toBe(100);
    }
  });
});

describe('bonds', () => {
  it('lets wishes raise a bond to three hearts, other sources to five', () => {
    const f = hamletFixture();
    const id = f.residents[0]![0]!;
    addBond(f.state, id, 1);
    addBond(f.state, id, 1);
    addBond(f.state, id, 1);
    expect(resident(f.state, id).bond).toBe(3);
    addBond(f.state, id, 1, 'other');
    expect(resident(f.state, id).bond).toBe(4);
    addBond(f.state, id, -9);
    expect(resident(f.state, id).bond).toBe(0);
  });

  it('loses a heart at the turn of a season while Miserable', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const clover = resident(f.state, f.residents[0]![0]!);
    clover.bond = 2;
    // Day 6 is the first day of the second season.
    ticks(r, 6 * TICKS_PER_DAY - 10);
    clover.needs = [0, 0, 0, 0, 0];
    clover.mood = 5;
    clover.modifiers = [];
    untilHour(r, 6.01);
    expect(clover.bond).toBe(1);
  });
});
