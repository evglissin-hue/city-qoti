// The fourth gap's two audit rules (R3A; docs/spec/22-quality.md, Playability [R3]): whether the town
// can meet a place short of supplies at all (`gap-unmeetable`), and whether some command could close
// one where it stands (`gap-dead-end`). api.ts's supplyGapAchievable and supplyGapClosable call these.
import type { Gap, WorldState } from '../../contracts';

/** What its pieces draw can be made here or bought from a neighbor under some carrier rule. */
export function shortGapAchievable(_state: WorldState): boolean {
  // R3A skeleton: Executor D writes it.
  return false;
}

/**
 * Some command could close it where it stands: a lot where a maker of the good could grow with its
 * raw good in reach, a carrier rule or the places switch, a lower reserve, a priority.
 */
export function shortGapClosable(_state: WorldState, _gap: Gap): boolean {
  // R3A skeleton: Executor D writes it.
  return true;
}

/** The fourth gap's words beside {place} and {n}: the good's name, how often, and what the town makes a day. */
export function shortGapWords(_state: WorldState, _gap: Gap): { good: string; when: string; makes: number } {
  // R3A skeleton: Executor D writes it.
  return { good: 'supplies', when: '', makes: 0 };
}
