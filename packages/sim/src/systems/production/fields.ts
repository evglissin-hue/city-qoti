// Wheat fields (docs/spec/13-ledger.md, Farmhouse and Wheat Field). Field tiles are painted
// within 6 tiles of a farmhouse on open ground (fertility 15+). The farmhouse's workers tend up to
// 12 tiles each, during the work day, in the `crop` layer (0 bare to 255 ripe).
//
// I3 (C5A): wheat follows the year (docs/spec/14-challenge.md, Seasons). Bare tiles are sown on
// Spring days 1 to 3 (content SeasonDef.sow), grow through spring, summer and autumn (one tended
// step in GROW_EVERY, a quarter slower on fair soil and half on thin), and turn golden at
// HARVEST_MIN. From Autumn day 1 (SeasonDef.harvest) golden tiles are brought in: each tended step
// takes HARVEST_YIELD wheat while the farm has room and lowers the tile by HARVEST_STEP, so a fully
// ripe tile gives about 26 wheat, about what a year of I2's tending gave. Sheaves left standing keep
// through winter (nothing grows, but the harvest goes on as room allows) until the spring ploughing
// turns them in. An early frost halves what is still standing (frostFields); the Seed Drill takes
// smaller bites (DRILL_STEP), a fifth more per tile. A farm with nothing sown outside the sowing
// window lies fallow until spring, and says so (BuildingStatus.fallow).
import { content, type BuildingDef } from '@qoti/content';
import { FIELD_GOOD_FERTILITY, FIELD_MIN_FERTILITY, MAP_SIZE, TILE_FP } from '../../constants';
import type { Building, Rect, RejectReason, TickCtx, WorldState } from '../../contracts';
import { inBounds, Terrain } from '../../map/layers';
import { MAX_DECOR_RADIUS } from '../../rules/geometry';
import { footprintSize } from '../../rules/footprint';
import { seasonAt } from '../../state/seasons';
import { hasInnovation } from '../../state/village';
import { worldIndex } from '../../state/worldIndex';
import { markCharmDirty } from '../hearth/charm/dirty';
import { outputCap } from '../logistics/stores';
import { produce } from './produce';

export const FIELD_RANGE = 6;
export const FIELD_TILES_PER_WORKER = 12;
/** Crop growth per growing step, steps per hour while tended, and wheat per harvest step. */
export const CROP_GROWTH = 4;
export const CROP_STEP_TICKS = 50;
export const CROP_RIPE = 255;
export const CROP_YIELD = 2;
/** I3 (C5A): a tile grows on one tended step in this many (staggered by tile). */
export const GROW_EVERY = 4;
/** Golden: from here a tile is standing wheat, brought in at harvest. */
export const HARVEST_MIN = 192;
/** Crop taken off a standing tile per harvest step, and with the Seed Drill. */
export const HARVEST_STEP = 5;
export const DRILL_STEP = 4;
/**
 * A bare tile outside the sowing window grows vegetables in the growing seasons: one on a tended
 * step in this many (staggered by tile), so twelve tiles give what a vegetable plot's gardener does.
 */
export const VEG_EVERY = 64;
/** Wheat a fully ripe tile gives over its harvest, without and with the Seed Drill. */
export function tileHarvest(step: number): number {
  return (Math.floor((CROP_RIPE - HARVEST_MIN) / step) + 1) * CROP_YIELD;
}
/** Crop growth per tended step on a tile of this fertility: full on good soil, less on thin. */
export function cropGrowth(fertility: number): number {
  if (fertility >= FIELD_GOOD_FERTILITY) return CROP_GROWTH;
  return fertility >= 25 ? CROP_GROWTH - 1 : CROP_GROWTH - 2;
}
/** Growth stages the renderer draws (crop >> CROP_STAGE_SHIFT): bare, sprouts, green, golden. */
export const CROP_STAGE_SHIFT = 6;

const FIELD_TERRAIN: ReadonlySet<number> = new Set<number>([
  Terrain.grass,
  Terrain.meadow,
  Terrain.forestFloor,
  Terrain.field,
]);

export function isFarm(def: BuildingDef | undefined): boolean {
  return !!def?.methods?.some((m) => m.kind === 'farm');
}

export function fieldRange(def: BuildingDef | undefined): number {
  return def?.methods?.find((m) => m.kind === 'farm')?.range ?? FIELD_RANGE;
}

