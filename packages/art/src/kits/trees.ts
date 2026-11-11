// Forest trees (the map's tree layer), about one and a half world units tall when mature.
// `opts.stage` 0 (sapling) to 3 (mature, the default) scales and simplifies; `opts.lod` 'low' is the
// far level for forests: about 16 triangles with the near level's silhouette, height and colors;
// `opts.seed` picks a variant (canopy lumps, lean of the crown, hue).
//
// C3D-1: storybook trees. Oaks are broad, lumpy crowns of several clumps with sunlit tops; birches
// are slender white trunks with airy, tall crowns; pines are stacked, slightly drooping tiers.
// V1C (trees v2): fuller crowns of a few soft blobs (smooth normals, so they shade round rather
// than faceted), a root flare at the foot of the trunk, leaf surface ids, and a far level a tenth
// of the near one's cost. Hedgerows along fields come from the same kit.
//
// V2B (painted green): near oak, birch and fruit crowns are brush dabs (`dabs.ts`) laid over the
// crown's blobs, around a smaller, darker core that shows through the gaps as depth; the far dome
// keeps today's shape with the dabs' tints in its vertex colors. The season's thinning
// (`params.thin`, 1 full to 0 bare) drops dabs in a fixed order and leaves the core, which the
// foliage shader turns to bare twigs in winter. Dab vertices carry a `dab` attribute (1), so the
// shader can keep their autumn color while the core goes to twigs.
import { Float32BufferAttribute, type BufferGeometry } from 'three';
import { brushDabs, dabTint, type DabBlob, type DabOptions } from '../dabs';
import { mixHex, seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { SURFACE } from '../surface';
import type { Kit, KitBuildOptions } from './types';

const STAGE_SCALE = [0.32, 0.52, 0.76, 1];

function stageOf(opts: KitBuildOptions | undefined): number {
  const st = opts?.stage ?? 3;
  return Math.min(3, Math.max(0, Math.round(st)));
}

/** V2B: the season's thinning a build asks for (`params.thin`, 1 full to 0 bare). */
export function thinOf(opts: KitBuildOptions | undefined): number {
  const t = opts?.params?.['thin'];
  return typeof t === 'number' ? Math.min(1, Math.max(0, t)) : 1;
}

/** V2B: the deep shade of a crown's core, seen through the gaps between the dabs. */
export const CORE_SHADE = 0x22361f;

/** V2B: the area-weighted mean color of a set of blobs (what a far crown stands in for). */
export function meanBlobColor(blobs: readonly DabBlob[]): number {
  let w = 0;
  let mean = blobs[0]?.color ?? 0x6a8f3a;
  for (const bl of blobs) {
    const a = bl.radii[0] * bl.radii[1] + bl.radii[1] * bl.radii[2] + bl.radii[0] * bl.radii[2];
    w += a;
    mean = mixHex(mean, bl.color, a / w);
  }
  return mean;
}

/** V2B: blobs whose soft normals point from part way between the crown's heart and their own middle. */
export function toward(blobs: readonly DabBlob[], heart: V3, k: number): DabBlob[] {
  return blobs.map((bl) => ({
    ...bl,
    normalFrom: [
      heart[0] + (bl.center[0] - heart[0]) * k,
      heart[1] + (bl.center[1] - heart[1]) * k,
      heart[2] + (bl.center[2] - heart[2]) * k,
    ] as V3,
  }));
}

/** Sunlit top color for a leaf color. */
function sunlit(hex: number, k = 0.14): number {
  return mixHex(hex, 0xc8e070, k);
}

/** A crown part whose normals are smoothed after the build: center and radii of its ellipsoid. */
interface Soft {
  from: number;
  to: number;
  c: V3;
  r: V3;
}

/**
 * Builds trees and keeps note of the soft parts, so their normals can point out from their own
 * centers (round, painterly shading) once the geometry exists.
 */
class TreeBuilder {
  readonly s = new ShapeBuilder();
  private readonly soft: Soft[] = [];
  /** V2B: vertex ranges written as dabs (the `dab` attribute). */
  private readonly dabbed: [number, number][] = [];

  /** V2B: brush dabs over `blobs` (see dabs.ts), marked as dabs for the foliage shader. */
  dabs(blobs: readonly DabBlob[], opts: DabOptions): this {
    const from = this.s.triangles * 3;
    brushDabs(this.s, blobs, opts);
    this.dabbed.push([from, this.s.triangles * 3]);
    return this;
  }

  /**
   * V2B: the core under a crown's dabs: each blob shrunk to `k` of its size, in its color deep in
   * shade, round (soft normals), showing through the gaps as depth. Bare (`thin` 0, no dabs left)
   * it is today's whole crown with its sunlit top, which the foliage shader turns to winter twigs.
   */
  core(blobs: readonly DabBlob[], k: number, seed: number, shade: number, thin: number): this {
    const rnd = seeded(seed);
    for (const bl of blobs) {
      if (thin <= 0) {
        this.crown(bl.center, bl.radii, bl.color, 1, rnd, 0.1, sunlit(bl.color));
        continue;
      }
      const r: V3 = [bl.radii[0] * k, bl.radii[1] * k, bl.radii[2] * k];
      this.crown(bl.center, r, mixHex(bl.color, CORE_SHADE, shade), 1, rnd, 0.06);
    }
    return this;
  }

  /**
   * V2B: the far dome painted with the near dabs' tints: lighter and warmer on top, the mean color
   * round the middle, deeper underneath (`dabTint`), as vertex colors.
   */
  paintedDome(c: V3, r: V3, mean: number, skyLighten: number, phase: number, rnd: () => number): this {
    // Seen from afar the dabs' sunlit tops and the shade between them average out: the mean
    // color a touch deeper (the gaps and the dabs' darker roots), lit a little toward the top.
    const body = mixHex(mean, CORE_SHADE, 0.12);
    const top = dabTint(body, 0.6, skyLighten * 0.7);
    const mid = body;
    const low = mixHex(body, CORE_SHADE, 0.3);
    const from = this.s.triangles * 3;
    const ring: V3[] = [];
    for (let i = 0; i < 5; i++) {
      const a = phase + (i / 5) * Math.PI * 2;
      const k = 1 + (rnd() - 0.5) * 0.12;
      ring.push([c[0] + Math.cos(a) * r[0] * k, c[1] - r[1] * 0.1, c[2] + Math.sin(a) * r[2] * k]);
    }
    const apex: V3 = [c[0], c[1] + r[1], c[2]];
    const bottom: V3 = [c[0], c[1] - r[1] * 0.75, c[2]];
    for (let i = 0; i < 5; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % 5]!;
      const out: V3 = [a[0] + b[0] - 2 * c[0], 0, a[2] + b[2] - 2 * c[2]];
      this.s.triN(a, b, apex, [out[0], 1, out[2]], mid, mid, top);
      this.s.triN(a, b, bottom, [out[0], -1, out[2]], mid, mid, low);
    }
    this.soft.push({ from, to: this.s.triangles * 3, c, r });
    return this;
  }

  /** A canopy blob with smooth normals. */
  crown(c: V3, r: V3, hex: number, detail: number, rnd: () => number, wobble: number, topHex?: number): this {
    const from = this.s.triangles * 3;
    this.s.blob(c[0], c[1], c[2], r[0], r[1], r[2], hex, detail, rnd, wobble, topHex);
    this.soft.push({ from, to: this.s.triangles * 3, c, r });
    return this;
  }

  /**
   * A cheap round crown for the far level: a pentagonal bipyramid (10 triangles) squashed below,
   * smooth-shaded, turned by `phase`.
   */
  dome(c: V3, r: V3, hex: number, topHex: number, phase: number, rnd: () => number): this {
    const from = this.s.triangles * 3;
    const ring: V3[] = [];
    for (let i = 0; i < 5; i++) {
      const a = phase + (i / 5) * Math.PI * 2;
      const k = 1 + (rnd() - 0.5) * 0.12;
      ring.push([c[0] + Math.cos(a) * r[0] * k, c[1] - r[1] * 0.1, c[2] + Math.sin(a) * r[2] * k]);
    }
    const top: V3 = [c[0], c[1] + r[1], c[2]];
    const bottom: V3 = [c[0], c[1] - r[1] * 0.75, c[2]];
    for (let i = 0; i < 5; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % 5]!;
      this.s.tri(a, b, top, topHex, [a[0] + b[0] - 2 * c[0], 1, a[2] + b[2] - 2 * c[2]]);
      this.s.tri(a, b, bottom, hex, [a[0] + b[0] - 2 * c[0], -1, a[2] + b[2] - 2 * c[2]]);
    }
    this.soft.push({ from, to: this.s.triangles * 3, c, r });
    return this;
  }

  /** A cone without its hidden base, for the far pine tiers (`seg` triangles). */
  cone(
    cx: number,
    cz: number,
    r: number,
    y0: number,
    y1: number,
    hex: number,
    seg: number,
    phase: number,
  ): this {
    for (let i = 0; i < seg; i++) {
      const a0 = phase + (i / seg) * Math.PI * 2;
      const a1 = phase + ((i + 1) / seg) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      this.s.tri(
        [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r],
        [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r],
        [cx, y1, cz],
        hex,
        [Math.cos(mid), 0.4, Math.sin(mid)],
      );
    }
    return this;
  }

  /** An open three-sided trunk for the far level (6 triangles, no caps). */
  stick(r0: number, r1: number, h: number, hex: number): this {
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * Math.PI * 2;
      const a1 = ((i + 1) / 3) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      this.s.quad(
        [Math.cos(a0) * r0, 0, Math.sin(a0) * r0],
        [Math.cos(a1) * r0, 0, Math.sin(a1) * r0],
        [Math.cos(a1) * r1, h, Math.sin(a1) * r1],
        [Math.cos(a0) * r1, h, Math.sin(a0) * r1],
        hex,
        [Math.cos(mid), 0, Math.sin(mid)],
      );
    }
    return this;
  }

  /** The trunk with a root flare: a short wide skirt into the ground, then the bole. */
  trunk(r: number, h: number, hex: number, seg: number): this {
    this.s.cylinder(0, 0, r * 1.75, r * 0.95, 0, h * 0.14, hex, seg);
    this.s.cylinder(0, 0, r, r * 0.6, h * 0.12, h, hex, seg);
    return this;
  }

  build(scale: number): BufferGeometry {
    this.s.scale(scale);
    const g = this.s.build();
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    for (const p of this.soft) {
      const cx = p.c[0] * scale;
      const cy = p.c[1] * scale;
      const cz = p.c[2] * scale;
      const rx = p.r[0] * scale;
      const ry = p.r[1] * scale;
      const rz = p.r[2] * scale;
      for (let v = p.from; v < p.to; v++) {
        // The ellipsoid's normal, leaning a little up, as light falls through a canopy from above.
        const nx = (pos.getX(v) - cx) / (rx * rx);
        const ny = (pos.getY(v) - cy) / (ry * ry) + 0.35 / ry;
        const nz = (pos.getZ(v) - cz) / (rz * rz);
        const l = Math.hypot(nx, ny, nz) || 1;
        nor.setXYZ(v, nx / l, ny / l, nz / l);
      }
    }
    nor.needsUpdate = true;
    // V2B: dab vertices, for the foliage shader (both levels carry the attribute).
    const dab = new Float32Array(pos.count);
    for (const [a, b] of this.dabbed) dab.fill(1, a, b);
    g.setAttribute('dab', new Float32BufferAttribute(dab, 1));
    return g;
  }
}

