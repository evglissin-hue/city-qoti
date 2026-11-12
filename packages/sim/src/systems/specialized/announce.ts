// Tells the Businesses book when a specialized building's served count may have changed because a
// business in its reach came, went or changed trade (docs/build/r1-wave-notes.md, Events). One walk
// over the buildings, run only at the moment of the change.
import { content } from '@qoti/content';
import type { Building, TickCtx, WorldState } from '../../contracts';
import { businessView } from '../../view/businesses';
import { doorTile } from '../movement/api';
import { withinReach } from './api';

/**
 * `business.updated` for every built specialized building that enables one of `trades` (but, when
 * `onlyOne` is set, not all of them) and whose reach covers the business's door. Call it after the
 * change, so the views carry the new counts. `b` may already be out of `state.buildings`.
 */
export function announceServers(
  state: WorldState,
  ctx: TickCtx,
  b: Building,
  trades: readonly (string | undefined)[],
  onlyOne = false,
): void {
  const list = trades.filter((t): t is string => !!t);
  if (list.length === 0) return;
  const door = doorTile(b);
  for (const sb of state.buildings) {
    if (sb.id === b.id || sb.stage !== 'built') continue;
    const enables = content.buildingById.get(sb.def)?.enables;
    if (!enables?.length) continue;
    const hits = list.filter((t) => enables.includes(t)).length;
    if (hits === 0 || (onlyOne && hits === list.length && list.length > 1)) continue;
    if (withinReach(state, sb, door)) ctx.events.push({ e: 'business.updated', b: businessView(state, sb) });
  }
}
