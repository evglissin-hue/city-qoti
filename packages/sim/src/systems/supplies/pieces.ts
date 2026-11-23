// Supplied pieces, derived (R3A; docs/spec/19-evenings.md, Supplies): what each piece draws, the tile it
// stands on, which places it belongs to and how the Hearth ranks them. The settling, the carrier's
// buying for places, the views and the fourth gap all read these, so they agree. Pure functions of
// saved state when read: the one cache (the index of supplied pieces) keys on the decor grid's own
// version, which counts every add, move and removal, and a seat joining from a snapshot builds it
// afresh to the same result.
import { content, type SupplyDef } from '@qoti/content';
import { DAYS_PER_SEASON, MAP_SIZE, TILE_FP } from '../../constants';
import type { Decor, Place, PlacePriority, WorldState } from '../../contracts';
import { worldIndex } from '../../state/worldIndex';
import { rankAtLeast } from '../../state/village';
import { placeState } from '../../state/evenings';
import { placeIndex } from '../places';

/** SUPPLY_KINDS indexes (constants.ts), by name. */
export const Kind = { nightly: 0, evening: 1, season: 2, outlet: 3, well: 4 } as const;
export type KindIndex = (typeof Kind)[keyof typeof Kind];

/** The kinds that draw on the town's goods (the fourth gap's, the Balances line's). */
export function drawsGoods(kind: number): boolean {
  return kind === Kind.nightly || kind === Kind.evening || kind === Kind.season;
}

/** A place's priority as a rank: let it rest 0, as it comes 1, keep first 2. */
export const Rank = { rest: 0, normal: 1, keep: 2 } as const;

export function rankOf(p: PlacePriority | undefined): number {
  return p === 'keep' ? Rank.keep : p === 'rest' ? Rank.rest : Rank.normal;
}

const KIND_OF = new Map<string, number>(
  content.decor.flatMap((d) => (d.supply ? [[d.id, Kind[d.supply.kind]] as [string, number]] : [])),
);

/** The decor def's supply kind index, or -1 when it needs none. */
export function kindOfDef(def: string): number {
  return KIND_OF.get(def) ?? -1;
}

/** The decor def's supply, or undefined. */
export function supplyOfDef(def: string): SupplyDef | undefined {
  return content.decorById.get(def)?.supply;
}

/** The tile a piece stands on (row-major index). */
export function pieceTile(d: Pick<Decor, 'fx' | 'fz'>): number {
  return Math.floor(d.fz / TILE_FP) * MAP_SIZE + Math.floor(d.fx / TILE_FP);
}

/** Manhattan distance between two tiles. */
export function tileDist(a: number, b: number): number {
  const ax = a % MAP_SIZE;
  const bx = b % MAP_SIZE;
  return Math.abs(ax - bx) + Math.abs((a - ax) / MAP_SIZE - (b - bx) / MAP_SIZE);
}

/** The absolute season index (year * 4 + season) of a day index. */
export function seasonOfDay(day: number): number {
  return Math.floor(day / DAYS_PER_SEASON);
}

/** Pieces draw on the town's goods (SUPPLIES.fromRank, the Village); below it every piece is supplied for nothing. */
export function suppliesDraw(state: WorldState): boolean {
  return rankAtLeast(state, content.supplies.fromRank);
}

/** The supplied pieces in town, by id, with their kind and tile, and the pieces on each tile. */
export interface SuppliedIndex {
  /** Supplied pieces, sorted by id. */
  list: Decor[];
  /** By list index: the SUPPLY_KINDS index. */
  kind: number[];
  /** By list index: the tile it stands on. */
  tile: number[];
  /** Tile to list indexes (ascending). */
  byTile: Map<number, number[]>;
}

const indexMemo = new WeakMap<WorldState, { grid: object; version: number; index: SuppliedIndex }>();

/** The supplied pieces now (cached against the decor grid's version; callers must not mutate it). */
export function suppliedIndex(state: WorldState): SuppliedIndex {
  const grid = worldIndex(state).decorGrid;
  const m = indexMemo.get(state);
  if (m && m.grid === grid && m.version === grid.version) return m.index;
  const list: Decor[] = [];
  const kind: number[] = [];
  const tile: number[] = [];
  const byTile = new Map<number, number[]>();
  for (const d of state.decor) {
    const k = kindOfDef(d.def);
    if (k < 0) continue;
    const t = pieceTile(d);
    const i = list.length;
    list.push(d);
    kind.push(k);
    tile.push(t);
    const at = byTile.get(t);
    if (at) at.push(i);
    else byTile.set(t, [i]);
  }
  const index: SuppliedIndex = { list, kind, tile, byTile };
  indexMemo.set(state, { grid, version: grid.version, index });
  return index;
}

/**
 * The supplied pieces of a place (list indexes into `suppliedIndex`, ascending): those standing on
 * its tiles, plus its member pieces wherever they stand.
 */
export function placePieces(state: WorldState, place: Place): number[] {
  const ix = suppliedIndex(state);
  const out: number[] = [];
  for (const t of place.tiles) {
    const at = ix.byTile.get(t);
    if (at) for (const i of at) out.push(i);
  }
  for (const id of place.members) {
    const i = indexOfPiece(ix, id);
    if (i >= 0) out.push(i);
  }
  out.sort((a, b) => a - b);
  let w = 0;
  for (let k = 0; k < out.length; k++) if (k === 0 || out[k] !== out[k - 1]) out[w++] = out[k]!;
  out.length = w;
  return out;
}

/** The list index of a supplied piece by decor id (binary search), or -1. */
export function indexOfPiece(ix: SuppliedIndex, id: number): number {
  const list = ix.list;
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

/**
 * Each supplied piece's rank (by list index): the highest priority among the places it belongs to
 * (keep first beats as it comes beats let it rest), and as it comes for a piece in no place. One pass
 * over the places' tiles and members; call it once a settling, never per piece.
 */
export function pieceRanks(state: WorldState): Uint8Array {
  const ix = suppliedIndex(state);
  const n = ix.list.length;
  // 255: no place yet.
  const ranks = new Uint8Array(n).fill(255);
  if (n === 0) return ranks;
  for (const place of placeIndex(state).places) {
    const r = rankOf(placeState(state, place.id)?.priority);
    for (const i of placePieces(state, place)) if (ranks[i] === 255 || r > ranks[i]!) ranks[i] = r;
  }
  for (let i = 0; i < n; i++) if (ranks[i] === 255) ranks[i] = Rank.normal;
  return ranks;
}
