// Town Gate (C5D): a built gate in a wall run (a wall piece beside it), with at least `lanterns`
// lanterns within `lanternReach` tiles and a dressed stone wall (one wearing a module, C5C) within
// `dressedReach` tiles. Anchored on the gate's tile.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../../../constants';
import type { Building, WorldState } from '../../../../contracts';
import { tileGap2, within } from '../../../../conditions/geo';
import { type Detector, param, type SiteCandidate, taggedIn, tileOf } from '../shared';

const S = MAP_SIZE;

function wallPiece(state: WorldState, tile: number): Building | null {
  const id = state.map.occupant[tile];
  if (!id) return null;
  const b = state.buildings.find((x) => x.id === id);
  return b && b.stage === 'built' && content.buildingById.get(b.def)?.defense?.blocks ? b : null;
}

export const townGate: Detector = (state, def) => {
  const want = param(def, 'lanterns', 2);
  const lanternReach = param(def, 'lanternReach', 2);
  const dressedReach = param(def, 'dressedReach', 3);
  const out: SiteCandidate[] = [];
  for (const g of state.buildings) {
    if (g.stage !== 'built' || content.buildingById.get(g.def)?.defense?.passable !== 'gate') continue;
    const t = g.z * S + g.x;
    const beside = [t - S, t + S, g.x > 0 ? t - 1 : -1, g.x < S - 1 ? t + 1 : -1]
      .filter((n) => n >= 0 && n < S * S)
      .filter((n) => wallPiece(state, n));
    if (beside.length === 0) continue;
    const lanterns = taggedIn(
      state,
      [g.x - lanternReach, g.z - lanternReach, g.x + lanternReach, g.z + lanternReach],
      'lantern',
    )
      .filter((d) => {
        const lt = tileOf(d);
        return within(tileGap2(lt % S, (lt - (lt % S)) / S, [g.x, g.z, g.x, g.z]), lanternReach);
      })
      .map((d) => d.id);
    if (lanterns.length < want) continue;
    const dressed = state.buildings.some(
      (b) =>
        b.stage === 'built' &&
        b.def === 'stone-wall' &&
        (b.rt?.modules?.length ?? 0) > 0 &&
        Math.max(Math.abs(b.x - g.x), Math.abs(b.z - g.z)) <= dressedReach,
    );
    if (!dressed) continue;
    out.push({ anchor: t, members: lanterns, tiles: [t, ...beside] });
  }
  return out;
};
