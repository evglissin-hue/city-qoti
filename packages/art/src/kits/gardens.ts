// V3B-E4: back gardens. The sim cuts the ground inside a closed block, behind the rows of joined
// houses, into garden lots (at most 4 x 4 tiles, never built on); this kit draws one. A garden is
// world aligned: kit x runs 0..w, kit z runs 0..d, y = 0 the ground (the lot's origin, no rotation).
// Around it, boundary walls on the edges the client asks for (brick, plaster, dry stone, timber or a
// hedge by district; a lighter fence or low hedge toward another garden; a gate onto a road). Inside,
// by seed and size: a boarded shed in a corner away from the houses, a washing line nearer them, one
// or two fruit trees, vegetable rows or a flower border, a water butt, now and then a bench or hens.
// The mown lawn is the ground shader's: no grass plane is drawn here.
//
// Params: `sides` (4 chars for the north, east, south and west edges: 'p' the backs of row houses,
// 'g' another garden, 'r' a road, 'o' open), `walls` (a subset of 'nesw'), `style` ('brick',
// 'plaster', 'stone', 'timber' or '' for the district) and `season` (0 spring to 3 winter).
import { mixHex, seeded, vary, type ShapeBuilder } from '../geometry';
import { palette } from '../palette';
import { beam } from '../shapes';
import { SURFACE } from '../surface';
import { flowerBorder, gate, hedgeRun, hen, postAndRail as postRail, washingLine } from './details';
import { bench, picket, wattle } from './props';
import { roofPart } from './roofs';
import { kitBuilder } from './parts';
import type { Kit, KitBuildOptions } from './types';
import { orchardTree, seasonOf } from './village';

/** The kit's default lot, for the gallery: 3 x 3. */
const DEFAULT_SIZE: [number, number] = [3, 3];

type WallKind = 'brick' | 'plaster' | 'stone' | 'hedge' | 'hedgeLow' | 'picket' | 'rail' | 'wattle';

/** Half-thickness reach from a wall's centerline, so every kind stays inside the lot. */
const INSET: Record<WallKind, number> = {
  brick: 0.13,
  plaster: 0.13,
  stone: 0.13,
  hedge: 0.2,
  hedgeLow: 0.2,
  picket: 0.1,
  rail: 0.1,
  wattle: 0.1,
};

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

type P2 = [number, number];

const PLASTERS = [palette.plasterCream, palette.plasterRose, palette.plasterSage, palette.plasterButter];
const SHED_PAINTS = [0x8a6f58, 0x8a6f58, 0x7f9a86, 0xa9b9bd, 0xc9b78a];
const FENCE_PAINTS = [palette.white, 0x9fb7a8, 0xb9c6d0, 0xe4d6b0];

/** The outer wall kind for a district style, by seed. */
function outerKind(style: string, roll: number): WallKind {
  switch (style) {
    case 'brick':
      return 'brick';
    case 'stone':
      return 'stone';
    case 'plaster':
      return roll < 0.55 ? 'plaster' : 'hedge';
    case 'timber':
      return roll < 0.5 ? 'rail' : 'picket';
    default:
      return roll < 0.5 ? 'hedge' : roll < 0.8 ? 'picket' : 'wattle';
  }
}

/** The lighter boundary toward another garden. */
function innerKind(roll: number): WallKind {
  return roll < 0.34 ? 'picket' : roll < 0.6 ? 'hedgeLow' : roll < 0.82 ? 'wattle' : 'rail';
}

const dist = (a: P2, b: P2): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** A box between two axis-aligned ground points with `half` thickness either side. */
function bar(s: ShapeBuilder, a: P2, b: P2, half: number, y0: number, y1: number, hex: number): void {
  const alongX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const lo = (v: number, w: number): number => Math.min(v, w);
  const hi = (v: number, w: number): number => Math.max(v, w);
  s.box(
    lo(a[0], b[0]) - (alongX ? 0 : half),
    y0,
    lo(a[1], b[1]) - (alongX ? half : 0),
    hi(a[0], b[0]) + (alongX ? 0 : half),
    y1,
    hi(a[1], b[1]) + (alongX ? half : 0),
    hex,
  );
}