/** P1: a clump's own leaf color: the tree's, nudged towards sunny yellow-green, deep green or olive. */
function clumpColor(leaf: number, rnd: () => number): number {
  const roll = rnd();
  const toward = roll < 0.4 ? 0x9bb84c : roll < 0.7 ? 0x3c6a36 : 0x7a9a3c;
  return vary(mixHex(leaf, toward, 0.15 + rnd() * 0.25), rnd, 1.8);
}

/** P1: which of a species' three mature shapes a build seed picks (the stages below keep one). */
function shapeOf(seed: number | undefined, stage: number): number {
  return stage === 3 ? Math.abs(Math.floor(seed ?? 0)) % 3 : 0;
}

interface OakShape {
  /** Main crown: center height and radii. */
  y: number;
  main: V3;
  /** Clumps around it: how many, how far out, how low they sit, the spread above that, their radii. */
  ring: number;
  reach: number;
  low: number;
  spread: number;
  clump: V3;
  /** The crown on top. */
  topY: number;
  top: V3;
  /** The far level's dome: radii (it must not poke out of the near crown). */
  dome: V3;
  domeY: number;
}

const OAK_SHAPES: readonly OakShape[] = [
  // Round: a full ball of six clumps.
  {
    y: 0.98,
    main: [0.44, 0.36, 0.44],
    ring: 6,
    reach: 0.32,
    low: 0.84,
    spread: 0.16,
    clump: [0.28, 0.24, 0.28],
    topY: 1.25,
    top: [0.3, 0.22, 0.3],
    dome: [0.74, 0.5, 0.74],
    domeY: 0.98,
  },
  // Broad: wide and low, spreading like an old field oak.
  {
    y: 0.92,
    main: [0.52, 0.3, 0.52],
    ring: 6,
    reach: 0.44,
    low: 0.76,
    spread: 0.12,
    clump: [0.3, 0.2, 0.3],
    topY: 1.1,
    top: [0.34, 0.2, 0.34],
    dome: [0.86, 0.42, 0.86],
    domeY: 0.9,
  },
  // Tall: an upright, egg-shaped crown of clumps stacked up the bole.
  {
    y: 1.02,
    main: [0.38, 0.42, 0.38],
    ring: 5,
    reach: 0.24,
    low: 0.9,
    spread: 0.34,
    clump: [0.25, 0.26, 0.25],
    topY: 1.42,
    top: [0.26, 0.26, 0.26],
    dome: [0.58, 0.62, 0.58],
    domeY: 1.08,
  },
];