/** Field tiles one farmhouse may own: 12 per job. */
export function fieldCap(def: BuildingDef | undefined): number {
  return FIELD_TILES_PER_WORKER * Math.max(1, def?.jobs?.count ?? 1);
}

/** The footprint rect grown by the field range, clamped to the map. */
export function fieldArea(b: Building, def: BuildingDef): Rect {
  const [w, d] = footprintSize(def, b.rot);
  const r = fieldRange(def);
  return [
    Math.max(0, b.x - r),
    Math.max(0, b.z - r),
    Math.min(MAP_SIZE - 1, b.x + w - 1 + r),
    Math.min(MAP_SIZE - 1, b.z + d - 1 + r),
  ];
}

/** Tiles the farmhouse owns now. */
export function ownedFields(state: WorldState, b: Building, def: BuildingDef): number {
  const [x0, z0, x1, z1] = fieldArea(b, def);
  const owner = state.map.fieldOwner;
  let n = 0;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (owner[z * MAP_SIZE + x] === b.id) n++;
  return n;
}

/** Why a tile cannot become a field of this farmhouse, or null when it can (or already is). */
export function fieldTileProblem(
  state: WorldState,
  farm: Building,
  def: BuildingDef,
  x: number,
  z: number,
): RejectReason | null {
  if (!inBounds(x, z)) return 'OUT_OF_BOUNDS';
  const [x0, z0, x1, z1] = fieldArea(farm, def);
  if (x < x0 || x > x1 || z < z0 || z > z1) return 'OUT_OF_RANGE';
  const i = z * MAP_SIZE + x;
  const m = state.map;
  if (m.fieldOwner[i] === farm.id) return null;
  const reader = worldIndex(state).reader;
  if (!reader.parcelUnlocked(x, z)) return 'LOCKED_PARCEL';
  if (m.water[i]) return 'WATER';
  if (m.road[i] || m.occupant[i] || m.tree[i] || m.fieldOwner[i]) return 'OCCUPIED';
  if (!FIELD_TERRAIN.has(m.terrain[i]!)) return 'NOT_ALLOWED';
  if (m.fertility[i]! < FIELD_MIN_FERTILITY) return 'NEEDS_FERTILITY';
  const cx = x * TILE_FP + TILE_FP / 2;
  const cz = z * TILE_FP + TILE_FP / 2;
  for (const d of reader.decorNear(cx, cz, TILE_FP + MAX_DECOR_RADIUS)) {
    if (Math.floor(d.fx / TILE_FP) === x && Math.floor(d.fz / TILE_FP) === z) return 'OCCUPIED';
  }
  return null;
}

export interface FieldPlan {
  /** New field tiles (indexes), in the order given, without duplicates. */
  tiles: number[];
  /** Why nothing could be painted, when `tiles` is empty. */
  reason: RejectReason | null;
}

/**
 * Which of the given tiles field.paint would turn into fields: valid tiles that are not fields of
 * this farmhouse yet, up to its cap. Invalid tiles are skipped, so a dragged rectangle paints what
 * it can; the command is refused only when nothing would change.
 */
export function planFields(
  state: WorldState,
  farm: Building,
  def: BuildingDef,
  tiles: readonly [number, number][],
): FieldPlan {
  const seen = new Set<number>();
  const out: number[] = [];
  let room = fieldCap(def) - ownedFields(state, farm, def);
  let reason: RejectReason | null = null;
  for (const [x, z] of tiles) {
    const problem = fieldTileProblem(state, farm, def, x, z);
    if (problem) {
      reason ??= problem;
      continue;
    }
    const i = z * MAP_SIZE + x;
    if (state.map.fieldOwner[i] === farm.id || seen.has(i)) continue;
    if (room <= 0) {
      reason ??= 'TOO_MANY';
      continue;
    }
    seen.add(i);
    out.push(i);
    room--;
  }
  return { tiles: out, reason: out.length > 0 ? null : (reason ?? 'NOT_FOUND') };
}