/** A masonry wall: a body, a coping and a pier now and then. */
function masonry(
  s: ShapeBuilder,
  kind: 'brick' | 'plaster',
  a: P2,
  b: P2,
  rnd: () => number,
  tone: number,
): void {
  const len = dist(a, b);
  if (len < 0.05) return;
  const n = Math.max(1, Math.round(len / 0.5));
  const ux = (b[0] - a[0]) / len;
  const uz = (b[1] - a[1]) / len;
  const pt = (k: number): P2 => [a[0] + ux * k, a[1] + uz * k];
  s.surface(kind === 'brick' ? SURFACE.brick : SURFACE.plaster);
  if (s.low) {
    // Far: one block along the whole run.
    bar(s, a, b, 0.04, 0, 0.22, tone);
  } else {
    for (let i = 0; i < n; i++) {
      const h = 0.2 + (rnd() - 0.5) * 0.015;
      bar(s, pt((i / n) * len), pt(((i + 1) / n) * len), 0.035, 0, h, vary(tone, rnd, 0.5));
    }
  }
  // The coping: stone on edge on brick, a run of tiles on plaster.
  s.surface(kind === 'brick' ? SURFACE.stone : SURFACE.tile);
  const coping = kind === 'brick' ? vary(0xa39c90, rnd, 0.8) : palette.roofTerracotta;
  s.nearOnly(() => bar(s, a, b, 0.05, 0.2, 0.232, coping));
  // Piers at the ends and about every tile and a half.
  s.surface(kind === 'brick' ? SURFACE.brick : SURFACE.plaster);
  const piers = Math.max(1, Math.round(len / 1.5));
  s.nearOnly(() => {
    for (let i = 0; i <= piers; i++) {
      const p = pt((i / piers) * len);
      s.box(p[0] - 0.055, 0, p[1] - 0.055, p[0] + 0.055, 0.27, p[1] + 0.055, vary(tone, rnd, 0.4));
      s.surface(SURFACE.stone);
      s.box(p[0] - 0.068, 0.27, p[1] - 0.068, p[0] + 0.068, 0.295, p[1] + 0.068, 0xb9b1a3);
      s.surface(kind === 'brick' ? SURFACE.brick : SURFACE.plaster);
    }
  });
  s.surface(SURFACE.plain);
}

/** A hedge taller than the plain run: a dark core and a row of lumps on top. */
function hedgeTall(s: ShapeBuilder, a: P2, b: P2, rnd: () => number): void {
  bar(s, a, b, 0.065, 0, 0.27, vary(0x3f6a33, rnd, 0.4));
  hedgeRun(s, a, b, rnd);
  s.nearOnly(() => {
    const len = dist(a, b);
    const n = Math.max(2, Math.round(len / 0.15));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      s.blob(
        a[0] + (b[0] - a[0]) * t,
        0.26,
        a[1] + (b[1] - a[1]) * t,
        0.085,
        0.06,
        0.085,
        vary(0x5f8c45, rnd, 0.8),
        0,
      );
    }
  });
}

/** One straight run of a wall kind. */
function wallRun(s: ShapeBuilder, kind: WallKind, a: P2, b: P2, rnd: () => number, tone: number): void {
  switch (kind) {
    case 'brick':
    case 'plaster':
      masonry(s, kind, a, b, rnd, tone);
      return;
    case 'stone': {
      // The far level is one plain block: the stones themselves are too small to survive.
      if (s.low) {
        s.surface(SURFACE.stone);
        bar(s, a, b, 0.06, 0, 0.2, palette.stone);
        s.surface(SURFACE.plain);
        return;
      }
      // Near: a rough body (the stone surface does the courses) under coping stones set on edge.
      s.surface(SURFACE.stone);
      bar(s, a, b, 0.06, 0, 0.17, vary(palette.stone, rnd, 0.8));
      const len = dist(a, b);
      const n = Math.max(2, Math.round(len / 0.17));
      const ux = (b[0] - a[0]) / len;
      const uz = (b[1] - a[1]) / len;
      for (let i = 0; i < n; i++) {
        const k = ((i + 0.5) / n) * len;
        const x = a[0] + ux * k;
        const z = a[1] + uz * k;
        const h = 0.2 + rnd() * 0.035;
        const hw = (len / n) * 0.46;
        const alongX = Math.abs(ux) > 0.5;
        s.box(
          x - (alongX ? hw : 0.05),
          0.17,
          z - (alongX ? 0.05 : hw),
          x + (alongX ? hw : 0.05),
          h,
          z + (alongX ? 0.05 : hw),
          vary(0xa39c90, rnd, 1.2),
        );
      }
      s.surface(SURFACE.plain);
      return;
    }
    case 'hedge':
      hedgeTall(s, a, b, rnd);
      return;
    case 'hedgeLow':
      hedgeRun(s, a, b, rnd);
      return;
    case 'picket':
      if (s.low) {
        bar(s, a, b, 0.015, 0, 0.17, tone);
        return;
      }
      picket(s, a, b, tone);
      return;
    case 'rail':
      if (s.low) {
        bar(s, a, b, 0.015, 0.05, 0.25, 0x9a7a52);
        return;
      }
      postRail(s, a, b, rnd);
      return;
    case 'wattle':
      if (s.low) {
        bar(s, a, b, 0.015, 0, 0.17, 0x9a7a52);
        return;
      }
      wattle(s, a, b, rnd);
      return;
  }
}