export const oak: Kit = {
  id: 'oak',
  kind: 'tree',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 7);
    const leaf = vary(palette.oakLeaf, rnd);
    const stage = stageOf(opts);
    const t = new TreeBuilder();
    // The crown leans a touch to one side, different per variant (rolled before the level, so both
    // levels lean the same way).
    const la = rnd() * Math.PI * 2;
    const lx = Math.cos(la) * 0.05;
    const lz = Math.sin(la) * 0.05;
    const phase = rnd() * Math.PI * 2;
    const shape = shapeOf(opts?.seed, stage);
    const O = OAK_SHAPES[shape]!;
    // V2B: the crown's blobs are rolled before the level, so both levels see the same clumps and
    // tints (the far dome is painted with their mean).
    const blobs: DabBlob[] = [];
    if (stage === 0) blobs.push({ center: [0, 0.85, 0], radii: [0.26, 0.24, 0.26], color: leaf });
    else {
      blobs.push({ center: [lx, O.y, lz], radii: O.main, color: leaf });
      if (stage >= 2) {
        // Fuller: clumps around the main crown, each with its own tint, and one high on top, all
        // overlapping. The mature oaks come in three shapes (round, broad and tall).
        const ring = stage === 3 ? O.ring : 4;
        for (let i = 0; i < ring; i++) {
          const a = phase + (i / ring) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
          const r = O.reach + rnd() * 0.08;
          const c = clumpColor(leaf, rnd);
          const y = O.low + rnd() * O.spread;
          const k = 0.9 + rnd() * 0.2;
          blobs.push({
            center: [lx + Math.cos(a) * r, y, lz + Math.sin(a) * r],
            radii: [O.clump[0] * k, O.clump[1] * k, O.clump[2] * k],
            color: c,
          });
        }
        const top = vary(mixHex(leaf, palette.birchLeaf, 0.3), rnd);
        blobs.push({ center: [lx * 2, O.topY, lz * 2], radii: O.top, color: top });
      } else blobs.push({ center: [lx + 0.18, 0.9, lz], radii: [0.22, 0.2, 0.22], color: vary(leaf, rnd) });
    }
    const sky = 0.6;
    if (opts?.lod === 'low') {
      t.s.surface(SURFACE.timber);
      t.stick(0.1, 0.07, 0.66, palette.bark);
      t.s.surface(SURFACE.leaf);
      // The near crown's whole outline: its clumps reach about 0.6 out and 1.4 up.
      t.paintedDome([lx, O.domeY, lz], O.dome, meanBlobColor(blobs), sky, phase, rnd);
      return t.build(STAGE_SCALE[stage]!);
    }
    t.s.surface(SURFACE.timber);
    if (stage === 0) t.s.cylinder(0, 0, 0.05, 0.03, 0, 0.7, palette.bark, 4);
    else {
      t.trunk(0.12, 0.66, palette.bark, 6);
      // A low bough reaching out under the crown.
      t.s.cylinder(0.05, 0, 0.035, 0.025, 0.42, 0.52, palette.bark, 3);
    }
    t.s.surface(SURFACE.leaf);
    const heart: V3 = [lx, stage === 0 ? 0.85 : O.y, lz];
    t.core(blobs, 0.82, (opts?.seed ?? 7) + 1, 0.55, thinOf(opts));
    t.dabs(toward(blobs, heart, 0.45), {
      count: [70, 140, 220, 300][stage]!,
      size: 0.17 / Math.sqrt(STAGE_SCALE[stage]!),
      tintSpread: 0.45,
      skyLighten: sky,
      gaps: 0.12,
      thin: thinOf(opts),
      seed: (opts?.seed ?? 7) * 3 + 1,
    });
    return t.build(STAGE_SCALE[stage]!);
  },
};

