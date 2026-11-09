import { kitById } from '@qoti/art';
import { CHUNK_SIZE, CHUNKS_PER_SIDE, MAP_SIZE, Terrain, TILE_FP, Water } from '@qoti/sim';
import { PerspectiveCamera, type MeshStandardMaterial } from 'three';
import type { Mirror } from '../../state/mirror';
import { ChunkDirt } from '../chunkDirt';
import { hash2 } from '../coords';
import { createWorldEnv, nearOf, type WorldEnv } from '../env';
import { homeDistance, meadowAmount, mownAmount, MOWN, patch } from '../ground';
import {
  addInstance,
  createFoliageMaterial,
  emptyScatterChunk,
  ScatterField,
  type ScatterChunk,
  type ScatterKind,
} from '../scatter';
import { SurfaceTiles, surfaceY, WATER_Y } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * C3D-1 nature: the small life between things, scattered from the map with a seeded hash (never
 * sim state, the same on both laptops): grass tufts and wildflowers on open ground, bushes and ferns
 * at the forest's edge and under its trees, mushrooms and the odd fallen log in the woods, reeds at
 * the water line, rocks on stony ground. Nothing grows on roads, under buildings or around decor.
 * Small props fade out with the quality preset's detail distance.
 */

interface PropSpec {
  kit: string;
  variants: number;
  /** Camera distance (at Medium) where the prop has shrunk away, and where the low mesh starts. */
  max: number;
  lod?: number;
  shadows: boolean;
}

const PROPS: readonly PropSpec[] = [
  { kit: 'bush', variants: 2, max: 140, lod: 60, shadows: true },
  { kit: 'fallen-log', variants: 2, max: 90, shadows: true },
  { kit: 'fern', variants: 2, max: 72, shadows: false },
  { kit: 'grass-tuft', variants: 2, max: 72, lod: 40, shadows: false },
  { kit: 'hedgerow', variants: 3, max: 200, lod: 60, shadows: true },
  { kit: 'lily-pads', variants: 3, max: 90, lod: 45, shadows: false },
  { kit: 'meadow-tuft', variants: 3, max: 72, lod: 40, shadows: false },
  { kit: 'mushrooms', variants: 2, max: 40, shadows: false },
  { kit: 'reeds', variants: 2, max: 80, shadows: false },
  { kit: 'rock', variants: 2, max: 140, lod: 60, shadows: true },
  { kit: 'wildflowers', variants: 3, max: 76, shadows: false },
];

/** P1: spots tried on an open tile (the tuft count wanted is spread over them). */
const TUFT_TRIES = 6;

const PROP_BY_KIT = new Map(PROPS.map((p) => [p.kit, p]));

function propKinds(): ScatterKind[] {
  const kinds: ScatterKind[] = [];
  for (const p of PROPS) {
    const kit = kitById.get(p.kit)!;
    for (let v = 0; v < p.variants; v++) {
      const seed = 101 + v * 13;
      kinds.push({
        id: `${p.kit}:${v}`,
        high: kit.build({ seed }),
        ...(p.lod !== undefined ? { low: kit.build({ seed, lod: 'low' }), lodDistance: p.lod } : {}),
        maxDistance: p.max,
        shadows: p.shadows,
      });
    }
  }
  return kinds;
}

class Placer {
  constructor(
    private readonly field: ScatterField,
    private readonly chunk: ScatterChunk,
    private readonly tiles: SurfaceTiles,
  ) {}

  put(
    kit: string,
    x: number,
    z: number,
    salt: number,
    scale = 1,
    sink = 0,
    tint: [number, number, number] = [1, 1, 1],
    at?: { y?: number; yaw?: number },
  ): void {
    const spec = PROP_BY_KIT.get(kit)!;
    const v = Math.floor(hash2(Math.floor(x * 7), Math.floor(z * 7), salt) * spec.variants);
    const kind = this.field.kindIndex(`${kit}:${v}`);
    const y = at?.y ?? surfaceY(this.tiles, x, z) - sink * scale;
    const yaw = at?.yaw ?? hash2(Math.floor(x * 11), Math.floor(z * 11), salt + 1) * Math.PI * 2;
    addInstance(this.chunk, kind, x, y, z, yaw, scale, 0, 0, tint[0], tint[1], tint[2], 0.4);
  }
}

