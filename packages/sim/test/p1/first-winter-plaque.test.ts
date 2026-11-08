// P1 (playtest item 13): the County's letter promises a plaque when the first winter is weathered.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/conditions';
import { createTickCtx } from '../../src/turn';
import { checkAchievements } from '../../src/systems/achievements';
import { winterFixture } from '../fixtures/winter';

describe('The First Winter plaque', () => {
  const cond = content.achievementById.get('the-first-winter')!.condition;
  const trial = (charter: string, status: 'upcoming' | 'running' | 'passed' | 'failed') => ({
    kind: 'winter' as const,
    charter,
    season: 3 as const,
    year: 0,
    status,
    measured: [] as [string, number][],
  });

  it('holds only once the Village trial has passed', () => {
    const { state } = winterFixture();
    for (const status of ['upcoming', 'running', 'failed'] as const) {
      state.trial = trial('village', status);
      expect(evaluate(state, cond), status).toBe(false);
    }
    state.trial = null;
    expect(evaluate(state, cond)).toBe(false);
    state.trial = trial('village', 'passed');
    expect(evaluate(state, cond)).toBe(true);
    // Another Charter's trial does not count.
    state.trial = trial('town', 'passed');
    expect(evaluate(state, cond)).toBe(false);
  });

  it('is earned by the check that follows the sealing', () => {
    const { state } = winterFixture();
    state.trial = trial('village', 'passed');
    expect(checkAchievements(state, createTickCtx(state))).toContain('the-first-winter');
  });
});