interface BirchShape {
  y: number;
  main: V3;
  ring: number;
  reach: number;
  low: number;
  spread: number;
  clump: V3;
  dome: V3;
  domeY: number;
}

const BIRCH_SHAPES: readonly BirchShape[] = [
  // Airy: a slender crown with pale clumps round it.
  {
    y: 1.12,
    main: [0.24, 0.38, 0.24],
    ring: 5,
    reach: 0.2,
    low: 0.92,
    spread: 0.5,
    clump: [0.16, 0.2, 0.16],
    dome: [0.4, 0.46, 0.4],
    domeY: 1.08,
  },
  // Weeping: wider and lower, the clumps hanging.
  {
    y: 1.04,
    main: [0.29, 0.32, 0.29],
    ring: 5,
    reach: 0.27,
    low: 0.82,
    spread: 0.36,
    clump: [0.18, 0.18, 0.18],
    dome: [0.5, 0.4, 0.5],
    domeY: 1.0,
  },
  // Slim: a tall, narrow crown reaching up the trunk.
  {
    y: 1.2,
    main: [0.19, 0.4, 0.19],
    ring: 5,
    reach: 0.14,
    low: 0.98,
    spread: 0.62,
    clump: [0.14, 0.2, 0.14],
    dome: [0.3, 0.52, 0.3],
    domeY: 1.18,
  },
];

