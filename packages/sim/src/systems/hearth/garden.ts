// The garden bed's flavor (docs/spec/12-hearth.md, The Pattern Book): a built garden bed within 3
// tiles of a home gives that home's household vegetables as a flavor through the growing seasons
// (spring, summer, autumn). Variety, not volume: it adds no food to any pantry. The variety bonus at
// breakfast reads it (systems/residents/needs.ts); R1A's household variety reads it too.
import { content } from '@qoti/content';
import type { Building, Household, WorldState } from '../../contracts';
import { buildingRect, rectGap2, within } from '../../conditions/geo';
import { seasonAt } from '../../state/seasons';

/** Tiles from a home a garden bed may stand and still be its garden. */
export const GARDEN_BED_REACH = 3;
const WINTER = 3;
let vegetables: number | undefined;

/** Anything that stands on the map: a Building, or the client's BuildingView. */
type Placed = Pick<Building, 'x' | 'z' | 'rot' | 'def'>;

/**
 * P3A: true when a garden bed stands within reach of a home. The one rule: gardenFlavors reads it,
 * and so does the inspector's line on which family's supper a bed feeds.
 */
export function gardenBedReaches(bed: Placed, home: Placed): boolean {
  return within(rectGap2(buildingRect(bed), buildingRect(home)), GARDEN_BED_REACH);
}

/** Good indexes a household's garden gives it as flavors today: [vegetables], or none. */
export function gardenFlavors(state: WorldState, household: Household): number[] {
  if (seasonAt(state.tick).season === WINTER || !household.homeId) return [];
  vegetables ??= content.goodIndex.get('vegetables');
  if (vegetables === undefined) return [];
  const home = state.buildings.find((b) => b.id === household.homeId);
  if (!home || home.stage !== 'built') return [];
  for (const b of state.buildings) {
    if (b.stage !== 'built' || b.def !== 'garden-bed') continue;
    if (gardenBedReaches(b, home)) return [vegetables];
  }
  return [];
}
