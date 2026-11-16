// Floors by tier, level and row (docs/build/i4-visual-planning-notes.md, V2 item 4; V3B draws them as
// the kit's `params.storeys`). The sim chooses them, deterministically, and saves them on the building
// (Building.storeys), so both seats see one skyline.
//
// A building's base is its home tier or business level. The row rule then lifts it: along a row, the
// touching lots that are all built form a chain, and each building stands at the upper envelope of the
// bases in its chain, `s_i = max_j(b_j - |i - j|)`. So no building is shorter than its tier or level
// says, neighbors differ by at most one storey, nothing rises above the chain's tallest base, and the
// result does not depend on the order the buildings went up in.
import { content, type BuildingDef } from '@qoti/content';
import type { Building, EntityId, Lot, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { levelOf } from '../../state/zones';
import { buildingView } from '../../view';
import { lotView } from '../../view/lots';
import { lotEpoch } from './lots';

/** The cozy ceiling outside landmarks (18-eras.md). */
export const MAX_STOREYS = 4;

/** Storeys by the tier a home houses: a Settler cottage one and a half, up to a Merchants' townhouse three. */
const HOME_STOREYS: readonly [tier: string, storeys: number][] = [
  ['settler', 1.5],
  ['craftsfolk', 2],
  ['merchant', 3],
  ['patron', 3],
];

/** Storeys by business level 1 to 3. */
const BUSINESS_STOREYS: readonly number[] = [1, 1.5, 2];

/** The storeys a building of `def` (at `level`, for a business) stands at before its row is read. */
export function baseStoreys(def: BuildingDef, level = 1, trade?: string): number {
  const business = trade !== undefined || content.trades.some((t) => t.building === def.id);
  let s: number;
  if (def.housing && !business) {
    const tier = def.tier ?? 'settler';
    s = HOME_STOREYS.find(([t]) => t === tier)?.[1] ?? 1;
  } else {
    s = BUSINESS_STOREYS[Math.max(0, Math.min(BUSINESS_STOREYS.length - 1, level - 1))]!;
  }
  return Math.min(MAX_STOREYS, s);
}

/** Where a lot sits along its road line, and its length there. */
function along(lot: Lot): number {
  return lot.rot % 2 === 0 ? lot.x : lot.z;
}
function span(lot: Lot): number {
  return lot.rot % 2 === 0 ? lot.w : lot.d;
}

/** True when the two lots of one row share a side line. */
function touches(a: Lot, b: Lot): boolean {
  return along(a) + span(a) === along(b) || along(b) + span(b) === along(a);
}

/** The built plot lots of a row touching `lot`, in lot order. */
function touchingBuilt(state: WorldState, lot: Lot): Lot[] {
  const out: Lot[] = [];
  for (const o of state.lots) {
    if (o.id === lot.id || o.row !== lot.row || o.kind === 'garden' || !o.buildingId) continue;
    if (touches(lot, o)) out.push(o);
  }
  return out;
}

/**
 * The storeys of a building growing on a lot, in half-storey steps: its base by tier or level, raised
 * to within one of the current storeys of the built lots touching it in its row, so a lot built later
 * fits the row it joins.
 */
export function storeysFor(state: WorldState, lot: Lot, def: BuildingDef, level = 1): number {
  let s = baseStoreys(def, level);
  if (lot.row === 0) return s;
  for (const o of touchingBuilt(state, lot)) {
    const n = findById(state.buildings, o.buildingId)?.storeys;
    if (n !== undefined) s = Math.max(s, n - 1);
  }
  return Math.min(MAX_STOREYS, s);
}

/** What a grown building's own tier or level asks for; null when its def is gone. */
function baseOf(b: Building): number | null {
  const def = content.buildingById.get(b.def);
  if (!def) return null;
  return baseStoreys(def, levelOf(b), b.trade);
}

function announce(state: WorldState, ctx: TickCtx | null, b: Building, lot: Lot): void {
  if (!ctx) return;
  ctx.events.push({ e: 'building.updated', b: buildingView(b) });
  ctx.events.push({ e: 'lot.updated', l: lotView(lot, state) });
}

/** Scratch for refitLots, reused so a refit allocates nothing per row. */
const scratchBuildings: (Building | undefined)[] = [];
const scratchTarget: number[] = [];

/**
 * Sets the storeys of every grown building on the plot lots of one row to the row rule, emitting
 * building.updated and lot.updated for each that changed.
 */
function refitLots(state: WorldState, ctx: TickCtx | null, lots: Lot[]): void {
  lots.sort((p, q) => along(p) - along(q) || p.id - q.id);
  const n = lots.length;
  const bs = scratchBuildings;
  const target = scratchTarget;
  bs.length = n;
  target.length = n;
  for (let i = 0; i < n; i++) {
    const lot = lots[i]!;
    const b = lot.buildingId ? findById(state.buildings, lot.buildingId) : undefined;
    bs[i] = b;
    target[i] = b ? (baseOf(b) ?? b.storeys ?? 1) : 0;
  }
  // Forward then backward over each chain of touching, built lots: the upper envelope.
  for (let i = 1; i < n; i++) {
    if (bs[i] && bs[i - 1] && touches(lots[i - 1]!, lots[i]!))
      target[i] = Math.max(target[i]!, target[i - 1]! - 1);
  }
  for (let i = n - 2; i >= 0; i--) {
    if (bs[i] && bs[i + 1] && touches(lots[i]!, lots[i + 1]!))
      target[i] = Math.max(target[i]!, target[i + 1]! - 1);
  }
  for (let i = 0; i < n; i++) {
    const b = bs[i];
    if (!b) continue;
    const want = Math.min(MAX_STOREYS, target[i]!);
    if (b.storeys === want) continue;
    b.storeys = want;
    announce(state, ctx, b, lots[i]!);
  }
  bs.length = 0;
}

/** Refits the storeys of one row (a lot just grew on it, or one of its buildings changed). */
export function refitRow(state: WorldState, ctx: TickCtx | null, rowId: EntityId): void {
  if (rowId === 0) return;
  refitLots(
    state,
    ctx,
    state.lots.filter((l) => l.row === rowId && l.kind !== 'garden'),
  );
}

/** Refits one building on a lot in no row: its own base. */
function refitAlone(state: WorldState, ctx: TickCtx | null, b: Building, lot: Lot): void {
  const base = baseOf(b);
  if (base === null || b.storeys === base) return;
  b.storeys = base;
  announce(state, ctx, b, lot);
}

/**
 * What the last refit saw of a state, so a quiet hour refits only the rows whose buildings changed
 * tier or level. Derived, never saved: a client that just loaded has none and refits everything, which
 * finds what a running client keeps (the rule is a function of these inputs alone).
 */
interface Seen {
  /** Anything that moves rows or their members: roads, buildings, lots, a pass that renumbered rows. */
  key: string;
  /** Per building, in building order: its def, level and whether it keeps a trade. */
  defs: string[];
  levels: number[];
  trades: boolean[];
}
const seen = new WeakMap<WorldState, Seen>();

function seenKey(state: WorldState): string {
  const b = state.buildings;
  const l = state.lots;
  return [
    state.networkVersion,
    b.length,
    b.length ? b[b.length - 1]!.id : 0,
    l.length,
    l.length ? l[l.length - 1]!.id : 0,
    lotEpoch(state),
  ].join(':');
}

function remember(state: WorldState, key: string): void {
  const bs = state.buildings;
  const was = seen.get(state);
  const s: Seen = was ?? { key, defs: [], levels: [], trades: [] };
  s.key = key;
  s.defs.length = bs.length;
  s.levels.length = bs.length;
  s.trades.length = bs.length;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i]!;
    s.defs[i] = b.def;
    s.levels[i] = levelOf(b);
    s.trades[i] = b.trade !== undefined;
  }
  seen.set(state, s);
}