export const birch: Kit = {
  id: 'birch',
  kind: 'tree',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 11);
    const leaf = vary(palette.birchLeaf, rnd);
    const stage = stageOf(opts);
    const t = new TreeBuilder();
    const la = rnd() * Math.PI * 2;
    const lx = Math.cos(la) * 0.04;
    const lz = Math.sin(la) * 0.04;
    const phase = rnd() * Math.PI * 2;
    const shape = shapeOf(opts?.seed, stage);
    const B = BIRCH_SHAPES[shape]!;
    // V2B: the crown's blobs, rolled before the level (see the oak).
    const blobs: DabBlob[] = [];
    if (stage === 3) {
      // P1: airier and lighter: a smaller main crown with five small, pale clumps hanging round
      // it at different heights, each a shade of its own, and gaps between them.
      const light = mixHex(leaf, 0xd9e27a, 0.14);
      blobs.push({ center: [lx, B.y, lz], radii: B.main, color: light });
      for (let i = 0; i < B.ring; i++) {
        const a = phase + (i / B.ring) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
        const r = B.reach * (0.8 + rnd() * 0.4);
        const y = B.low + rnd() * B.spread;
        const c = vary(mixHex(light, rnd() < 0.5 ? 0xe3e88a : 0x8fb04a, 0.15 + rnd() * 0.2), rnd, 1.8);
        const k = 0.88 + rnd() * 0.24;
        blobs.push({
          center: [lx + Math.cos(a) * r, y, lz + Math.sin(a) * r],
          radii: [B.clump[0] * k, B.clump[1] * k, B.clump[2] * k],
          color: c,
        });
      }
    } else {
      blobs.push({ center: [lx, 1.12, lz], radii: [0.27, 0.42, 0.27], color: leaf });
      if (stage >= 1) {
        const a = phase;
        blobs.push({
          center: [lx + Math.cos(a) * 0.16, 0.92, lz + Math.sin(a) * 0.16],
          radii: [0.18, 0.24, 0.18],
          color: vary(leaf, rnd, 1.6),
        });
      }
      if (stage >= 2) {
        const a = phase + 2.4;
        blobs.push({
          center: [lx * 2 + Math.cos(a) * 0.1, 1.4, lz * 2 + Math.sin(a) * 0.1],
          radii: [0.17, 0.21, 0.17],
          color: vary(mixHex(leaf, 0xd9e27a, 0.25), rnd, 1.4),
        });
        const a2 = phase + 4.1;
        blobs.push({
          center: [lx + Math.cos(a2) * 0.15, 1.02, lz + Math.sin(a2) * 0.15],
          radii: [0.17, 0.22, 0.17],
          color: vary(leaf, rnd, 1.2),
        });
      }
    }
    const sky = 0.55;
    if (opts?.lod === 'low') {
      t.s.surface(SURFACE.timber);
      t.stick(0.05, 0.035, 1.0, palette.birchBark);
      t.s.surface(SURFACE.leaf);
      const d = stage === 3 ? B.dome : ([0.38, 0.5, 0.38] as V3);
      t.paintedDome([lx, stage === 3 ? B.domeY : 1.15, lz], d, meanBlobColor(blobs), sky, phase, rnd);
      return t.build(STAGE_SCALE[stage]!);
    }
    t.s.surface(SURFACE.timber);
    t.trunk(0.055, 1.0, palette.birchBark, 5);
    // Dark bark marks.
    for (const y of [0.2, 0.47]) t.s.box(-0.058, y, -0.022, 0.058, y + 0.035, 0.022, palette.birchMark);
    t.s.surface(SURFACE.leaf);
    t.core(blobs, 0.8, (opts?.seed ?? 11) + 1, 0.42, thinOf(opts));
    t.dabs(toward(blobs, [lx, stage === 3 ? B.y : 1.1, lz], 0.55), {
      count: [60, 110, 170, 230][stage]!,
      size: 0.14 / Math.sqrt(STAGE_SCALE[stage]!),
      tintSpread: 0.7,
      skyLighten: sky,
      gaps: 0.2,
      thin: thinOf(opts),
      seed: (opts?.seed ?? 11) * 3 + 2,
    });
    return t.build(STAGE_SCALE[stage]!);
  },
};

