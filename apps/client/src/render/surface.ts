import { MAP_SIZE } from '@qoti/sim';
import { levelY } from './coords';

/**
 * The ground surface, shared by terrain, water, roads, trees, props and picking.
 *
 * Every tile center sits exactly at its level (so buildings, decor and residents placed at
 * `levelY(h)` stand on the ground). Between four tile centers the ground is two triangles split
 * along the diagonal whose ends agree best, so one-level steps become even slopes and a staircase of
 * levels reads as one diagonal hillside instead of a zigzag. Neighbors two or more levels apart do
 * not blend: each keeps its own level up to the shared edge and the terrain draws a rocky face
 * between them. Tiles under buildings are pinned flat at their building's pad (its door's level, so
 * a footprint across two levels is cut into the hill or banked up as one terrace), with a little
 * flat apron round them and the slopes easing away beyond it. River banks follow a softened water
 * mask, so shorelines curve.
 */

/** Water surface height (world units). */
export const WATER_Y = -0.06;
/** River bed under shallow and deep water (world units). */
const BED_Y = -0.42;
const DEEP_Y = -0.66;
/** Flat ground right round a pinned (built-on) tile, for doorsteps, benches and barrels, in tiles. */
const PIN_APRON = 0.2;
/** Beyond the apron, how far the ground takes to ease back to the hillside, in tiles. */
const PIN_REACH = 0.6;
/** Shoreline shaping: half-width of the band around the mask's middle line, and its slope. */
const SHORE_BAND = 0.14;
const SHORE_SLOPE = 1.6;
/**
 * Grid cells per tile side where the ground is not flat. The grid's vertices are the tile centers,
 * edge middles and corners, and its diagonals run from the tile center to the corners, so it holds
 * the cell triangles exactly.
 */
export const SURFACE_GRID = 2;

export interface SurfaceReader {
  height(x: number, z: number): number;
  water(x: number, z: number): number;
  occupant(x: number, z: number): number;
  /** The level a built-on tile's ground is drawn at (its building's pad); the tile's level if absent. */
  padLevel?(x: number, z: number): number;
}

function clampTile(v: number): number {
  return v < 0 ? 0 : v >= MAP_SIZE ? MAP_SIZE - 1 : v;
}

function ease(u: number): number {
  return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
}

/**
 * Tile facts for the surface (level, base height, pinned), read from the map on demand or cached
 * for a region during a chunk build. Tiles outside the map repeat the edge tiles.
 */
export class SurfaceTiles {
  private cx0 = 0;
  private cz0 = 0;
  private cw = 0;
  private ch = 0;
  private lv = new Int8Array(0);
  private ys = new Float32Array(0);
  private pins = new Uint8Array(0);
  /** 1 when a pinned tile lies in the 3 x 3 block around the tile (cached regions only). */
  private nearPins = new Uint8Array(0);
  /** Share of water tiles in the 3 x 3 block around each tile (the shoreline's smooth mask). */
  private wets = new Float32Array(0);

  constructor(readonly reader: SurfaceReader) {}

  /** Caches the tiles of [x0, x1] x [z0, z1] (inclusive) until `uncache`. */
  cache(x0: number, z0: number, x1: number, z1: number): void {
    this.cx0 = x0;
    this.cz0 = z0;
    this.cw = x1 - x0 + 1;
    this.ch = z1 - z0 + 1;
    const n = this.cw * this.ch;
    if (this.lv.length < n) {
      this.lv = new Int8Array(n);
      this.ys = new Float32Array(n);
      this.pins = new Uint8Array(n);
      this.nearPins = new Uint8Array(n);
      this.wets = new Float32Array(n);
    }
    for (let z = 0; z < this.ch; z++) {
      for (let x = 0; x < this.cw; x++) {
        const i = z * this.cw + x;
        const tx = clampTile(x0 + x);
        const tz = clampTile(z0 + z);
        this.lv[i] = this.readLevel(tx, tz);
        this.ys[i] = this.readY(tx, tz);
        this.pins[i] = this.reader.occupant(tx, tz) ? 1 : 0;
      }
    }
    for (let z = 0; z < this.ch; z++) {
      for (let x = 0; x < this.cw; x++) this.wets[z * this.cw + x] = this.readWet(x0 + x, z0 + z);
    }
    for (let z = 0; z < this.ch; z++) {
      for (let x = 0; x < this.cw; x++) {
        let near = 0;
        for (let dz = -1; dz <= 1 && !near; dz++) {
          for (let dx = -1; dx <= 1 && !near; dx++) {
            const nx = x + dx;
            const nz = z + dz;
            // Outside the cached block: assume a pin could be there (the slow path checks).
            if (nx < 0 || nz < 0 || nx >= this.cw || nz >= this.ch) near = 1;
            else near = this.pins[nz * this.cw + nx]!;
          }
        }
        this.nearPins[z * this.cw + x] = near;
      }
    }
  }

  uncache(): void {
    this.cw = 0;
    this.ch = 0;
  }