/** A wall run on one edge with an optional gate gap at `at` (0..1 along it). */
function edgeWall(
  s: ShapeBuilder,
  kind: WallKind,
  a: P2,
  b: P2,
  rnd: () => number,
  tone: number,
  at: number | null,
): void {
  if (at === null) {
    wallRun(s, kind, a, b, rnd, tone);
    return;
  }
  const len = dist(a, b);
  const ux = (b[0] - a[0]) / len;
  const uz = (b[1] - a[1]) / len;
  const g = len * at;
  const pt = (k: number): P2 => [a[0] + ux * k, a[1] + uz * k];
  const g0 = pt(g - 0.19);
  const g1 = pt(g + 0.19);
  wallRun(s, kind, a, g0, rnd, tone);
  wallRun(s, kind, g1, b, rnd, tone);
  // Posts either side of the gap and a latched gate between them.
  const wood = kind === 'picket' ? tone : 0x7a5a3a;
  for (const p of [g0, g1]) {
    s.surface(SURFACE.timber);
    s.box(p[0] - 0.03, 0, p[1] - 0.03, p[0] + 0.03, 0.29, p[1] + 0.03, palette.timber);
    s.box(p[0] - 0.035, 0.29, p[1] - 0.035, p[0] + 0.035, 0.31, p[1] + 0.035, palette.timber);
  }
  s.surface(SURFACE.plain);
  s.nearOnly(() => gate(s, pt(g - 0.15), pt(g + 0.15), wood));
  // Far off the gap is a darker slab so the gate still reads.
  if (s.low) {
    const q0 = pt(g - 0.15);
    const q1 = pt(g + 0.15);
    bar(s, q0, q1, 0.012, 0.03, 0.22, wood);
  }
}

// --- Layout -------------------------------------------------------------------------------------

function overlap(a: Rect, b: Rect, gap = 0.04): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.z0 < b.z1 + gap && b.z0 < a.z1 + gap;
}

const around = (cx: number, cz: number, hx: number, hz: number): Rect => ({
  x0: cx - hx,
  z0: cz - hz,
  x1: cx + hx,
  z1: cz + hz,
});

type Item = 'shed' | 'tree' | 'veg' | 'line' | 'border' | 'bench' | 'hens';

interface Plan {
  s: ShapeBuilder;
  rnd: () => number;
  /** The free region: inside the walls' reach. */
  region: Rect;
  placed: Rect[];
  w: number;
  d: number;
  sides: string;
  walls: string;
  season: number;
}

function fits(plan: Plan, r: Rect): boolean {
  const g = plan.region;
  if (r.x0 < g.x0 - 1e-6 || r.z0 < g.z0 - 1e-6 || r.x1 > g.x1 + 1e-6 || r.z1 > g.z1 + 1e-6) return false;
  return !plan.placed.some((p) => overlap(r, p));
}

/** Tries random spots for a rect of the given size until one is free; null when none is. */
function spot(plan: Plan, hx: number, hz: number, tries = 24): Rect | null {
  const g = plan.region;
  const spanX = g.x1 - g.x0 - hx * 2;
  const spanZ = g.z1 - g.z0 - hz * 2;
  if (spanX < -1e-6 || spanZ < -1e-6) return null;
  for (let i = 0; i < tries; i++) {
    const r = around(
      g.x0 + hx + Math.max(0, spanX) * plan.rnd(),
      g.z0 + hz + Math.max(0, spanZ) * plan.rnd(),
      hx,
      hz,
    );
    if (fits(plan, r)) return r;
  }
  return null;
}

// --- The pieces ---------------------------------------------------------------------------------

