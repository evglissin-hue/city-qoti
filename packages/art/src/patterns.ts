// The pattern texture array (V1.0 interface, V1A generators). The kit material (render/material.ts)
// and the ground shader (V1C) sample one texture array with a layer per surface id (surface.ts)
// plus the noise layer, laid on each face as the surface table says. Generated in code at load,
// never authored (P46), and seeded, so both laptops build the same texels.
//
// Speed: every layer is built from a handful of noise fields, each one value noise on an integer
// lattice whose corner values come from a precomputed table, interpolated with weights that are
// precomputed per row and per column. No texel hashes anything, so the twenty-five generated layers take a few
// tens of milliseconds. Only +, -, *, / and floor are used (no Math.sin or Math.pow), so the
// result is the same on every machine to the bit.
import {
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { NOISE_LAYER, PATTERN_LAYERS, ROOM_LAYER, ROOM_LAYERS, SURFACE } from './surface';

/**
 * What each texel holds (RGBA8):
 * - R: a luminance multiplier, 128 meaning 1 (0 is black, 255 just under 2).
 * - G: the accent mask, 0 to 255, mixing toward the surface's accent color (mortar, stripes).
 * - B: a secondary value, such as the hue of a flower.
 * - A: the color mask, used by the flowers layer only (its RGB is then the flower's color).
 */
export const PATTERN_CHANNELS = { luminance: 0, accent: 1, secondary: 2, mask: 3 } as const;

/** R value that leaves a color as it is. */
export const PATTERN_ONE = 128;

/** Default edge of one layer in texels. */
export const PATTERN_SIZE = 256;

/** How the array is filled: the generators (the game) or flat (R 128 everywhere, for tests). */
export type PatternFill = 'patterns' | 'flat';

/** Milliseconds the last `createPatternArray` spent generating, for the load log. */
let lastMs = 0;
export function lastPatternMs(): number {
  return lastMs;
}

/**
 * The pattern array: `size` x `size` texels per layer, one layer per surface id with the noise layer
 * at 19 (`NOISE_LAYER`), then the room layers (V2.0, `ROOM_LAYER`), `PATTERN_LAYERS` in all, RGBA8,
 * mipmapped, repeating. `fill` 'patterns' (the default) runs the
 * generators; 'flat' leaves every layer flat (R 128, G B A 0). Create it once and share it: about
 * 8.7 MB, plus a third again for the mipmaps. Anisotropy is the renderer's (see `setPatternAnisotropy`
 * in the client's env.ts).
 */
export function createPatternArray(size = PATTERN_SIZE, fill: PatternFill = 'patterns'): DataArrayTexture {
  const data = new Uint8Array(size * size * PATTERN_LAYERS * 4);
  if (fill === 'patterns') {
    const t0 = typeof performance === 'undefined' ? 0 : performance.now();
    generatePatterns(data, size);
    lastMs = typeof performance === 'undefined' ? 0 : performance.now() - t0;
  } else {
    for (let i = 0; i < data.length; i += 4) data[i] = PATTERN_ONE;
  }
  const tex = new DataArrayTexture(data, size, size, PATTERN_LAYERS);
  tex.format = RGBAFormat;
  tex.type = UnsignedByteType;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- tables and fields

/** A small seeded generator (mulberry32): integers only, so every engine gives the same stream. */
function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A table of `cx * cy` random values in [0, 1), one per lattice cell. */
function table(cx: number, cy: number, seed: number): Float64Array {
  const t = new Float64Array(cx * cy);
  const r = rng(seed * 7919 + cx * 131 + cy * 7);
  for (let i = 0; i < t.length; i++) t[i] = r();
  return t;
}

/** Per-texel lattice indices and smoothstep weights along one axis, for `cells` cells. */
function axis(size: number, cells: number): { i0: Int32Array; i1: Int32Array; w: Float64Array } {
  const i0 = new Int32Array(size);
  const i1 = new Int32Array(size);
  const w = new Float64Array(size);
  for (let p = 0; p < size; p++) {
    const f = ((p + 0.5) / size) * cells;
    const i = Math.floor(f);
    const t = f - i;
    i0[p] = i % cells;
    i1[p] = (i + 1) % cells;
    w[p] = t * t * (3 - 2 * t);
  }
  return { i0, i1, w };
}

/**
 * Tileable value noise over the layer, `cx` by `cy` lattice cells, in [0, 1). Row major, y up
 * (row 0 is v = 0).
 */
function noise(size: number, cx: number, cy: number, seed: number): Float64Array {
  const t = table(cx, cy, seed);
  const ax = axis(size, cx);
  const ay = axis(size, cy);
  const out = new Float64Array(size * size);
  for (let py = 0; py < size; py++) {
    const r0 = ay.i0[py]! * cx;
    const r1 = ay.i1[py]! * cx;
    const v = ay.w[py]!;
    const o = py * size;
    for (let px = 0; px < size; px++) {
      const x0 = ax.i0[px]!;
      const x1 = ax.i1[px]!;
      const u = ax.w[px]!;
      const a = t[r0 + x0]!;
      const b = t[r0 + x1]!;
      const c = t[r1 + x0]!;
      const d = t[r1 + x1]!;
      out[o + px] = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
  }
  return out;
}

/** Fractal value noise: `octaves` layers of `noise`, each twice the cells at half the weight. */
function fbm(size: number, cx: number, cy: number, octaves: number, seed: number): Float64Array {
  const out = new Float64Array(size * size);
  let amp = 0.5;
  let sum = 0;
  for (let o = 0; o < octaves; o++) {
    const n = noise(size, cx << o, cy << o, seed + o);
    for (let i = 0; i < out.length; i++) out[i]! += n[i]! * amp;
    sum += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i]! /= sum;
  return out;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Hermite step from a to b (either order). */
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** A cheap bump on [0, 1]: 0 at the ends, 1 in the middle (a parabola, close to sin(pi x)). */
const bump = (x: number): number => 4 * x * (1 - x);

/** A running bond: `rows` courses of `cols` blocks, every other course shifted by `shift` of a block. */
interface Bond {
  row: number;
  col: number;
  /** Position inside the block, 0 to 1 across and up. */
  fx: number;
  fy: number;
}
function bond(x: number, y: number, cols: number, rows: number, shift = 0.5): Bond {
  const cy = y * rows;
  const row = Math.floor(cy);
  const bx = x * cols + (row % 2) * shift;
  const col = Math.floor(bx);
  return { row, col: ((col % cols) + cols) % cols, fx: bx - col, fy: cy - row };
}

// ---------------------------------------------------------------- the layers

type Texel = (x: number, y: number, i: number) => void;

/**
 * Fills every layer. Each layer's function writes R (luminance, 1 is neutral), G (accent mask),
 * B (secondary) and A (color mask) into `out` for the texel at (x, y), with `i` its index in the
 * layer's noise fields.
 */
export function generatePatterns(data: Uint8Array, size: number): void {
  const n = size * size;
  const out = { r: 1, g: 0, b: 0, a: 0 };
  // A clamped view rounds and clamps each byte as it is written (the same on every engine).
  const c8 = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  const put = (layer: number, fn: Texel | null): void => {
    const off = layer * n * 4;
    if (!fn) {
      for (let i = 0; i < n; i++) c8[off + i * 4] = PATTERN_ONE;
      return;
    }
    for (let py = 0; py < size; py++) {
      const y = (py + 0.5) / size;
      for (let px = 0; px < size; px++) {
        out.r = 1;
        out.g = 0;
        out.b = 0;
        out.a = 0;
        const i = py * size + px;
        fn((px + 0.5) / size, y, i);
        const o = off + i * 4;
        c8[o] = out.r * 127.5;
        c8[o + 1] = out.g * 255;
        c8[o + 2] = out.b * 255;
        c8[o + 3] = out.a * 255;
      }
    }
  };
  const cells = (cx: number, cy: number, seed: number): Float64Array => table(cx, cy, seed);

  // Plain: flat.
  put(SURFACE.plain, null);

  // Plaster: two scales of mottling, broad patches and a fine grain.
  {
    const broad = fbm(size, 4, 4, 4, 11);
    const grain = fbm(size, 48, 48, 2, 13);
    put(SURFACE.plaster, (_x, _y, i) => {
      out.r = 1 + (broad[i]! - 0.5) * 0.3 + (grain[i]! - 0.5) * 0.12;
    });
  }

  // Brick: 16 courses of 6 stretchers (0.075 by 0.2 of a tile at the table's scale), staggered half
  // a brick, a tone per brick, slightly darker edges, mortar in G.
  {
    const tone = cells(6, 16, 21);
    const grain = fbm(size, 32, 32, 2, 22);
    put(SURFACE.brick, (x, y, i) => {
      const b = bond(x, y, 6, 16);
      const mortar = b.fy < 0.13 || b.fx < 0.035;
      const edge = b.fy < 0.2 || b.fx < 0.06 || b.fy > 0.94 ? 0.92 : 1;
      out.r = (0.84 + 0.32 * tone[b.row * 6 + b.col]!) * edge * (1 + (grain[i]! - 0.5) * 0.14);
      out.g = mortar ? 1 : 0;
    });
  }

  // Stone ashlar: 8 courses of 4 blocks, darker joints, a tone and a little relief per block.
  {
    const tone = cells(4, 8, 31);
    const grain = fbm(size, 16, 16, 3, 32);
    put(SURFACE.stone, (x, y, i) => {
      const b = bond(x, y, 4, 8);
      const joint = b.fy < 0.07 || b.fx < 0.035;
      const lip = b.fy > 0.9 ? 1.05 : 1;
      out.r = joint ? 0.68 : (0.88 + 0.22 * tone[b.row * 4 + b.col]!) * lip * (1 + (grain[i]! - 0.5) * 0.18);
    });
  }

  // Timber: long grain along the beam with a few darker streaks.
  {
    const grain = fbm(size, 24, 2, 3, 41);
    const streak = noise(size, 64, 1, 42);
    put(SURFACE.timber, (_x, _y, i) => {
      out.r = (1 + (grain[i]! - 0.5) * 0.36) * (streak[i]! > 0.82 ? 0.88 : 1);
    });
  }

  // Clay tile: 16 courses of 10 tiles (0.07 of a tile per course at the table's scale), a shadow
  // line under each course, joints, a tone per tile and a curve shaded across every tile.
  {
    const tone = cells(10, 16, 51);
    const grain = fbm(size, 32, 32, 2, 52);
    put(SURFACE.tile, (x, y, i) => {
      const b = bond(x, y, 10, 16);
      const curve = 0.86 + 0.18 * bump(b.fx);
      const course = b.fy > 0.86 ? 0.68 : 0.8 + 0.28 * smooth(1, 0.15, b.fy);
      const joint = b.fx < 0.04 ? 0.86 : 1;
      out.r =
        course * curve * joint * (0.86 + 0.28 * tone[b.row * 10 + b.col]!) * (1 + (grain[i]! - 0.5) * 0.1);
    });
  }

  // Slate: smaller courses (20 of 12), a dark line under each, a tone per slate.
  {
    const tone = cells(12, 20, 61);
    const grain = fbm(size, 32, 32, 2, 62);
    put(SURFACE.slate, (x, y, i) => {
      const b = bond(x, y, 12, 20);
      out.r =
        (b.fy > 0.85 ? 0.74 : 1) *
        (b.fx < 0.05 ? 0.86 : 1) *
        (0.88 + 0.24 * tone[b.row * 12 + b.col]!) *
        (1 + (grain[i]! - 0.5) * 0.08);
    });
  }

  // Thatch: fibers running down the slope, soft courses and clumps.
  {
    const fibers = fbm(size, 96, 6, 2, 71);
    const clumps = fbm(size, 4, 4, 3, 72);
    put(SURFACE.thatch, (_x, y, i) => {
      const fy = y * 8 - Math.floor(y * 8);
      out.r =
        (0.8 + 0.36 * fibers[i]!) * (0.88 + 0.12 * smooth(0, 0.45, fy)) * (1 + (clumps[i]! - 0.5) * 0.24);
    });
  }

  // Cobbles: 8 by 8 setts with rounded shading and dark gaps.
  {
    const tone = cells(8, 8, 81);
    const grain = fbm(size, 32, 32, 2, 82);
    put(SURFACE.cobble, (x, y, i) => {
      const b = bond(x, y, 8, 8);
      const fx = b.fx - 0.5;
      const fy = b.fy - 0.5;
      const r = Math.max(Math.abs(fx), Math.abs(fy));
      out.r =
        r > 0.42
          ? 0.56
          : (0.84 + 0.32 * tone[b.row * 8 + b.col]!) *
            (1.06 - 0.5 * (fx * fx + fy * fy)) *
            (1 + (grain[i]! - 0.5) * 0.1);
    });
  }

  // Glass: flat (the material gives it a sky fresnel and a sun glint).
  put(SURFACE.glass, null);

  // Grass: fine variation and sparse flower dots (G mask, B hue).
  {
    const fine = fbm(size, 24, 24, 3, 101);
    const blades = noise(size, 128, 128, 105);
    const dots = cells(128, 128, 103);
    const hue = cells(128, 128, 104);
    put(SURFACE.grass, (x, y, i) => {
      const c = Math.floor(y * 128) * 128 + Math.floor(x * 128);
      out.r = 1 + (fine[i]! - 0.5) * 0.26 + (blades[i]! - 0.5) * 0.08;
      out.g = dots[c]! > 0.985 ? 1 : 0;
      out.b = hue[c]!;
    });
  }

  // Dirt: noise and pebbles.
  {
    const ground = fbm(size, 8, 8, 4, 111);
    const pebbles = cells(64, 64, 112);
    put(SURFACE.dirt, (x, y, i) => {
      const p = pebbles[Math.floor(y * 64) * 64 + Math.floor(x * 64)]!;
      out.r = (1 + (ground[i]! - 0.5) * 0.3) * (p > 0.95 ? 1.14 : p < 0.05 ? 0.86 : 1);
    });
  }

  // Water: flat (fresnel and glint).
  put(SURFACE.water, null);

  // Leaf: soft clusters of light and shade.
  {
    const clusters = fbm(size, 6, 6, 3, 131);
    put(SURFACE.leaf, (_x, _y, i) => {
      out.r = 1 + (clusters[i]! - 0.5) * 0.4;
    });
  }

  // Zinc: standing seams, 8 to a tile, with a lit ridge beside each, and a faint mottle.
  {
    const mottle = fbm(size, 8, 8, 2, 141);
    put(SURFACE.zinc, (x, _y, i) => {
      const fx = x * 8 - Math.floor(x * 8);
      out.r = (fx < 0.04 ? 0.82 : fx < 0.08 ? 1.08 : 1) * (1 + (mottle[i]! - 0.5) * 0.08);
    });
  }

  // Awning: two stripes to a tile, the cream one in G.
  put(SURFACE.awning, (x) => {
    out.g = x * 2 - Math.floor(x * 2) < 0.5 ? 1 : 0;
  });

  // Field: 4 furrows to a tile, ridges lit and troughs shaded, over soil noise.
  {
    const soil = fbm(size, 8, 8, 3, 161);
    put(SURFACE.field, (_x, y, i) => {
      const fv = y * 4 - Math.floor(y * 4);
      out.r = (1 + (smooth(0, 0.5, fv) * smooth(1, 0.5, fv) - 0.47) * 0.5) * (1 + (soil[i]! - 0.5) * 0.2);
    });
  }

  // Flags: 4 by 4 slabs, staggered by a little over a third, with joints.
  {
    const tone = cells(4, 4, 171);
    const grain = fbm(size, 16, 16, 2, 172);
    put(SURFACE.flags, (x, y, i) => {
      const b = bond(x, y, 4, 4, 0.37);
      const joint = b.fy < 0.045 || b.fx < 0.045;
      out.r = joint ? 0.72 : (0.92 + 0.15 * tone[b.row * 4 + b.col]!) * (1 + (grain[i]! - 0.5) * 0.1);
    });
  }

  // Flowers: an 11 by 11 grid of round heads, a little under half the cells, colors in RGB (stored
  // as luminance-scale values: R 0.5 is full red) and the mask in A.
  {
    const kind = cells(11, 11, 181);
    const keep = cells(11, 11, 182);
    const COLORS = [
      [0.8, 0.22, 0.26],
      [0.95, 0.74, 0.2],
      [0.88, 0.52, 0.74],
      [0.96, 0.94, 0.9],
    ] as const;
    put(SURFACE.flowers, (x, y) => {
      const ci = Math.floor(x * 11);
      const cj = Math.floor(y * 11);
      const fx = x * 11 - ci - 0.5;
      const fy = y * 11 - cj - 0.5;
      const c = cj * 11 + ci;
      out.r = 0;
      if (keep[c]! < 0.45) return;
      const d = fx * fx + fy * fy;
      if (d > 0.12) return;
      const col = COLORS[Math.min(3, Math.floor(kind[c]! * 4))]!;
      // RGB carries the color directly (the A mask says where), so write it at half scale to
      // undo the luminance channel's doubling.
      out.r = col[0] * 2;
      out.g = col[1];
      out.b = col[2];
      out.a = smooth(0.12, 0.08, d);
    });
  }

  // The noise layer: low-frequency fbm for meadow patches and weathering.
  {
    const low = fbm(size, 4, 4, 4, 191);
    put(NOISE_LAYER, (_x, _y, i) => {
      out.r = low[i]! * 2;
      out.a = 1;
    });
  }

  // V2C: the five surfaces of props, carts and residents. They sit on small things (a barrel is a
  // fifth of a tile), so each is a few soft strokes that read at street zoom and mip away to the
  // piece's own color from the default camera.

  // Wood grain: streaks along u (planks, seats and cart beds run level), finer lines between them,
  // and a knot in about one cell in seven of a 3 by 6 grid, drawn long along the grain.
  {
    const streaks = fbm(size, 2, 14, 2, 201);
    const lines = noise(size, 3, 56, 202);
    const knotAt = cells(3, 6, 203);
    const knotX = cells(3, 6, 204);
    const knotY = cells(3, 6, 205);
    put(SURFACE.woodGrain, (x, y, i) => {
      let r = 1 + (streaks[i]! - 0.5) * 0.42 + (lines[i]! - 0.5) * 0.16;
      const cx = Math.floor(x * 3);
      const cy = Math.floor(y * 6);
      const c = cy * 3 + cx;
      if (knotAt[c]! > 0.86) {
        const dx = (x * 3 - cx - 0.25 - knotX[c]! * 0.5) * 2.2;
        const dy = (y * 6 - cy - 0.3 - knotY[c]! * 0.4) * 5;
        const d = dx * dx + dy * dy;
        // A dark heart and a lighter ring of grain bending round it.
        r *= d < 0.05 ? 0.66 : d < 0.22 ? 1.08 - 0.22 * smooth(0.22, 0.05, d) : 1;
      }
      out.r = r;
    });
  }

  // Painted wood: the paint is mostly even, with faint brush strokes along u, and worn through to
  // bare wood (G, the accent: palette 2.0 wood) where a fine mottle peaks, about one texel in twelve.
  {
    const strokes = fbm(size, 2, 24, 2, 211);
    const tone = fbm(size, 5, 5, 2, 212);
    const wear = fbm(size, 10, 12, 2, 213);
    put(SURFACE.paintedWood, (_x, _y, i) => {
      out.r = 1 + (strokes[i]! - 0.5) * 0.14 + (tone[i]! - 0.5) * 0.12;
      out.g = smooth(0.68, 0.76, wear[i]!);
    });
  }

  // Wrought iron: a hammered mottle, darker hollows and bright worn high spots.
  {
    const mottle = fbm(size, 12, 12, 2, 221);
    const spots = cells(64, 64, 222);
    put(SURFACE.wroughtIron, (x, y, i) => {
      const p = spots[Math.floor(y * 64) * 64 + Math.floor(x * 64)]!;
      out.r = (1 + (mottle[i]! - 0.5) * 0.46) * (p > 0.94 ? 1.22 : 1);
    });
  }

  // Terracotta: the potter's wheel's rings (level bands), mottled firing, a little grit, and pale
  // bloom where the clay has weathered (G, the accent: palette 2.0 stripe, a lime-washed cream).
  {
    const firing = fbm(size, 6, 6, 2, 231);
    const ringTone = noise(size, 1, 20, 232);
    const grit = cells(128, 128, 233);
    const bloom = fbm(size, 4, 4, 3, 234);
    put(SURFACE.terracotta, (x, y, i) => {
      const fy = y * 20 - Math.floor(y * 20);
      const ring = 0.97 + 0.06 * bump(fy) + (ringTone[i]! - 0.5) * 0.08;
      const g = grit[Math.floor(y * 128) * 128 + Math.floor(x * 128)]!;
      out.r = ring * (1 + (firing[i]! - 0.5) * 0.34) * (g > 0.96 ? 0.92 : g < 0.03 ? 1.06 : 1);
      out.g = smooth(0.58, 0.76, bloom[i]!) * 0.8;
    });
  }

  // Cloth: a plain weave of 32 threads each way (8 texels a thread), each thread a little lighter
  // or darker than its neighbors (homespun), over the soft unevenness of a hand dye.
  {
    const warp = cells(32, 1, 241);
    const weft = cells(1, 32, 242);
    const dye = fbm(size, 4, 4, 2, 243);
    put(SURFACE.cloth, (x, y, i) => {
      const tx = x * 32;
      const ty = y * 32;
      const ix = Math.floor(tx);
      const iy = Math.floor(ty);
      const fx = tx - ix;
      const fy = ty - iy;
      // Where the warp lies on top it is lit across its width; where the weft does, across its own.
      const over = (ix + iy) % 2 === 0;
      const lit = 0.8 + 0.3 * bump(over ? fx : fy);
      const slub = over ? warp[ix]! : weft[iy]!;
      out.r = lit * (1 + (slub - 0.5) * 0.14) * (1 + (dye[i]! - 0.5) * 0.2);
    });
  }

  // V2.0: the eight room layers behind lit windows (V2A) are flat until their generator lands.
  for (let r = 0; r < ROOM_LAYERS; r++) put(ROOM_LAYER + r, null);
}
