// Story API (C4.0 contract; C4D owns arrivals, goals and letters). docs/spec/11-residents.md,
// Story characters. storyStep closes the open step (or the arrival), pays its reward and opens the
// next, emitting story.step with the letter to show.
import { content, type Reward } from '@qoti/content';
import { PENNIES_PER_COIN, TICKS_PER_DAY } from '../../constants';
import type { TickCtx, WorldState } from '../../contracts';
import { storyLetter, storyView } from '../../view/village';
import { pay } from '../economy/money';
import { unlockInnovation } from '../innovations/api';
import { addBond, addMoodModifier } from '../residents/api';

/** Pays a story reward: mood and bond to the character, unlocks, innovations, coins from the County. */
export function grantReward(
  state: WorldState,
  ctx: TickCtx | null,
  reward: Reward,
  residentId: number,
): void {
  if (residentId && reward.mood) {
    addMoodModifier(state, residentId, { kind: 'story', value: reward.mood, ticks: 3 * TICKS_PER_DAY });
  }
  if (residentId && reward.bond) addBond(state, residentId, reward.bond, 'other');
  for (const u of reward.unlock ?? []) if (!state.hearth.unlocked.includes(u)) state.hearth.unlocked.push(u);
  for (const i of reward.innovation ?? []) unlockInnovation(state, ctx, i);
  if (reward.coins) pay(state, 'outside', 'treasury', reward.coins * PENNIES_PER_COIN, 'grants');
}

/**
 * Moves an arc on by one: arrival (-1) to step 0, a step to the next, the last step to the finale.
 * The step being closed pays its reward (the finale pays the arc's finale). Returns false when the
 * arc is unknown, has not arrived (no resident yet), or is already finished.
 */
export function storyStep(state: WorldState, ctx: TickCtx | null, arcId: string): boolean {
  const arc = content.storyById.get(arcId);
  const s = state.stories.find((x) => x.arc === arcId);
  if (!arc || !s || !s.residentId) return false;
  const steps = arc.steps.length;
  if (s.step >= steps) return false;
  if (s.step >= 0) {
    const closing = arc.steps[s.step];
    if (closing) grantReward(state, ctx, closing.reward, s.residentId);
  }
  s.step += 1;
  s.stepTick = state.tick;
  if (s.step >= steps) grantReward(state, ctx, arc.finale, s.residentId);
  ctx?.events.push({ e: 'story.step', s: storyView(state, s), letter: storyLetter(state, s, s.step) });
  return true;
}
