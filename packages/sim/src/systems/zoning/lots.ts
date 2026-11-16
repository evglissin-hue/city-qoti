// Lot subdivision (docs/spec/13-ledger.md, Zoning and growth). Zoned tiles along a road become
// lots facing it, cut the way a street fills in over time rather than stamped from a grid:
//
// - Frontage runs: straight stretches of free zoned tiles with a road beside them (no more than a
//   level apart, so a door can reach it). Streets claim their frontage first, then lanes, then
//   paths; along a main road before a side spur, so corners go to the busier road.
// - Each run is cut into the zone's lot shapes (width along the road, depth back from it), picked
//   by weight with a hash of the place, never leaving a single orphan tile. Deep shapes give way to
//   shallow ones where the land rises or something stands in the way. Low-density zones leave the
//   odd one-tile gap (a garden, a gate, a shortcut); townhouses and shops stand shoulder to shoulder.
// - A lot never covers road, water, fields, a building, a tile in front of a door that faces it, or
//   the tiles just past a dead end (so roads can always go on), and never swallows decor; its
//   ground spreads at most one level. Roads may still be painted over empty lots, which then go.
//
// The pass is idempotent: once a frontage is cut, running it again changes nothing, so it can run
// hourly and only does work when the zones, roads or buildings changed.
//
// R2 (R2F), streets that fill their frontage (13-ledger.md, Lots; i4-visual-planning-notes.md, V2):
//
// - Rows: a zone whose content gives streets a `row` (Townhouses, Shops) cuts each street frontage
//   run into lots that touch, sharing their side lines, with no gaps; shapes per class of road come
//   from `ZoneDef.roads`. The touching lots of a run share `row`, an id from `state.nextId`. Lanes,
//   paths and low-density zones keep C4B's cut, gaps and all, so a town with no streets is cut (and
//   hashes) exactly as before.
// - Order of painting: the empty lots a street manages (rows, gardens, and empty lots of a row zone
//   beside a street) are lifted at the start of every pass and cut again, so what stands is a function
//   of the roads, zones and buildings, whatever order they came in. A lot cut again exactly where it
//   stood keeps its id and score. A lot with a building is never lifted, moved or cut out from under it.
// - Corners: where a row's end lot also fronts a cross road it is a corner lot (`corner`,
//   `frontage2`); its entrance stays on the busier road, which cut it first.
// - Gardens: ground the backs of rows close in (every edge a lot or a building, at least one of them a
//   row) becomes garden lots, never built on, in no zone; a block open on any side stays open to the
//   fields. Erasing a road or a row opens the block and the gardens go with the next pass.
import { content, type LotDef, type RoadLotsDef } from '@qoti/content';
import { DECOR_BUILDING_MARGIN, MAP_SIZE, TILE_FP, Zone } from '../../constants';
import type { Lot, Rot4, TickCtx, WorldState } from '../../contracts';
import { Road } from '../../map/layers';
import { inClearance, MAX_CLEAR } from '../../rules/clearance';
import { footprintSize } from '../../rules/footprint';
import { decorRadius, distSqToRect, MAX_DECOR_RADIUS } from '../../rules/geometry';
import { removeById } from '../../state/entities';
import { worldIndex } from '../../state/worldIndex';
import { lotView } from '../../view/village';
import { doorTile } from '../movement/api';
import { lotDesirability, mix, pickStyle, servicesOf, townSpecies } from '../growth/desirability';

const S = MAP_SIZE;
const N = S * S;

/** Where the road lies from a lot's front row: north (-z), south (+z), west (-x), east (+x). */
const ROAD_DX = [0, 0, -1, 1] as const;
const ROAD_DZ = [-1, 1, 0, 0] as const;
/** The lot's rotation for each road side (the entrance faces the road). */
const ROT_FOR: readonly Rot4[] = [2, 0, 1, 3];

/** New lots a pass scores in full; the rest get their species tastes within the day. */
const FULL_SCORES = 8;

/** R2F: the most tiles a closed block's garden ground may hold (a bigger hollow is open country). */
const GARDEN_MAX_TILES = 400;
/** R2F: the longest side of one garden lot, so a courtyard splits into gardens a row can own. */
const GARDEN_MAX_SIDE = 4;

/** R2F: empty lots lifted for this pass, by where they stood, so a lot cut again in place keeps its id. */
const lifted = new Map<string, Lot>();
/** R2F: lifted lots cut again in place this pass. */
const reused = new Set<Lot>();

/** Tiles no lot may take this pass (dead-end continuations, doors that face open ground). */
const reserved = new Uint8Array(N);
const reservedList: number[] = [];

interface Run {
  dir: number;
  zone: number;
  /** First tile (lowest x for north and south runs, lowest z for west and east). */
  x: number;
  z: number;
  len: number;
  /** Busiest road beside the run, and how far that road runs straight. */
  road: number;
  reach: number;
}

function reserve(i: number): void {
  if (i < 0 || i >= N || reserved[i]) return;
  reserved[i] = 1;
  reservedList.push(i);
}

function clearReserved(): void {
  for (const i of reservedList) reserved[i] = 0;
  reservedList.length = 0;
}