  private readLevel(tx: number, tz: number): number {
    const r = this.reader;
    return r.padLevel && r.occupant(tx, tz) && !r.water(tx, tz) ? r.padLevel(tx, tz) : r.height(tx, tz);
  }

  private readY(tx: number, tz: number): number {
    const w = this.reader.water(tx, tz);
    if (w) return w === 2 ? DEEP_Y : BED_Y;
    return levelY(this.readLevel(tx, tz));
  }

  private readWet(x: number, z: number): number {
    let n = 0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) if (this.reader.water(clampTile(x + dx), clampTile(z + dz))) n++;
    return n / 9;
  }

  /** Share of water in the 3 x 3 block around a tile. */
  wet(x: number, z: number): number {
    const i = this.slot(x, z);
    return i >= 0 ? this.wets[i]! : this.readWet(x, z);
  }

  private slot(x: number, z: number): number {
    const lx = x - this.cx0;
    const lz = z - this.cz0;
    return lx >= 0 && lz >= 0 && lx < this.cw && lz < this.ch ? lz * this.cw + lx : -1;
  }

  level(x: number, z: number): number {
    const i = this.slot(x, z);
    return i >= 0 ? this.lv[i]! : this.readLevel(clampTile(x), clampTile(z));
  }

  /** Height of the tile's center: its level on land, the river bed under water. */
  y(x: number, z: number): number {
    const i = this.slot(x, z);
    return i >= 0 ? this.ys[i]! : this.readY(clampTile(x), clampTile(z));
  }

  /** False only when no tile in the 3 x 3 block around (x, z) is pinned. */
  pinsNear(x: number, z: number): boolean {
    const i = this.slot(x, z);
    return i >= 0 ? this.nearPins[i] === 1 : true;
  }

  pinned(x: number, z: number): boolean {
    const i = this.slot(x, z);
    return i >= 0 ? this.pins[i] === 1 : this.reader.occupant(clampTile(x), clampTile(z)) !== 0;
  }
}

const L = [0, 0, 0, 0];
const Y = [0, 0, 0, 0];
const S = [0, 0, 0, 0];
const IN = [false, false, false, false];
// Edge neighbors of each corner of a dual cell (0 top left, 1 top right, 2 bottom left, 3 bottom right).
const NB: readonly (readonly [number, number])[] = [
  [1, 2],
  [0, 3],
  [0, 3],
  [1, 2],
];

/**
 * Surface height at (px, pz) as seen from tile (tx, tz). The point should lie on that tile
 * (boundaries included). Two tiles agree along their shared edge unless they are a cliff apart, a
 * pinned tile meets a different level, or similar; the terrain closes such seams with a face.
 */
