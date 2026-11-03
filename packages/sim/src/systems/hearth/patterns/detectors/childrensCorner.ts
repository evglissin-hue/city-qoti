// Children's Corner (C5C): a play piece (tag 'play') within `sight` (8) tiles of `homes` (3) or
// more homes where children live, with a bench within `benchReach` (3) tiles of it for the
// grown-ups. Play pieces within 3 tiles of a corner already found belong to it. Anchored on the
// first play piece's tile; members are the play pieces and benches.
import { MAP_SIZE } from '../../../../constants';
import { buildingRect, rectGap2, within } from '../../../../conditions/geo';
import type { EntityId, Rect } from '../../../../contracts';
import { findById } from '../../../../state/entities';
import { dist2, type Detector, param, type SiteCandidate, tagged, tileOf } from '../shared';

const S = MAP_SIZE;

export const childrensCorner: Detector = (state, def) => {
  const needHomes = param(def, 'homes', 3);
  const sight = param(def, 'sight', 8);
  const benchReach = param(def, 'benchReach', 3);
  const play = tagged(state, 'play');
  if (play.length === 0) return [];
  const homes: Rect[] = [];
  const seen = new Set<number>();
  for (const h of state.households) {
    if (seen.has(h.homeId)) continue;
    const child = h.members.some((id) => findById(state.residents, id)?.stage === 'child');
    const home = child ? findById(state.buildings, h.homeId) : undefined;
    if (!home || home.stage !== 'built') continue;
    seen.add(h.homeId);
    homes.push(buildingRect(home));
  }
  if (homes.length < needHomes) return [];
  const benches = tagged(state, 'bench');
  const out: SiteCandidate[] = [];
  const used = new Set<EntityId>();
  for (const p of play) {
    if (used.has(p.id)) continue;
    const t = tileOf(p);
    const x = t % S;
    const z = (t - x) / S;
    let seenBy = 0;
    for (const r of homes) if (within(rectGap2(r, [x, z, x, z]), sight)) seenBy++;
    if (seenBy < needHomes) continue;
    const seats = benches.filter(
      (b) => dist2(b.fx, b.fz, p.fx, p.fz) <= benchReach * benchReach + benchReach,
    );
    if (seats.length === 0) continue;
    const pieces = play.filter((q) => !used.has(q.id) && dist2(q.fx, q.fz, p.fx, p.fz) <= 12);
    for (const q of pieces) used.add(q.id);
    out.push({ anchor: t, members: [...pieces.map((q) => q.id), ...seats.map((b) => b.id)], tiles: [] });
  }
  return out;
};