/** Rect around tile indexes. */
function rectOf(tiles: readonly number[]): Rect | null {
  if (tiles.length === 0) return null;
  let x0 = MAP_SIZE;
  let z0 = MAP_SIZE;
  let x1 = -1;
  let z1 = -1;
  for (const i of tiles) {
    const x = i % MAP_SIZE;
    const z = (i - x) / MAP_SIZE;
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  return [x0, z0, x1, z1];
}

function fieldsChanged(state: WorldState, ctx: TickCtx, tiles: readonly number[]): void {
  const rect = rectOf(tiles);
  if (!rect) return;
  ctx.events.push({ e: 'tiles.changed', rect, layers: ['terrain', 'fieldOwner', 'crop'] });
  ctx.dirty.mark('terrain', rect);
  ctx.dirty.mark('fieldOwner', rect);
  ctx.dirty.mark('crop', rect);
  state.networkVersion += 1;
  markCharmDirty(state, rect);
}

/** Turns tiles into bare fields of `farm`. */
export function paintFields(state: WorldState, ctx: TickCtx, farm: Building, tiles: readonly number[]): void {
  const m = state.map;
  for (const i of tiles) {
    m.terrain[i] = Terrain.field;
    m.fieldOwner[i] = farm.id;
    m.crop[i] = 0;
  }
  fieldsChanged(state, ctx, tiles);
}

/** Turns field tiles back into grass. */
export function clearFields(state: WorldState, ctx: TickCtx, tiles: readonly number[]): void {
  const m = state.map;
  for (const i of tiles) {
    m.terrain[i] = Terrain.grass;
    m.fieldOwner[i] = 0;
    m.crop[i] = 0;
  }
  fieldsChanged(state, ctx, tiles);
}

/** Field tiles owned by a farmhouse (tile indexes, row-major). */
export function fieldsOf(state: WorldState, b: Building, def: BuildingDef): number[] {
  const [x0, z0, x1, z1] = fieldArea(b, def);
  const out: number[] = [];
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++)
      if (state.map.fieldOwner[z * MAP_SIZE + x] === b.id) out.push(z * MAP_SIZE + x);
  }
  return out;
}

/** What fields do today: sow (bare tiles), grow (green tiles), harvest (golden tiles). */
export interface FieldPhase {
  sow: boolean;
  grow: boolean;
  harvest: boolean;
}

/** Season index of winter: nothing grows. */
const WINTER = 3;

export function fieldPhase(state: WorldState): FieldPhase {
  const { season, day } = seasonAt(state.tick);
  const def = content.seasons[season];
  const sow = !!def?.sow && day >= def.sow[0] && day <= def.sow[1];
  const harvest = season === WINTER || (!!def?.harvest && day >= def.harvest[0]);
  return { sow, grow: season !== WINTER, harvest };
}

/** True when nothing stands or grows in the fields and the sowing window is shut. */
export function isFallow(state: WorldState, b: Building, def: BuildingDef): boolean {
  if (fieldPhase(state).sow) return false;
  const tiles = fieldsOf(state, b, def);
  if (tiles.length === 0) return false;
  for (const i of tiles) if (state.map.crop[i]! > 0) return false;
  return true;
}

/** An early frost: standing wheat loses half of what is left, green wheat half its growth. */
export function frostFields(state: WorldState, ctx: TickCtx): void {
  const m = state.map;
  let changed = false;
  for (let i = 0; i < m.crop.length; i++) {
    if (!m.fieldOwner[i]) continue;
    const c = m.crop[i]!;
    if (c === 0) continue;
    m.crop[i] = c >= HARVEST_MIN ? HARVEST_MIN + ((c - HARVEST_MIN) >> 1) : Math.max(1, c >> 1);
    changed = true;
  }
  if (changed) {
    const rect: Rect = [0, 0, MAP_SIZE - 1, MAP_SIZE - 1];
    ctx.dirty.mark('crop', rect);
    ctx.events.push({ e: 'tiles.changed', rect, layers: ['crop'] });
  }
}