function markReserved(state: WorldState): void {
  const road = state.map.road;
  for (let i = 0; i < N; i++) {
    if (!road[i]) continue;
    const x = i % S;
    let n = 0;
    let only = -1;
    for (let k = 0; k < 4; k++) {
      if ((k === 0 && x === S - 1) || (k === 1 && x === 0)) continue;
      const nb = k === 0 ? i + 1 : k === 1 ? i - 1 : k === 2 ? i + S : i - S;
      if (nb < 0 || nb >= N || !road[nb]) continue;
      n++;
      only = nb;
    }
    if (n !== 1) continue;
    // A dead end: keep the next two tiles straight on free, so the road can carry on.
    const step = i - only;
    const sx = step === 1 || step === -1 ? step : 0;
    for (let k = 1; k <= 2; k++) {
      const nx = x + sx * k;
      if (nx < 0 || nx >= S) break;
      reserve(i + step * k);
    }
  }
  for (const b of state.buildings) {
    const door = doorTile(b);
    if (door >= 0 && door < N && !road[door]) reserve(door);
  }
}

/**
 * R2F: the pass's windmill clearance as a tile mask (marked: within some openGround building's
 * clearance), built once a pass, so the many shapes a street tries ask one array instead of
 * `inClearance`'s ring of occupant reads. Same answer: a rect is in clearance when one of its tiles is.
 */
const clearMask = new Uint8Array(N);
const clearList: number[] = [];
let clearReady = false;

function buildClearMask(state: WorldState): void {
  clearReady = true;
  if (MAX_CLEAR <= 0) return;
  for (const b of state.buildings) {
    const def = content.buildingById.get(b.def);
    const rule = def?.placement?.find((r) => r.kind === 'openGround');
    if (!def || !rule || rule.kind !== 'openGround') continue;
    const [w, d] = footprintSize(def, b.rot);
    const c = rule.clear;
    for (let z = Math.max(0, b.z - c); z <= Math.min(S - 1, b.z + d - 1 + c); z++) {
      for (let x = Math.max(0, b.x - c); x <= Math.min(S - 1, b.x + w - 1 + c); x++) {
        const i = z * S + x;
        if (!clearMask[i]) clearList.push(i);
        clearMask[i] = 1;
      }
    }
  }
}

function clearClearMask(): void {
  for (const i of clearList) clearMask[i] = 0;
  clearList.length = 0;
  clearReady = false;
}

/** True when the rect lies within a windmill's clearance (the mask while a pass holds one). */
function cleared(state: WorldState, x0: number, z0: number, w: number, d: number): boolean {
  if (!clearReady) return inClearance(worldIndex(state).reader, x0, z0, w, d);
  if (clearList.length === 0) return false;
  for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) if (clearMask[z * S + x]) return true;
  return false;
}

/** True when a tile may become part of a lot of `zone`. */
function free(state: WorldState, i: number, zone: number): boolean {
  const m = state.map;
  return (
    m.zone[i] === zone &&
    !m.lot[i] &&
    !m.road[i] &&
    !m.occupant[i] &&
    !m.water[i] &&
    !m.fieldOwner[i] &&
    !reserved[i]
  );
}

/** True when tile (x, z) is free and fronts a road on side `dir` that a door can reach. */
function fronts(state: WorldState, x: number, z: number, dir: number, zone: number): boolean {
  const rx = x + ROAD_DX[dir]!;
  const rz = z + ROAD_DZ[dir]!;
  if (rx < 0 || rz < 0 || rx >= S || rz >= S) return false;
  const i = z * S + x;
  const r = rz * S + rx;
  if (!state.map.road[r] || !free(state, i, zone)) return false;
  return Math.abs(state.map.height[i]! - state.map.height[r]!) <= 1;
}

/** Every frontage run on the map, busiest road and longest run first. */
function frontageRuns(state: WorldState, zoned: readonly number[]): Run[] {
  const m = state.map;
  const runs: Run[] = [];
  for (let dir = 0; dir < 4; dir++) {
    const alongX = dir < 2;
    // The zoned tiles that front a road on this side, in run order (along x, or along z).
    const front: number[] = [];
    for (const i of zoned) {
      const x = i % S;
      const z = (i - x) / S;
      if (!m.lot[i] && fronts(state, x, z, dir, m.zone[i]!)) front.push(i);
    }
    if (!alongX) front.sort((p, q) => (p % S) - (q % S) || p - q);
    const step = alongX ? 1 : S;
    let k = 0;
    while (k < front.length) {
      const first = front[k]!;
      const zone = m.zone[first]!;
      let road = 0;
      let len = 0;
      const off = ROAD_DZ[dir]! * S + ROAD_DX[dir]!;
      const street = isStreet(m.road[first + off]!);
      while (
        k + len < front.length &&
        front[k + len] === first + step * len &&
        m.zone[front[k + len]!] === zone &&
        // A run along x never wraps onto the next row.
        (!alongX || (first % S) + len < S) &&
        // R2F: a run is all street or all lane and path (never true in a town with no streets).
        isStreet(m.road[front[k + len]! + off]!) === street
      ) {
        const t = front[k + len]!;
        road = Math.max(road, m.road[t + off]!);
        len++;
      }
      runs.push({ dir, zone, x: first % S, z: Math.floor(first / S), len, road, reach: 0 });
      k += len;
    }
  }
  for (const r of runs) r.reach = straightRoad(state, r);
  runs.sort(
    (p, q) =>
      q.road - p.road ||
      q.reach - p.reach ||
      q.len - p.len ||
      p.z * S + p.x - (q.z * S + q.x) ||
      p.dir - q.dir,
  );
  return runs;
}

