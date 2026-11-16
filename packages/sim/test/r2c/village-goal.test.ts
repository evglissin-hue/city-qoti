// The Village Charter's evening goal (docs/spec/15-progression.md, [R2]: half the grown-ups out on three
// fair evenings) and its counter. R2A's 17:00 roll is a stand-in on R2C's branch (nobody goes out), so
// the harness plays it: each evening it rolls the tally as R2A does, then runs the gaps pass, which
// keeps the count the goal reads. The goal counts fair evenings only (R2X: whole, not running).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { countOf } from '../../src/conditions';
import { refreshCharter } from '../../src/systems/charter';
import { hamletFixture } from '../fixtures/hamlet';
import { newCtx, night } from './harness';

const goal = content.charterById.get('village')!.goals.find((g) => g.id === 'evenings')!;

describe("the Village's evening goal", () => {
  it('is on the Village Charter, measured by eveningsHalfOut, target 3', () => {
    expect(goal).toBeDefined();
    expect(goal.measure.what).toBe('eveningsHalfOut');
    expect(goal.target).toBe(3);
    expect(goal.text).not.toMatch(/—/);
  });

  it('counts fair evenings with half the grown-ups out, holds on rain, storm and a thin evening', () => {
    const s = hamletFixture().state;
    expect(s.charter.rank).toBe('hamlet');
    const ctx = newCtx(s);
    const progress = () => {
      refreshCharter(s, null);
      return s.charter.progress[content.charterById.get('village')!.goals.indexOf(goal)];
    };
    expect(progress()).toBe(0);
    night(s, ctx, { day: 1, grownups: 20, out: 10 });
    night(s, ctx, { day: 2, grownups: 20, out: 18, weather: 'rain' });
    night(s, ctx, { day: 3, grownups: 20, out: 0, weather: 'storm' });
    night(s, ctx, { day: 4, grownups: 20, out: 12 });
    expect(countOf(s, 'eveningsHalfOut')).toBe(2);
    expect(progress()).toBe(2);
    // A fair evening below half breaks R2C's run, but not the goal's count (R2X).
    night(s, ctx, { day: 5, grownups: 20, out: 9 });
    expect(countOf(s, 'eveningsOut')).toBe(0);
    expect(progress()).toBe(2);
    night(s, ctx, { day: 6, grownups: 20, out: 11 });
    expect(progress()).toBe(3);
  });

  it('counts nothing while no evening happens (the stand-ins: nobody goes out)', () => {
    const s = hamletFixture().state;
    const ctx = newCtx(s);
    for (const day of [1, 2, 3, 4]) night(s, ctx, { day, noEvening: true });
    expect(countOf(s, 'eveningsHalfOut')).toBe(0);
  });
});
