// Can the town do this yet? A wish is only offered when its target is something the town can build
// now (playtest item 4: no dead-end wishes). The walk reads a target condition: `all` needs every
// branch, `any` needs one, and `not`, code predicates, counts, charm and the rest count as
// achievable. A `near` on a building (id, tag or category) is achievable when one is already there
// (built or a site) or a matching def can be placed now; on decor, when a matching piece is unlocked.
// R1: a target naming a trade ('baker') is achievable when that trade's zone is open at the valley's
// rank and, if it wants a reach, its enabling building stands or can be placed.
import { type BuildingDef, type Condition, content, type Target, type TradeDef } from '@qoti/content';
import type { WorldState } from '../../../contracts';
import { isStandard } from '../../../state/hamlet';
import { hasInnovation, rankAtLeast } from '../../../state/village';
import { meetsRequires } from '../../innovations/api';

/** True when a def can be placed by hand in this valley right now. */
export function placeableNow(state: WorldState, def: BuildingDef): boolean {
  if (def.modes && !def.modes.includes(state.settings.mode)) return false;
  if (def.grows && !def.grows.handPlaced && isStandard(state)) return false;
  return meetsRequires(state, def.requires, def.id);
}

function buildingMatches(def: BuildingDef, t: Target): boolean {
  if ('building' in t) return def.id === t.building;
  if ('buildingTag' in t) return (def.tags ?? []).includes(t.buildingTag);
  if ('buildingCategory' in t) return def.category === t.buildingCategory;
  return false;
}

/** True when a business of the trade could grow now: its zone is open and its reach is to be had. */
export function tradeAvailable(state: WorldState, trade: TradeDef): boolean {
  const zone = content.zoneById.get(trade.zone);
  if (!zone || (zone.requires?.rank && !rankAtLeast(state, zone.requires.rank))) return false;
  if (trade.requires?.rank && !rankAtLeast(state, trade.requires.rank)) return false;
  if (trade.requires?.innovation && !hasInnovation(state, trade.requires.innovation)) return false;
  const reach = trade.wants.reach;
  if (!reach) return true;
  if (state.buildings.some((b) => b.def === reach)) return true;
  const def = content.buildingById.get(reach);
  return !!def && placeableNow(state, def);
}

/** The trade a building target names, by id ('building' or 'buildingTag'), if any. */
function targetTrade(t: Target): TradeDef | undefined {
  const id = 'building' in t ? t.building : 'buildingTag' in t ? t.buildingTag : undefined;
  return id === undefined ? undefined : content.tradeById.get(id);
}

/** True when the town has, or can make, something of this kind to put near a place. */
export function targetAvailable(state: WorldState, t: Target): boolean {
  if ('building' in t || 'buildingTag' in t || 'buildingCategory' in t) {
    for (const b of state.buildings) {
      const def = content.buildingById.get(b.def);
      if (def && buildingMatches(def, t)) return true;
      if (b.trade && targetTrade(t)?.id === b.trade) return true;
    }
    const trade = targetTrade(t);
    if (trade && tradeAvailable(state, trade)) return true;
    return content.buildings.some((d) => buildingMatches(d, t) && placeableNow(state, d));
  }
  if ('tag' in t || 'decor' in t) {
    return content.decor.some((d) => {
      if ('tag' in t ? !d.tags.includes(t.tag) : d.id !== t.decor) return false;
      return !d.locked || !isStandard(state) || state.hearth.unlocked.includes(d.id);
    });
  }
  return true;
}

/** True when some way to meet the condition is open to the town now. */
export function achievable(state: WorldState, cond: Condition): boolean {
  if ('all' in cond) return cond.all.every((c) => achievable(state, c));
  if ('any' in cond) return cond.any.some((c) => achievable(state, c));
  if ('near' in cond) {
    const n = cond.near;
    return targetAvailable(state, n) && (!n.also || targetAvailable(state, n.also.target));
  }
  return true;
}
