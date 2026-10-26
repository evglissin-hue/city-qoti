// Condition DSL evaluator (C3.0 contract; C3B implements it). Wish offers and targets and
// achievements are Conditions (types in @qoti/content). A Binding gives the places a wish was bound
// to; achievements evaluate with an empty binding.
import type { Condition } from '@qoti/content';
import type { EntityId, WorldState } from '../contracts';

export interface Binding {
  residentId?: EntityId;
  home?: EntityId;
  work?: EntityId;
  market?: EntityId;
}

/**
 * Evaluates a condition against the world. Pure: reads state, never writes. C3.0 STUB: false for
 * everything, so no wish is granted and no achievement unlocks until C3B lands.
 */
export function evaluate(_state: WorldState, _cond: Condition, _bind: Binding = {}): boolean {
  return false;
}
