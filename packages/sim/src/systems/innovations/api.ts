// Innovations API (C4.0 contract; C4C owns the measures and conditions). docs/spec/15-progression.md.
import { content, type RankName } from '@qoti/content';
import type { TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { hasInnovation, rankAtLeast } from '../../state/village';
import { innovationView } from '../../view/village';

/**
 * True when a def's `requires` (a rank, an innovation) is met. Sandbox valleys have everything.
 * Checked when a building is placed or grown (C4C).
 */
export function meetsRequires(
  state: WorldState,
  req: { rank?: RankName; innovation?: string } | undefined,
): boolean {
  if (!req || !isStandard(state)) return true;
  if (req.rank && !rankAtLeast(state, req.rank)) return false;
  if (req.innovation && !hasInnovation(state, req.innovation)) return false;
  return true;
}

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
