import { content } from '@qoti/content';
import { entranceTiles, MAP_SIZE, START_HOUR, Terrain, TICKS_PER_DAY, TICKS_PER_HOUR } from '@qoti/sim';
import type { BuildingView } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { drawDef } from './defs';

/**
 * V3A: the ground between the buildings. Pure CPU side of the worn paths, the cobble aprons and the
 * puddles' rain memory; ground.ts uploads the result as one small texture (one texel a tile) and
 * the ground shader draws it. Everything here reads the Mirror only, so both seats get the same
 * bytes, and runs when the town changes, never per frame.
 *
 * The walk texture (RGBA8, one texel a tile):
 * - R: low nibble, which of the four neighbors (E, S, W, N: bits 1, 2, 4, 8) this tile's path
 *   continues to; high nibble, the same bits for a neighbor that is a road (the path runs into it).
 * - G: where the door is, for the first tile of a path: 1 + direction of the door tile (E, S, W, N).
 * - B: a cobble apron on this tile: 1 + the rotation of the door that opens onto it.
 * - A: how well used the path is (170 a home's, 255 a business's), 0 off a path.
 */

const N = MAP_SIZE;
/** Most tiles in one path. */
export const WALK_REACH = 8;
export const Walk = { E: 1, S: 2, W: 4, N: 8, roadShift: 16 } as const;

/** Direction index 0 E, 1 S, 2 W, 3 N. */
const DX = [1, 0, -1, 0];
const DZ = [0, 1, 0, -1];
/** The way a door at rotation r faces, as a direction index (as footprint.ts `facing`). */
const FACING = [1, 2, 3, 0];

/** Looks that are shop fronts: their door gets cobbles whatever the level. */
const SHOP_LOOKS = new Set(['shop', 'chandler', 'bakery', 'weaver']);
/** Kits that are not a home or a workplace with a door worth a path. */
const NO_PATH_KITS = new Set(['well', 'vegetable-plot', 'shed']);

/** Does this building's door wear a path? Homes and workplaces, built, not yards or defenses. */
export function wantsPath(b: BuildingView): boolean {
  if (b.stage !== 'built') return false;
  const def = drawDef(b.def);
  if (!def || def.category === 'defense' || def.category === 'landmark') return false;
  return !NO_PATH_KITS.has(def.art.kit);
}

/** A cobble apron at the door: a business of level 2 and up, or any whose look is a shop front. */
export function wantsApron(b: BuildingView): boolean {
  if (!b.trade || !wantsPath(b)) return false;
  if ((b.level ?? 1) >= 2) return true;
  const look = content.tradeById.get(b.trade)?.look.kit;
  return look !== undefined && SHOP_LOOKS.has(look);
}

type Layers = Mirror['layers'];

function walkable(L: Layers, x: number, z: number, from: number): boolean {
  if (x < 0 || z < 0 || x >= N || z >= N) return false;
  const i = z * N + x;
  if (L.water[i] || L.occupant[i] || L.tree[i] || L.road[i]) return false;
  const t = L.terrain[i];
  if (t === Terrain.water || t === Terrain.mountain || t === Terrain.rock || t === Terrain.field) return false;
  return Math.abs(L.height[i]! - L.height[from]!) <= 1;
}

/**
 * The tiles from a door's front tile to the nearest road, over free walkable ground, at most
 * WALK_REACH tiles; the last one touches the road. Empty when the door already fronts a road or no
 * road is near. Breadth first, trying straight on before the sides, so ties break the same way.
 */
export function findPath(L: Layers, front: [number, number], facing: number): [number, number][] {
  const [fx, fz] = front;
  if (fx < 0 || fz < 0 || fx >= N || fz >= N) return [];
  const fi = fz * N + fx;
  if (L.road[fi]) return [];
  if (L.water[fi] || L.occupant[fi] || L.tree[fi]) return [];
  const order = [facing, (facing + 1) % 4, (facing + 3) % 4, (facing + 2) % 4];
  const parent = new Map<number, number>([[fi, -1]]);
  const depth = new Map<number, number>([[fi, 1]]);
  let queue = [fi];
  while (queue.length) {
    const next: number[] = [];
    for (const i of queue) {
      const x = i % N;
      const z = (i - x) / N;
      for (const k of order) {
        const nx = x + DX[k]!;
        const nz = z + DZ[k]!;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        if (L.road[nz * N + nx] && !L.water[nz * N + nx]) {
          const out: [number, number][] = [];
          for (let c = i; c !== -1; c = parent.get(c)!) out.push([c % N, Math.floor(c / N)]);
          return out.reverse();
        }
      }
      if (depth.get(i)! >= WALK_REACH) continue;
      for (const k of order) {
        const nx = x + DX[k]!;
        const nz = z + DZ[k]!;
        const j = nz * N + nx;
        if (parent.has(j) || !walkable(L, nx, nz, i)) continue;
        parent.set(j, i);
        depth.set(j, depth.get(i)! + 1);
        next.push(j);
      }
    }
    queue = next;
  }
  return [];
}