/** One tended step on a tile: the new crop value and the wheat it gave (0 or CROP_YIELD). */
function tendTile(
  c: number,
  phase: FieldPhase,
  grow: number,
  growsNow: boolean,
  bite: number,
  room: boolean,
  vegNow: boolean,
): { next: number; wheat: number; veg: number; waiting: boolean } {
  if (phase.sow && (c === 0 || (c >= HARVEST_MIN && !phase.harvest))) {
    // Spring ploughing: bare ground and last year's standing sheaves are sown afresh.
    return { next: 1, wheat: 0, veg: 0, waiting: false };
  }
  if (phase.harvest && c >= HARVEST_MIN) {
    if (!room) return { next: c, wheat: 0, veg: 0, waiting: true };
    const left = c - bite;
    return { next: left < HARVEST_MIN ? 0 : left, wheat: CROP_YIELD, veg: 0, waiting: false };
  }
  if (phase.grow && c > 0 && c < CROP_RIPE && growsNow) {
    return { next: Math.min(CROP_RIPE, c + grow), wheat: 0, veg: 0, waiting: false };
  }
  // Missed the sowing: rows of vegetables keep the ground (and the larder) busy until spring.
  if (phase.grow && c === 0 && vegNow && room) return { next: 0, wheat: 0, veg: 1, waiting: false };
  return { next: c, wheat: 0, veg: 0, waiting: false };
}

/**
 * One tending step for a farmhouse whose crew adds `power` (percent-workers, after condition):
 * the first tiles in row order, as many as the crew can tend, are sown, grow or are harvested by
 * the season (fieldPhase); harvested wheat goes to the output buffer while it has room. Tiles a
 * road or building took over stop being fields. Returns true when standing wheat waits for room.
 */
export function tendFields(
  state: WorldState,
  ctx: TickCtx,
  b: Building,
  def: BuildingDef,
  power: number,
  wheat: number,
): boolean {
  const rt = b.rt!;
  const m = state.map;
  const cap = Math.floor((power * FIELD_TILES_PER_WORKER) / 100);
  const [x0, z0, x1, z1] = fieldArea(b, def);
  const room = outputCap(def);
  const phase = fieldPhase(state);
  const bite = hasInnovation(state, 'seed-drill') ? DRILL_STEP : HARVEST_STEP;
  const step = Math.floor(state.tick / CROP_STEP_TICKS);
  const vegetables = content.goodIndex.get('vegetables') ?? -1;
  let tended = 0;
  let sum = 0;
  let full = false;
  let dx0 = MAP_SIZE;
  let dz0 = MAP_SIZE;
  let dx1 = -1;
  let dz1 = -1;
  let lost: number[] | null = null;
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const i = z * MAP_SIZE + x;
      if (m.fieldOwner[i] !== b.id) continue;
      if (m.road[i] || m.occupant[i]) {
        (lost ??= []).push(i);
        continue;
      }
      if (tended >= cap) continue;
      tended++;
      const c = m.crop[i]!;
      const t = tendTile(
        c,
        phase,
        cropGrowth(m.fertility[i]!),
        (step + i) % GROW_EVERY === 0,
        bite,
        rt.output[wheat]! + CROP_YIELD <= room,
        (step + i) % VEG_EVERY === 0,
      );
      const next = t.next;
      if (t.wheat > 0) produce(state, ctx, b, wheat, t.wheat);
      if (t.veg > 0 && vegetables >= 0 && rt.output[vegetables]! < room)
        produce(state, ctx, b, vegetables, t.veg);
      if (t.waiting) full = true;
      m.crop[i] = next;
      sum += next;
      if (c >> CROP_STAGE_SHIFT !== next >> CROP_STAGE_SHIFT) {
        dx0 = Math.min(dx0, x);
        dz0 = Math.min(dz0, z);
        dx1 = Math.max(dx1, x);
        dz1 = Math.max(dz1, z);
      }
    }
  }
  // The farm's progress bar shows how ripe its tended fields are on average.
  rt.progress = tended > 0 ? Math.round(sum / tended) : 0;
  if (dx1 >= 0) {
    const rect: Rect = [dx0, dz0, dx1, dz1];
    ctx.dirty.mark('crop', rect);
    ctx.events.push({ e: 'tiles.changed', rect, layers: ['crop'] });
  }
  if (lost) {
    for (const i of lost) {
      m.fieldOwner[i] = 0;
      m.crop[i] = 0;
      if (m.terrain[i] === Terrain.field) m.terrain[i] = Terrain.grass;
    }
    const rect = rectOf(lost)!;
    state.networkVersion += 1;
    ctx.events.push({ e: 'tiles.changed', rect, layers: ['terrain', 'fieldOwner', 'crop'] });
    ctx.dirty.mark('terrain', rect);
    ctx.dirty.mark('fieldOwner', rect);
    ctx.dirty.mark('crop', rect);
  }
  return full;
}
