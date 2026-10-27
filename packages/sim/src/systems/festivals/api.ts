// Festival API (C5.0 contract; C5B owns festivals). docs/spec/12-hearth.md, Festivals.
import type { TickCtx, WorldState } from '../../contracts';

/** How many recent festivals count toward the Watch's morale. */
export const FESTIVAL_MORALE_SEASONS = 2;

/**
 * The Watch's morale from recent festivals (C5D reads it): -10 to +10, from the stars of the last
 * FESTIVAL_MORALE_SEASONS festivals (3 stars is neutral).
 */
export function festivalMorale(state: WorldState): number {
  const recent = state.festival.history.slice(-FESTIVAL_MORALE_SEASONS);
  if (recent.length === 0) return 0;
  let sum = 0;
  for (const f of recent) sum += f.stars - 3;
  return Math.max(-10, Math.min(10, Math.round((sum * 10) / (2 * recent.length))));
}

/** C5B: puts by the plan's menu from town stock, as far as it goes. Baseline: nothing reserved. */
export function reserveMenu(_state: WorldState, _ctx: TickCtx | null): void {}
