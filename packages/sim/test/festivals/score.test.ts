// C5B: the stars follow the formula (docs/spec/12-hearth.md, Festivals, Outcome). One test per
// factor, each reading its numbers from content (festivalTuning), never pinning them.
import { festivalTuning } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/constants';
import type { FestivalPlan, Rect, WorldState } from '../../src/contracts';
import { attendChance, weatherPermille } from '../../src/systems/festivals/api';
import {
  joyOf,
  menuPart,
  musicPart,
  scoreFestival,
  sitePart,
  starsFor,
  twistPart,
  varietyPart,
} from '../../src/systems/festivals/score';
import { siteRect } from '../../src/systems/festivals/site';
import { addDecorAt } from '../fixtures/seasonsPlace';
import { feastFixture, good } from './helpers';

const T = festivalTuning;
const RECT: Rect = [51, 52, 57, 58];

function setup(): { state: WorldState; plan: FestivalPlan } {
  const { state } = feastFixture(6, 19);
  const plan = state.festival.plan!;
  plan.site = { rect: [...RECT] };
  plan.reserved = [];
  plan.twist = '';
  return { state, plan };
}

function paintCharm(state: WorldState, r: Rect, v: number): void {
  for (let z = r[1]; z <= r[3]; z++) for (let x = r[0]; x <= r[2]; x++) state.map.charm[z * MAP_SIZE + x] = v;
}

describe('festival stars', () => {
  it('site: charm up to the content mark, and a pattern site its bonus', () => {
    const { state, plan } = setup();
    paintCharm(state, RECT, 0);
    expect(sitePart(state, plan, RECT)).toBe(0);
    paintCharm(state, RECT, T.siteCharm / 2);
    expect(sitePart(state, plan, RECT)).toBe(50);
    paintCharm(state, RECT, T.siteCharm);
    expect(sitePart(state, plan, RECT)).toBe(100);
    plan.site = { pattern: 'well-gathering-place', anchor: 52 * MAP_SIZE + 60 };
    const r = siteRect(state, plan.site)!;
    paintCharm(state, r, 0);
    expect(sitePart(state, plan, r)).toBe(T.patternBonus);
  });

  it('variety: distinct festival pieces on the site', () => {
    const { state } = setup();
    expect(varietyPart(state, RECT)).toBe(0);
    addDecorAt(state, 'festival-stall', 52.5, 53.5);
    addDecorAt(state, 'festival-stall', 54.5, 53.5);
    expect(varietyPart(state, RECT)).toBe(Math.round(100 / T.varietyFull));
    addDecorAt(state, 'festival-table', 52.5, 56.5);
    expect(varietyPart(state, RECT)).toBe(Math.round(200 / T.varietyFull));
  });

  it('menu: half variety, half enough for every guest', () => {
    const { plan } = setup();
    expect(menuPart(plan, 10)).toBe(0);
    plan.reserved = [[good('bread'), 10 * T.perGuest]];
    expect(menuPart(plan, 10)).toBe(Math.round(50 / T.menuGoods + 50));
    plan.reserved = [[good('bread'), 5 * T.perGuest]];
    expect(menuPart(plan, 10)).toBe(Math.round(50 / T.menuGoods + 25));
    plan.reserved = Array.from({ length: T.menuGoods }, (_, i) => [i + 3, 20] as [number, number]);
    expect(menuPart(plan, 10)).toBe(100);
  });

  it('music: none, a resident, the bandstand', () => {
    const { state, plan } = setup();
    plan.music = 'none';
    expect(musicPart(state, plan)).toBe(T.music.none);
    plan.music = 'resident';
    plan.musician = state.residents.find((r) => r.traits.includes('artistic'))!.id;
    expect(musicPart(state, plan)).toBe(Math.round(T.music.resident / 2));
    state.stories.find((s) => s.arc === 'musician')!.residentId = plan.musician;
    state.hearth.unlocked.push('festival-music', 'bandstand-green');
    expect(musicPart(state, plan)).toBe(T.music.resident);
    plan.music = 'bandstand';
    plan.musician = 0;
    expect(musicPart(state, plan)).toBe(T.music.bandstand);
  });

  it('twist: its goal held earns the content bonus', () => {
    const { state, plan } = setup();
    plan.twist = 'pie-contest';
    plan.reserved = [[good('pies'), 4]];
    expect(twistPart(state, plan)).toBe(0);
    plan.reserved = [[good('pies'), 10]];
    expect(twistPart(state, plan)).toBe(T.twist);
    plan.twist = '';
    expect(twistPart(state, plan)).toBe(0);
  });

  it('weather: rain thins the crowd, and a thin crowd scores lower', () => {
    const { state, plan } = setup();
    const r = state.residents[0]!;
    r.mood = 100;
    state.weather.today = 'clear';
    expect(attendChance(state, r)).toBe(1000);
    state.weather.today = 'rain';
    const rain = T.weather.find(([k]) => k === 'rain')![1];
    expect(weatherPermille(state)).toBe(rain);
    expect(attendChance(state, r)).toBe(rain);
    r.mood = 0;
    expect(attendChance(state, r)).toBe(Math.trunc((T.moodFloor * rain) / 1000));
    paintCharm(state, RECT, T.siteCharm);
    const full = scoreFestival(state, plan, RECT, 40, 40);
    const half = scoreFestival(state, plan, RECT, 20, 40);
    expect(half.joy.site).toBe(full.joy.site);
    expect(half.score!).toBeLessThan(full.score!);
  });

  it('joy weighs its parts by content and stars follow the thresholds', () => {
    const zero = { site: 0, variety: 0, menu: 0, music: 0, twist: 0 };
    expect(joyOf({ ...zero, site: 100 })).toBe(T.weights.site);
    expect(joyOf({ ...zero, menu: 100 })).toBe(T.weights.menu);
    expect(starsFor(0)).toBe(1);
    T.stars.forEach((s, i) => {
      expect(starsFor(s)).toBe(i + 2);
      expect(starsFor(s - 1)).toBe(i + 1);
    });
  });

  it('a plain Hamlet festival (bread and vegetables on a green) is plannable and earns stars', () => {
    const { state, plan } = setup();
    plan.reserved = [
      [good('bread'), 20],
      [good('vegetables'), 20],
    ];
    paintCharm(state, RECT, T.siteCharm / 2);
    expect(scoreFestival(state, plan, RECT, 40, 40).stars).toBeGreaterThanOrEqual(2);
  });
});
