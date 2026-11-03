import { BufferGeometry, Color, Float32BufferAttribute, Uint8BufferAttribute, Vector3 } from 'three';

export type V3 = [number, number, number];

/** V1B: the level of detail a builder draws (`KitBuildOptions.lod`). */
export type Lod = 'high' | 'low';

/**
 * V1B: how `build()` bakes vertex ambient occlusion. `classic` is the C2 bake every kit had (a
 * contact band scaled to the piece's height and a top-lit gradient), kept for trees, nature and
 * props; `kit` is the Painted Miniature bake for buildings: about a quarter darker at the foot of a
 * wall, fading out by 0.85 tiles up, darker under jetties, deep eaves and in inner corners (the
 * builder's occluders), never on roofs or lit panes.
 */
export type AoBake = 'classic' | 'kit';

/** V1B: a soft box of shade: vertices inside darken by `k`, fading over `soft` outside it. */
interface Occluder {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  k: number;
  soft: number;
}

/** Surface ids (surface.ts) that are roofs: the kit bake never darkens them. */
const ROOF_SURFACES = new Set([5, 6, 7, 14]);

/** A hash in [0, 1) of a few integers, for jitter that depends only on where a face is. */
export function hash4(a: number, b: number, c: number, d: number): number {
  let h =
    (Math.imul(a | 0, 73856093) ^
      Math.imul(b | 0, 19349663) ^
      Math.imul(c | 0, 83492791) ^
      Math.imul(d | 0, 668265263)) >>>
    0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpN = new Vector3();
const tmpColor = new Color();
const hsl = { h: 0, s: 0, l: 0 };

/** A small deterministic generator (mulberry32). Same seed, same sequence, on every laptop. */
export function seeded(seed: number): () => number {
  let a = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A gentle hue and lightness nudge for variety; `amount` 1 is about plus or minus 4 percent. */
export function vary(hex: number, rnd: () => number, amount = 1): number {
  tmpColor.setHex(hex).getHSL(hsl);
  const h = hsl.h + (rnd() - 0.5) * 0.03 * amount;
  const l = Math.min(1, Math.max(0, hsl.l + (rnd() - 0.5) * 0.08 * amount));
  return tmpColor.setHSL((h + 1) % 1, hsl.s, l).getHex();
}

/** Mix two colors; t 0 is `a`, 1 is `b`. */
export function mixHex(a: number, b: number, t: number): number {
  const ca = new Color(a);
  return ca.lerp(new Color(b), t).getHex();
}

/**
 * Accumulates flat-shaded, vertex-colored triangles and emits one non-indexed geometry.
 * Faces take an outward hint and flip themselves if needed, so winding mistakes cannot
 * produce inside-out pieces. Every geometry carries a `glow` attribute (1 on panes and flames),
 * a `surface` attribute (V1.0: the surface id of each face, surface.ts; 0, plain, unless set) and
 * baked vertex ambient occlusion (darker at the base and on undersides, lighter on top).
 */
export class ShapeBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly glows: number[] = [];
  private readonly surfaces: number[] = [];
  private readonly color = new Color();
  private glowValue = 0;
  private surfaceValue = 0;
  /**
   * V1B: muting at the low level. `soft` sections (decoration) drop everything but the far versions
   * of structural parts (`essential`); `hard` sections (near-only detail) drop everything.
   */
  private soft = 0;
  private hard = 0;
  private jitterValue = 0;
  /** A face's jitter factor while `quad` draws its two triangles (NaN when unset). */
  private faceK = Number.NaN;
  private readonly occluders: Occluder[] = [];
  /** V1B: the level this builder draws. Parts read it to draw their far version. */
  readonly lod: Lod;
  /** V1B: the vertex AO `build()` bakes by default. */
  readonly bake: AoBake;

  constructor(lod: Lod = 'high', bake: AoBake = 'classic') {
    this.lod = lod;
    this.bake = bake;
  }

  /** V1B: true when drawing the far level. */
  get low(): boolean {
    return this.lod === 'low';
  }

  /** V1B: true while faces are being dropped (inside `detail` or `nearOnly` at the low level). */
  get silent(): boolean {
    return this.soft > 0 || this.hard > 0;
  }

  /**
   * V1B: decoration. At the high level `fn` draws as usual; at the low level it runs with its faces
   * dropped, so every random draw inside happens exactly as at the high level and whatever is built
   * afterwards keeps its colors and choices: the swap never pops. Structural parts inside (walls,
   * roofs, chimneys, windows and doors) still draw their far versions (`essential`).
   */
  detail(fn: () => void): this {
    if (!this.low) {
      fn();
      return this;
    }
    this.soft++;
    try {
      fn();
    } finally {
      this.soft--;
    }
    return this;
  }

  /** V1B: near-only detail: like `detail`, but nothing inside draws at the low level. */
  nearOnly(fn: () => void): this {
    if (!this.low) {
      fn();
      return this;
    }
    this.hard++;
    try {
      fn();
    } finally {
      this.hard--;
    }
    return this;
  }

  /** V1B: the far version of a structural part: it draws even inside `detail` (not `nearOnly`). */
  essential(fn: () => void): this {
    if (!this.low || this.soft === 0) {
      fn();
      return this;
    }
    const soft = this.soft;
    this.soft = 0;
    try {
      fn();
    } finally {
      this.soft = soft;
    }
    return this;
  }

  /**
   * V1B: a part with two versions: `near` at the high level; at the low level `near` runs silently
   * (the same random draws) and `far` draws instead, as an essential part. `far` must not draw from
   * a random stream.
   */
  levels(near: () => void, far: () => void): this {
    if (!this.low) {
      near();
      return this;
    }
    this.nearOnly(near);
    this.essential(far);
    return this;
  }

  /** V1B: true when a primitive of these extents is dropped at the low level: largest under 0.16
   * tiles, or middle under 0.045 (knobs, pots, rails, pickets). */
  isMinor(a: number, b: number, c: number): boolean {
    if (!this.low) return false;
    const x = Math.abs(a);
    const y = Math.abs(b);
    const z = Math.abs(c);
    const hi = Math.max(x, y, z);
    const mid = x + y + z - hi - Math.min(x, y, z);
    // Long posts and beams stay a little thinner than short pieces, so roofs keep their supports.
    return hi < 0.16 || mid < (hi > 0.45 ? 0.03 : 0.045);
  }

  /** V1B: runs a primitive, silently when it is minor at the low level (its random draws still run). */
  private minor(a: number, b: number, c: number, fn: () => void): this {
    if (this.isMinor(a, b, c)) return this.nearOnly(fn);
    fn();
    return this;
  }

  /**
   * V1B: per-face color jitter for the following faces, hashed from each face's position and surface
   * (about plus or minus `amount` in brightness), so the near and far levels paint a wall alike.
   */
  jitter(amount: number): this {
    this.jitterValue = amount;
    return this;
  }

  /**
   * V1B: a soft box of baked shade (the kit bake): vertices inside darken by `k` (0.2 is a fifth),
   * fading to nothing `soft` tiles outside. For under jetties and porches, inner corners and party walls.
   */
  occlude(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    k: number,
    soft = 0.2,
  ): this {
    this.occluders.push({
      x0: Math.min(x0, x1),
      y0: Math.min(y0, y1),
      z0: Math.min(z0, z1),
      x1: Math.max(x0, x1),
      y1: Math.max(y0, y1),
      z1: Math.max(z0, z1),
      k,
      soft,
    });
    return this;
  }

  /** Sets the glow written for the following faces (1 for window panes and flames). */
  glow(value: number): this {
    this.glowValue = value;
    return this;
  }

  /**
   * V1.0: sets the surface id (`SURFACE` in surface.ts: brick, slate, thatch, ...) written for the
   * following faces, like `glow`. Faces before any call are plain (0).
   */
  surface(id: number): this {
    this.surfaceValue = id;
    return this;
  }

  /** Triangle count so far. */
  get triangles(): number {
    return this.positions.length / 9;
  }

  tri(a: V3, b: V3, c: V3, hex: number, outward?: V3): this {
    if (this.silent) return this;
    tmpA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    tmpB.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    tmpN.crossVectors(tmpA, tmpB);
    if (tmpN.lengthSq() === 0) return this;
    if (outward && tmpN.x * outward[0] + tmpN.y * outward[1] + tmpN.z * outward[2] < 0) {
      [b, c] = [c, b];
      tmpN.negate();
    }
    tmpN.normalize();
    this.color.setHex(hex);
    if (this.jitterValue > 0) {
      let k = this.faceK;
      if (Number.isNaN(k)) {
        k =
          1 +
          this.jitterValue *
            (hash4(
              (a[0] + b[0] + c[0]) * 13.3,
              (a[1] + b[1] + c[1]) * 13.3,
              (a[2] + b[2] + c[2]) * 13.3,
              this.surfaceValue,
            ) *
              2 -
              1);
      }
      this.color.multiplyScalar(k);
    }
    for (const p of [a, b, c]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(tmpN.x, tmpN.y, tmpN.z);
      this.colors.push(this.color.r, this.color.g, this.color.b);
      this.glows.push(this.glowValue);
      this.surfaces.push(this.surfaceValue);
    }
    return this;
  }

  quad(a: V3, b: V3, c: V3, d: V3, hex: number, outward?: V3): this {
    if (this.silent) return this;
    if (this.jitterValue > 0) {
      // One jitter for the whole face, keyed by its center, so both triangles match.
      this.faceK =
        1 +
        this.jitterValue *
          (hash4(
            (a[0] + b[0] + c[0] + d[0]) * 10,
            (a[1] + b[1] + c[1] + d[1]) * 10,
            (a[2] + b[2] + c[2] + d[2]) * 10,
            this.surfaceValue,
          ) *
            2 -
            1);
    }
    this.tri(a, b, c, hex, outward).tri(a, c, d, hex, outward);
    this.faceK = Number.NaN;
    return this;
  }

  /**
   * An axis-aligned box. V1B: `skip` leaves faces out, by letter: t top, b bottom, f front (+z),
   * k back (-z), r right (+x), l left (-x). At the low level the bottom is always left out (nothing
   * looks up at a building from below) and a small box is dropped (see `minor`).
   */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number, skip = ''): this {
    if (this.silent) return this;
    return this.minor(x1 - x0, y1 - y0, z1 - z0, () => {
      const sk = this.low ? skip + 'b' : skip;
      if (!sk.includes('t'))
        this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], hex, [0, 1, 0]);
      if (!sk.includes('b'))
        this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex, [0, -1, 0]);
      if (!sk.includes('f'))
        this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], hex, [0, 0, 1]);
      if (!sk.includes('k'))
        this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], hex, [0, 0, -1]);
      if (!sk.includes('r'))
        this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], hex, [1, 0, 0]);
      if (!sk.includes('l'))
        this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], hex, [-1, 0, 0]);
    });
  }

  /** A box whose top edges are chamfered by `b`, for soft, rounded-feeling blocks. */
  rbox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number, b = 0.03): this {
    // V1B: at the low level a chamfered box is a plain one.
    if (this.low) return this.box(x0, y0, z0, x1, y1, z1, hex);
    const bb = Math.min(b, (x1 - x0) / 2.2, (z1 - z0) / 2.2, (y1 - y0) / 1.5);
    const ym = y1 - bb;
    const top: V3[] = [
      [x0 + bb, y1, z0 + bb],
      [x1 - bb, y1, z0 + bb],
      [x1 - bb, y1, z1 - bb],
      [x0 + bb, y1, z1 - bb],
    ];
    const mid: V3[] = [
      [x0, ym, z0],
      [x1, ym, z0],
      [x1, ym, z1],
      [x0, ym, z1],
    ];
    const bot: V3[] = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
    ];
    const outs: V3[] = [
      [0, 0, -1],
      [1, 0, 0],
      [0, 0, 1],
      [-1, 0, 0],
    ];
    this.quad(top[0]!, top[1]!, top[2]!, top[3]!, hex, [0, 1, 0]);
    this.quad(bot[0]!, bot[1]!, bot[2]!, bot[3]!, hex, [0, -1, 0]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const o = outs[i]!;
      this.quad(bot[i]!, bot[j]!, mid[j]!, mid[i]!, hex, o);
      this.quad(mid[i]!, mid[j]!, top[j]!, top[i]!, hex, [o[0], 1, o[2]]);
    }
    return this;
  }

  /** A gable roof over [x0, x1] x [z0, z1] from eave height y0 to ridge y1. Ridge runs along x or z. */
  gable(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y0: number,
    y1: number,
    hex: number,
    ridgeAlongX: boolean,
  ): this {
    if (ridgeAlongX) {
      const zm = (z0 + z1) / 2;
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, zm], [x0, y1, zm], hex, [0, 1, 1]);
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, zm], [x0, y1, zm], hex, [0, 1, -1]);
      this.tri([x0, y0, z0], [x0, y0, z1], [x0, y1, zm], hex, [-1, 0, 0]);
      this.tri([x1, y0, z0], [x1, y0, z1], [x1, y1, zm], hex, [1, 0, 0]);
      if (!this.low) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex, [0, -1, 0]);
    } else {
      const xm = (x0 + x1) / 2;
      this.quad([x1, y0, z0], [x1, y0, z1], [xm, y1, z1], [xm, y1, z0], hex, [1, 1, 0]);
      this.quad([x0, y0, z0], [x0, y0, z1], [xm, y1, z1], [xm, y1, z0], hex, [-1, 1, 0]);
      this.tri([x0, y0, z0], [x1, y0, z0], [xm, y1, z0], hex, [0, 0, -1]);
      this.tri([x0, y0, z1], [x1, y0, z1], [xm, y1, z1], hex, [0, 0, 1]);
      if (!this.low) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex, [0, -1, 0]);
    }
    return this;
  }

  /**
   * A chunky slab gable roof with generous eaves: two sloped slabs of thickness `t` over
   * [x0, x1] x [z0, z1] (already including the overhang), eaves at y0, ridge at y1, and a ridge cap.
   */
  slabRoof(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y0: number,
    y1: number,
    hex: number,
    edgeHex: number,
    ridgeAlongX: boolean,
    t = 0.07,
  ): this {
    // Work in (a = along ridge, c = across ridge) and map back.
    const m = (a: number, y: number, c: number): V3 => (ridgeAlongX ? [a, y, c] : [c, y, a]);
    const a0 = ridgeAlongX ? x0 : z0;
    const a1 = ridgeAlongX ? x1 : z1;
    const c0 = ridgeAlongX ? z0 : x0;
    const c1 = ridgeAlongX ? z1 : x1;
    const cm = (c0 + c1) / 2;
    const up = (dc: number): V3 => (ridgeAlongX ? [0, 1, dc] : [dc, 1, 0]);
    const along = (da: number): V3 => (ridgeAlongX ? [da, 0, 0] : [0, 0, da]);
    for (const ce of [c0, c1]) {
      const dir = ce < cm ? -1 : 1;
      this.quad(m(a0, y0, ce), m(a1, y0, ce), m(a1, y1, cm), m(a0, y1, cm), hex, up(dir));
      this.quad(m(a0, y0 - t, ce), m(a1, y0 - t, ce), m(a1, y1 - t, cm), m(a0, y1 - t, cm), edgeHex, [
        -up(dir)[0],
        -1,
        -up(dir)[2],
      ]);
      // Eave fascia.
      this.quad(
        m(a0, y0 - t, ce),
        m(a1, y0 - t, ce),
        m(a1, y0, ce),
        m(a0, y0, ce),
        edgeHex,
        ridgeAlongX ? [0, 0, dir] : [dir, 0, 0],
      );
      // Verge ends.
      for (const ae of [a0, a1]) {
        const da = ae < (a0 + a1) / 2 ? -1 : 1;
        this.quad(m(ae, y0, ce), m(ae, y1, cm), m(ae, y1 - t, cm), m(ae, y0 - t, ce), edgeHex, along(da));
      }
    }
    // Ridge cap.
    const r = 0.05;
    const [rx0, ry0, rz0] = m(a0 - 0.02, y1 - 0.03, cm - r);
    const [rx1, ry1, rz1] = m(a1 + 0.02, y1 + 0.04, cm + r);
    this.box(
      Math.min(rx0, rx1),
      Math.min(ry0, ry1),
      Math.min(rz0, rz1),
      Math.max(rx0, rx1),
      Math.max(ry0, ry1),
      Math.max(rz0, rz1),
      edgeHex,
    );
    return this;
  }

  /** A closed cylinder (or a cone when rTop is 0) around (cx, cz). */
  cylinder(
    cx: number,
    cz: number,
    rBottom: number,
    rTop: number,
    y0: number,
    y1: number,
    hex: number,
    segments = 8,
    phase = 0,
  ): this {
    // V1B: the far level rounds with fewer sides and never draws a bottom.
    if (this.low && segments > 8) segments = Math.max(8, Math.round(segments / 2));
    const r = Math.max(rBottom, rTop);
    if (this.isMinor(r * 2, r * 2, y1 - y0) && !this.silent)
      return this.nearOnly(() => this.cylinder(cx, cz, rBottom, rTop, y0, y1, hex, segments, phase));
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2 + phase;
      const a1 = ((i + 1) / segments) * Math.PI * 2 + phase;
      const mid = (a0 + a1) / 2;
      const out: V3 = [Math.cos(mid), 0.3, Math.sin(mid)];
      const b0: V3 = [cx + Math.cos(a0) * rBottom, y0, cz + Math.sin(a0) * rBottom];
      const b1: V3 = [cx + Math.cos(a1) * rBottom, y0, cz + Math.sin(a1) * rBottom];
      const t0: V3 = [cx + Math.cos(a0) * rTop, y1, cz + Math.sin(a0) * rTop];
      const t1: V3 = [cx + Math.cos(a1) * rTop, y1, cz + Math.sin(a1) * rTop];
      if (rTop > 0) this.quad(b0, b1, t1, t0, hex, out);
      else this.tri(b0, b1, [cx, y1, cz], hex, out);
      if (rTop > 0) this.tri([cx, y1, cz], t0, t1, hex, [0, 1, 0]);
      if (!this.low) this.tri([cx, y0, cz], b0, b1, hex, [0, -1, 0]);
    }
    return this;
  }

  /**
   * A low-poly blob (an octahedron, subdivided once when `detail` is 1), for canopies and bushes.
   * `wobble` and `rnd` nudge vertices for a lumpy, hand-made silhouette.
   */
  blob(
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    hex: number,
    detail = 1,
    rnd?: () => number,
    wobble = 0,
    topHex?: number,
  ): this {
    if (this.isMinor(rx * 2, ry * 2, rz * 2) && !this.silent)
      return this.nearOnly(() => this.blob(cx, cy, cz, rx, ry, rz, hex, detail, rnd, wobble, topHex));
    const v: V3[] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    const faces: [number, number, number][] = [
      [0, 2, 4],
      [4, 2, 1],
      [1, 2, 5],
      [5, 2, 0],
      [0, 4, 3],
      [4, 1, 3],
      [1, 5, 3],
      [5, 0, 3],
    ];
    const norm = (p: V3): V3 => {
      const l = Math.hypot(p[0], p[1], p[2]);
      return [p[0] / l, p[1] / l, p[2] / l];
    };
    const mid = (a: V3, b: V3): V3 => norm([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    // Per-direction wobble, keyed by a rounded direction so shared vertices move together.
    const bumps = new Map<string, number>();
    const bump = (p: V3): number => {
      if (!rnd || wobble === 0) return 1;
      const key = `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
      let b = bumps.get(key);
      if (b === undefined) {
        b = 1 + (rnd() - 0.5) * 2 * wobble;
        bumps.set(key, b);
      }
      return b;
    };
    const place = (p: V3): V3 => {
      const k = bump(p);
      return [cx + p[0] * rx * k, cy + p[1] * ry * k, cz + p[2] * rz * k];
    };
    for (const [i, j, k] of faces) {
      const a = v[i]!;
      const b = v[j]!;
      const c = v[k]!;
      const tris: V3[][] =
        detail > 0
          ? [
              [a, mid(a, b), mid(c, a)],
              [mid(a, b), b, mid(b, c)],
              [mid(c, a), mid(b, c), c],
              [mid(a, b), mid(b, c), mid(c, a)],
            ]
          : [[a, b, c]];
      for (const t of tris) {
        const center = norm([
          t[0]![0] + t[1]![0] + t[2]![0],
          t[0]![1] + t[1]![1] + t[2]![1],
          t[0]![2] + t[1]![2] + t[2]![2],
        ]);
        // C3D-1: an optional sunlit color for the upward faces (canopies, bushes).
        const c = topHex !== undefined && center[1] > 0.45 ? topHex : hex;
        this.tri(place(t[0]!), place(t[1]!), place(t[2]!), c, center);
      }
    }
    return this;
  }

  /**
   * C3D-1: a thin tapered blade from (x, 0, z) leaning towards `dir` (radians), two triangles back to
   * back so it reads from both sides. For grass, reeds and leaves.
   */
  blade(
    x: number,
    z: number,
    height: number,
    width: number,
    lean: number,
    dir: number,
    hex: number,
    tipHex = hex,
  ): this {
    const dx = Math.cos(dir);
    const dz = Math.sin(dir);
    // The blade's flat side faces sideways to its lean.
    const sx = -dz * width * 0.5;
    const sz = dx * width * 0.5;
    const tip: V3 = [x + dx * lean, height, z + dz * lean];
    const a: V3 = [x - sx, 0, z - sz];
    const b: V3 = [x + sx, 0, z + sz];
    const out: V3 = [-dz, 0.3, dx];
    this.tri(a, b, tip, hex, out);
    this.tri(a, b, tip, tipHex, [dz, 0.3, -dx]);
    return this;
  }

  /** C3D-1: moves everything built so far (used to lift or offset a finished piece). */
  translate(x: number, y: number, z: number): this {
    for (let i = 0; i < this.positions.length; i += 3) {
      this.positions[i]! += x;
      this.positions[i + 1]! += y;
      this.positions[i + 2]! += z;
    }
    return this;
  }

  /** Scales everything built so far about the origin (used for tree growth stages). */
  scale(k: number): this {
    for (let i = 0; i < this.positions.length; i++) this.positions[i]! *= k;
    return this;
  }

  /**
   * V1B: the Painted Miniature bake. Walls are about a quarter darker at their foot and clear by
   * 0.85 tiles up (the concept's `ao` ramp); undersides (jetties, eaves, canopies) take a third
   * off; occluders add shade where things meet. Roofs and lit panes are never darkened.
   */
  private bakeKit(colors: number[]): void {
    let maxY = 0.001;
    for (let i = 1; i < this.positions.length; i += 3) maxY = Math.max(maxY, this.positions[i]!);
    // Small pieces (sheds, stalls) keep a contact band in proportion to their height.
    const foot = Math.min(0.85, Math.max(0.16, maxY * 0.55));
    const occ = this.occluders;
    for (let v = 0; v < this.glows.length; v++) {
      if (this.glows[v]! > 0) continue;
      const roof = ROOF_SURFACES.has(this.surfaces[v]!);
      const x = this.positions[v * 3]!;
      const y = this.positions[v * 3 + 1]!;
      const z = this.positions[v * 3 + 2]!;
      const ny = this.normals[v * 3 + 1]!;
      let k = 1;
      if (ny < -0.5) k *= 0.7;
      if (!roof) {
        k *= 1 - 0.25 * (1 - Math.min(1, Math.max(0, y / foot)));
        for (const o of occ) {
          const dx = Math.max(o.x0 - x, 0, x - o.x1);
          const dy = Math.max(o.y0 - y, 0, y - o.y1);
          const dz = Math.max(o.z0 - z, 0, z - o.z1);
          const d = Math.max(dx, dy, dz);
          if (d >= o.soft) continue;
          k *= 1 - o.k * (1 - d / o.soft);
        }
      }
      if (k === 1) continue;
      for (let c = 0; c < 3; c++) colors[v * 3 + c] = Math.min(1, colors[v * 3 + c]! * k);
    }
  }

  build(ao: boolean | AoBake = true): BufferGeometry {
    const colors = this.colors.slice();
    const bake: AoBake | null = ao === false ? null : ao === true ? this.bake : ao;
    if (bake === 'classic') {
      let maxY = 0.001;
      for (let i = 1; i < this.positions.length; i += 3) maxY = Math.max(maxY, this.positions[i]!);
      const base = Math.min(0.28, maxY * 0.45);
      for (let v = 0; v < this.glows.length; v++) {
        if (this.glows[v]! > 0) continue;
        const y = this.positions[v * 3 + 1]!;
        const ny = this.normals[v * 3 + 1]!;
        let k = 0.74 + 0.26 * Math.min(1, Math.max(0, y / base)); // contact darkening at the base
        k *= 0.94 + 0.08 * Math.min(1, y / maxY); // gentle gradient, lighter on top
        if (ny > 0.5) k *= 1.04;
        if (ny < -0.5) k *= 0.72; // undersides of eaves and canopies
        for (let c = 0; c < 3; c++) colors[v * 3 + c] = Math.min(1, colors[v * 3 + c]! * k);
      }
    } else if (bake === 'kit') this.bakeKit(colors);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.setAttribute('glow', new Float32BufferAttribute(this.glows, 1));
    g.setAttribute('surface', new Uint8BufferAttribute(Uint8Array.from(this.surfaces), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
