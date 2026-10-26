// Growth API (C4.0 contract; C4B owns it). docs/spec/13-ledger.md, Zoning and growth.
// growLot starts a grown construction site on an empty lot. Grown sites cost the town nothing up
// front (the household or business that moves in pays its way); builders and porters treat them
// like any other site. C4B decides when and what; C4E draws them by `style`.
import { content } from '@qoti/content';
import type { Building, EntityId, TickCtx, WorldState } from '../../contracts';
import { canPlaceBuilding } from '../../rules/building';
import { findById } from '../../state/entities';
import { insertBuilding } from '../../state/place';
import { worldIndex } from '../../state/worldIndex';
import { lotView } from '../../view/village';

/**
 * Grows `defId` on the lot, at the lot's corner and rotation, in its style (or `style`). Returns the
 * new building, or null when the lot is taken, the def does not fit the lot, or the ground says no.
 */
export function growLot(
  state: WorldState,
  ctx: TickCtx | null,
  lotId: EntityId,
  defId: string,
  style?: string,
): Building | null {
  const lot = findById(state.lots, lotId);
  const def = content.buildingById.get(defId);
  if (!lot || !def || lot.buildingId) return null;
  const [w, d] = lot.rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
  if (w > lot.w || d > lot.d) return null;
  if (!canPlaceBuilding(worldIndex(state).reader, def, lot.x, lot.z, lot.rot).ok) return null;
  const b = insertBuilding(state, ctx, def, lot.x, lot.z, lot.rot, 0, {
    lot: lot.id,
    style: style ?? lot.style,
  });
  lot.buildingId = b.id;
  if (style) lot.style = style;
  ctx?.events.push({ e: 'lot.updated', l: lotView(lot) });
  return b;
}