export function tileSurfaceY(t: SurfaceTiles, tx: number, tz: number, px: number, pz: number): number {
  const ownY = t.y(tx, tz);
  if (t.pinned(tx, tz)) return ownY;
  // The dual cell between the four tile centers around the point.
  const i0 = px >= tx + 0.5 ? tx : tx - 1;
  const j0 = pz >= tz + 0.5 ? tz : tz - 1;
  const u = px - 0.5 - i0;
  const v = pz - 0.5 - j0;
  const own = (tz - j0) * 2 + (tx - i0);
  for (let k = 0; k < 4; k++) {
    const x = i0 + (k & 1);
    const z = j0 + (k >> 1);
    L[k] = t.level(x, z);
    Y[k] = t.y(x, z);
    IN[k] = k === own;
  }
  // Cells corners blend when edge neighbors differ by less than two levels.
  const e01 = Math.abs(L[0]! - L[1]!) < 2;
  const e23 = Math.abs(L[2]! - L[3]!) < 2;
  const e02 = Math.abs(L[0]! - L[2]!) < 2;
  const e13 = Math.abs(L[1]! - L[3]!) < 2;
  for (let pass = 0; pass < 2; pass++) {
    if (e01 && (IN[0] || IN[1])) IN[0] = IN[1] = true;
    if (e23 && (IN[2] || IN[3])) IN[2] = IN[3] = true;
    if (e02 && (IN[0] || IN[2])) IN[0] = IN[2] = true;
    if (e13 && (IN[1] || IN[3])) IN[1] = IN[3] = true;
  }
  for (let k = 0; k < 4; k++) {
    if (IN[k]) {
      S[k] = Y[k]!;
      continue;
    }
    // Across a cliff: continue the owner's side of the cell instead.
    const [a, b] = NB[k]!;
    if (IN[a] && IN[b]) S[k] = (Y[a]! + Y[b]!) / 2;
    else if (IN[a]) S[k] = Y[a]!;
    else if (IN[b]) S[k] = Y[b]!;
    else S[k] = ownY;
  }
  // Two triangles, split along the diagonal whose ends differ least (ties: the higher one, so
  // saddles keep a ridge). Cell edges stay linear between their tile centers either way, so
  // neighboring cells always meet.
  const s0 = S[0]!;
  const s1 = S[1]!;
  const s2 = S[2]!;
  const s3 = S[3]!;
  const dMain = Math.abs(s0 - s3);
  const dAnti = Math.abs(s1 - s2);
  let y: number;
  if (dAnti < dMain || (dAnti === dMain && s1 + s2 >= s0 + s3)) {
    y = u + v <= 1 ? s0 + (s1 - s0) * u + (s2 - s0) * v : s3 + (s2 - s3) * (1 - u) + (s1 - s3) * (1 - v);
  } else {
    y = u >= v ? s0 + (s1 - s0) * u + (s3 - s1) * v : s0 + (s2 - s0) * v + (s3 - s2) * u;
  }

  // Shorelines follow a softened water mask instead of the tile grid: close to the mask's middle
  // line the ground is pulled through the water line, so river banks curve. Only where the water
  // and this tile share the slope (not under a cliff that drops into the river).
  let wetCell = false;
  for (let k = 0; k < 4; k++) if (IN[k] && Y[k]! < 0) wetCell = true;
  if (wetCell) {
    const eu = ease(u);
    const ev = ease(v);
    const w0 = t.wet(i0, j0);
    const w1 = t.wet(i0 + 1, j0);
    const w2 = t.wet(i0, j0 + 1);
    const w3 = t.wet(i0 + 1, j0 + 1);
    const wt = w0 + (w1 - w0) * eu;
    const wb = w2 + (w3 - w2) * eu;
    const sd = 0.5 - (wt + (wb - wt) * ev);
    const k = ease(Math.abs(sd) / SHORE_BAND);
    if (k < 1) y = WATER_Y + sd * SHORE_SLOPE + (y - WATER_Y - sd * SHORE_SLOPE) * k;
  }

  // Built-on neighbors pull the ground level with themselves near their edges.
  if (!t.pinsNear(tx, tz)) return y;
  let maxW = 0;
  let sumW = 0;
  let sumY = 0;
  const ownL = t.level(tx, tz);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const nx = tx + dx;
      const nz = tz + dz;
      if (!t.pinned(nx, nz) || Math.abs(t.level(nx, nz) - ownL) >= 2) continue;
      const ddx = px < nx ? nx - px : px > nx + 1 ? px - nx - 1 : 0;
      const ddz = pz < nz ? nz - pz : pz > nz + 1 ? pz - nz - 1 : 0;
      const d = Math.sqrt(ddx * ddx + ddz * ddz);
      if (d >= PIN_APRON + PIN_REACH) continue;
      const w = d <= PIN_APRON ? 1 : 1 - ease((d - PIN_APRON) / PIN_REACH);
      sumW += w;
      sumY += w * t.y(nx, nz);
      if (w > maxW) maxW = w;
    }
  }
  if (sumW > 0) y += (sumY / sumW - y) * maxW;
  return y;
}

/**
 * Height of the ground as drawn at a world point: the terrain mesh samples the smooth surface on a
 * grid and the triangles between are flat, so this interpolates the same grid the same way. Use it
 * to stand things on the ground.
 */
export function surfaceY(t: SurfaceTiles, px: number, pz: number): number {
  const x = Math.min(MAP_SIZE - 1e-6, Math.max(0, px));
  const z = Math.min(MAP_SIZE - 1e-6, Math.max(0, pz));
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  const fx = (x - tx) * SURFACE_GRID;
  const fz = (z - tz) * SURFACE_GRID;
  const i = Math.min(SURFACE_GRID - 1, Math.floor(fx));
  const j = Math.min(SURFACE_GRID - 1, Math.floor(fz));
  const a = fx - i;
  const b = fz - j;
  const g = 1 / SURFACE_GRID;
  const at = (di: number, dj: number) => tileSurfaceY(t, tx, tz, tx + (i + di) * g, tz + (j + dj) * g);
  const y00 = at(0, 0);
  const y11 = at(1, 1);
  // Triangles follow the mesh: diagonals alternate between neighboring cells.
  if ((i + j) % 2 === 0) {
    // Diagonal from (0, 0) to (1, 1).
    if (b >= a) return y00 + (at(0, 1) - y00) * b + (y11 - at(0, 1)) * a;
    return y00 + (at(1, 0) - y00) * a + (y11 - at(1, 0)) * b;
  }
  const y10 = at(1, 0);
  const y01 = at(0, 1);
  // Diagonal from (1, 0) to (0, 1).
  if (a + b <= 1) return y00 + (y10 - y00) * a + (y01 - y00) * b;
  return y11 + (y01 - y11) * (1 - a) + (y10 - y11) * (1 - b);
}

const tilesByReader = new WeakMap<SurfaceReader, SurfaceTiles>();

/** An uncached surface view of a reader (picking, single placements). */
export function surfaceOf(reader: SurfaceReader): SurfaceTiles {
  let t = tilesByReader.get(reader);
  if (!t) {
    t = new SurfaceTiles(reader);
    tilesByReader.set(reader, t);
  }
  return t;
}

/** Ground height at a world point straight from a map reader. */
export function groundY(reader: SurfaceReader, px: number, pz: number): number {
  return surfaceY(surfaceOf(reader), px, pz);
}
