// Where to build first (docs/spec/13-ledger.md, The season plan): builders and the porters bringing
// materials favor sites standing on a lot of the zone the plan names (state.seasonPlan.buildFirst).
import { content } from '@qoti/content';
import type { Building, WorldState } from '../../contracts';
import { findById } from '../../state/entities';

/** True when a site stands on a lot of the zone the season plan says to build first. */
export function buildsFirst(state: WorldState, b: Building): boolean {
  const zone = state.seasonPlan.buildFirst;
  if (!zone || !b.lot || b.stage !== 'construction') return false;
  const lot = findById(state.lots, b.lot);
  return !!lot && content.zoneByValue.get(lot.zone)?.id === zone;
}
