// Growth API (C4.0 contract; C4B owns it). docs/spec/13-ledger.md, Zoning and growth.
// growLot starts a grown construction site on an empty lot. Grown sites cost the town nothing up
// front (the household or business that moves in pays its way); builders and porters treat them
// like any other site. C4B decides when and what; C4E draws them by `style`.
import { content, type BuildingDef } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, EntityId, Lot, TickCtx, WorldState } from '../../contracts';
import { canPlaceBuilding } from '../../rules/building';
import { entranceTiles, footprintSize } from '../../rules/footprint';
import { findById } from '../../state/entities';
import { insertBuilding } from '../../state/place';
import { worldIndex } from '../../state/worldIndex';
import { lotView } from '../../view/village';
import { mix } from './desirability';

/**
 * Where `def` stands on the lot: flush with the road side, its door onto road, and when it is
 * narrower than the lot, set along the frontage by the lot's own hash (some houses keep a side
 * garden, some sit in the middle). Null when it does not fit or the ground says no.
 */
export function lotPlacement(state: WorldState, lot: Lot, def: BuildingDef): [x: number, z: number] | null {
  const [fw, fd] = footprintSize(def, lot.rot);
  if (fw > lot.w || fd > lot.d) return null;
  const alongX = lot.rot % 2 === 0;
  // The fixed coordinate puts the front wall on the road side of the lot.
  const fixed =
    lot.rot === 2 ? lot.z : lot.rot === 0 ? lot.z + lot.d - fd : lot.rot === 1 ? lot.x : lot.x + lot.w - fw;
  const slack = alongX ? lot.w - fw : lot.d - fd;
  const start = slack > 0 ? mix(lot.id, 11) % (slack + 1) : 0;
  const reader = worldIndex(state).reader;
  for (let k = 0; k <= slack; k++) {
    const off = (start + k) % (slack + 1);
    const x = alongX ? lot.x + off : fixed;
    const z = alongX ? fixed : lot.z + off;
    const { front } = entranceTiles(def, x, z, lot.rot);
    if (!state.map.road[front[1] * MAP_SIZE + front[0]]) continue;
    if (canPlaceBuilding(reader, def, x, z, lot.rot).ok) return [x, z];
  }
  return null;
}

/**
 * Grows `defId` on the lot, facing its road, in its style (or `style`). Returns the new building,
 * or null when the lot is taken, the def does not fit the lot, or the ground says no.
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
  const at = lotPlacement(state, lot, def);
  if (!at) return null;
  const b = insertBuilding(state, ctx, def, at[0], at[1], lot.rot, 0, {
    lot: lot.id,
    style: style ?? lot.style,
  });
  lot.buildingId = b.id;
  if (style) lot.style = style;
  ctx?.events.push({ e: 'lot.updated', l: lotView(lot) });
  return b;
}
