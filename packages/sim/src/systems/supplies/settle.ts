// The settling and the supplies' nightly bookkeeping (R3A; docs/spec/19-evenings.md, Supplies): at 17:30
// the town decides which lanterns get a candle, puts up the season's cloth, lets the fires that may burn
// tonight burn, burns a night of every household's candle and keeps the records; at 21:30 the fires
// someone sat by draw their firewood; at 07:00 the lamps go out by themselves (the readers go by the
// hour) and the view says so. Never draws from an RNG stream: everything is ordered by rank, distance
// and id.
import { content } from '@qoti/content';
import { GOOD_FAMILIES, MAP_SIZE } from '../../constants';
import type { Building, EntityId, LampState, PieceSupply, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { placeState } from '../../state/evenings';
import { balancesView } from '../../view/balances';
import { suppliesView } from '../../view/supplies';
import { dayIndex } from '../economy/time';
import { markCharmDirty } from '../hearth/charm/dirty';
import { isStorehouse } from '../logistics/stores';
import { doorTile } from '../movement/api';
import { placeIndex } from '../places';
import { drawForPlaces, placesPurse, type PlacesPurse } from '../carrier/places';
import { pieceRests } from './api';
import { walkLamps, type LitLantern, type Walker } from './lamplighter';
import {
  Kind,
  pieceRanks,
  placePieces,
  Rank,
  seasonOfDay,
  suppliedIndex,
  suppliesDraw,
  tileDist,
  type SuppliedIndex,
} from './pieces';
import { tickAt } from './time';

/** The fires' firewood is drawn at 21:30, once the evening's visitors are counted (the gaps pass runs at 21:00). */
export const FIRE_HOUR = 21;
export const FIRE_MINUTE = 30;

const TOWN_HALL = 'town-hall';

/** Where the night's goods come from: the storehouse nearest the Town Hall's door, else the door, else the middle of the map. */
export function startTile(state: WorldState): number {
  let hall: Building | undefined;
  for (const b of state.buildings) {
    if (b.def === TOWN_HALL && b.stage === 'built') {
      hall = b;
      break;
    }
  }
  const middle = (MAP_SIZE >> 1) * MAP_SIZE + (MAP_SIZE >> 1);
  if (!hall) return middle;
  const hallDoor = doorTile(hall);
  let best = -1;
  let bestDist = Infinity;
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    const def = content.buildingById.get(b.def);
    if (!isStorehouse(def)) continue;
    const door = doorTile(b, def);
    const d = tileDist(door, hallDoor);
    // Buildings come in id order, so a tie keeps the lower id.
    if (d < bestDist) {
      bestDist = d;
      best = door;
    }
  }
  return best >= 0 ? best : hallDoor;
}

/** The record of a piece, made (in id order) when it has none. */
function recordFor(state: WorldState, id: EntityId): PieceSupply {
  const list = state.supplies.pieces;
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid]!.id;
    if (v === id) return list[mid]!;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  const rec: PieceSupply = { id, rested: 0 };
  list.splice(lo, 0, rec);
  return rec;
}

/** The good a piece burns or wears, by index, and what it takes. */
function supplyOfPiece(ix: SuppliedIndex, i: number) {
  const s = content.decorById.get(ix.list[i]!.def)!.supply!;
  return { good: s.good ? (content.goodIndex.get(s.good) ?? -1) : -1, qty: s.qty ?? 1, per: s.per ?? 1, s };
}

/** Adds units to tonight's row of `supplies.drawn` (a row is made when none stands). */
function addDrawn(state: WorldState, good: number, qty: number): void {
  if (qty <= 0) return;
  const rows = state.supplies.drawn;
  if (rows.length === 0) rows.push(new Array<number>(content.goods.length).fill(0));
  const row = rows[rows.length - 1]!;
  row[good] = (row[good] ?? 0) + qty;
}

/** The season of the fires: pieces burn in the seasons their def lists (the thaw ends winter's). */
function inSeason(s: { seasons?: number[] }, season: number): boolean {
  return !!s.seasons?.includes(season % 4);
}