/** A boarded shed: a plinth, walls, a door and a window, and a pent or gable roof. */
function shed(plan: Plan, cx: number, cz: number, f: P2): Rect {
  const { s, rnd } = plan;
  // u runs across the door face, v out from the back to the door.
  const aX = -f[1];
  const aZ = f[0];
  const at = (u: number, v: number): P2 => [cx + aX * u + f[0] * v, cz + aZ * u + f[1] * v];
  const box = (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, hex: number): void => {
    const p = at(u0, v0);
    const q = at(u1, v1);
    s.box(
      Math.min(p[0], q[0]),
      y0,
      Math.min(p[1], q[1]),
      Math.max(p[0], q[0]),
      y1,
      Math.max(p[1], q[1]),
      hex,
    );
  };
  const paint = SHED_PAINTS[Math.floor(rnd() * SHED_PAINTS.length)]!;
  const boards = vary(paint, rnd, 0.6);
  const W = 0.25;
  const D = 0.2;
  const H = 0.32 + rnd() * 0.04;
  s.surface(SURFACE.stone);
  box(-W - 0.012, 0, -D - 0.012, W + 0.012, 0.03, D + 0.012, 0x8f877a);
  s.surface(paint === 0x8a6f58 ? SURFACE.woodGrain : SURFACE.paintedWood);
  box(-W, 0.03, -D, W, H, D, boards);
  // The door, boarded, with a batten across and a ring handle; a small window beside it.
  s.nearOnly(() => {
    s.surface(SURFACE.woodGrain);
    const door = vary(palette.darkWood, rnd, 0.5);
    box(-0.09, 0.03, D, 0.09, H - 0.05, D + 0.012, door);
    box(-0.09, 0.11, D + 0.012, 0.09, 0.135, D + 0.02, boards);
    box(-0.09, 0.22, D + 0.012, 0.09, 0.245, D + 0.02, boards);
    box(0.06, 0.15, D + 0.012, 0.075, 0.18, D + 0.02, palette.metal);
    s.surface(SURFACE.glass);
    s.glow(0);
    box(0.14, 0.17, D, 0.215, 0.27, D + 0.01, 0x9bb8c0);
    s.surface(SURFACE.paintedWood);
    box(0.133, 0.162, D + 0.01, 0.222, 0.172, D + 0.018, palette.white);
    box(0.133, 0.268, D + 0.01, 0.222, 0.278, D + 0.018, palette.white);
    box(0.133, 0.172, D + 0.01, 0.143, 0.268, D + 0.018, palette.white);
    box(0.212, 0.172, D + 0.01, 0.222, 0.268, D + 0.018, palette.white);
  });
  // The roof, riding the top: a pent sloping to the door, or a gable with its end to the door.
  // V3B review: always a pent roof, sloping to the door (at a shed's size a gable's verge board
  // stood out like a flag). The draw the gable's choice used is kept, so the stream is unchanged.
  rnd();
  const color = vary(0x7a6a5a, rnd, 0.4);
  const p = at(-W - 0.05, -D - 0.03);
  const q = at(W + 0.05, D + 0.06);
  roofPart(s, {
    shape: 'lean',
    material: 'shingle',
    x0: Math.min(p[0], q[0]),
    z0: Math.min(p[1], q[1]),
    x1: Math.max(p[0], q[0]),
    z1: Math.max(p[1], q[1]),
    y0: H - 0.02,
    y1: H + 0.14,
    color,
    trim: palette.timber,
    // A pent rises away from the door.
    ridgeAlongX: f[0] === 0,
    rnd,
    ...(f[0] + f[1] < 0 ? { highAtC1: true } : {}),
  });
  s.surface(SURFACE.plain);
  const r = at(-W - 0.06, -D - 0.04);
  const t = at(W + 0.06, D + 0.07);
  return {
    x0: Math.min(r[0], t[0]),
    z0: Math.min(r[1], t[1]),
    x1: Math.max(r[0], t[0]),
    z1: Math.max(r[1], t[1]),
  };
}

/** A water butt on a stand with a downpipe to the eaves. */
function butt(plan: Plan, x: number, z: number, hex: number): void {
  const { s } = plan;
  s.nearOnly(() => {
    s.surface(SURFACE.woodGrain);
    s.box(x - 0.055, 0, z - 0.055, x + 0.055, 0.05, z + 0.055, palette.timber);
    s.cylinder(x, z, 0.065, 0.07, 0.05, 0.19, hex, 8);
    s.cylinder(x, z, 0.07, 0.06, 0.19, 0.2, palette.metal, 8);
    s.surface(SURFACE.plain);
  });
}

