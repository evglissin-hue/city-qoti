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
import type { BufferGeometry } from 'three';
import { mixHex, seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { SURFACE } from '../surface';
import type { Kit, KitBuildOptions } from './types';

const STAGE_SCALE = [0.32, 0.52, 0.76, 1];

function stageOf(opts: KitBuildOptions | undefined): number {
  const st = opts?.stage ?? 3;
  return Math.min(3, Math.max(0, Math.round(st)));
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
    return g;
  }
}

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
    if (opts?.lod === 'low') {
      t.s.surface(SURFACE.timber);
      t.stick(0.1, 0.07, 0.66, palette.bark);
      t.s.surface(SURFACE.leaf);
      // The near crown's whole outline: its clumps reach about 0.6 out and 1.4 up.
      t.dome([lx, 0.98, lz], [0.74, 0.5, 0.74], leaf, sunlit(leaf, 0.2), phase, rnd);
      return t.build(STAGE_SCALE[stage]!);
    }
    if (stage === 0) {
      t.s.surface(SURFACE.timber);
      t.s.cylinder(0, 0, 0.05, 0.03, 0, 0.7, palette.bark, 4);
      t.s.surface(SURFACE.leaf);
      t.crown([0, 0.85, 0], [0.26, 0.24, 0.26], leaf, 0, rnd, 0.1, sunlit(leaf));
      return t.build(STAGE_SCALE[stage]!);
    }
    t.s.surface(SURFACE.timber);
    t.trunk(0.12, 0.66, palette.bark, 6);
    // A low bough reaching out under the crown.
    t.s.cylinder(0.05, 0, 0.035, 0.025, 0.42, 0.52, palette.bark, 3);
    t.s.surface(SURFACE.leaf);
    t.crown([lx, 0.98, lz], [0.44, 0.36, 0.44], leaf, 1, rnd, 0.08, sunlit(leaf));
    if (stage >= 2) {
      // Fuller: four clumps around the main crown, and one high on top, all overlapping.
      for (let i = 0; i < 4; i++) {
        const a = phase + (i / 4) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
        const r = 0.3 + rnd() * 0.08;
        const c = vary(leaf, rnd, 1.4);
        const y = 0.86 + rnd() * 0.14;
        t.crown(
          [lx + Math.cos(a) * r, y, lz + Math.sin(a) * r],
          [0.28, 0.24, 0.28],
          c,
          1,
          rnd,
          0.1,
          sunlit(c),
        );
      }
      const top = vary(mixHex(leaf, palette.birchLeaf, 0.3), rnd);
      t.crown([lx * 2, 1.25, lz * 2], [0.3, 0.22, 0.3], top, 1, rnd, 0.08, sunlit(top, 0.2));
    } else {
      t.crown([lx + 0.18, 0.9, lz], [0.22, 0.2, 0.22], vary(leaf, rnd), 1, rnd, 0.1, sunlit(leaf));
    }
    return t.build(STAGE_SCALE[stage]!);
  },
};

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
    if (opts?.lod === 'low') {
      t.s.surface(SURFACE.timber);
      t.stick(0.05, 0.035, 1.0, palette.birchBark);
      t.s.surface(SURFACE.leaf);
      t.dome([lx, 1.15, lz], [0.38, 0.5, 0.38], leaf, sunlit(leaf, 0.2), phase, rnd);
      return t.build(STAGE_SCALE[stage]!);
    }
    t.s.surface(SURFACE.timber);
    t.trunk(0.055, 1.0, palette.birchBark, 5);
    // Dark bark marks.
    for (const y of [0.2, 0.47]) t.s.box(-0.058, y, -0.022, 0.058, y + 0.035, 0.022, palette.birchMark);
    t.s.surface(SURFACE.leaf);
    t.crown([lx, 1.12, lz], [0.27, 0.42, 0.27], leaf, 1, rnd, 0.12, sunlit(leaf));
    if (stage >= 1) {
      const a = phase;
      const c = vary(leaf, rnd, 1.6);
      t.crown(
        [lx + Math.cos(a) * 0.16, 0.92, lz + Math.sin(a) * 0.16],
        [0.18, 0.24, 0.18],
        c,
        1,
        rnd,
        0.12,
        sunlit(c),
      );
    }
    if (stage >= 2) {
      const a = phase + 2.4;
      const c = vary(mixHex(leaf, 0xd9e27a, 0.25), rnd, 1.4);
      t.crown(
        [lx * 2 + Math.cos(a) * 0.1, 1.4, lz * 2 + Math.sin(a) * 0.1],
        [0.17, 0.21, 0.17],
        c,
        1,
        rnd,
        0.1,
        sunlit(c, 0.18),
      );
      const b = vary(leaf, rnd, 1.2);
      const a2 = phase + 4.1;
      t.crown(
        [lx + Math.cos(a2) * 0.15, 1.02, lz + Math.sin(a2) * 0.15],
        [0.17, 0.22, 0.17],
        b,
        1,
        rnd,
        0.12,
        sunlit(b),
      );
    }
    return t.build(STAGE_SCALE[stage]!);
  },
};

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
    if (low) {
      // Two open cones over a stick: the near tiers' outline from 0.26 to the tip at 1.4.
      t.s.surface(SURFACE.timber);
      t.stick(0.07, 0.05, 0.36, palette.bark);
      t.s.surface(SURFACE.leaf);
      t.cone(0, 0, 0.6, 0.24, 1.0, mixHex(green, 0x2f4a33, 0.12), 5, phase);
      t.cone(0, 0, 0.44, 0.7, 1.45, mixHex(green, palette.birchLeaf, 0.18), 5, phase + 0.6);
      return t.build(STAGE_SCALE[stage]!);
    }
    t.s.surface(SURFACE.timber);
    t.trunk(0.07, 0.36, palette.bark, 5);
    t.s.surface(SURFACE.leaf);
    // Tiers from the bottom up: wide and dark below, narrower and lighter above, each tilted a
    // little and turned so the edges do not line up.
    const tiers = stage >= 2 ? 4 : stage === 1 ? 3 : 2;
    for (let k = 0; k < tiers; k++) {
      const f = k / Math.max(1, tiers - 1);
      const r = 0.52 - f * 0.27;
      const y0 = 0.26 + k * (1.05 / tiers);
      const h = 0.6 - f * 0.14;
      const col = vary(mixHex(green, mixHex(green, palette.birchLeaf, 0.3), f), rnd, 1.2);
      const ox = (rnd() - 0.5) * 0.04;
      const oz = (rnd() - 0.5) * 0.04;
      t.s.cylinder(ox, oz, r, 0, y0, y0 + h, col, 8, phase + rnd() * Math.PI);
    }
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
