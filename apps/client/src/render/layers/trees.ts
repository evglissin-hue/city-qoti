import { kitById } from '@qoti/art';
import { CHUNK_SIZE, CHUNKS_PER_SIDE, MAP_SIZE, treeSpecies, treeStage } from '@qoti/sim';
import { PerspectiveCamera, type BufferGeometry, type MeshStandardMaterial } from 'three';
import { ChunkDirt } from '../chunkDirt';
import { hash2 } from '../coords';
import { createWorldEnv, type WorldEnv } from '../env';
import {
  addInstance,
  createFoliageMaterial,
  emptyScatterChunk,
  ScatterField,
  type ScatterChunk,
  type ScatterKind,
} from '../scatter';
import { SurfaceTiles, surfaceY } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * C3D-1 forest: trees from the map's tree layer, instanced with per-chunk culling and a low
 * detail version in the distance. Each tree gets a seeded variant, size, turn, tint and lean:
 * groves of big old trees and younger thickets, smaller trees and an outward lean at the forest's
 * edge, and neighbors huddling into clumps.
 */

const SPECIES_KIT = ['', 'oak', 'birch', 'pine'];
/** Mature trees come in this many shapes per species; young stages in one. */
const VARIANTS = 2;
/** Camera distance (world units, at Medium) beyond which trees use their low detail mesh. */
export const TREE_LOD_DISTANCE = 72;

function kindId(species: number, stage: number, variant: number): string {
  return `${species}:${stage}:${variant}`;
}

function treeKinds(): ScatterKind[] {
  const kinds: ScatterKind[] = [];
  for (let species = 1; species <= 3; species++) {
    const kit = kitById.get(SPECIES_KIT[species]!)!;
    for (let stage = 0; stage <= 3; stage++) {
      const variants = stage === 3 ? VARIANTS : 1;
      for (let v = 0; v < variants; v++) {
        const seed = 17 + v * 31 + species * 7;
        const high: BufferGeometry = kit.build({ stage, seed });
        const low: BufferGeometry = kit.build({ stage, seed, lod: 'low' });
        kinds.push({
          id: kindId(species, stage, v),
          high,
          low,
          lodDistance: TREE_LOD_DISTANCE,
          shadows: true,
        });
      }
    }
  }
  return kinds;
}

/** Tints: warm, cool and plain, a little brighter or darker. */
function tint(species: number, x: number, z: number): [number, number, number] {
  const warm = hash2(x, z, 51);
  const value = 0.8 + hash2(x, z, 53) * 0.2;
  // Broad patches share a mood, so the forest varies in swathes as well as tree by tree.
  const mood = hash2(x >> 3, z >> 3, 57);
  let r = 1;
  const g = 1;
  let b = 1;
  if (warm < 0.25 || mood < 0.2) {
    r = 1.05;
    b = 0.9;
  } else if (warm > 0.7) {
    r = 0.9;
    b = 1.03;
  }
  const v = species === 3 ? value * 0.94 : value;
  return [r * v, g * v, b * v];
}

export function buildTreeChunk(
  field: ScatterField,
  tiles: SurfaceTiles,
  tree: ArrayLike<number>,
  stageOf: (x: number, z: number, v: number) => number,
  cx: number,
  cz: number,
): ScatterChunk {
  const chunk = emptyScatterChunk(field.kinds.length);
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  tiles.cache(x0 - 2, z0 - 2, x0 + CHUNK_SIZE + 1, z0 + CHUNK_SIZE + 1);
  const has = (x: number, z: number) =>
    x >= 0 && z >= 0 && x < MAP_SIZE && z < MAP_SIZE && tree[z * MAP_SIZE + x]! > 0;
  for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
    for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
      const v = tree[z * MAP_SIZE + x]!;
      if (!v) continue;
      const species = treeSpecies(v);
      const stage = Math.max(0, Math.min(3, Math.round(stageOf(x, z, v))));
      // Neighbors: how deep in the forest this tree stands, and which way is open.
      let n = 0;
      let ox = 0;
      let oz = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dz) && has(x + dx, z + dz)) {
            n++;
            ox += dx;
            oz += dz;
          }
        }
      }
      const edge = 1 - n / 8;
      const jx = (hash2(x, z, 1) - 0.5) * 0.5 + (n ? (ox / n) * 0.14 : 0);
      const jz = (hash2(x, z, 2) - 0.5) * 0.5 + (n ? (oz / n) * 0.14 : 0);
      const px = x + 0.5 + jx;
      const pz = z + 0.5 + jz;
      const grove = 0.86 + hash2(x >> 2, z >> 2, 61) * 0.3;
      const scale = (0.84 + hash2(x, z, 3) * 0.3) * grove * (1 - edge * 0.16);
      // Edge trees lean out towards the light; inner ones only a touch, any way.
      const len = Math.hypot(ox, oz) || 1;
      const leanAmount = 0.02 + edge * 0.07;
      const leanX = n ? (oz / len) * leanAmount : (hash2(x, z, 5) - 0.5) * 0.05;
      const leanZ = n ? (-ox / len) * leanAmount : (hash2(x, z, 6) - 0.5) * 0.05;
      const variant = stage === 3 ? Math.floor(hash2(x, z, 7) * VARIANTS) : 0;
      const kind = field.kindIndex(kindId(species, stage, variant));
      if (kind < 0) continue;
      const [r, g, b] = tint(species, x, z);
      addInstance(
        chunk,
        kind,
        px,
        surfaceY(tiles, px, pz) - 0.02,
        pz,
        hash2(x, z, 4) * Math.PI * 2,
        scale,
        leanX,
        leanZ,
        r,
        g,
        b,
      );
    }
  }
  tiles.uncache();
  return chunk;
}

export function treesLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let field: ScatterField | null = null;
  let material: MeshStandardMaterial | null = null;
  let env: WorldEnv | null = null;
  let tiles: SurfaceTiles | null = null;
  const dirt = new ChunkDirt();

  function rebuildChunk(i: number): void {
    if (!ctx || !field || !tiles) return;
    const reader = ctx.mirror as { treeStage?(x: number, z: number): number };
    const stageOf = (x: number, z: number, v: number) => reader.treeStage?.(x, z) ?? treeStage(v);
    field.setChunk(
      i,
      buildTreeChunk(
        field,
        tiles,
        ctx.mirror.layers.tree,
        stageOf,
        i % CHUNKS_PER_SIDE,
        Math.floor(i / CHUNKS_PER_SIDE),
      ),
    );
  }

  return {
    id: 'trees',
    init(c) {
      ctx = c;
      env = c.env ?? createWorldEnv(new PerspectiveCamera());
      material = createFoliageMaterial(env);
      field = new ScatterField(c.scene, material, treeKinds(), env);
      tiles = new SurfaceTiles(c.mirror);
      dirt.markAll();
      // The first build happens at once, so the first frame already has its forest.
      for (const i of dirt.take(Infinity)) rebuildChunk(i);
    },
    update(change) {
      if (change.full) dirt.markAll();
      for (const layer of ['tree', 'height', 'water', 'occupant'] as const) {
        for (const rect of change.rects.get(layer) ?? []) dirt.markRect(rect);
      }
    },
    frame() {
      if (!field || !env) return false;
      for (const i of dirt.take(4)) rebuildChunk(i);
      field.lodScale = env.detailDistance / 80;
      return field.update(env.camera);
    },
    dispose() {
      field?.dispose();
      material?.dispose();
    },
  };
}
