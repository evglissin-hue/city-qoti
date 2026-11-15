// R1D: the garden bed (docs/spec/12-hearth.md, The Pattern Book). It gives a home's household
// vegetables as a flavor through the growing seasons (variety, never volume), counts for the
// Kitchen Garden and for A Garden Plot, and a bed far from home gives nothing.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/conditions';
import type { Household, WorldState } from '../../src/contracts';
import { gardenFlavors } from '../../src/systems/hearth/garden';
import { runPatterns } from '../../src/systems/hearth/patterns/engine';
import { eatBreakfast, Need, pantryFood } from '../../src/systems/residents/needs';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { tickAt } from '../fixtures/seasonsPlace';
import { build, colRun, plot, S, standardWorld } from '../hearth/helpers';

const BREAD = content.goodIndex.get('bread')!;
const VEG = content.goodIndex.get('vegetables')!;

function setup() {
  const f = hamletFixture();
  const s = f.state;
  const home = s.buildings.find((b) => b.id === f.b.cottages[0])!;
  const h = s.households.find((x) => x.homeId === home.id)!;
  return { s, home, h };
}

/** Breakfast for a household with only bread in the pantry; the food need of its first member after. */
function breakfast(s: WorldState, h: Household): number {
  h.pantry.fill(0);
  h.pantry[BREAD] = 20;
  h.recentFoods = [BREAD, BREAD];
  eatBreakfast(s, createTickCtx(s));
  return s.residents.find((r) => r.id === h.members[0])!.needs[Need.food]!;
}

describe('the garden bed', () => {
  it('is a Hearth piece that costs timber and makes nothing', () => {
    const def = content.buildingById.get('garden-bed')!;
    expect(def.lane).toBe('hearth');
    expect(def.cost).toEqual({ goods: [['timber', 4]] });
    expect(def.methods).toBeUndefined();
    expect(def.jobs).toBeUndefined();
    expect(def.grows).toBeUndefined();
  });

  it('gives the home vegetables as variety in spring, summer and autumn, but not winter', () => {
    const { s, home, h } = setup();
    plot(s, home.x, home.z - 4);
    for (const [season, flavored] of [
      [0, true],
      [1, true],
      [2, true],
      [3, false],
    ] as const) {
      s.tick = tickAt(0, season, 3, 7);
      expect(gardenFlavors(s, h), `season ${season}`).toEqual(flavored ? [VEG] : []);
    }
  });

  it('lifts the breakfast variety bonus in spring and not in winter, and adds no food', () => {
    const { s, home, h } = setup();
    s.tick = tickAt(0, 0, 3, 7);
    expect(breakfast(s, h)).toBe(80);
    plot(s, home.x, home.z - 4);
    expect(breakfast(s, h)).toBe(90);
    s.tick = tickAt(0, 3, 3, 7);
    expect(breakfast(s, h)).toBe(80);
    // The pantry only ever shrinks at breakfast, and no vegetables appear in it.
    s.tick = tickAt(0, 0, 3, 7);
    h.pantry.fill(0);
    h.pantry[BREAD] = 20;
    const before = pantryFood(h);
    eatBreakfast(s, createTickCtx(s));
    expect(pantryFood(h)).toBeLessThanOrEqual(before);
    expect(h.pantry[VEG] ?? 0).toBe(0);
  });

  it('gives a home far from the bed, or a bed still under construction, nothing', () => {
    const { s, home, h } = setup();
    s.tick = tickAt(0, 1, 3, 7);
    plot(s, home.x, home.z + 30);
    expect(gardenFlavors(s, h)).toEqual([]);
    const near = plot(s, home.x, home.z - 4);
    near.stage = 'construction';
    expect(gardenFlavors(s, h)).toEqual([]);
    near.stage = 'built';
    expect(gardenFlavors(s, h)).toEqual([VEG]);
  });

  it('makes the Kitchen Garden page with a second bed and a fence', () => {
    const w = standardWorld();
    const home = build(w, 'cottage', 160, 80);
    const found = () => w.hearth.sites.find((x) => x.pattern === 'kitchen-garden');
    plot(w, 163, 80);
    colRun(w, 'fence', 166, 80, 81);
    runPatterns(w, createTickCtx(w));
    expect(found()).toBeUndefined();
    plot(w, 160, 83);
    runPatterns(w, createTickCtx(w));
    expect(found()?.anchor).toBe(home.z * S + home.x);
  });

  it('grants A Garden Plot from a bed within three tiles of home, and not from one farther off', () => {
    const { s, home } = setup();
    const target = content.wishes.find((w) => w.id === 'a-garden-plot')!.target;
    const bind = { home: home.id };
    expect(evaluate(s, target, bind)).toBe(false);
    plot(s, home.x, home.z - 12);
    expect(evaluate(s, target, bind)).toBe(false);
    plot(s, home.x, home.z - 4);
    expect(evaluate(s, target, bind)).toBe(true);
  });
});
