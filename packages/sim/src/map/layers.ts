import { MAP_SIZE } from '../constants';
import type { LayerName, MapLayers, Rect } from '../contracts';

/** Fixed iteration order for layers (hashing, serialization, patches). */
export const LAYER_NAMES: readonly LayerName[] = [
  'height',
  'terrain',
  'water',
  'fertility',
  'deposit',
  'road',
  'tree',
  'occupant',
  'zone',
  'parcel',
  'flags',
];

/** Layers stored as Int32Array; all others are Uint8Array. */
export const INT32_LAYERS: ReadonlySet<LayerName> = new Set<LayerName>(['occupant']);

export const Terrain = {
  grass: 0,
  meadow: 1,
  forestFloor: 2,
  sand: 3,
  rock: 4,
  mountain: 5,
  water: 6,
  field: 7,
} as const;

export const Water = { none: 0, river: 1, riverDeep: 2, pond: 3, canal: 4 } as const;

export const Deposit = { none: 0, stone: 1, clay: 2, sand: 3, coal: 4 } as const;

export const Road = { none: 0, path: 1, lane: 2, street: 3, avenue: 4 } as const;

export const Flags = { floodplain: 1, valleyGate: 2, startArea: 4 } as const;

/** Tree layer value: species * 8 + stage. Species 1 oak, 2 birch, 3 pine; stage 0 sapling to 3 mature. */
export const TREE_SPECIES = { oak: 1, birch: 2, pine: 3 } as const;
export const TREE_MATURE = 3;

export function treeValue(species: number, stage: number): number {
  return species * 8 + stage;
}

export function treeSpecies(value: number): number {
  return value >> 3;
}

export function treeStage(value: number): number {
  return value & 7;
}

export function createLayers(size = MAP_SIZE): MapLayers {
  const n = size * size;
  return {
    height: new Uint8Array(n),
    terrain: new Uint8Array(n),
    water: new Uint8Array(n),
    fertility: new Uint8Array(n),
    deposit: new Uint8Array(n),
    road: new Uint8Array(n),
    tree: new Uint8Array(n),
    occupant: new Int32Array(n),
    zone: new Uint8Array(n),
    parcel: new Uint8Array(n),
    flags: new Uint8Array(n),
  };
}

export function inBounds(x: number, z: number, size = MAP_SIZE): boolean {
  return x >= 0 && z >= 0 && x < size && z < size;
}

export function clampRect(rect: Rect, size = MAP_SIZE): Rect {
  return [
    Math.max(0, rect[0]),
    Math.max(0, rect[1]),
    Math.min(size - 1, rect[2]),
    Math.min(size - 1, rect[3]),
  ];
}

/** Bounding rect of a tile list, or null when empty. */
export function tilesRect(tiles: readonly (readonly [number, number])[]): Rect | null {
  if (tiles.length === 0) return null;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of tiles) {
    if (x < x0) x0 = x;
    if (z < z0) z0 = z;
    if (x > x1) x1 = x;
    if (z > z1) z1 = z;
  }
  return [x0, z0, x1, z1];
}

/** Row-major copy of a rect of a layer (the data of a LayerPatch). */
export function copyRect(
  layer: Uint8Array | Int32Array,
  rect: Rect,
  size = MAP_SIZE,
): Uint8Array | Int32Array {
  const [x0, z0, x1, z1] = rect;
  const w = x1 - x0 + 1;
  const out =
    layer instanceof Int32Array ? new Int32Array(w * (z1 - z0 + 1)) : new Uint8Array(w * (z1 - z0 + 1));
  for (let z = z0; z <= z1; z++) {
    const start = z * size + x0;
    out.set(layer.subarray(start, start + w), (z - z0) * w);
  }
  return out;
}

/** Writes a row-major rect copy back into a layer (applies a LayerPatch). */
export function pasteRect(
  layer: Uint8Array | Int32Array,
  rect: Rect,
  data: Uint8Array | Int32Array,
  size = MAP_SIZE,
): void {
  const [x0, z0, x1, z1] = rect;
  const w = x1 - x0 + 1;
  for (let z = z0; z <= z1; z++) {
    layer.set(data.subarray((z - z0) * w, (z - z0 + 1) * w), z * size + x0);
  }
}
