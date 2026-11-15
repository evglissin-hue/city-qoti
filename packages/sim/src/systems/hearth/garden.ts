// The garden bed's flavor (docs/spec/12-hearth.md, The Pattern Book): a built garden bed within 3
// tiles of a home gives that home's household vegetables as a flavor through the growing seasons
// (spring, summer, autumn). Variety, not volume: it adds no food to any pantry. The variety bonus at
// breakfast reads it (systems/residents/needs.ts); R1A's household variety reads it too.
import { content } from '@qoti/content';
import type { Household, WorldState } from '../../contracts';
import { buildingRect, rectGap2, within } from '../../conditions/geo';
import { seasonAt } from '../../state/seasons';

/** Tiles from a home a garden bed may stand and still be its garden. */
export const GARDEN_BED_REACH = 3;
const WINTER = 3;
let vegetables: number | undefined;

/** Good indexes a household's garden gives it as flavors today: [vegetables], or none. */
export function gardenFlavors(state: WorldState, household: Household): number[] {
  if (seasonAt(state.tick).season === WINTER || !household.homeId) return [];
  vegetables ??= content.goodIndex.get('vegetables');
  if (vegetables === undefined) return [];
  const home = state.buildings.find((b) => b.id === household.homeId);
  if (!home || home.stage !== 'built') return [];
  const r = buildingRect(home);
  for (const b of state.buildings) {
    if (b.stage !== 'built' || b.def !== 'garden-bed') continue;
    if (within(rectGap2(buildingRect(b), r), GARDEN_BED_REACH)) return [vegetables];
  }
  return [];
}