/** How far the road beside a run goes on in a straight line (a main road outranks a side spur). */
function straightRoad(state: WorldState, run: Run): number {
  const road = state.map.road;
  const alongX = run.dir < 2;
  const rx = run.x + ROAD_DX[run.dir]!;
  const rz = run.z + ROAD_DZ[run.dir]!;
  let n = 1;
  for (const step of [-1, 1]) {
    for (let k = 1; k < S; k++) {
      const x = alongX ? rx + step * k : rx;
      const z = alongX ? rz : rz + step * k;
      if (x < 0 || z < 0 || x >= S || z >= S || !road[z * S + x]) break;
      n++;
    }
  }
  return n;
}

/** The world rect of a lot shape at run position (fx, fz) facing a road on side `dir`. */
function shapeRect(
  dir: number,
  fx: number,
  fz: number,
  w: number,
  d: number,
): [number, number, number, number] {
  switch (dir) {
    case 0:
      return [fx, fz, w, d];
    case 1:
      return [fx, fz - d + 1, w, d];
    case 2:
      return [fx, fz, d, w];
    default:
      return [fx - d + 1, fz, d, w];
  }
}

/** True when the rect may become a lot: free ground of the zone, gentle, no decor in it. */
function fits(state: WorldState, zone: number, x0: number, z0: number, w: number, d: number): boolean {
  if (x0 < 0 || z0 < 0 || x0 + w > S || z0 + d > S) return false;
  const reader = worldIndex(state).reader;
  let lo = 255;
  let hi = 0;
  for (let z = z0; z < z0 + d; z++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = z * S + x;
      if (!free(state, i, zone) || !reader.parcelUnlocked(x, z)) return false;
      const h = state.map.height[i]!;
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  if (hi - lo > 1) return false;
  // A windmill keeps its open ground: no lot inside its clearance.
  if (cleared(state, x0, z0, w, d)) return false;
  return !swallowsDecor(state, x0, z0, w, d);
}

/** True when decor stands within the building margin of the rect (a building there would eat it). */
export function swallowsDecor(state: WorldState, x: number, z: number, w: number, d: number): boolean {
  const x0 = x * TILE_FP;
  const z0 = z * TILE_FP;
  const x1 = (x + w) * TILE_FP;
  const z1 = (z + d) * TILE_FP;
  const cx = (x0 + x1) >> 1;
  const cz = (z0 + z1) >> 1;
  const reach =
    Math.ceil(Math.sqrt((x1 - cx) * (x1 - cx) + (z1 - cz) * (z1 - cz))) +
    MAX_DECOR_RADIUS +
    DECOR_BUILDING_MARGIN;
  for (const dec of worldIndex(state).reader.decorNear(cx, cz, reach)) {
    const r = decorRadius(dec.def) + DECOR_BUILDING_MARGIN;
    if (distSqToRect(dec.fx, dec.fz, x0, z0, x1, z1) < r * r) return true;
  }
  return false;
}

/** True for a street or an avenue (the classes whose frontage a row zone fills). */
function isStreet(road: number): boolean {
  return road >= Road.street;
}

/** R2F: how a zone cuts frontage on this road value, when its content says so. */
function roadLots(zone: number, road: number): RoadLotsDef | undefined {
  const roads = content.zoneByValue.get(zone)?.roads;
  if (!roads) return undefined;
  return road >= Road.street ? roads.street : road === Road.lane ? roads.lane : roads.path;
}

/** R2F: true when the zone fills its street frontage with rows. */
function rowZone(zone: number): boolean {
  return content.zoneByValue.get(zone)?.roads?.street?.row === true;
}

/** Lot shapes, in a weighted order picked by `h` (heavier shapes come first more often). */
function shapeOrder(lots: readonly LotDef[], h: number): LotDef[] {
  const left = [...lots];
  const out: LotDef[] = [];
  let k = 0;
  while (left.length > 0) {
    let total = 0;
    for (const l of left) total += l.weight;
    let pick = mix(h, k++) % Math.max(1, total);
    let j = 0;
    while (j < left.length - 1 && pick >= left[j]!.weight) pick -= left[j++]!.weight;
    out.push(left.splice(j, 1)[0]!);
  }
  return out;
}

/** Cuts one run into lots. Returns the lots cut. */
function cutRun(state: WorldState, ctx: TickCtx | null, run: Run, out: Lot[]): void {
  const zone = content.zoneByValue.get(run.zone);
  if (!zone) return;
  const spec = roadLots(run.zone, run.road);
  if (spec?.row) {
    cutRow(state, ctx, run, spec.lots, out);
    return;
  }
  const shapes = spec?.lots ?? zone.lots;
  const alongX = run.dir < 2;
  let p = 0;
  while (p < run.len) {
    const fx = alongX ? run.x + p : run.x;
    const fz = alongX ? run.z : run.z + p;
    // How much of the run from here is still free frontage (an earlier run may have taken some).
    let avail = 0;
    while (p + avail < run.len) {
      const ax = alongX ? fx + avail : fx;
      const az = alongX ? fz : fz + avail;
      if (!fronts(state, ax, az, run.dir, run.zone)) break;
      avail++;
    }
    if (avail === 0) {
      p++;
      continue;
    }
    const h = mix(fz * S + fx, run.dir);
    let cut: LotDef | null = null;
    for (const pass of [0, 1]) {
      for (const shape of shapeOrder(shapes, h)) {
        const [w, d] = shape.size;
        // First try shapes that leave no lone tile behind, then anything that fits.
        if (w > avail || (pass === 0 && avail - w === 1)) continue;
        const [x0, z0, rw, rd] = shapeRect(run.dir, fx, fz, w, d);
        if (fits(state, run.zone, x0, z0, rw, rd)) {
          cut = shape;
          break;
        }
      }
      if (cut) break;
    }
    if (!cut) {
      p++;
      continue;
    }
    const lot = addLot(state, ctx, run, fx, fz, cut.size[0], cut.size[1], out);
    p += cut.size[0];
    // Low-density frontage leaves the odd gap, when a whole lot still fits after it.
    const rest = avail - cut.size[0];
    if (zone.density === 'low' && rest >= 3 && mix(lot.id, 3) % 4 === 0) p++;
  }
}

/**
 * R2F: cuts a street run into one row of lots that touch: shapes of the zone's commonest width that
 * leave the rest of the free frontage fillable first, then any width that does (so nothing is left
 * over), then any that fit; a tile nothing fits on is the only gap. Choices depend on the place and the free frontage alone, never on the order of painting.
 */
function cutRow(
  state: WorldState,
  ctx: TickCtx | null,
  run: Run,
  shapes: readonly LotDef[],
  out: Lot[],
): void {
  const alongX = run.dir < 2;
  // fillable[n]: n tiles of frontage can be cut into the shapes' widths with nothing left over.
  const fillable = new Uint8Array(run.len + 1);
  fillable[0] = 1;
  for (let n = 1; n <= run.len; n++) {
    for (const s of shapes) if (s.size[0] <= n && fillable[n - s.size[0]]) fillable[n] = 1;
  }
  // The commonest width (by weight): rows are filled with it, so the buildings, as wide as their lots,
  // stand joined; another width only where the run would not come out even (once, at its end).
  const byWidth = new Map<number, number>();
  for (const s of shapes) byWidth.set(s.size[0], (byWidth.get(s.size[0]) ?? 0) + s.weight);
  let common = 0;
  for (const [w, weight] of byWidth) if (!common || weight > byWidth.get(common)!) common = w;
  let p = 0;
  while (p < run.len) {
    const fx = alongX ? run.x + p : run.x;
    const fz = alongX ? run.z : run.z + p;
    let avail = 0;
    while (p + avail < run.len) {
      const ax = alongX ? fx + avail : fx;
      const az = alongX ? fz : fz + avail;
      if (!fronts(state, ax, az, run.dir, run.zone)) break;
      avail++;
    }
    if (avail === 0) {
      p++;
      continue;
    }
    const h = mix(fz * S + fx, run.dir);
    let cut: LotDef | null = null;
    for (const pass of [0, 1, 2]) {
      for (const shape of shapeOrder(shapes, h)) {
        const [w, d] = shape.size;
        if (w > avail || (pass < 2 && !fillable[avail - w]) || (pass === 0 && w !== common)) continue;
        const [x0, z0, rw, rd] = shapeRect(run.dir, fx, fz, w, d);
        if (fits(state, run.zone, x0, z0, rw, rd)) {
          cut = shape;
          break;
        }
      }
      if (cut) break;
    }
    if (!cut) {
      p++;
      continue;
    }
    addLot(state, ctx, run, fx, fz, cut.size[0], cut.size[1], out);
    p += cut.size[0];
  }
}

/** Where a lot stands, for finding a lifted lot cut again in the same place. */
function placeKey(
  x: number,
  z: number,
  w: number,
  d: number,
  rot: number,
  zone: number,
  front: number,
): string {
  return `${x},${z},${w},${d},${rot},${zone},${front}`;
}

/** Stamps a lot's tiles into the lot layer. */
function stamp(state: WorldState, lot: Lot): void {
  const layer = state.map.lot;
  for (let z = lot.z; z < lot.z + lot.d; z++)
    for (let x = lot.x; x < lot.x + lot.w; x++) layer[z * S + x] = lot.id;
}

/** A new lot at run position (fx, fz), or the lifted one that stood exactly there; new ones join `out`. */
function addLot(
  state: WorldState,
  ctx: TickCtx | null,
  run: Run,
  fx: number,
  fz: number,
  w: number,
  d: number,
  out: Lot[],
): Lot {
  const [x0, z0, rw, rd] = shapeRect(run.dir, fx, fz, w, d);
  const mid = (w - 1) >> 1;
  const frontX = run.dir < 2 ? fx + mid + ROAD_DX[run.dir]! : fx + ROAD_DX[run.dir]!;
  const frontZ = run.dir < 2 ? fz + ROAD_DZ[run.dir]! : fz + mid + ROAD_DZ[run.dir]!;
  const was = lifted.get(placeKey(x0, z0, rw, rd, ROT_FOR[run.dir]!, run.zone, frontZ * S + frontX));
  if (was && !reused.has(was)) {
    reused.add(was);
    stamp(state, was);
    return was;
  }
  const lot: Lot = {
    id: state.nextId++,
    zone: run.zone,
    x: x0,
    z: z0,
    w: rw,
    d: rd,
    rot: ROT_FOR[run.dir]!,
    frontage: frontZ * S + frontX,
    desirability: 0,
    style: '',
    buildingId: 0,
    tick: state.tick,
    // R2F: rows are numbered once the pass has cut everything (assignRows).
    row: 0,
    kind: 'plot',
  };
  stamp(state, lot);
  state.lots.push(lot);
  lot.style = pickStyle(state, lot);
  if (ctx) ctx.dirty.mark('lot', [x0, z0, x0 + rw - 1, z0 + rd - 1]);
  out.push(lot);
  return lot;
}

/** True when an empty lot still stands where it was cut, on ground it may use. */
function stillValid(state: WorldState, lot: Lot, decorMoved: boolean): boolean {
  const m = state.map;
  if (!m.road[lot.frontage] || !content.zoneByValue.has(lot.zone)) return false;
  let lo = 255;
  let hi = 0;
  for (let z = lot.z; z < lot.z + lot.d; z++) {
    for (let x = lot.x; x < lot.x + lot.w; x++) {
      const i = z * S + x;
      if (m.lot[i] !== lot.id || m.zone[i] !== lot.zone) return false;
      if (m.road[i] || m.occupant[i] || m.water[i] || m.fieldOwner[i]) return false;
      const h = m.height[i]!;
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  if (hi - lo > 1 || cleared(state, lot.x, lot.z, lot.w, lot.d)) return false;
  return !decorMoved || !swallowsDecor(state, lot.x, lot.z, lot.w, lot.d);
}

/** Removes a lot and its tiles from the lot layer. */
export function dropLot(state: WorldState, ctx: TickCtx | null, lot: Lot): void {
  const layer = state.map.lot;
  for (let z = lot.z; z < lot.z + lot.d; z++) {
    for (let x = lot.x; x < lot.x + lot.w; x++) if (layer[z * S + x] === lot.id) layer[z * S + x] = 0;
  }
  removeById(state.lots, lot.id);
  if (ctx) {
    ctx.dirty.mark('lot', [lot.x, lot.z, lot.x + lot.w - 1, lot.z + lot.d - 1]);
    ctx.events.push({ e: 'lot.removed', id: lot.id });
  }
}

/**
 * R2F: a count per state of the passes that changed some lot (cut, dropped, or a row or corner
 * renumbered in place), so the storeys refit knows when rows may have changed. Derived, never saved.
 */
const lotEpochs = new WeakMap<WorldState, number>();

/** R2F: how many passes have changed a lot of this state (see lotEpochs). */
export function lotEpoch(state: WorldState): number {
  return lotEpochs.get(state) ?? 0;
}

/** Counts of what a pass did, for tests and benches. */
export interface ZoningResult {
  added: number;
  removed: number;
}

/** R2F: the deepest lot any zone cuts along a street in rows (how far a street's frontage reaches back). */
let streetReach = -1;
function rowReach(): number {
  if (streetReach < 0) {
    streetReach = 0;
    for (const z of content.zones) {
      if (!z.roads?.street?.row) continue;
      for (const l of z.roads.street.lots) streetReach = Math.max(streetReach, l.size[1]);
    }
  }
  return streetReach;
}

/**
 * True when a street (or an avenue) lies within a street lot's depth of the lot, so a row along it
 * may want the lot's ground (a lot cut by a lane before the street came stands in its way).
 */
function nearStreet(state: WorldState, lot: Lot): boolean {
  const road = state.map.road;
  const r = rowReach();
  const x0 = Math.max(0, lot.x - r);
  const z0 = Math.max(0, lot.z - r);
  const x1 = Math.min(S - 1, lot.x + lot.w - 1 + r);
  const z1 = Math.min(S - 1, lot.z + lot.d - 1 + r);
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (isStreet(road[z * S + x]!)) return true;
  return false;
}

/**
 * R2F: an empty lot a street manages, cut again every pass: a garden, a row lot, or an empty lot of a
 * row zone within a street lot's depth of a street (cut before the street came, or by a lane at its
 * corner). None exist in a town with no streets.
 */
function managed(state: WorldState, lot: Lot): boolean {
  if (lot.buildingId) return false;
  if (lot.kind === 'garden' || lot.row !== 0) return true;
  return rowZone(lot.zone) && nearStreet(state, lot);
}

/** R2F: lifts the managed empty lots off the lot layer, keyed by where they stood. */
function liftManaged(state: WorldState, lots: readonly Lot[]): void {
  const layer = state.map.lot;
  for (const lot of lots) {
    const key =
      lot.kind === 'garden'
        ? gardenKey(lot.x, lot.z, lot.w, lot.d)
        : placeKey(lot.x, lot.z, lot.w, lot.d, lot.rot, lot.zone, lot.frontage);
    lifted.set(key, lot);
    for (let z = lot.z; z < lot.z + lot.d; z++) {
      for (let x = lot.x; x < lot.x + lot.w; x++) if (layer[z * S + x] === lot.id) layer[z * S + x] = 0;
    }
  }
}

/** R2F: removes the lifted lots of one kind that were not cut again in place. Returns how many. */
function dropUnused(state: WorldState, ctx: TickCtx | null, lots: readonly Lot[], garden: boolean): number {
  let n = 0;
  for (const lot of lots) {
    if ((lot.kind === 'garden') !== garden || reused.has(lot)) continue;
    dropLot(state, ctx, lot);
    n++;
  }
  return n;
}

/** Position of a lot along its road (x for lots facing north or south, z for east or west). */
function along(lot: Lot): number {
  return lot.rot % 2 === 0 ? lot.x : lot.z;
}

/** Width of a lot along its road. */
function width(lot: Lot): number {
  return lot.rot % 2 === 0 ? lot.w : lot.d;
}

/** Depth of a lot back from its road. */
function depth(lot: Lot): number {
  return lot.rot % 2 === 0 ? lot.d : lot.w;
}

/** The tile `k` deep from the road at position `a` along it (a may lie just outside the lot). */
function tileAt(lot: Lot, a: number, k: number): [number, number] {
  switch (lot.rot) {
    case 2:
      return [a, lot.z + k];
    case 0:
      return [a, lot.z + lot.d - 1 - k];
    case 1:
      return [lot.x + k, a];
    default:
      return [lot.x + lot.w - 1 - k, a];
  }
}

/**
 * R2F: the second frontage of a row's end lot, when a cross road runs past its side: the road tile
 * beside the middle of that side if there is one, else beside its front tile; within a level of the
 * lot's ground. The busier cross road wins when both sides have one. -1 when it is no corner.
 */
function secondFrontage(state: WorldState, lot: Lot): number {
  const m = state.map;
  let best = -1;
  let bestRoad = 0;
  const a0 = along(lot);
  for (const a of [a0 - 1, a0 + width(lot)]) {
    const inside = a < a0 ? a0 : a0 + width(lot) - 1;
    const [fx, fz] = tileAt(lot, a, 0);
    if (fx < 0 || fz < 0 || fx >= S || fz >= S || m.road[fz * S + fx]! < Road.lane) continue;
    // The entrance stays on the busier road: a busier cross road that did not cut this lot (a stub
    // too short for a lot of its own) makes no corner of it.
    if (m.road[fz * S + fx]! > m.road[lot.frontage]!) continue;
    for (const k of [(depth(lot) - 1) >> 1, 0]) {
      const [rx, rz] = tileAt(lot, a, k);
      const [ix, iz] = tileAt(lot, inside, k);
      const r = rz * S + rx;
      const road = m.road[r]!;
      if (road < Road.lane || Math.abs(m.height[r]! - m.height[iz * S + ix]!) > 1) continue;
      if (road > bestRoad) {
        best = r;
        bestRoad = road;
      }
      break;
    }
  }
  return best;
}

/**
 * R2F: numbers the rows and marks the corners. A row is a chain of touching plots of one row zone
 * along one street line (built or not); it keeps the row id its members already carry (the built
 * ones' first), else takes a fresh one. Lots that no longer stand in a row lose theirs. Lots whose row
 * or corner changed go in `changed`.
 */
function assignRows(state: WorldState, changed: Set<Lot>): void {
  const road = state.map.road;
  const lines = new Map<number, Lot[]>();
  for (const lot of state.lots) {
    const inRow = lot.kind === 'plot' && rowZone(lot.zone) && isStreet(road[lot.frontage]!);
    if (!inRow) {
      if (lot.kind === 'plot' && (lot.row !== 0 || lot.corner)) {
        lot.row = 0;
        delete lot.corner;
        delete lot.frontage2;
        changed.add(lot);
      }
      continue;
    }
    const fx = lot.frontage % S;
    const line = lot.rot * S + (lot.rot % 2 === 0 ? (lot.frontage - fx) / S : fx);
    let list = lines.get(line);
    if (!list) lines.set(line, (list = []));
    list.push(lot);
  }
  const taken = new Set<number>();
  const keys = [...lines.keys()].sort((p, q) => p - q);
  for (const key of keys) {
    const list = lines.get(key)!.sort((p, q) => along(p) - along(q) || p.id - q.id);
    let k = 0;
    while (k < list.length) {
      let end = k + 1;
      while (
        end < list.length &&
        list[end]!.zone === list[k]!.zone &&
        along(list[end - 1]!) + width(list[end - 1]!) === along(list[end]!)
      )
        end++;
      const chain = list.slice(k, end);
      let id = 0;
      for (const built of [true, false]) {
        for (const l of chain) {
          if (!l.row || taken.has(l.row) || (l.buildingId !== 0) !== built) continue;
          if (!id || l.row < id) id = l.row;
        }
        if (id) break;
      }
      if (!id) id = state.nextId++;
      taken.add(id);
      for (const l of chain) {
        const second = secondFrontage(state, l);
        const corner = second >= 0;
        if (l.row === id && !!l.corner === corner && (l.frontage2 ?? -1) === second) continue;
        l.row = id;
        if (corner) {
          l.corner = true;
          l.frontage2 = second;
        } else {
          delete l.corner;
          delete l.frontage2;
        }
        changed.add(l);
      }
      k = end;
    }
  }
}

/** Where a garden stands, for finding a lifted garden cut again in the same place. */
function gardenKey(x: number, z: number, w: number, d: number): string {
  return `g${x},${z},${w},${d}`;
}

/** R2F: garden search marks per tile: 1 seen in this search, 2 open ground (not a closed block). */
const seenMark = new Uint8Array(N);
const seenList: number[] = [];

function mark(i: number, v: number): void {
  if (!seenMark[i]) seenList.push(i);
  seenMark[i] = v;
}

/**
 * True when a tile is open ground a garden may take: no road, water, field, building or lot, and not
 * Farmland (free farm ground is a farm's fields, so a block that holds some is open to the fields).
 */
function gardenGround(state: WorldState, i: number): boolean {
  const m = state.map;
  if (m.road[i] || m.water[i] || m.fieldOwner[i] || m.occupant[i] || m.lot[i]) return false;
  if (m.zone[i] === Zone.farms) return false;
  const x = i % S;
  return worldIndex(state).reader.parcelUnlocked(x, (i - x) / S);
}

/**
 * R2F: the garden lots. From the ground beside every row lot, each hollow is searched: if every edge
 * is a lot or a building (one of them a row's), it is a closed block and becomes gardens, split into
 * rectangles of at most GARDEN_MAX_SIDE, each owned by a row lot it backs onto. Gardens are in no
 * zone and never grow. Returns the new ones (lifted gardens cut again in place keep their ids).
 */
function planGardens(state: WorldState, ctx: TickCtx | null, changed: Set<Lot>): Lot[] {
  const m = state.map;
  const added: Lot[] = [];
  const rowLots = state.lots.filter((l) => l.kind === 'plot' && l.row !== 0);
  if (rowLots.length === 0) return added;
  const byId = new Map<number, Lot>();
  for (const l of state.lots) byId.set(l.id, l);
  const rowOf = (i: number): Lot | undefined => {
    const l = m.lot[i] ? byId.get(m.lot[i]!) : undefined;
    return l && l.kind === 'plot' && l.row !== 0 ? l : undefined;
  };
  const queue: number[] = [];
  try {
    for (const lot of rowLots) {
      for (let z = lot.z - 1; z <= lot.z + lot.d; z++) {
        for (let x = lot.x - 1; x <= lot.x + lot.w; x++) {
          const edge = z === lot.z - 1 || z === lot.z + lot.d || x === lot.x - 1 || x === lot.x + lot.w;
          const corner = (z === lot.z - 1 || z === lot.z + lot.d) && (x === lot.x - 1 || x === lot.x + lot.w);
          if (!edge || corner || x < 0 || z < 0 || x >= S || z >= S) continue;
          const seed = z * S + x;
          if (seenMark[seed] || !gardenGround(state, seed)) continue;
          // One hollow: closed while every edge is a lot or a building and it stays small.
          queue.length = 0;
          queue.push(seed);
          mark(seed, 1);
          let closed = true;
          for (let q = 0; q < queue.length && closed; q++) {
            const i = queue[q]!;
            const ix = i % S;
            for (let k = 0; k < 4 && closed; k++) {
              if ((k === 0 && ix === S - 1) || (k === 1 && ix === 0)) {
                closed = false;
                break;
              }
              const nb = k === 0 ? i + 1 : k === 1 ? i - 1 : k === 2 ? i + S : i - S;
              if (nb < 0 || nb >= N) {
                closed = false;
                break;
              }
              if (seenMark[nb] === 2) closed = false;
              else if (seenMark[nb] === 1) continue;
              else if (gardenGround(state, nb)) {
                mark(nb, 1);
                queue.push(nb);
                if (queue.length > GARDEN_MAX_TILES) closed = false;
              } else if (!m.lot[nb] && !m.occupant[nb]) closed = false;
            }
          }
          if (!closed) {
            for (const i of queue) mark(i, 2);
            continue;
          }
          gardensOf(state, ctx, queue, rowOf, lot, changed, added);
        }
      }
    }
  } finally {
    for (const i of seenList) seenMark[i] = 0;
    seenList.length = 0;
  }
  return added;
}

/** R2F: splits one closed hollow into garden lots, each owned by a row lot it touches. */
function gardensOf(
  state: WorldState,
  ctx: TickCtx | null,
  tiles: number[],
  rowOf: (i: number) => Lot | undefined,
  first: Lot,
  changed: Set<Lot>,
  added: Lot[],
): void {
  // The hollow's tiles are marked 1 in seenMark; a tile given to a garden is marked 3.
  const open = (i: number): boolean => seenMark[i] === 1;
  const sorted = tiles.slice().sort((p, q) => p - q);
  for (const t of sorted) {
    if (!open(t)) continue;
    const x0 = t % S;
    const z0 = (t - x0) / S;
    let w = 1;
    while (w < GARDEN_MAX_SIDE && x0 + w < S && open(t + w)) w++;
    let d = 1;
    grow: while (d < GARDEN_MAX_SIDE && z0 + d < S) {
      for (let x = 0; x < w; x++) if (!open((z0 + d) * S + x0 + x)) break grow;
      d++;
    }
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) seenMark[z * S + x] = 3;
    // The row lot it backs onto: the first along its edge, else the one that found the hollow.
    let owner: Lot | undefined;
    for (let z = z0 - 1; z <= z0 + d && !owner; z++) {
      for (let x = x0 - 1; x <= x0 + w && !owner; x++) {
        const edge = z === z0 - 1 || z === z0 + d || x === x0 - 1 || x === x0 + w;
        const corner = (z === z0 - 1 || z === z0 + d) && (x === x0 - 1 || x === x0 + w);
        if (edge && !corner && x >= 0 && z >= 0 && x < S && z < S) owner = rowOf(z * S + x);
      }
    }
    owner ??= first;
    addGarden(state, ctx, x0, z0, w, d, owner, changed, added);
  }
}

/** R2F: a garden lot owned by `owner`'s row, or the lifted garden that stood exactly there. */
function addGarden(
  state: WorldState,
  ctx: TickCtx | null,
  x: number,
  z: number,
  w: number,
  d: number,
  owner: Lot,
  changed: Set<Lot>,
  added: Lot[],
): void {
  const was = lifted.get(gardenKey(x, z, w, d));
  if (was && !reused.has(was)) {
    reused.add(was);
    stamp(state, was);
    if (was.row !== owner.row || was.rot !== owner.rot || was.frontage !== owner.frontage) {
      was.row = owner.row;
      was.rot = owner.rot;
      was.frontage = owner.frontage;
      changed.add(was);
    }
    return;
  }
  const lot: Lot = {
    id: state.nextId++,
    zone: 0,
    x,
    z,
    w,
    d,
    rot: owner.rot,
    frontage: owner.frontage,
    desirability: 0,
    style: '',
    buildingId: 0,
    tick: state.tick,
    row: owner.row,
    kind: 'garden',
  };
  stamp(state, lot);
  state.lots.push(lot);
  if (ctx) ctx.dirty.mark('lot', [x, z, x + w - 1, z + d - 1]);
  added.push(lot);
}

/**
 * One zoning pass: empty lots the ground no longer allows go, then free frontage is cut into new
 * lots, round after round until nothing more fits, so a second pass right after finds nothing.
 * `decorMoved` false skips looking for decor on lots that were clear of it when last checked (the
 * caller knows no decor came or went since). R2F: the empty lots streets manage are lifted first and
 * cut again with the rest, then rows are numbered, corners marked and gardens found; `streetsSettled`
 * (only buildings grown on lots came since the last pass) leaves them standing.
 */
export function zoningPass(
  state: WorldState,
  ctx: TickCtx | null,
  decorMoved = true,
  streetsSettled = false,
): ZoningResult {
  buildClearMask(state);
  try {
    return cutAll(state, ctx, decorMoved, streetsSettled);
  } finally {
    clearClearMask();
  }
}

function cutAll(
  state: WorldState,
  ctx: TickCtx | null,
  decorMoved: boolean,
  streetsSettled: boolean,
): ZoningResult {
  let removed = 0;
  // R2F: the lots streets manage are lifted and cut again below (unless the streets are settled), so
  // only the others are checked here; a managed lot the ground no longer allows is simply not cut again.
  const up: Lot[] = [];
  if (!streetsSettled) for (const lot of state.lots) if (managed(state, lot)) up.push(lot);
  const lifting = new Set(up);
  for (const lot of [...state.lots]) {
    if (lot.buildingId || lot.kind === 'garden' || lifting.has(lot)) continue;
    if (stillValid(state, lot, decorMoved)) continue;
    dropLot(state, ctx, lot);
    removed++;
  }
  // R2F: when only buildings grown on lots came since the last pass (the caller knows), the street
  // lots stand as they would be cut again, so they stay down unless this pass dropped one.
  const settled = streetsSettled && removed === 0;
  if (streetsSettled && !settled) for (const lot of state.lots) if (managed(state, lot)) up.push(lot);
  const added: Lot[] = [];
  const changed = new Set<Lot>();
  let gardens: Lot[] = [];
  try {
    if (!settled) liftManaged(state, up);
    // Zoned tiles outside any lot: the only places a new lot can start.
    const zoned: number[] = [];
    const zone = state.map.zone;
    const lotLayer = state.map.lot;
    for (let i = 0; i < N; i++) if (zone[i] && !lotLayer[i]) zoned.push(i);
    if (zoned.length > 0) {
      markReserved(state);
      try {
        // Each round only takes free tiles, so this settles; the bound is a guard, never reached.
        for (let round = 0; round < 32; round++) {
          const before = added.length + reused.size;
          for (const run of frontageRuns(state, zoned)) cutRun(state, ctx, run, added);
          if (added.length + reused.size === before) break;
        }
      } finally {
        clearReserved();
      }
    }
    removed += dropUnused(state, ctx, up, false);
    if (!settled || added.length > 0) {
      assignRows(state, changed);
      gardens = planGardens(state, ctx, changed);
    }
    removed += dropUnused(state, ctx, up, true);
  } finally {
    lifted.clear();
    reused.clear();
  }
  if (added.length > 0) {
    // A first score now; past the first few the species tastes wait for the lot's hourly slice
    // (refreshDesirability), so zoning a whole valley at once stays one short tick.
    const species = townSpecies(state);
    const services = servicesOf(state);
    added.forEach((lot, k) => {
      lot.desirability = lotDesirability(state, lot, k < FULL_SCORES ? species : [], services);
    });
  }
  if (added.length + gardens.length + removed + changed.size > 0) lotEpochs.set(state, lotEpoch(state) + 1);
  if (ctx) {
    const fresh = new Set<Lot>([...added, ...gardens]);
    for (const lot of state.lots) {
      if (fresh.has(lot)) ctx.events.push({ e: 'lot.added', l: lotView(lot, state) });
      else if (changed.has(lot)) ctx.events.push({ e: 'lot.updated', l: lotView(lot, state) });
    }
  }
  return { added: added.length + gardens.length, removed };
}
