// Growth API (C4.0 contract; C4B owns it). docs/spec/13-ledger.md, Zoning and growth.
// growLot starts a grown construction site on an empty lot. Grown sites cost the town nothing up
// front (the household or business that moves in pays its way); builders and porters treat them
// like any other site. C4B decides when and what; C4E draws them by `style`.
import { content, type BuildingDef } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, EntityId, Lot, TickCtx, WorldState } from '../../contracts';
import { canPlaceBuilding } from '../../rules/building';
import { entranceTiles, footprintSize } from '../../rules/footprint';
import { doorFront } from '../../rules/reach';
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
    if (!canPlaceBuilding(reader, def, x, z, lot.rot).ok) continue;
    if (coversDoor(state, x, z, fw, fd)) continue;
    return [x, z];
  }
  return null;
}

/**
 * R1X: true when a footprint at x, z (fw by fd tiles) would stand on the step in front of a
 * neighbor's door. A garden bed whose door faced the lots behind it was walled in by the farmstead
 * that grew there, and its site waited forever (the audit's site-cut-off on birch). Only the
 * buildings touching the footprint's edge can have their step inside it.
 */
function coversDoor(state: WorldState, x: number, z: number, fw: number, fd: number): boolean {
  const reader = worldIndex(state).reader;
  const S = MAP_SIZE;
  const seen: number[] = [];
  const near = (nx: number, nz: number): boolean => {
    if (nx < 0 || nz < 0 || nx >= S || nz >= S) return false;
    const id = reader.occupant(nx, nz);
    if (!id || seen.includes(id)) return false;
    seen.push(id);
    const b = findById(state.buildings, id);
    // Walls, fences and gates have no step of their own to keep clear.
    if (!b || content.buildingById.get(b.def)?.defense) return false;
    const step = doorFront(b);
    const sx = step % S;
    const sz = (step - sx) / S;
    return sx >= x && sx < x + fw && sz >= z && sz < z + fd;
  };
  for (let k = 0; k < fw; k++) if (near(x + k, z - 1) || near(x + k, z + fd)) return true;
  for (let k = 0; k < fd; k++) if (near(x - 1, z + k) || near(x + fw, z + k)) return true;
  return false;
}

/**
 * Grows `defId` on the lot, facing its road, in its style (or `style`); R1: a business of `trade`. Returns the new building,
 * or null when the lot is taken, the def does not fit the lot, or the ground says no.
 */
export function growLot(
  state: WorldState,
  ctx: TickCtx | null,
  lotId: EntityId,
  defId: string,
  style?: string,
  trade?: string,
): Building | null {
  const lot = findById(state.lots, lotId);
  const def = content.buildingById.get(defId);
  if (!lot || !def || lot.buildingId) return null;
  const at = lotPlacement(state, lot, def);
  if (!at) return null;
  const b = insertBuilding(state, ctx, def, at[0], at[1], lot.rot, 0, {
    lot: lot.id,
    style: style ?? lot.style,
    ...(trade !== undefined && { trade }),
  });
  lot.buildingId = b.id;
  if (style) lot.style = style;
  ctx?.events.push({ e: 'lot.updated', l: lotView(lot) });
  return b;
}