/** Rows to refit this hour (reused). */
const dirtyRows: EntityId[] = [];

/** What a refit did: whether it looked at every building, and how many rows and lone lots it refit. */
export interface RefitResult {
  full: boolean;
  refit: number;
}

/**
 * The hourly pass: every grown building's storeys follow its tier or level and its row, so a home
 * that moved up a tier or a business that gained a level lifts its neighbors too. When nothing but
 * tiers and levels moved since the last refit, only the rows of the buildings that changed are refit;
 * `full` refits every row regardless.
 */
export function refitStoreys(state: WorldState, ctx: TickCtx | null, full = false): RefitResult {
  const key = seenKey(state);
  const was = seen.get(state);
  if (!full && was && was.key === key) {
    const bs = state.buildings;
    let refit = 0;
    dirtyRows.length = 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i]!;
      const level = levelOf(b);
      const trade = b.trade !== undefined;
      if (was.defs[i] === b.def && was.levels[i] === level && was.trades[i] === trade) continue;
      was.defs[i] = b.def;
      was.levels[i] = level;
      was.trades[i] = trade;
      const lot = b.lot ? findById(state.lots, b.lot) : undefined;
      if (!lot || lot.kind === 'garden' || lot.buildingId !== b.id) continue;
      if (lot.row === 0) {
        refitAlone(state, ctx, b, lot);
        refit++;
      } else if (!dirtyRows.includes(lot.row)) dirtyRows.push(lot.row);
    }
    for (const row of dirtyRows) refitRow(state, ctx, row);
    refit += dirtyRows.length;
    dirtyRows.length = 0;
    return { full: false, refit };
  }
  let rows: Map<EntityId, Lot[]> | null = null;
  let refit = 0;
  for (const lot of state.lots) {
    if (lot.kind === 'garden' || !lot.buildingId) continue;
    if (lot.row === 0) {
      const b = findById(state.buildings, lot.buildingId);
      if (b) refitAlone(state, ctx, b, lot);
      refit++;
      continue;
    }
    rows ??= new Map();
    let list = rows.get(lot.row);
    if (!list) rows.set(lot.row, (list = []));
    list.push(lot);
  }
  // Empty lots are left out, so a chain breaks where one stands (its neighbors no longer touch).
  if (rows) for (const list of rows.values()) refitLots(state, ctx, list);
  refit += rows?.size ?? 0;
  remember(state, key);
  return { full: true, refit };
}
