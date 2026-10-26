// Shared pieces for the pattern detectors: the detector contract, parameter lookup, decor tag
// queries, lantern coverage and flood fills over tile sets. Scratch buffers are module-level.
import { content, type PatternDef } from '@qoti/content';
import { MAP_SIZE, TILE_FP } from '../../../constants';
import type { Decor, EntityId, Rect, WorldState } from '../../../contracts';
import { decorInRect } from '../../../conditions/geo';

const S = MAP_SIZE;
const N = S * S;

/** One valid instance a detector found. Members and tiles need not be sorted. */
export interface SiteCandidate {
  anchor: number;
  members: EntityId[];
  tiles: number[];
}

export type Detector = (state: WorldState, def: PatternDef) => SiteCandidate[];

export function param(def: PatternDef, name: string, fallback: number): number {
  for (const [k, v] of def.params) if (k === name) return v;
  return fallback;
}

export function hasTag(defId: string, tag: string): boolean {
  return content.decorById.get(defId)?.tags.includes(tag) ?? false;
}

export function buildingHasTag(defId: string, tag: string): boolean {
  return content.buildingById.get(defId)?.tags?.includes(tag) ?? false;
}

/** Decor with a tag in an inclusive tile rect, sorted by id. */
export function taggedIn(state: WorldState, rect: Rect, tag: string): Decor[] {
  const out = decorInRect(state, rect).filter((d) => hasTag(d.def, tag));
  out.sort((a, b) => a.id - b.id);
  return out;
}

/** Decor with a tag anywhere, in id order. */
export function tagged(state: WorldState, tag: string): Decor[] {
  return state.decor.filter((d) => hasTag(d.def, tag));
}

export function tileOf(d: Pick<Decor, 'fx' | 'fz'>): number {
  return Math.floor(d.fz / TILE_FP) * S + Math.floor(d.fx / TILE_FP);
}

/** Squared distance between two fixed-point points, in tiles squared. */
export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = (ax - bx) / TILE_FP;
  const dz = (az - bz) / TILE_FP;
  return dx * dx + dz * dz;
}

// --- Tile sets --------------------------------------------------------------------------------

const mask = new Uint8Array(N);
const seen = new Uint32Array(N);
const dist = new Int32Array(N);
let gen = 0;

function nextGen(): number {
  gen = (gen + 1) >>> 0;
  if (gen === 0) {
    seen.fill(0);
    gen = 1;
  }
  return gen;
}

const STEPS = [1, -1, S, -S] as const;

function neighbor(i: number, k: number): number {
  const x = i % S;
  if (k === 0 && x === S - 1) return -1;
  if (k === 1 && x === 0) return -1;
  const j = i + STEPS[k]!;
  return j < 0 || j >= N ? -1 : j;
}

/** 4-connected components of a tile set, each sorted, in order of their smallest tile. */
export function components(tiles: readonly number[]): number[][] {
  for (const t of tiles) mask[t] = 1;
  const g = nextGen();
  const sorted = [...tiles].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const start of sorted) {
    if (seen[start] === g) continue;
    const comp: number[] = [start];
    seen[start] = g;
    for (let h = 0; h < comp.length; h++) {
      const i = comp[h]!;
      for (let k = 0; k < 4; k++) {
        const j = neighbor(i, k);
        if (j >= 0 && mask[j] && seen[j] !== g) {
          seen[j] = g;
          comp.push(j);
        }
      }
    }
    comp.sort((a, b) => a - b);
    out.push(comp);
  }
  for (const t of tiles) mask[t] = 0;
  return out;
}

/** Tiles in the longest shortest walk through a component (double BFS), so 1 for a single tile. */
export function spanLength(comp: readonly number[]): number {
  if (comp.length <= 2) return comp.length;
  for (const t of comp) mask[t] = 1;
  const far = (start: number): [number, number] => {
    const g = nextGen();
    const queue = [start];
    seen[start] = g;
    dist[start] = 0;
    let best = start;
    for (let h = 0; h < queue.length; h++) {
      const i = queue[h]!;
      if (dist[i]! > dist[best]! || (dist[i] === dist[best] && i < best)) best = i;
      for (let k = 0; k < 4; k++) {
        const j = neighbor(i, k);
        if (j >= 0 && mask[j] && seen[j] !== g) {
          seen[j] = g;
          dist[j] = dist[i]! + 1;
          queue.push(j);
        }
      }
    }
    return [best, dist[best]!];
  };
  const [u] = far(comp[0]!);
  const [, d] = far(u);
  for (const t of comp) mask[t] = 0;
  return d + 1;
}

/** Decor ids with a tag standing on a component tile or one of its eight neighbors, sorted. */
export function taggedAlong(state: WorldState, comp: readonly number[], tag: string): EntityId[] {
  let x0 = S;
  let z0 = S;
  let x1 = -1;
  let z1 = -1;
  for (const t of comp) {
    const x = t % S;
    const z = (t - x) / S;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  for (const t of comp) mask[t] = 1;
  const ids: EntityId[] = [];
  for (const d of taggedIn(state, [x0 - 1, z0 - 1, x1 + 1, z1 + 1], tag)) {
    const t = tileOf(d);
    const x = t % S;
    const z = (t - x) / S;
    let near = false;
    for (let dz = -1; dz <= 1 && !near; dz++) {
      for (let dx = -1; dx <= 1 && !near; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < S && nz < S && mask[nz * S + nx]) near = true;
      }
    }
    if (near) ids.push(d.id);
  }
  for (const t of comp) mask[t] = 0;
  return ids;
}

// --- Per-pass scans --------------------------------------------------------------------------
// Several detectors scan the whole map for roads or grown trees. Inside a patterns pass the
// scans are shared; outside one (tests calling a detector directly) they are made fresh.

let pass: { roads: number[] | null; trees: number[] | null } | null = null;

export function beginPass(): void {
  pass = { roads: null, trees: null };
}

export function endPass(): void {
  pass = null;
}

/** Path and lane tiles anywhere on the map, ascending. */
export function roadTiles(state: WorldState): number[] {
  if (pass?.roads) return pass.roads;
  const out: number[] = [];
  const road = state.map.road;
  for (let i = 0; i < N; i++) {
    const r = road[i]!;
    if (r > 0 && r <= 2) out.push(i);
  }
  if (pass) pass.roads = out;
  return out;
}

/** Tiles of trees at stage `minStage` or more (3 = mature), ascending. */
export function treeTiles(state: WorldState): number[] {
  if (pass?.trees) return pass.trees;
  const out: number[] = [];
  const tree = state.map.tree;
  for (let i = 0; i < N; i++) if (tree[i]) out.push(i);
  if (pass) pass.trees = out;
  return out;
}