export function buildNatureChunk(
  field: ScatterField,
  tiles: SurfaceTiles,
  mirror: Mirror,
  cx: number,
  cz: number,
  /** Tiles with decor on or next to them (nothing grows there). */
  decorTiles: ReadonlySet<number>,
): ScatterChunk {
  const chunk = emptyScatterChunk(field.kinds.length);
  const L = mirror.layers;
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  tiles.cache(x0 - 2, z0 - 2, x0 + CHUNK_SIZE + 1, z0 + CHUNK_SIZE + 1);
  const place = new Placer(field, chunk, tiles);
  const at = (x: number, z: number) => z * MAP_SIZE + x;
  const inMap = (x: number, z: number) => x >= 0 && z >= 0 && x < MAP_SIZE && z < MAP_SIZE;
  for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
    for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
      const i = at(x, z);
      // V1C: lily pads on still water near a bank (ponds and the river's slow edges).
      if (L.water[i] && !L.road[i] && !L.occupant[i]) {
        let bank = false;
        for (let dz = -1; dz <= 1 && !bank; dz++)
          for (let dx = -1; dx <= 1 && !bank; dx++)
            if (inMap(x + dx, z + dz) && !L.water[at(x + dx, z + dz)]) bank = true;
        const still = L.water[i] === Water.pond || L.water[i] === Water.canal;
        if ((still || bank) && hash2(x, z, 150) < (still ? 0.4 : 0.22)) {
          const px = x + 0.15 + hash2(x, z, 151) * 0.7;
          const pz = z + 0.15 + hash2(x, z, 152) * 0.7;
          if (surfaceY(tiles, px, pz) < WATER_Y - 0.08)
            place.put('lily-pads', px, pz, 153, 0.9 + hash2(x, z, 154) * 0.6, 0, [1, 1, 1], {
              y: WATER_Y + 0.002,
            });
        }
        continue;
      }
      if (L.water[i] || L.road[i] || L.occupant[i]) continue;
      if (decorTiles.has(i)) continue;
      const terrain = L.terrain[i]!;
      if (terrain === Terrain.field) continue;
      // V1C: hedgerows along the edges this tile shares with a field, just inside this tile.
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        if (!inMap(x + dx, z + dz) || L.terrain[at(x + dx, z + dz)] !== Terrain.field) continue;
        if (hash2(x * 4 + dx + 2, z * 4 + dz + 2, 160) > 0.85) continue;
        const hx = x + 0.5 + dx * 0.38;
        const hz = z + 0.5 + dz * 0.38;
        place.put('hedgerow', hx, hz, 161, 0.9 + hash2(x, z, 162 + dx + dz * 3) * 0.25, 0, [1, 1, 1], {
          yaw: dx !== 0 ? Math.PI / 2 : 0,
        });
      }
      let trees = 0;
      let wet = 0;
      let pond = false;
      let roadSide = 0;
      let tx = 0;
      let tz = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!(dx || dz) || !inMap(x + dx, z + dz)) continue;
          const j = at(x + dx, z + dz);
          if (L.tree[j]) {
            trees++;
            tx += dx;
            tz += dz;
          }
          if (L.water[j]) wet++;
          if (L.water[j] === Water.pond) pond = true;
          if (L.road[j] || L.occupant[j]) roadSide++;
        }
      }
      const h = (salt: number) => hash2(x, z, salt);
      const spot = (salt: number): [number, number] => [
        x + 0.12 + h(salt) * 0.76,
        z + 0.12 + h(salt + 1) * 0.76,
      ];
      const forest = L.tree[i]! > 0;
      const warm = patch(x, z, 9, 3);
      const grassTint: [number, number, number] = [0.94 + warm * 0.14, 1, 0.9 + (1 - warm) * 0.1];

      // Reeds at the water line: try a few spots on the bank.
      if (wet) {
        // C5E: ponds are ringed more thickly than the river's banks.
        for (let k = 0; k < (pond ? 6 : 4); k++) {
          const [px, pz] = spot(10 + k * 2);
          const y = surfaceY(tiles, px, pz);
          if (y > WATER_Y - 0.1 && y < WATER_Y + 0.07 && h(30 + k) < (pond ? 0.92 : 0.75))
            place.put('reeds', px, pz, 30 + k, 0.85 + h(40 + k) * 0.4);
        }
        if (h(50) < 0.12) place.put('rock', ...spot(51), 52, 0.5 + h(53) * 0.4, 0.2);
      }

      if (forest) {
        // Under the trees: ferns, the odd bush, mushrooms and now and then a fallen log.
        if (h(60) < 0.4) place.put('fern', ...spot(61), 62, 0.8 + h(63) * 0.5);
        if (h(64) < 0.08) place.put('bush', ...spot(65), 66, 0.7 + h(67) * 0.4);
        if (h(68) < 0.07) place.put('mushrooms', ...spot(69), 70, 0.9 + h(71) * 0.5);
        if (h(72) < 0.02 && trees >= 4) place.put('fallen-log', ...spot(73), 74, 0.9 + h(75) * 0.3);
        continue;
      }

      if (trees >= 2 && terrain !== Terrain.mountain) {
        // The forest's edge: bushes leaning in towards the trees, ferns in their shade.
        const len = Math.hypot(tx, tz) || 1;
        const bx = x + 0.5 + (tx / len) * 0.3 + (h(80) - 0.5) * 0.3;
        const bz = z + 0.5 + (tz / len) * 0.3 + (h(81) - 0.5) * 0.3;
        if (h(82) < 0.55) place.put('bush', bx, bz, 83, 0.75 + h(84) * 0.5);
        if (h(85) < 0.3) place.put('fern', ...spot(86), 87, 0.8 + h(88) * 0.4);
      }

      switch (terrain) {
        case Terrain.rock:
          if (h(90) < 0.7) place.put('rock', ...spot(91), 92, 0.8 + h(93) * 0.9, 0.25);
          if (h(94) < 0.3) place.put('rock', ...spot(95), 96, 0.5 + h(97) * 0.5, 0.25);
          if (h(98) < 0.35) place.put('grass-tuft', ...spot(99), 100, 0.9, 0, grassTint);
          break;
        case Terrain.mountain:
          if (h(90) < 0.35) place.put('rock', ...spot(91), 92, 1 + h(93) * 1.2, 0.3);
          break;
        case Terrain.sand:
          if (h(110) < 0.2) place.put('grass-tuft', ...spot(111), 112, 0.8, 0, [1.08, 1.02, 0.86]);
          if (h(113) < 0.06) place.put('rock', ...spot(114), 115, 0.5 + h(116) * 0.4, 0.25);
          break;
        default: {
          // Open grass and meadow: tufts clump with a soft noise, flowers bloom in patches.
          const meadow = terrain === Terrain.meadow;
          const clump = patch(x, z, 4, 120);
          // P1: about 5 tufts on a meadow tile and 2 to 3 on plain grass, clumped by the noise; lawns
          // near homes a touch sparser and neat. Tall fluffy tufts stand where the ground paints
          // long grass (the same weight as the ground shader), a few among wild grass; short ones
          // elsewhere.
          const mown = mownAmount(homeDistance(L.occupant, x, z));
          const long = meadowAmount(terrain, x, z, mown);
          const tall = long + (1 - mown) * (1 - long) * 0.5;
          const want = (2.5 + long * 2.5) * (0.75 + clump * 0.5) * (1 - mown * 0.2) + (roadSide ? 0.6 : 0);
          for (let k = 0; k < TUFT_TRIES; k++) {
            if (h(200 + k * 6) >= want / TUFT_TRIES) continue;
            const [px, pz] = spot(201 + k * 6);
            if (h(203 + k * 6) < tall)
              place.put('meadow-tuft', px, pz, 204 + k * 6, 0.9 + h(205 + k * 6) * 0.6, 0, grassTint);
            else place.put('grass-tuft', px, pz, 204 + k * 6, 0.8 + h(205 + k * 6) * 0.6, 0, grassTint);
          }
          const bloom = patch(x, z, 7, 9);
          const flowers = meadow ? 0.25 + bloom * 0.4 : Math.max(0, bloom - 0.6) * 0.8;
          if (h(131) < flowers) place.put('wildflowers', ...spot(132), 133, 0.9 + h(134) * 0.4);
          if (meadow && h(135) < flowers * 0.6)
            place.put('wildflowers', ...spot(136), 137, 0.8 + h(138) * 0.4);
          if (h(139) < 0.015) place.put('bush', ...spot(140), 141, 0.6 + h(142) * 0.4);
          if (h(143) < 0.01) place.put('rock', ...spot(144), 145, 0.5 + h(146) * 0.5, 0.25);
        }
      }
    }
  }
  tiles.uncache();
  return chunk;
}