/** Vegetable rows for the season: seedlings, full rows, pumpkins among cabbages, or bare ridges. */
function vegBed(plan: Plan, r: Rect): void {
  const { s, rnd, season } = plan;
  const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
  s.surface(SURFACE.dirt);
  s.rbox(r.x0, 0, r.z0, r.x1, 0.032, r.z1, vary(palette.soil, rnd, 0.4), 0.015);
  s.surface(SURFACE.plain);
  const across = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
  const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
  const rows = Math.max(2, Math.round(across / 0.15));
  s.detail(() => {
    for (let k = 0; k < rows; k++) {
      const c = (alongX ? r.z0 : r.x0) + (across * (k + 0.5)) / rows;
      const n = Math.max(2, Math.round(len / 0.14));
      // A ridge of earth under each row.
      const ridge = (alongX ? r.x0 : r.z0) + 0.02;
      const ridgeEnd = (alongX ? r.x1 : r.z1) - 0.02;
      if (alongX) s.box(ridge, 0.032, c - 0.025, ridgeEnd, 0.052, c + 0.025, vary(palette.soil, rnd, 0.8));
      else s.box(c - 0.025, 0.032, ridge, c + 0.025, 0.052, ridgeEnd, vary(palette.soil, rnd, 0.8));
      const kind = k % 3;
      for (let i = 0; i < n; i++) {
        const a = (alongX ? r.x0 : r.z0) + (len * (i + 0.5)) / n;
        const x = alongX ? a : c;
        const z = alongX ? c : a;
        const jx = (rnd() - 0.5) * 0.02;
        if (season === 0) {
          if (i % 2 === 0) s.blob(x + jx, 0.06, z, 0.014, 0.018, 0.014, vary(0x9ccc6a, rnd, 0.8), 0);
        } else if (season === 3) {
          if (kind === 1 && i % 2 === 0)
            s.cylinder(x, z, 0.008, 0.014, 0.05, 0.1, vary(0x7f9a7a, rnd, 0.6), 4);
        } else if (kind === 0) {
          const cab = season === 2 ? vary(0x6f8f55, rnd, 0.8) : vary(0x7fae4e, rnd, 0.8);
          s.blob(x + jx, 0.075, z, 0.05, 0.04, 0.05, cab, 0);
        } else if (kind === 1) {
          s.cylinder(x, z, 0.012, 0.02, 0.05, 0.14, vary(0x8fbf6a, rnd, 0.6), 4);
        } else if (season === 2) {
          s.blob(x, 0.07, z, 0.045, 0.04, 0.045, vary(palette.autumnGold, rnd, 0.8), 0);
        } else {
          s.blob(x, 0.065, z, 0.03, 0.03, 0.03, vary(0x6f9a4a, rnd, 1.2), 0);
        }
      }
    }
    // A cane wigwam of beans at one end in summer and autumn.
    if ((season === 1 || season === 2) && across > 0.4) {
      const bx = alongX ? r.x1 - 0.1 : (r.x0 + r.x1) / 2;
      const bz = alongX ? (r.z0 + r.z1) / 2 : r.z1 - 0.1;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        beam(s, [bx + Math.cos(a) * 0.07, 0.03, bz + Math.sin(a) * 0.07], [bx, 0.3, bz], 0.006, 0x9a7a52);
      }
      s.blob(bx, 0.17, bz, 0.06, 0.1, 0.06, vary(0x6fa04a, rnd, 0.8), 0);
    }
  });
}

/** Places a fruit tree: crown reach 0.3 at k 0.8. */
function tree(plan: Plan, x: number, z: number): void {
  const { s, season } = plan;
  // Far off (leaf seasons): the same draws run silently, and one painted puff on a short trunk stands in.
  s.nearOnly(() => orchardTree(s, x, z, 0.8, season, plan.rnd, true, 44));
  if (season === 3) {
    s.essential(() => {
      if (s.low) s.cylinder(x, z, 0.035, 0.015, 0, 0.42, palette.bark, 3);
    });
    return;
  }
  s.essential(() => {
    if (!s.low) return;
    const base = mixHex(palette.oakLeaf, palette.birchLeaf, season === 0 ? 0.6 : 0.4);
    const leaf = season === 2 ? mixHex(base, palette.autumnGold, 0.45) : base;
    s.cylinder(x, z, 0.04, 0.03, 0, 0.3, palette.bark, 4);
    s.blob(x, 0.5, z, 0.25, 0.2, 0.25, leaf, 0);
  });
}

const TREE_HALF = 0.32;

