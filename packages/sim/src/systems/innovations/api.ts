// Innovations API (C4.0 contract; C4C owns the measures and conditions). docs/spec/15-progression.md.
import { content, type BuildingDef } from '@qoti/content';
import type { TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { hasInnovation, rankAtLeast } from '../../state/village';
import { innovationView } from '../../view/village';

/**
 * True when a def's `requires` (a rank, an innovation, buildings standing) is met. Sandbox valleys have everything.
 * Checked when a building is placed or grown (C4C).
 */
export function meetsRequires(state: WorldState, req: BuildingDef['requires'] | undefined): boolean {
  if (!req || !isStandard(state)) return true;
  if (req.rank && !rankAtLeast(state, req.rank)) return false;
  if (req.innovation && !hasInnovation(state, req.innovation)) return false;
  return hasBuilt(state, req.built);
}

/** Playtest round six: every [def, count] in `built` has that many standing (built, not sites). */
export function hasBuilt(
  state: WorldState,
  built: readonly (readonly [string, number])[] | undefined,
): boolean {
  if (!built) return true;
  for (const [def, count] of built) {
    let n = 0;
    for (const b of state.buildings) if (b.def === def && b.stage === 'built') n++;
    if (n < count) return false;
  }
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