const PINE_SHAPES: readonly { tiers: number; width: number; rise: number; tip: number }[] = [
  { tiers: 4, width: 1, rise: 1, tip: 1.45 },
  { tiers: 5, width: 0.82, rise: 1.15, tip: 1.62 },
  { tiers: 4, width: 1.14, rise: 0.9, tip: 1.38 },
];

export const pine: Kit = {
  id: 'pine',
  kind: 'tree',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 13);
    const green = vary(palette.pine, rnd);
    const stage = stageOf(opts);
    const low = opts?.lod === 'low';
    const t = new TreeBuilder();
    const phase = rnd() * Math.PI;
    // P1: three mature shapes: classic, tall and slim (five tiers), and low and wide.
    const P = PINE_SHAPES[shapeOf(opts?.seed, stage)]!;
    if (low) {
      // Two open cones over a stick: the near tiers' outline from 0.26 to the tip at 1.4.
      t.s.surface(SURFACE.timber);
      t.stick(0.07, 0.05, 0.36, palette.bark);
      t.s.surface(SURFACE.leaf);
      t.cone(0, 0, 0.6 * P.width, 0.24, 1.0, mixHex(green, 0x2f4a33, 0.12), 5, phase);
      t.cone(0, 0, 0.44 * P.width, 0.7, P.tip, mixHex(green, palette.birchLeaf, 0.18), 5, phase + 0.6);
      return t.build(STAGE_SCALE[stage]!);
    }
    t.s.surface(SURFACE.timber);
    t.trunk(0.07, 0.36, palette.bark, 5);
    t.s.surface(SURFACE.leaf);
    // Tiers from the bottom up: wide and dark below, narrower and lighter above, each tilted a
    // little and turned so the edges do not line up.
    const tiers = stage === 3 ? P.tiers : stage >= 2 ? 4 : stage === 1 ? 3 : 2;
    // Mature tiers are jittered: off the axis, a little wider or narrower, higher or lower.
    const jit = stage === 3 ? 1 : 0;
    // V2B: each tier's cone is the core, a shade deeper, and clumps of needle dabs hang round its
    // rim and up its slope (from a stream of their own, so the tiers keep today's draws), so the
    // outline reads as drooping skirts of needles rather than clean cones. Pines never thin.
    const clumps: DabBlob[] = [];
    const crnd = seeded((opts?.seed ?? 13) * 5 + 3);
    for (let k = 0; k < tiers; k++) {
      const f = k / Math.max(1, tiers - 1);
      const r = (0.52 - f * 0.27) * P.width * (1 + jit * (rnd() - 0.5) * 0.24);
      const y0 = 0.26 + k * ((1.05 * P.rise) / tiers) + jit * (rnd() - 0.5) * 0.06;
      const h = (0.6 - f * 0.14) * (1 + jit * (rnd() - 0.5) * 0.2);
      const col = vary(mixHex(green, mixHex(green, palette.birchLeaf, 0.3), f), rnd, 1.2 + jit * 0.8);
      const ox = (rnd() - 0.5) * (0.04 + jit * 0.06);
      const oz = (rnd() - 0.5) * (0.04 + jit * 0.06);
      const turn = phase + rnd() * Math.PI;
      t.s.cylinder(ox, oz, r * 0.92, 0, y0 + 0.02, y0 + h, mixHex(col, CORE_SHADE, 0.4), 8, turn);
      // Normals from below the tier, as a cone's face turns out and up.
      const axis: V3 = [ox, y0 - h * 0.3, oz];
      // Round the rim, then smaller rings up the slope.
      for (const [ring, at, size] of [
        [8, 0.06, 0.28],
        [6, 0.34, 0.25],
        [4, 0.62, 0.22],
      ] as const) {
        const n = Math.max(3, ring - (stage < 2 ? 2 : 0));
        for (let i = 0; i < n; i++) {
          const a = turn + (i / n) * Math.PI * 2 + (crnd() - 0.5) * 0.5;
          const rr = r * (1 - at) * (0.86 + crnd() * 0.12);
          const cr = r * size * (0.85 + crnd() * 0.3);
          clumps.push({
            center: [ox + Math.cos(a) * rr, y0 + h * at, oz + Math.sin(a) * rr],
            radii: [cr, cr * 0.7, cr],
            normalFrom: axis,
            color: vary(mixHex(col, palette.birchLeaf, 0.12), crnd, 1.2),
          });
        }
      }
      if (k === tiers - 1)
        clumps.push({ center: [ox, y0 + h * 0.72, oz], radii: [r * 0.3, h * 0.28, r * 0.3], color: col });
    }
    t.dabs(clumps, {
      count: [60, 110, 170, 220][stage]!,
      size: 0.1 / Math.sqrt(STAGE_SCALE[stage]!),
      tintSpread: 0.55,
      skyLighten: 0.75,
      gaps: 0,
      thin: 1,
      seed: (opts?.seed ?? 13) * 3 + 3,
      stretch: 1.5,
    });
    return t.build(STAGE_SCALE[stage]!);
  },
};

