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
import { content, type LotDef, type ZoneDef } from '@qoti/content';
import { DECOR_BUILDING_MARGIN, MAP_SIZE, TILE_FP } from '../../constants';
import type { Lot, Rot4, TickCtx, WorldState } from '../../contracts';
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
      while (
        k + len < front.length &&
        front[k + len] === first + step * len &&
        m.zone[front[k + len]!] === zone &&
        // A run along x never wraps onto the next row.
        (!alongX || (first % S) + len < S)
      ) {
        const t = front[k + len]!;
        road = Math.max(road, m.road[t + ROAD_DZ[dir]! * S + ROAD_DX[dir]!]!);
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

/** Lot shapes for a zone, in a weighted order picked by `h` (heavier shapes come first more often). */
function shapeOrder(zone: ZoneDef, h: number): LotDef[] {
  const left = [...zone.lots];
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
      for (const shape of shapeOrder(zone, h)) {
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
    const lot = addLot(state, ctx, run, fx, fz, cut.size[0], cut.size[1]);
    out.push(lot);
    p += cut.size[0];
    // Low-density frontage leaves the odd gap, when a whole lot still fits after it.
    const rest = avail - cut.size[0];
    if (zone.density === 'low' && rest >= 3 && mix(lot.id, 3) % 4 === 0) p++;
  }
}

function addLot(
  state: WorldState,
  ctx: TickCtx | null,
  run: Run,
  fx: number,
  fz: number,
  w: number,
  d: number,
): Lot {
  const [x0, z0, rw, rd] = shapeRect(run.dir, fx, fz, w, d);
  const mid = (w - 1) >> 1;
  const frontX = run.dir < 2 ? fx + mid + ROAD_DX[run.dir]! : fx + ROAD_DX[run.dir]!;
  const frontZ = run.dir < 2 ? fz + ROAD_DZ[run.dir]! : fz + mid + ROAD_DZ[run.dir]!;
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
  };
  const layer = state.map.lot;
  for (let z = z0; z < z0 + rd; z++) for (let x = x0; x < x0 + rw; x++) layer[z * S + x] = lot.id;
  state.lots.push(lot);
  lot.style = pickStyle(state, lot);
  if (ctx) ctx.dirty.mark('lot', [x0, z0, x0 + rw - 1, z0 + rd - 1]);
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
  return hi - lo <= 1 && (!decorMoved || !swallowsDecor(state, lot.x, lot.z, lot.w, lot.d));
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

/** Counts of what a pass did, for tests and benches. */
export interface ZoningResult {
  added: number;
  removed: number;
}

/**
 * One zoning pass: empty lots the ground no longer allows go, then free frontage is cut into new
 * lots, round after round until nothing more fits, so a second pass right after finds nothing.
 * `decorMoved` false skips looking for decor on lots that were clear of it when last checked (the
 * caller knows no decor came or went since).
 */
export function zoningPass(state: WorldState, ctx: TickCtx | null, decorMoved = true): ZoningResult {
  let removed = 0;
  for (const lot of [...state.lots]) {
    if (lot.buildingId) continue;
    if (stillValid(state, lot, decorMoved)) continue;
    dropLot(state, ctx, lot);
    removed++;
  }
  // Zoned tiles outside any lot: the only places a new lot can start.
  const zoned: number[] = [];
  const zone = state.map.zone;
  const lotLayer = state.map.lot;
  for (let i = 0; i < N; i++) if (zone[i] && !lotLayer[i]) zoned.push(i);
  const added: Lot[] = [];
  if (zoned.length > 0) {
    markReserved(state);
    try {
      // Each round only takes free tiles, so this settles; the bound is a guard, never reached.
      for (let round = 0; round < 32; round++) {
        const before = added.length;
        for (const run of frontageRuns(state, zoned)) cutRun(state, ctx, run, added);
        if (added.length === before) break;
      }
    } finally {
      clearReserved();
    }
  }
  if (added.length > 0) {
    // A first score now; past the first few the species tastes wait for the lot's hourly slice
    // (refreshDesirability), so zoning a whole valley at once stays one short tick.
    const species = townSpecies(state);
    const services = servicesOf(state);
    added.forEach((lot, k) => {
      lot.desirability = lotDesirability(state, lot, k < FULL_SCORES ? species : [], services);
      ctx?.events.push({ e: 'lot.added', l: lotView(lot) });
    });
  }
  return { added: added.length, removed };
}
