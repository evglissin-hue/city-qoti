import { CHUNK_SIZE, MAP_SIZE, type LayerName } from '@qoti/sim';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  PerspectiveCamera,
  type MeshStandardMaterial,
} from 'three';
import { ChunkedMeshes } from '../chunks';
import { hash2 } from '../coords';
import { createWorldEnv } from '../env';
import { createGroundMaterial, GroundTextures } from '../ground';
import { lastGrad, SURFACE_GRID, SurfaceTiles, tileSurfaceY } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * C3D-1 terrain: soft rolling ground from the shared surface (smooth slopes between levels, flat
 * under buildings), rocky faces where levels part by two or more, and an earthen skirt at the
 * valley's edge. Tops are painted by the ground shader; faces carry vertex colors.
 */

/** Grid cells per tile side on sloped tiles (flat tiles are a single quad). */
const GRID = SURFACE_GRID;
const EDGE_BOTTOM = -1.6;
/** A seam taller than this is a rocky face; smaller seams are plain earth. */
const ROCKY = 0.3;

/** Accumulates terrain triangles: smooth-shaded tops and flat-shaded faces. */
class TerrainBuilder {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];
  readonly surf: number[] = [];

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: Color, surf: number): void {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c.r, c.g, c.b);
    this.surf.push(surf);
  }

  /** A flat-shaded triangle facing `out` (winding is fixed up to match). */
  face(a: number[], b: number[], c: number[], ca: Color, cb: Color, cc: Color, out: number[]): void {
    const ux = b[0]! - a[0]!;
    const uy = b[1]! - a[1]!;
    const uz = b[2]! - a[2]!;
    const vx = c[0]! - a[0]!;
    const vy = c[1]! - a[1]!;
    const vz = c[2]! - a[2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len;
    ny /= len;
    nz /= len;
    if (nx * out[0]! + ny * out[1]! + nz * out[2]! < 0) {
      [b, c] = [c, b];
      [cb, cc] = [cc, cb];
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    this.vertex(a[0]!, a[1]!, a[2]!, nx, ny, nz, ca, 0);
    this.vertex(b[0]!, b[1]!, b[2]!, nx, ny, nz, cb, 0);
    this.vertex(c[0]!, c[1]!, c[2]!, nx, ny, nz, cc, 0);
  }

  build(): BufferGeometry | null {
    if (this.pos.length === 0) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('gsurf', new Float32BufferAttribute(this.surf, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const WHITE = new Color(1, 1, 1);
const ROCK = new Color().setHex(0x9a978c);
const ROCK_DARK = new Color().setHex(0x6f6c66);
const MOSS = new Color().setHex(0x76875a);
const EARTH = new Color().setHex(0x7d6247);
const EARTH_DARK = new Color().setHex(0x5a4634);

const heights = new Float32Array((GRID + 1) * (GRID + 1));
const normals = new Float32Array((GRID + 1) * (GRID + 1) * 3);
/** Columns along a seam: the face is finer than the top grid, for its bulges. */
const COLS = 4;
const rowA = new Float32Array(COLS + 1);
const rowB = new Float32Array(COLS + 1);

/** Builds one chunk of terrain. Exported for tests and benchmarks. */
export function buildTerrainChunk(tiles: SurfaceTiles, cx: number, cz: number): BufferGeometry | null {
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  tiles.cache(x0 - 2, z0 - 2, x0 + CHUNK_SIZE + 1, z0 + CHUNK_SIZE + 1);
  const b = new TerrainBuilder();
  const flat = (x: number, z: number): boolean => {
    const y = tiles.y(x, z);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) if (tiles.y(x + dx, z + dz) !== y) return false;
    return true;
  };
  for (let tz = z0; tz < z0 + CHUNK_SIZE; tz++) {
    for (let tx = x0; tx < x0 + CHUNK_SIZE; tx++) {
      const isFlat = tiles.pinned(tx, tz) || flat(tx, tz);
      if (isFlat) top(b, tiles.y(tx, tz), tx, tz);
      else slope(b, tiles, tx, tz);
      // Seams on the east and south edges (each edge belongs to one tile), and the valley's rim.
      if (tx + 1 < MAP_SIZE) {
        if (!isFlat || !flat(tx + 1, tz)) seam(b, tiles, tx, tz, tx + 1, tz);
      }
      if (tz + 1 < MAP_SIZE) {
        if (!isFlat || !flat(tx, tz + 1)) seam(b, tiles, tx, tz, tx, tz + 1);
      }
      if (tx === 0) skirt(b, tiles, tx, tz, -1, 0);
      if (tz === 0) skirt(b, tiles, tx, tz, 0, -1);
      if (tx === MAP_SIZE - 1) skirt(b, tiles, tx, tz, 1, 0);
      if (tz === MAP_SIZE - 1) skirt(b, tiles, tx, tz, 0, 1);
    }
  }
  tiles.uncache();
  return b.build();
}

function top(b: TerrainBuilder, y: number, x: number, z: number): void {
  b.vertex(x, y, z, 0, 1, 0, WHITE, 1);
  b.vertex(x, y, z + 1, 0, 1, 0, WHITE, 1);
  b.vertex(x + 1, y, z + 1, 0, 1, 0, WHITE, 1);
  b.vertex(x, y, z, 0, 1, 0, WHITE, 1);
  b.vertex(x + 1, y, z + 1, 0, 1, 0, WHITE, 1);
  b.vertex(x + 1, y, z, 0, 1, 0, WHITE, 1);
}

/**
 * A sloped tile: a small grid on the smooth surface with normals from the smooth surface, so slopes
 * shade round and soft even though the grid is coarse.
 */
function slope(b: TerrainBuilder, tiles: SurfaceTiles, tx: number, tz: number): void {
  const step = 1 / GRID;
  for (let j = 0; j <= GRID; j++) {
    for (let i = 0; i <= GRID; i++) {
      const px = tx + i * step;
      const pz = tz + j * step;
      const k = j * (GRID + 1) + i;
      heights[k] = tileSurfaceY(tiles, tx, tz, px, pz);
      let dx = lastGrad.dx;
      let dz = lastGrad.dz;
      if (!lastGrad.exact) {
        const e = 0.04;
        const xa = Math.max(tx, px - e);
        const xb = Math.min(tx + 1, px + e);
        const za = Math.max(tz, pz - e);
        const zb = Math.min(tz + 1, pz + e);
        dx = (tileSurfaceY(tiles, tx, tz, xb, pz) - tileSurfaceY(tiles, tx, tz, xa, pz)) / (xb - xa);
        dz = (tileSurfaceY(tiles, tx, tz, px, zb) - tileSurfaceY(tiles, tx, tz, px, za)) / (zb - za);
      }
      const len = Math.hypot(dx, 1, dz);
      normals[k * 3] = -dx / len;
      normals[k * 3 + 1] = 1 / len;
      normals[k * 3 + 2] = -dz / len;
    }
  }
  const put = (i: number, j: number) => {
    const k = j * (GRID + 1) + i;
    b.vertex(
      tx + i * step,
      heights[k]!,
      tz + j * step,
      normals[k * 3]!,
      normals[k * 3 + 1]!,
      normals[k * 3 + 2]!,
      WHITE,
      1,
    );
  };
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      // Alternate the diagonal so slopes do not show a grain (surfaceY follows the same split).
      if ((i + j) % 2 === 0) {
        put(i, j);
        put(i, j + 1);
        put(i + 1, j + 1);
        put(i, j);
        put(i + 1, j + 1);
        put(i + 1, j);
      } else {
        put(i, j);
        put(i, j + 1);
        put(i + 1, j);
        put(i + 1, j);
        put(i, j + 1);
        put(i + 1, j + 1);
      }
    }
  }
}

/**
 * Closes the seam between two neighboring tiles where their surfaces part: a rocky face with
 * gentle bulges for cliffs, a plain earth step for small seams (a building's flat pad, say).
 */
function seam(b: TerrainBuilder, tiles: SurfaceTiles, ax: number, az: number, bx: number, bz: number): void {
  const alongZ = bx !== ax; // the shared edge runs along z when the neighbor is east
  const ex = alongZ ? bx : ax;
  const ez = alongZ ? az : bz;
  let maxDiff = 0;
  let sum = 0;
  sampleEdge(tiles, ax, az, ex, ez, alongZ, rowA);
  sampleEdge(tiles, bx, bz, ex, ez, alongZ, rowB);
  for (let k = 0; k <= COLS; k++) {
    const d = rowA[k]! - rowB[k]!;
    sum += d;
    maxDiff = Math.max(maxDiff, Math.abs(d));
  }
  if (maxDiff < 0.004) return;
  // The face looks towards the lower tile.
  const upperIsA = sum > 0;
  const hi = upperIsA ? rowA : rowB;
  const lo = upperIsA ? rowB : rowA;
  const sign = upperIsA ? 1 : -1;
  const out = alongZ ? [sign, 0, 0] : [0, 0, sign];
  face(b, hi, lo, ex, ez, alongZ, out, maxDiff >= ROCKY);
}

/** A tile's drawn edge, sampled at the top grid and spread over the seam's columns. */
const edgeGrid = new Float32Array(GRID + 1);
function sampleEdge(
  tiles: SurfaceTiles,
  tx: number,
  tz: number,
  ex: number,
  ez: number,
  alongZ: boolean,
  out: Float32Array,
): void {
  for (let k = 0; k <= GRID; k++) {
    const px = alongZ ? ex : ex + k / GRID;
    const pz = alongZ ? ez + k / GRID : ez;
    edgeGrid[k] = tileSurfaceY(tiles, tx, tz, px, pz);
  }
  for (let c = 0; c <= COLS; c++) {
    const f = (c / COLS) * GRID;
    const k = Math.min(GRID - 1, Math.floor(f));
    out[c] = edgeGrid[k]! + (edgeGrid[k + 1]! - edgeGrid[k]!) * (f - k);
  }
}

function face(
  b: TerrainBuilder,
  hi: Float32Array,
  lo: Float32Array,
  ex: number,
  ez: number,
  alongZ: boolean,
  out: number[],
  rocky: boolean,
): void {
  const rows = rocky ? 3 : 1;
  const grid: number[][] = [];
  const colors: Color[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let k = 0; k <= COLS; k++) {
      const t = r / rows;
      const y = lo[k]! + (hi[k]! - lo[k]!) * t;
      const ax = alongZ ? ex : ex + k / COLS;
      const az = alongZ ? ez + k / COLS : ez;
      let bulge = 0;
      let slide = 0;
      if (rocky && r > 0 && r < rows && k > 0 && k < COLS) {
        const h = hash2(Math.round(ax * 16), Math.round(az * 16) + Math.round(y * 40), 31);
        bulge = (0.03 + 0.09 * h) * Math.min(1, (hi[k]! - lo[k]!) / 0.8);
        slide = (hash2(Math.round(ax * 16), Math.round(az * 16), 37) - 0.5) * 0.08;
      }
      grid.push([
        ax + out[0]! * bulge + (alongZ ? 0 : slide),
        y,
        az + out[2]! * bulge + (alongZ ? slide : 0),
      ]);
      const c = new Color();
      if (rocky) {
        const v = hash2(Math.round(ax * 8), Math.round(y * 6), 41);
        c.copy(ROCK_DARK).lerp(ROCK, 0.35 + 0.65 * t * (0.6 + 0.4 * v));
        if (r === rows) c.lerp(MOSS, 0.55);
      } else {
        c.copy(EARTH_DARK).lerp(EARTH, t);
      }
      colors.push(c);
    }
  }
  const at = (r: number, k: number) => r * (COLS + 1) + k;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < COLS; k++) {
      const a = at(r, k);
      const bb = at(r, k + 1);
      const c = at(r + 1, k + 1);
      const d = at(r + 1, k);
      b.face(grid[a]!, grid[bb]!, grid[c]!, colors[a]!, colors[bb]!, colors[c]!, out);
      b.face(grid[a]!, grid[c]!, grid[d]!, colors[a]!, colors[c]!, colors[d]!, out);
    }
  }
}