/** The settled order: kept first, then as it comes; nearest the start first; ties by id. */
function settledOrder(ix: SuppliedIndex, ranks: Uint8Array, start: number, list: number[]): number[] {
  return list.sort(
    (a, b) =>
      ranks[b]! - ranks[a]! ||
      tileDist(ix.tile[a]!, start) - tileDist(ix.tile[b]!, start) ||
      ix.list[a]!.id - ix.list[b]!.id,
  );
}

/** The 17:30 run. */
export function settle(state: WorldState, ctx: TickCtx): void {
  const S = content.supplies;
  const sup = state.supplies;
  const night = dayIndex(state.tick);
  const season = seasonOfDay(night);
  const draws = suppliesDraw(state);
  const ix = suppliedIndex(state);
  const goods = content.goods.length;

  // Tonight's row of what places drew (two nights are kept, oldest first).
  sup.drawn.push(new Array<number>(goods).fill(0));
  while (sup.drawn.length > 2) sup.drawn.shift();

  // Rest before the settling, for the pieces whose charm follows it.
  const before = new Map<EntityId, boolean>();
  for (const r of sup.pieces) before.set(r.id, r.rested > 0);

  const records = new Map<EntityId, PieceSupply>();
  for (const r of sup.pieces) {
    // A fire's last burn matters only on its night.
    if (r.burned !== undefined && r.burned < night) delete r.burned;
    records.set(r.id, r);
  }
  const rec = (id: EntityId): PieceSupply => {
    let r = records.get(id);
    if (!r) {
      r = { id, rested: 0 };
      records.set(id, r);
    }
    return r;
  };

  const lanterns: number[] = [];
  const cloths: number[] = [];
  const fires: number[] = [];
  const others: number[] = [];
  for (let i = 0; i < ix.list.length; i++) {
    const k = ix.kind[i]!;
    if (k === Kind.nightly) lanterns.push(i);
    else if (k === Kind.season) cloths.push(i);
    else if (k === Kind.evening) fires.push(i);
    else others.push(i);
  }

  let lamps: LampState[] = [];
  const litHour = tickAt(night, S.litHour);

  if (!draws) {
    // A Hamlet: every piece is supplied for nothing, and the lamps come on at the hour.
    for (const i of lanterns) lamps.push({ id: ix.list[i]!.id, reach: litHour });
    for (const i of cloths) {
      const r = rec(ix.list[i]!.id);
      r.cloth = season;
      r.rested = 0;
    }
    for (const i of fires) rec(ix.list[i]!.id).rested = 0;
  } else {
    const ranks = pieceRanks(state);
    const start = startTile(state);
    const purse = placesPurse(state);

    // Lanterns: a candle for every `per`, the kept ones first, then the nearest the store.
    if (lanterns.length > 0) {
      const { good, per } = supplyOfPiece(ix, lanterns[0]!);
      const eligible = settledOrder(
        ix,
        ranks,
        start,
        lanterns.filter((i) => ranks[i]! > Rank.rest),
      );
      let lit = Math.min(
        eligible.length,
        per * Math.max(0, Math.min(purse.free[good] ?? 0, purse.surplus[familyOf(good)] ?? 0)),
      );
      const taken = drawForPlaces(state, purse, good, Math.ceil(lit / per), start);
      lit = Math.min(lit, per * taken);
      addDrawn(state, good, taken);
      const order: LitLantern[] = eligible.slice(0, lit).map((i) => ({
        id: ix.list[i]!.id,
        tile: ix.tile[i]!,
        rank: ranks[i]!,
      }));
      lamps = lampsFor(order, walkers(state), night);
    }

    // Cloth: put up once a season, if the purse can pay for it.
    const clothOrder = settledOrder(
      ix,
      ranks,
      start,
      cloths.filter((i) => rec(ix.list[i]!.id).cloth !== season),
    );
    for (const i of cloths) if (rec(ix.list[i]!.id).cloth === season) rec(ix.list[i]!.id).rested = 0;
    for (const i of clothOrder) {
      const r = rec(ix.list[i]!.id);
      const { good, qty } = supplyOfPiece(ix, i);
      let up = false;
      if (ranks[i]! > Rank.rest && canPay(purse, good, qty)) {
        const taken = drawForPlaces(state, purse, good, qty, start);
        addDrawn(state, good, taken);
        up = taken === qty;
      }
      if (up) {
        r.cloth = season;
        r.rested = 0;
      } else r.rested += 1;
    }

    // Fires: the firewood is drawn at 21:30 for the ones someone sits by; tonight's may burn if the
    // purse holds enough for them.
    const burning = fires.filter((i) => inSeason(supplyOfPiece(ix, i).s, season));
    for (const i of fires) if (!burning.includes(i)) rec(ix.list[i]!.id).rested = 0;
    if (burning.length > 0) {
      const { good, qty } = supplyOfPiece(ix, burning[0]!);
      const room = Math.floor(
        Math.max(0, Math.min(purse.free[good] ?? 0, purse.surplus[familyOf(good)] ?? 0)) / qty,
      );
      const order = settledOrder(
        ix,
        ranks,
        start,
        burning.filter((i) => ranks[i]! > Rank.rest),
      );
      const may = new Set(order.slice(0, room));
      for (const i of burning) {
        const r = rec(ix.list[i]!.id);
        if (may.has(i)) r.rested = 0;
        else r.rested += 1;
      }
    }
  }

  // The settled night and its records stand from here on.
  sup.night = night;
  sup.lamps = lamps.sort((a, b) => a.id - b.id);

  // Tables and fountains are read live; their count of resting nights is for the place card.
  for (const i of others) {
    const r = rec(ix.list[i]!.id);
    r.rested = pieceRests(state, ix.list[i]!) ? r.rested + 1 : 0;
  }

  // Records: sorted, without those that say nothing, and none for a piece that is gone.
  const out: PieceSupply[] = [];
  for (let i = 0; i < ix.list.length; i++) {
    const r = records.get(ix.list[i]!.id);
    if (r && (r.rested > 0 || r.cloth !== undefined || r.burned !== undefined)) out.push(r);
  }
  sup.pieces = out;

  // Charm follows a season piece or a fountain whose rest flipped.
  for (let i = 0; i < ix.list.length; i++) {
    const k = ix.kind[i]!;
    if (k !== Kind.season && k !== Kind.well) continue;
    const id = ix.list[i]!.id;
    if ((records.get(id)?.rested ?? 0) > 0 !== (before.get(id) ?? false)) {
      const x = ix.tile[i]! % MAP_SIZE;
      const z = (ix.tile[i]! - x) / MAP_SIZE;
      markCharmDirty(state, [x, z, x, z]);
    }
  }

  // A household's candle burns a night; a window is lit tonight while one is left.
  for (const h of state.households) {
    if (!h.candle) continue;
    if (h.candle <= 1) delete h.candle;
    else h.candle -= 1;
  }

  if (draws) placeCounts(state, ix, season);
  trackRound(state, lanterns.length);

  ctx.events.push({ e: 'supplies.updated', s: suppliesView(state) });
  if (sup.drawn[sup.drawn.length - 1]!.some((n) => n > 0)) {
    ctx.events.push({ e: 'balances.updated', b: balancesView(state) });
  }
}

