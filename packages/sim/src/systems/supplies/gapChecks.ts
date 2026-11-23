// The fourth gap's two audit rules and its words (R3A; docs/spec/22-quality.md, Playability [R3]):
// whether the town can meet a place short of supplies at all (`gap-unmeetable`), and whether some
// command could close one where it stands (`gap-dead-end`). api.ts's supplyGapAchievable and
// supplyGapClosable call these. Also the one reading of a place's pieces the rule (gaps.ts) and the
// words share, so the number a gap quotes and the good it names always agree.
import { content, type BuildingDef, type TradeDef } from '@qoti/content';
import type { Gap, Place, WorldState } from '../../contracts';
import { townStock } from '../../view/hamlet';
import { someoneSells } from '../carrier/sellers';
import { placeableNow, tradeAvailable } from '../hearth/wishes/achievable';
import { placeById } from '../places/api';
import { pieceRests, registerSupplyGapRules } from './api';
import { drawsGoods, Kind, placePieces, suppliedIndex } from './pieces';

const KIND_KEYS = ['nightly', 'evening', 'season'] as const;

/** What a place's goods-drawing pieces draw: the first (resting ones first) and how much a time wants. */
export interface Shortage {
  /** The SUPPLY_KINDS index (nightly, evening or season). */
  kind: number;
  /** The good index. */
  good: number;
  /** What the place wants a time of that good: candles a night, firewood an evening, cloth a season. */
  n: number;
  /** One of the place's pieces rests tonight. */
  resting: boolean;
}

/** The place's goods-drawing pieces (list indexes into the supplied index), sorted by piece id. */
function drawPieces(state: WorldState, place: Place): number[] {
  const ix = suppliedIndex(state);
  return placePieces(state, place).filter((i) => drawsGoods(ix.kind[i]!));
}

/** The good a piece draws (index), or -1. */
function goodOf(state: WorldState, i: number): number {
  const g = content.decorById.get(suppliedIndex(state).list[i]!.def)?.supply?.good;
  return g === undefined ? -1 : (content.goodIndex.get(g) ?? -1);
}

/**
 * The place's shortage: the first resting piece's kind and good (else the first piece that draws
 * goods), with what the place wants of it; null when no piece of the place draws goods.
 */
export function placeShortage(state: WorldState, place: Place): Shortage | null {
  const ix = suppliedIndex(state);
  const pieces = drawPieces(state, place);
  if (pieces.length === 0) return null;
  let pick = pieces[0]!;
  let resting = false;
  for (const i of pieces) {
    if (pieceRests(state, ix.list[i]!) !== null) {
      pick = i;
      resting = true;
      break;
    }
  }
  const kind = ix.kind[pick]!;
  const good = goodOf(state, pick);
  if (good < 0) return null;
  const supply = content.decorById.get(ix.list[pick]!.def)!.supply!;
  let count = 0;
  for (const i of pieces) if (ix.kind[i] === kind && goodOf(state, i) === good) count++;
  const n = kind === Kind.nightly ? Math.ceil(count / (supply.per ?? 1)) : (supply.qty ?? 1) * count;
  return { kind, good, n, resting };
}

/** The distinct goods the place's pieces draw, ascending. */
export function placeGoods(state: WorldState, place: Place): number[] {
  const out: number[] = [];
  for (const i of drawPieces(state, place)) {
    const g = goodOf(state, i);
    if (g >= 0 && !out.includes(g)) out.push(g);
  }
  return out.sort((a, b) => a - b);
}

// --- can it be made or bought --------------------------------------------------------------------

/** Some building of this def stands or could be placed now. */
function buildingAvailable(state: WorldState, def: BuildingDef): boolean {
  return state.buildings.some((b) => b.def === def.id) || placeableNow(state, def);
}

function tradeMakes(t: TradeDef, id: string): boolean {
  return t.makes === id;
}

/** A trade or a building method that outputs the good could stand here (its raw inputs are not read). */
function makeable(state: WorldState, good: number): boolean {
  const id = content.goods[good]?.id;
  if (id === undefined) return false;
  for (const t of content.trades) if (tradeMakes(t, id) && tradeAvailable(state, t)) return true;
  for (const d of content.buildings) {
    if (!d.methods?.some((m) => m.outputs.some(([g]) => g === id))) continue;
    if (buildingAvailable(state, d)) return true;
  }
  return false;
}

/** The town holds some of the good, or made some yesterday. */
function inTown(state: WorldState, good: number, stock: readonly number[]): boolean {
  return (stock[good] ?? 0) > 0 || (state.economy.yesterday.produced[good] ?? 0) > 0;
}

/** A maker of the good could grow with what it needs in town, made or sold (land goods need nothing). */
function makerCouldGrow(state: WorldState, good: number, stock: readonly number[]): boolean {
  const id = content.goods[good]?.id;
  if (id === undefined) return false;
  const inputOk = (raw: string): boolean => {
    const g = content.goodIndex.get(raw);
    return g === undefined || inTown(state, g, stock) || someoneSells(state, g) || makeable(state, g);
  };
  for (const t of content.trades) {
    if (tradeMakes(t, id) && tradeAvailable(state, t) && t.from.every(inputOk)) return true;
  }
  for (const d of content.buildings) {
    const m = d.methods?.find((x) => x.outputs.some(([g]) => g === id));
    if (m && buildingAvailable(state, d) && m.inputs.every(([g]) => inputOk(g))) return true;
  }
  return false;
}

/** What its pieces burn can be made here or bought from a neighbor under some carrier rule. */
export function shortGapAchievable(state: WorldState): boolean {
  const ix = suppliedIndex(state);
  const seen: number[] = [];
  for (let i = 0; i < ix.list.length; i++) {
    if (!drawsGoods(ix.kind[i]!)) continue;
    const g = goodOf(state, i);
    if (g < 0 || seen.includes(g)) continue;
    seen.push(g);
    if (!someoneSells(state, g) && !makeable(state, g)) return false;
  }
  return true;
}

/**
 * Some command could close it where it stands: a carrier rule or the places switch (a neighbor sells
 * the good), a lower reserve (the town holds some), a priority (places drew some elsewhere last night),
 * or a maker that could grow with its raw goods in reach. A gap whose place is gone is not flagged.
 */
export function shortGapClosable(state: WorldState, gap: Gap): boolean {
  const place = placeById(state, gap.subject);
  if (!place) return true;
  const goods = placeGoods(state, place);
  if (goods.length === 0) return true;
  const stock = townStock(state);
  const drawn = state.supplies.drawn;
  for (const g of goods) {
    if (someoneSells(state, g) || inTown(state, g, stock)) return true;
    if (drawn.some((row) => (row[g] ?? 0) > 0)) return true;
    if (makerCouldGrow(state, g, stock)) return true;
  }
  return false;
}

/** The fourth gap's words beside {place} and {n}: the good's name, how often, and what the town makes a day. */
export function shortGapWords(state: WorldState, gap: Gap): { good: string; when: string; makes: number } {
  const place = placeById(state, gap.subject);
  const s = place ? placeShortage(state, place) : null;
  if (!s) return { good: 'supplies', when: 'a night', makes: 0 };
  return {
    good: content.goods[s.good]!.label,
    when: content.supplies.gapWhen?.[KIND_KEYS[s.kind]!] ?? 'a night',
    makes: state.economy.yesterday.produced[s.good] ?? 0,
  };
}

// The cross-track API's two rules (supplies/api.ts), registered as this module loads.
registerSupplyGapRules({ achievable: shortGapAchievable, closable: shortGapClosable });