function dirTo(a: [number, number], b: [number, number]): number {
  return b[0] > a[0] ? 0 : b[1] > a[1] ? 1 : b[0] < a[0] ? 2 : 3;
}

/** Fills the walk texture bytes (N * N * 4) from the Mirror's buildings and layers. */
export function buildWalk(mirror: Mirror, out: Uint8Array): void {
  out.fill(0);
  const L = mirror.layers;
  const ids = [...mirror.buildings.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const b = mirror.buildings.get(id)!;
    if (!wantsPath(b)) continue;
    const def = drawDef(b.def);
    if (!def) continue;
    const front = entranceTiles(def, b.x, b.z, b.rot).front;
    const facing = FACING[b.rot]!;
    const business = !!b.trade;
    if (wantsApron(b)) {
      const fi = front[1] * N + front[0];
      if (
        front[0] >= 0 && front[1] >= 0 && front[0] < N && front[1] < N &&
        !L.occupant[fi] && !L.water[fi] && (L.road[fi] ?? 0) < 3
      )
        out[fi * 4 + 2] = b.rot + 1;
    }
    const path = findPath(L, front, facing);
    const strength = business ? 255 : 170;
    path.forEach((t, n) => {
      const o = (t[1] * N + t[0]) * 4;
      const prev = path[n - 1];
      const nextT = path[n + 1];
      if (prev) out[o] = out[o]! | (1 << dirTo(t, prev));
      if (nextT) out[o] = out[o]! | (1 << dirTo(t, nextT));
      if (!nextT) {
        const k = [0, 1, 2, 3].find((d) => L.road[(t[1] + DZ[d]!) * N + t[0] + DX[d]!]) ?? 0;
        out[o] = out[o]! | ((1 << k) << 4);
      }
      if (n === 0) out[o + 1] = 1 + ((facing + 2) % 4);
      out[o + 3] = Math.max(out[o + 3]!, strength);
    });
  }
}

/**
 * Puddles for the days after rain, 0 to 1: full on the morning after a rainy day, drying out over
 * that day, gone by the next midnight. (While it rains the ground shader reads the weather's own
 * wetness, so a rainy day itself returns 0 here.) `rainDay` is the absolute day of the last rain
 * this client saw, or null.
 */
export function puddleResidual(rainDay: number | null, tick: number): number {
  if (rainDay === null) return 0;
  const since = (tick + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY - (rainDay + 1);
  if (since < 0 || since >= 1) return 0;
  const t = Math.max(0, (since - 0.2) / 0.8);
  return 1 - t * t * (3 - 2 * t);
}

/** The absolute day (sim `dayIndex`) of a tick. */
export function dayOf(tick: number): number {
  return Math.floor((tick + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
}

/**
 * Remembers the last rainy day from the shared weather (today's kind, from the Mirror) and the
 * clock. A seat that joins on the morning after rain cannot know it rained (the sim keeps no
 * history), so the puddles of that one day may differ between seats; nothing else does.
 */
export class RainMemory {
  rainDay: number | null = null;
  private readonly stops: (() => void)[] = [];

  constructor(
    private readonly mirror: Mirror,
    private readonly onLevel: (v: number) => void,
  ) {
    const look = () => this.observe();
    this.stops.push(mirror.weather.subscribe(look), mirror.clock.subscribe(look));
  }

  private observe(): void {
    const tick = this.mirror.clock.value.tick;
    const today = this.mirror.weather.value?.today;
    if (today === 'rain' || today === 'storm') this.rainDay = dayOf(tick);
    this.onLevel(Math.round(puddleResidual(this.rainDay, tick) * 20) / 20);
  }

  dispose(): void {
    for (const s of this.stops) s();
  }
}