function familyOf(good: number): number {
  return GOOD_FAMILY[good] ?? 0;
}

const GOOD_FAMILY: readonly number[] = content.goods.map((g) => GOOD_FAMILIES.indexOf(g.family));

/** Whether the purse can pay `qty` of a good in one go (so nothing is taken by halves). */
function canPay(purse: PlacesPurse, good: number, qty: number): boolean {
  return (purse.free[good] ?? 0) >= qty && (purse.surplus[familyOf(good)] ?? 0) >= qty;
}

/** The lamplighters (by id) and the tiles they set out from: where each stands at the settling. */
function walkers(state: WorldState): Walker[] {
  const out: Walker[] = [];
  for (const id of state.supplies.lamplighters) {
    const r = findById(state.residents, id);
    if (r) out.push({ id, tile: r.tile });
  }
  return out;
}

/**
 * Tonight's lamps from the walk (lamplighter.ts). With nobody to walk it returns the lit ones as they
 * are; should it ever return anything else than the lit lanterns, every lamp comes on at the hour, so
 * the settling stands on its own.
 */
function lampsFor(order: readonly LitLantern[], held: readonly Walker[], night: number): LampState[] {
  const walked = walkLamps(order, held, night);
  const ids = order.map((l) => l.id).sort((a, b) => a - b);
  const got = walked.map((l) => l.id).sort((a, b) => a - b);
  if (ids.length === got.length && ids.every((id, k) => id === got[k])) return walked.map((l) => ({ ...l }));
  const reach = tickAt(night, content.supplies.litHour);
  return order.map((l) => ({ id: l.id, reach }));
}