/**
 * V1C: a hedgerow segment along a field edge, one tile long on local x: a row of clipped, lumpy
 * blobs with the odd taller shoot. Far, three domes.
 */
export const hedgerow: Kit = {
  id: 'hedgerow',
  kind: 'nature',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 19);
    const leaf = vary(mixHex(palette.oakLeaf, 0x3f6234, 0.25), rnd, 0.8);
    const t = new TreeBuilder();
    t.s.surface(SURFACE.leaf);
    const low = opts?.lod === 'low';
    const n = 3;
    // Rolled before building, so both levels have the same lumps.
    const parts = Array.from({ length: n }, (_, i) => ({
      x: -0.5 + (i + 0.5) / n + (rnd() - 0.5) * 0.06,
      h: 0.22 + rnd() * 0.08,
      c: vary(leaf, rnd, 1.2),
      phase: rnd() * Math.PI,
    }));
    for (const { x, h, c, phase } of parts) {
      if (low) t.dome([x, h * 0.7, 0], [0.24, h * 0.6, 0.17], c, sunlit(c, 0.18), phase, rnd);
      else t.crown([x, h * 0.7, 0], [0.24, h * 0.6, 0.17], c, 1, rnd, 0.12, sunlit(c, 0.18));
    }
    return t.build(1);
  },
};