export function natureLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let field: ScatterField | null = null;
  let material: MeshStandardMaterial | null = null;
  let env: WorldEnv | null = null;
  let tiles: SurfaceTiles | null = null;
  const dirt = new ChunkDirt();
  /** Decor positions by chunk, to rebuild only the chunks whose decor changed. */
  let decorKeys = new Map<number, string>();
  let decorTiles = new Set<number>();

  /** Decor fingerprints by chunk, and the tiles decor keeps clear (on it and around it). */
  function decorByChunk(): Map<number, string> {
    const out = new Map<number, string>();
    const tiles = new Set<number>();
    decorTiles = tiles;
    if (!ctx) return out;
    for (const d of ctx.mirror.decor.values()) {
      const cx = Math.floor(d.fx / TILE_FP / CHUNK_SIZE);
      const cz = Math.floor(d.fz / TILE_FP / CHUNK_SIZE);
      const i = cz * CHUNKS_PER_SIDE + cx;
      out.set(i, `${out.get(i) ?? ''}${d.id}@${d.fx},${d.fz};`);
      const tx = Math.floor(d.fx / TILE_FP);
      const tz = Math.floor(d.fz / TILE_FP);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx;
          const z = tz + dz;
          if (x >= 0 && z >= 0 && x < MAP_SIZE && z < MAP_SIZE) tiles.add(z * MAP_SIZE + x);
        }
    }
    return out;
  }

  function rebuildChunk(i: number): void {
    if (!ctx || !field || !tiles) return;
    field.setChunk(
      i,
      buildNatureChunk(
        field,
        tiles,
        ctx.mirror,
        i % CHUNKS_PER_SIDE,
        Math.floor(i / CHUNKS_PER_SIDE),
        decorTiles,
      ),
    );
  }

  return {
    id: 'nature',
    init(c) {
      ctx = c;
      env = c.env ?? createWorldEnv(new PerspectiveCamera());
      material = createFoliageMaterial(env);
      field = new ScatterField(c.scene, material, propKinds(), env);
      tiles = new SurfaceTiles(c.mirror);
      decorKeys = decorByChunk();
      dirt.markAll();
      // Small props only show up close, so only the start's neighborhood is built up front.
      for (const i of dirt.take(Infinity, nearOf(c.env, c.mirror.meta.startArea), 40)) rebuildChunk(i);
    },
    update(change) {
      if (change.full) dirt.markAll();
      for (const layer of ['tree', 'height', 'water', 'occupant', 'road', 'terrain'] as const) {
        for (const rect of change.rects.get(layer) ?? [])
          dirt.markRect(rect, layer === 'occupant' ? MOWN : 1);
      }
      if (change.decor || change.full) {
        // Decor clears the ground under it: rebuild the chunks (and their neighbors) that changed.
        const next = decorByChunk();
        for (const i of new Set([...next.keys(), ...decorKeys.keys()])) {
          if (next.get(i) === decorKeys.get(i)) continue;
          const cx = (i % CHUNKS_PER_SIDE) * CHUNK_SIZE;
          const cz = Math.floor(i / CHUNKS_PER_SIDE) * CHUNK_SIZE;
          dirt.markRect([cx, cz, cx + CHUNK_SIZE - 1, cz + CHUNK_SIZE - 1], 1);
        }
        decorKeys = next;
      }
    },
    frame() {
      if (!field || !env) return false;
      if (ctx) for (const i of dirt.take(3, nearOf(env, ctx.mirror.meta.startArea))) rebuildChunk(i);
      field.lodScale = env.detailDistance / 80;
      return field.update(env.camera);
    },
    dispose() {
      field?.dispose();
      material?.dispose();
    },
  };
}