/** The washing line: two posts and cloths, across the lot's grain nearer the houses. */
function line(plan: Plan): boolean {
  const { rnd, w, d, region: g } = plan;
  const ps = [...plan.sides].map((c, i) => (c === 'p' ? i : -1)).filter((i) => i >= 0);
  const minLen = 0.7;
  // Parallel to the house side, a little in from it; with none, along the longer axis.
  const side = ps.length ? ps[Math.floor(rnd() * ps.length)]! : w >= d ? 0 : 3;
  const horiz = side === 0 || side === 2;
  const span = horiz ? g.x1 - g.x0 : g.z1 - g.z0;
  if (span < minLen) return false;
  const len = Math.min(1.7, span - 0.1, 0.7 + rnd() * 1.0);
  if (len < minLen) return false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const off = 0.28 + attempt * 0.18 + rnd() * 0.12;
    const slack = span - len;
    const t0 = (horiz ? g.x0 : g.z0) + slack * rnd();
    let r: Rect;
    let a: P2;
    let b: P2;
    if (horiz) {
      const z = side === 0 ? g.z0 + off : g.z1 - off;
      r = { x0: t0 - 0.03, z0: z - 0.08, x1: t0 + len + 0.03, z1: z + 0.08 };
      a = [t0, z];
      b = [t0 + len, z];
    } else {
      const x = side === 3 ? g.x0 + off : g.x1 - off;
      r = { x0: x - 0.08, z0: t0 - 0.03, x1: x + 0.08, z1: t0 + len + 0.03 };
      a = [x, t0];
      b = [x, t0 + len];
    }
    if (!fits(plan, r)) continue;
    plan.placed.push(r);
    plan.s.nearOnly(() => washingLine(plan.s, a, b, rnd));
    return true;
  }
  return false;
}

/** A flower border along one walled side. */
function border(plan: Plan): boolean {
  const { rnd, region: g, season } = plan;
  if (season === 3) return false;
  const options: number[] = [];
  for (let i = 0; i < 4; i++) if (plan.walls.includes('nesw'[i]!) && plan.sides[i] !== 'p') options.push(i);
  if (!options.length) return false;
  const side = options[Math.floor(rnd() * options.length)]!;
  const horiz = side === 0 || side === 2;
  const lo = (horiz ? g.x0 : g.z0) + 0.1;
  const hi = (horiz ? g.x1 : g.z1) - 0.1;
  if (hi - lo < 0.4) return false;
  const from = lo + (hi - lo) * rnd() * 0.3;
  const to = hi - (hi - lo) * rnd() * 0.3;
  const edge = side === 0 ? g.z0 + 0.08 : side === 2 ? g.z1 - 0.08 : side === 3 ? g.x0 + 0.08 : g.x1 - 0.08;
  const r: Rect = horiz
    ? { x0: from, z0: edge - 0.1, x1: to, z1: edge + 0.1 }
    : { x0: edge - 0.1, z0: from, x1: edge + 0.1, z1: to };
  if (!fits(plan, r)) return false;
  plan.placed.push(r);
  const a: P2 = horiz ? [from, edge] : [edge, from];
  const b: P2 = horiz ? [to, edge] : [edge, to];
  plan.s.detail(() => flowerBorder(plan.s, a, b, rnd));
  return true;
}

