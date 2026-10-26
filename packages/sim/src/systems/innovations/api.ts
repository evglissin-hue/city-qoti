// Innovations API (C4.0 contract; C4C owns the measures and conditions). docs/spec/15-progression.md.
import { content } from '@qoti/content';
import type { TickCtx, WorldState } from '../../contracts';
import { innovationView } from '../../view/village';

/**
 * Unlocks an innovation now (its condition held, or a story reward completed it): marks it, adds its
 * unlock ids to hearth.unlocked, emits innovation.unlocked. False when unknown or already unlocked.
 */
export function unlockInnovation(state: WorldState, ctx: TickCtx | null, id: string): boolean {
  const s = state.innovations.find((i) => i.id === id);
  const def = content.innovationById.get(id);
  if (!s || !def || s.unlockedTick >= 0) return false;
  s.unlockedTick = state.tick;
  s.progress = 100;
  for (const u of def.unlocks) if (!state.hearth.unlocked.includes(u)) state.hearth.unlocked.push(u);
  ctx?.events.push({ e: 'innovation.unlocked', i: innovationView(state, id) });
  return true;
}