/** PlaceState.supplied: per kind, the nights this season a place's pieces were all supplied and the nights one rested. */
function placeCounts(state: WorldState, ix: SuppliedIndex, season: number): void {
  for (const place of placeIndex(state).places) {
    const pieces = placePieces(state, place);
    if (pieces.length === 0) continue;
    const row = placeState(state, place.id);
    if (!row) continue;
    if (!row.supplied || row.supplied.season !== season) {
      row.supplied = { season, kept: [0, 0, 0, 0, 0], rested: [0, 0, 0, 0, 0] };
    }
    const present = [false, false, false, false, false];
    const resting = [false, false, false, false, false];
    for (const i of pieces) {
      const k = ix.kind[i]!;
      if (k === Kind.evening && !inSeason(supplyOfPiece(ix, i).s, season)) continue;
      present[k] = true;
      if (pieceRests(state, ix.list[i]!)) resting[k] = true;
    }
    for (let k = 0; k < 5; k++) {
      if (!present[k]) continue;
      if (resting[k]) row.supplied.rested[k]! += 1;
      else row.supplied.kept[k]! += 1;
    }
  }
}

/** The Lamplighter's Round: a season counts when all its nights were settled at Village rank with every lantern lit. */
function trackRound(state: WorldState, lanterns: number): void {
  const sup = state.supplies;
  if (!suppliesDraw(state) || lanterns === 0 || sup.lamps.length < lanterns) sup.roundBroken = true;
}

/** Run at every half hour: a season ending is counted (or not) as the new one's first run comes. */
export function rollRound(state: WorldState): void {
  const sup = state.supplies;
  const season = seasonOfDay(dayIndex(state.tick));
  if (sup.roundSeason === season) return;
  if (sup.roundSeason >= 0 && !sup.roundBroken) sup.roundSeasons += 1;
  // The first season seen never counts: the nights before it were not watched.
  sup.roundBroken = sup.roundSeason < 0;
  sup.roundSeason = season;
}

/** The 21:30 run: each fire someone sat by that may burn draws its firewood. */
export function drawFires(state: WorldState, ctx: TickCtx): void {
  const sup = state.supplies;
  if (!suppliesDraw(state) || sup.night < 0) return;
  const night = sup.night;
  const ix = suppliedIndex(state);
  if (ix.list.length === 0) return;
  let purse: PlacesPurse | null = null;
  const start = startTile(state);
  let took = false;
  for (const place of placeIndex(state).places) {
    const row = placeState(state, place.id);
    const visitors = row?.visitors[row.visitors.length - 1] ?? 0;
    if (visitors <= 0) continue;
    for (const i of placePieces(state, place)) {
      if (ix.kind[i] !== Kind.evening) continue;
      const d = ix.list[i]!;
      const { good, qty, s } = supplyOfPiece(ix, i);
      if (!inSeason(s, seasonOfDay(night))) continue;
      if (pieceRests(state, d)) continue;
      const r = recordFor(state, d.id);
      if (r.burned === night) continue;
      purse ??= placesPurse(state);
      const taken = drawForPlaces(state, purse, good, qty, start);
      addDrawn(state, good, taken);
      if (taken > 0) took = true;
      // Nothing breaks when the stock ran dry since the settling: the fire burns on its night's wood.
      r.burned = night;
    }
  }
  if (took) ctx.events.push({ e: 'balances.updated', b: balancesView(state) });
}