/** The valley's rim: an earthen skirt down to the diorama's base. */
function skirt(b: TerrainBuilder, tiles: SurfaceTiles, tx: number, tz: number, dx: number, dz: number): void {
  const alongZ = dx !== 0;
  const ex = dx > 0 ? tx + 1 : tx;
  const ez = dz > 0 ? tz + 1 : tz;
  sampleEdge(tiles, tx, tz, ex, ez, alongZ, rowA);
  rowB.fill(EDGE_BOTTOM);
  face(b, rowA, rowB, ex, ez, alongZ, [dx, 0, dz], false);
}

/** The terrain layer also owns the ground textures and material shared with the ground shader. */
export function terrainLayer(): RenderLayer {
  let chunks: ChunkedMeshes | null = null;
  let ground: GroundTextures | null = null;
  let material: MeshStandardMaterial | null = null;
  let tiles: SurfaceTiles | null = null;

  return {
    id: 'terrain',
    init(ctx: LayerContext) {
      tiles = new SurfaceTiles(ctx.mirror);
      ground = new GroundTextures(ctx.mirror);
      material = createGroundMaterial(ground, ctx.env ?? createWorldEnv(new PerspectiveCamera()));
      const t = tiles;
      chunks = new ChunkedMeshes(ctx.scene, material, (cx, cz) => buildTerrainChunk(t, cx, cz));
      chunks.markAll();
      chunks.rebuild();
    },
    update(change) {
      if (!chunks || !ground) return;
      if (change.full) {
        chunks.markAll();
        ground.refresh([0, 0, MAP_SIZE - 1, MAP_SIZE - 1]);
        return;
      }
      for (const layer of ['height', 'water', 'occupant'] as const) {
        for (const rect of change.rects.get(layer) ?? []) chunks.markRect(rect);
      }
      const painted: LayerName[] = ['terrain', 'water', 'road', 'tree', 'occupant', 'crop', 'fieldOwner'];
      for (const layer of painted) for (const rect of change.rects.get(layer) ?? []) ground.refresh(rect);
    },
    frame() {
      return chunks ? chunks.rebuild(2) : false;
    },
    dispose() {
      chunks?.dispose();
      ground?.dispose();
      material?.dispose();
    },
  };
}