/** Builds the garden's contents; returns how many items stood. */
function furnish(plan: Plan, want: number): void {
  const { rnd, region: g, w, d, sides } = plan;
  const area = w * d;
  // The shed goes first, in the corner farthest from the houses.
  let shedAt: Rect | null = null;
  // V3B review: a shed in about half the gardens (a block of eight gardens with eight sheds read as
  // a row of huts), more often in the big ones.
  if (rnd() < (area >= 9 ? 0.7 : area >= 4 ? 0.45 : 0.25)) {
    const corners = [
      { x: g.x0, z: g.z0, sx: 1, sz: 1, adj: [sides[0], sides[3]] },
      { x: g.x1, z: g.z0, sx: -1, sz: 1, adj: [sides[0], sides[1]] },
      { x: g.x1, z: g.z1, sx: -1, sz: -1, adj: [sides[2], sides[1]] },
      { x: g.x0, z: g.z1, sx: 1, sz: -1, adj: [sides[2], sides[3]] },
    ]
      .map((c) => ({ c, score: c.adj.filter((a) => a === 'p').length * -10 + rnd() }))
      .sort((p, q) => q.score - p.score);
    for (const { c } of corners) {
      // Door toward the lot's heart along the axis with more room; the shed is 0.5 x 0.4.
      const roomX = Math.abs((g.x0 + g.x1) / 2 - c.x);
      const roomZ = Math.abs((g.z0 + g.z1) / 2 - c.z);
      const faceX = roomX > roomZ || (roomX === roomZ && rnd() < 0.5);
      const f: P2 = faceX ? [c.sx, 0] : [0, c.sz];
      const hx = faceX ? 0.28 : 0.35;
      const hz = faceX ? 0.35 : 0.28;
      const r = around(c.x + c.sx * hx, c.z + c.sz * hz, hx, hz);
      if (!fits(plan, r)) continue;
      shedAt = r;
      plan.placed.push(r);
      // The shed is drawn in its own frame, centered on the rect.
      shed(plan, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, f);
      // A water butt on the free side of it, now and then.
      if (rnd() < 0.7) {
        const sides2: P2[] = faceX
          ? [
              [(r.x0 + r.x1) / 2, r.z0 - 0.11],
              [(r.x0 + r.x1) / 2, r.z1 + 0.11],
            ]
          : [
              [r.x0 - 0.11, (r.z0 + r.z1) / 2],
              [r.x1 + 0.11, (r.z0 + r.z1) / 2],
            ];
        for (const [bx, bz] of sides2) {
          const br = around(bx, bz, 0.08, 0.08);
          if (!fits(plan, br)) continue;
          plan.placed.push(br);
          butt(plan, bx, bz, 0x4f6f55);
          break;
        }
      }
      break;
    }
  }
  let have = shedAt ? 1 : 0;
  // The rest, drawn from a weighted bag.
  const bag: [Item, number][] = [
    ['tree', 3],
    ['veg', 3],
    ['line', area >= 2 ? 2.5 : 0],
    ['border', 2],
    ['bench', area >= 2 ? 1 : 0],
    ['hens', area >= 3 ? 1.2 : 0],
  ];
  if (area >= 6) bag.push(['tree', 2.5]);
  let guard = 0;
  while (have < want && bag.length && guard++ < 30) {
    const total = bag.reduce((n, [, k]) => n + k, 0);
    if (total <= 0) break;
    let roll = rnd() * total;
    let pick = 0;
    for (let i = 0; i < bag.length; i++) {
      roll -= bag[i]![1];
      if (roll <= 0) {
        pick = i;
        break;
      }
    }
    const [item] = bag[pick]!;
    bag.splice(pick, 1);
    let ok = false;
    switch (item) {
      case 'tree': {
        const r = spot(plan, TREE_HALF, TREE_HALF);
        if (r) {
          plan.placed.push(r);
          tree(plan, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
          ok = true;
        }
        break;
      }
      case 'veg': {
        for (const [bw, bd] of [
          [1.3, 0.75],
          [1.0, 0.65],
          [0.7, 0.5],
          [0.45, 0.4],
        ] as const) {
          const flip = rnd() < 0.5;
          const r = spot(plan, (flip ? bd : bw) / 2, (flip ? bw : bd) / 2);
          if (r) {
            plan.placed.push(r);
            vegBed(plan, r);
            ok = true;
            break;
          }
        }
        break;
      }
      case 'line':
        ok = line(plan);
        break;
      case 'border':
        ok = border(plan);
        break;
      case 'bench': {
        const alongX = rnd() < 0.5;
        const r = spot(plan, alongX ? 0.24 : 0.12, alongX ? 0.12 : 0.24);
        if (r) {
          plan.placed.push(r);
          const x = (r.x0 + r.x1) / 2;
          const z = (r.z0 + r.z1) / 2;
          plan.s.nearOnly(() => bench(plan.s, x, z, alongX, plan.rnd));
          ok = true;
        }
        break;
      }
      case 'hens': {
        const r = spot(plan, 0.26, 0.18);
        if (r) {
          plan.placed.push(r);
          const n = 2 + Math.floor(rnd() * 2);
          const x = (r.x0 + r.x1) / 2;
          const z = (r.z0 + r.z1) / 2;
          plan.s.nearOnly(() => {
            for (let i = 0; i < n; i++)
              hen(plan.s, x + (rnd() - 0.5) * 0.4, z + (rnd() - 0.5) * 0.24, rnd() * Math.PI * 2, plan.rnd);
          });
          ok = true;
        }
        break;
      }
    }
    if (ok) have++;
  }
}

// --- The kit ------------------------------------------------------------------------------------

function paramOf(opts: KitBuildOptions | undefined, key: string): string {
  const v = opts?.params?.[key];
  return typeof v === 'string' ? v : '';
}

function gardenOf(opts: KitBuildOptions | undefined): ShapeBuilder {
  const [w, d] = opts?.size ?? DEFAULT_SIZE;
  const seed = Math.floor(opts?.seed ?? 1);
  const rnd = seeded(seed * 977 + w * 31 + d * 7 + 13);
  // Walls draw from their own stream, so the far level (which draws fewer stones) never moves the layout.
  const wr = seeded(seed * 613 + w * 17 + d * 5 + 3);
  const s = kitBuilder(opts);
  const sidesRaw = paramOf(opts, 'sides');
  const sides = (sidesRaw + 'oooo').slice(0, 4);
  const walls = paramOf(opts, 'walls');
  const style = paramOf(opts, 'style');
  const season = seasonOf(opts);

  // The wall kinds for this garden, drawn first so layout never changes them.
  const outer = outerKind(style, rnd());
  const inner = innerKind(rnd());
  const tone =
    outer === 'plaster'
      ? PLASTERS[Math.floor(rnd() * PLASTERS.length)]!
      : outer === 'brick'
        ? palette.brick
        : FENCE_PAINTS[Math.floor(rnd() * FENCE_PAINTS.length)]!;
  const fenceTone = FENCE_PAINTS[Math.floor(rnd() * FENCE_PAINTS.length)]!;
  const gateRoll = 0.3 + rnd() * 0.4;
  const kindOf = (i: number): WallKind => (sides[i] === 'g' ? inner : outer);
  const toneOf = (i: number): number => (sides[i] === 'g' ? fenceTone : tone);

  const reach = (i: number): number => (walls.includes('nesw'[i]!) ? INSET[kindOf(i)] : 0.06);
  // The walls, one edge at a time: north, east, south, west.
  const edges: { a: P2; b: P2 }[] = [
    { a: [reach(3), reach(0)], b: [w - reach(1), reach(0)] },
    { a: [w - reach(1), reach(0)], b: [w - reach(1), d - reach(2)] },
    { a: [reach(3), d - reach(2)], b: [w - reach(1), d - reach(2)] },
    { a: [reach(3), reach(0)], b: [reach(3), d - reach(2)] },
  ];
  // Walls stop a little short of the lot corners so hedge lumps stay inside.
  const trim = (i: number): number => {
    const k = kindOf(i);
    return INSET[k] >= 0.2 ? 0.2 : k === 'brick' || k === 'plaster' || k === 'stone' ? 0.15 : 0.1;
  };
  for (let i = 0; i < 4; i++) {
    if (!walls.includes('nesw'[i]!)) continue;
    const { a, b } = edges[i]!;
    const kind = kindOf(i);
    const len = dist(a, b);
    if (len < 0.2) continue;
    // Each end stands at least `trim` in from the lot's corner, whatever the next side does.
    const horiz = i % 2 === 0;
    const da = Math.max(0, trim(i) - (horiz ? a[0] : a[1]));
    const db = Math.max(0, trim(i) - (horiz ? w - b[0] : d - b[1]));
    const ux = (b[0] - a[0]) / len;
    const uz = (b[1] - a[1]) / len;
    const a2: P2 = [a[0] + ux * da, a[1] + uz * da];
    const b2: P2 = [b[0] - ux * db, b[1] - uz * db];
    const edgeLen = i % 2 === 0 ? w : d;
    const gateAt = sides[i] === 'r' && edgeLen >= 2 ? gateRoll : null;
    edgeWall(s, kind, a2, b2, wr, toneOf(i), gateAt);
  }

  // The free ground inside the walls' reach (and a little off bare edges).
  const margin = (i: number): number => {
    if (!walls.includes('nesw'[i]!)) return 0.14;
    return INSET[kindOf(i)] >= 0.2 ? 0.3 : 0.2;
  };
  const region: Rect = {
    x0: margin(3),
    z0: margin(0),
    x1: w - margin(1),
    z1: d - margin(2),
  };
  const area = w * d;
  const want = 1 + (area >= 2 ? 1 : 0) + Math.floor(area / 3.2);
  const plan: Plan = { s, rnd, region, placed: [], w, d, sides, walls, season };
  furnish(plan, want);
  return s;
}

/** The back garden kit; see the file header for its params. */
export const backGarden: Kit = {
  id: 'back-garden',
  kind: 'building',
  footprint: { size: DEFAULT_SIZE, entrance: [1, 2] },
  build: (opts) => gardenOf(opts).build(),
  anchors: () => ({}),
};
