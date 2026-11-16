// Never open a gap the town cannot meet (docs/spec/19-evenings.md, Gaps; 15-progression.md): a gap
// that asks for a shop needs one to be had, a gap that asks for a place needs a seat to be had.
import type { GapKind } from '@qoti/content';
import type { WorldState } from '../../contracts';
import { targetAvailable } from '../hearth/wishes/achievable';

/** True when the town has, or can make, what would close a gap of this kind. */
export function gapAchievable(state: WorldState, kind: GapKind): boolean {
  switch (kind) {
    case 'nothingToSell':
      return targetAvailable(state, { buildingTag: 'outlet' });
    case 'nobodyPasses':
    case 'nowhereToGo':
      return targetAvailable(state, { tag: 'seat' });
    default:
      return false;
  }
}
