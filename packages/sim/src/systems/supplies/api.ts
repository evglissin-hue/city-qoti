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
// The readers are called per piece per chunk by charm and per place per tick by the draw, so they stay
// cheap: binary searches on the saved lists and, for tables and fountains, a small scan of the map.
import { content, type RestKind, type SupplyDef } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, Decor, EntityId, Gap, Household, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { lanternsLit } from '../hearth/charm/sources';
import { sellsTreats, treatsOnShelf } from '../market/round';
import { doorTile } from '../movement/api';
import { shortGapAchievable, shortGapClosable } from './gapChecks';
import { Kind, kindOfDef, pieceTile, seasonOfDay, suppliesDraw, tileDist } from './pieces';

/** A decor piece's supply, or undefined when it needs none. */
export function supplyOf(decor: Decor): SupplyDef | undefined {
  return content.decorById.get(decor.def)?.supply;
}

/** Binary search of a list sorted by `id`: the index of `id`, or -1. */
function indexById(list: readonly { id: number }[], id: number): number {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid]!.id;
    if (v === id) return mid;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** True when some built building within `radius` tiles (Manhattan) of `tile`, each tried once, satisfies `test`. */
function nearBuilding(
  state: WorldState,
  tile: number,
  radius: number,
  test: (b: Building) => boolean,
): boolean {
  const cx = tile % MAP_SIZE;
  const cz = (tile - cx) / MAP_SIZE;
  const occupant = state.map.occupant;
  const seen: number[] = [];
  for (let dz = -radius; dz <= radius; dz++) {
    const z = cz + dz;
    if (z < 0 || z >= MAP_SIZE) continue;
    const span = radius - Math.abs(dz);
    for (let x = Math.max(0, cx - span); x <= Math.min(MAP_SIZE - 1, cx + span); x++) {
      const id = occupant[z * MAP_SIZE + x]!;
      if (id <= 0 || seen.includes(id)) continue;
      seen.push(id);
      const b = findById(state.buildings, id);
      if (b && b.stage === 'built' && test(b)) return true;
    }
  }
  return false;
}

/** Pieces draw on the town's goods and a night has been settled: the lit bits and records are in force. */
function settled(state: WorldState): boolean {
  return suppliesDraw(state) && state.supplies.night >= 0;
}

/**
 * The piece's light burns now, for every rule that reads light (charm's night values, a place's lit
 * part): a lantern settled with a candle tonight, from `SUPPLIES.litHour` to `outHour`; a fire with
 * firewood tonight; any other light piece through the night hours.
 */
export function decorLit(state: WorldState, decor: Decor): boolean {
  return lanternsLit(state.tick) && decorLitTonight(state, decor);
}

/**
 * The piece counts as lit tonight for the night threats (raiders lose heart in its light, wolves keep
 * off): a lantern with a candle for the night settled last (from `litHour` sharp: a raid at dusk never
 * finds a town half lit). Called at any hour; between nights it reads the night just past.
 */
export function decorLitTonight(state: WorldState, decor: Decor): boolean {
  switch (kindOfDef(decor.def)) {
    case Kind.nightly:
      // In a Hamlet (or before the first settling) lanterns go by the hour alone.
      return !settled(state) || indexById(state.supplies.lamps, decor.id) >= 0;
    case Kind.evening:
      return pieceRests(state, decor) !== 'cold';
    default:
      return true;
  }
}

/** How the piece rests tonight, or null when it has its supply (or needs none). */
export function pieceRests(state: WorldState, decor: Decor): RestKind | null {
  const kind = kindOfDef(decor.def);
  if (kind < 0 || !settled(state)) return null;
  const s = state.supplies;
  const supply = supplyOf(decor)!;
  switch (kind) {
    case Kind.nightly:
      return indexById(s.lamps, decor.id) >= 0 ? null : supply.rests;
    case Kind.evening: {
      if (!supply.seasons?.includes(seasonOfDay(s.night) % 4)) return null;
      const i = indexById(s.pieces, decor.id);
      return i >= 0 && s.pieces[i]!.rested > 0 ? supply.rests : null;
    }
    case Kind.season: {
      // No record: put up just now, before its first settling.
      const i = indexById(s.pieces, decor.id);
      if (i < 0) return null;
      return s.pieces[i]!.cloth === seasonOfDay(s.night) ? null : supply.rests;
    }
    case Kind.outlet: {
      const radius = supply.radius ?? 0;
      const tile = pieceTile(decor);
      const served = nearBuilding(
        state,
        tile,
        radius + 2,
        (b) => tileDist(doorTile(b), tile) <= radius && sellsTreats(state, b) && treatsOnShelf(state, b),
      );
      return served ? null : supply.rests;
    }
    default: {
      const tile = pieceTile(decor);
      const wet = nearBuilding(state, tile, supply.radius ?? 0, (b) => b.def === 'well');
      return wet ? null : supply.rests;
    }
  }
}

/**
 * The fourth gap can be met at all in this valley (gaps/achievable.ts; the audit's `gap-unmeetable`):
 * what its pieces burn can be made here or bought from a neighbor under some carrier rule.
 */
export function supplyGapAchievable(state: WorldState): boolean {
  return shortGapAchievable(state);
}

/**
 * Some command could close this fourth gap where it stands (view/health.ts gapClosable; the audit's
 * `gap-dead-end`): a lot where a chandler could grow with honey in reach, a carrier rule, a lower
 * reserve, a priority.
 */
export function supplyGapClosable(state: WorldState, gap: Gap): boolean {
  return shortGapClosable(state, gap);
}

const CANDLES = content.goodIndex.get('candles') ?? -1;

/**
 * A household bought `units` of good index `good` within its Wares (market/baskets.ts): a unit of
 * candles adds `SUPPLIES.candleNights` nights of candlelight to its home (Household.candle).
 */
export function householdBought(_state: WorldState, h: Household, good: number, units: number): void {
  if (good !== CANDLES || units <= 0) return;
  h.candle = (h.candle ?? 0) + units * content.supplies.candleNights;
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
