// Supplies' cross-track API (R3.0; R3A writes the bodies): docs/spec/19-evenings.md, Supplies. The
// readers are wired already (R3.0, task 5), so R3A changes only this folder:
// - decorLit: charm's night values (hearth/charm/compute.ts) and a place's lit part (places/draw.ts);
// - decorLitTonight: the threats' lit tiles and deterrence (threats/api.ts lanternLit, litTiles);
// - pieceRests: a fire's warmth (places/draw.ts), a faded or dry piece's charm (charm/compute.ts);
// - supplyGapAchievable, supplyGapClosable: the fourth gap's two audit rules (gaps/achievable.ts,
//   view/health.ts gapClosable); keepSupplyGaps (gaps.ts) is the rule itself, called by the gaps pass;
// - householdBought: a household's Wares purchase (market/baskets.ts), for its candle;
// - lampSeasons: the Lamplighter's Round's count (conditions).
// Every function here is a pure function of saved state when read (R2's rule on Place): which pieces
// rest tonight is derived from the lit bits, the pieces' records, the map and stock, never cached.
import { content, type RestKind, type SupplyDef } from '@qoti/content';
import type { Decor, EntityId, Gap, Household, WorldState } from '../../contracts';
import { lanternsLit } from '../hearth/charm/sources';

/** A decor piece's supply, or undefined when it needs none. */
export function supplyOf(decor: Decor): SupplyDef | undefined {
  return content.decorById.get(decor.def)?.supply;
}

/**
 * The piece's light burns now, for every rule that reads light (charm's night values, a place's lit
 * part): a lantern settled with a candle tonight, from `SUPPLIES.litHour` to `outHour`; a fire with
 * firewood tonight; any other light piece through the night hours.
 */
export function decorLit(state: WorldState, _decor: Decor): boolean {
  // R3 stand-in (R3A): every light is lit from 18:00 to 07:00, as before R3.
  return lanternsLit(state.tick);
}

/**
 * The piece counts as lit tonight for the night threats (raiders lose heart in its light, wolves keep
 * off): a lantern with a candle for the night settled last (from `litHour` sharp: a raid at dusk never
 * finds a town half lit). Called at any hour; between nights it reads the night just past.
 */
export function decorLitTonight(_state: WorldState, _decor: Decor): boolean {
  // R3 stand-in (R3A): every lantern counts, as before R3.
  return true;
}

/** How the piece rests tonight, or null when it has its supply (or needs none). */
export function pieceRests(_state: WorldState, _decor: Decor): RestKind | null {
  // R3 stand-in (R3A): nothing rests.
  return null;
}

/**
 * The fourth gap can be met at all in this valley (gaps/achievable.ts; the audit's `gap-unmeetable`):
 * what its pieces burn can be made here or bought from a neighbor under some carrier rule.
 */
export function supplyGapAchievable(_state: WorldState): boolean {
  // R3 stand-in (R3A): never, so the fourth gap never opens on stand-ins.
  return false;
}

/**
 * Some command could close this fourth gap where it stands (view/health.ts gapClosable; the audit's
 * `gap-dead-end`): a lot where a chandler could grow with honey in reach, a carrier rule, a lower
 * reserve, a priority.
 */
export function supplyGapClosable(_state: WorldState, _gap: Gap): boolean {
  // R3 stand-in (R3A): never flag what is not understood.
  return true;
}

/**
 * A household bought `units` of good index `good` within its Wares (market/baskets.ts): a unit of
 * candles adds `SUPPLIES.candleNights` nights of candlelight to its home (Household.candle).
 */
export function householdBought(_state: WorldState, _h: Household, _good: number, _units: number): void {
  // R3 stand-in (R3A): candles light nothing yet.
}

/** Seasons in which every lantern was lit every night (The Lamplighter's Round; conditions). */
export function lampSeasons(state: WorldState): number {
  return state.supplies.roundSeasons;
}

/** Homes (building ids) with a candle tonight, sorted (the supplies view and the home's detail). */
export function candleHomes(state: WorldState): EntityId[] {
  const out: EntityId[] = [];
  for (const h of state.households) if (h.homeId && (h.candle ?? 0) > 0) out.push(h.homeId);
  return out.sort((a, b) => a - b);
}
