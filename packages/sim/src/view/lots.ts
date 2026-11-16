// R2 (R2.0): a lot for the client, with the lot fields V3B draws (rows, gardens, corners, storeys).
// R2F owns this file in the wave; V3's lotsFor(mirror) reads what it builds.
import { content } from '@qoti/content';
import type { Lot, LotView, WorldState } from '../contracts';
import { findById } from '../state/entities';

/**
 * A lot for the client. R2 (R2.0): the lot fields V3B draws ride along (`frontage`, `row`, `kind`,
 * `corner`, `frontage2`), and with `state` the storeys of the building grown on it, so the Mirror's
 * lot view carries everything `lotsFor(mirror)` reads.
 */
export function lotView(lot: Lot, state?: WorldState): LotView {
  const view: LotView = {
    id: lot.id,
    zone: content.zoneByValue.get(lot.zone)?.id ?? '',
    x: lot.x,
    z: lot.z,
    w: lot.w,
    d: lot.d,
    rot: lot.rot,
    desirability: lot.desirability,
    style: lot.style,
    buildingId: lot.buildingId,
    frontage: lot.frontage,
    row: lot.row,
    kind: lot.kind,
  };
  if (lot.corner) view.corner = true;
  if (lot.frontage2 !== undefined) view.frontage2 = lot.frontage2;
  if (state && lot.buildingId) {
    const storeys = findById(state.buildings, lot.buildingId)?.storeys;
    if (storeys !== undefined) view.storeys = storeys;
  }
  return view;
}
