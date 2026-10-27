// Construction sites (docs/spec/13-ledger.md, Construction): 0 a staked plot with string lines,
// 1 a stone foundation, 2 a timber frame in scaffolding, 3 the roof going on. Delivered materials
// sit in piles on the site. Each building kit has a massing (outline, wall height, roof) so the
// frame grows into the shape the finished building will have.
import type { BufferGeometry } from 'three';
import { seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam } from '../shapes';
import { pileOf } from './goods';
import { ladder, groundPatch } from './props';
import { roofPart, type RoofShape } from './roofs';

interface Massing {
  /** Outline inset from the footprint edges: left, back, right, front. */
  inset: [number, number, number, number];
  wallH: number;
  rise: number;
  shape: RoofShape;
  /** Ridge along x (true) or z. */
  alongX: boolean;
  /** Open sites (plots, quarries) never get walls or a roof. */
  open?: boolean;
}

const DEFAULT_MASSING: Massing = {
  inset: [0.22, 0.28, 0.22, 0.3],
  wallH: 0.8,
  rise: 0.6,
  shape: 'gable',
  alongX: true,
};

const MASSING: Record<string, Partial<Massing>> = {
  bakery: { wallH: 0.84, shape: 'halfHip' },
  // C4E: the village buildings.
  'brick-kiln': { inset: [0.25, 0.3, 1.2, 1.4], wallH: 1.1, rise: 0.4, shape: 'hip' },
  'cart-shed': { inset: [0.16, 0.16, 0.16, 0.3], wallH: 0.98, rise: 0.72, alongX: false },
  cheesemaker: { inset: [0.22, 0.25, 0.22, 0.36], wallH: 0.82, shape: 'hip' },
  'chopping-shed': { inset: [0.16, 0.16, 0.16, 0.9], wallH: 0.6, rise: 0.22, shape: 'lean' },
  'cider-press': { inset: [0.18, 0.18, 0.18, 1.05], wallH: 0.8, shape: 'halfHip', alongX: false },
  'clay-pit': { open: true },
  dairy: { inset: [0.2, 0.18, 0.2, 1.8], wallH: 0.66, rise: 0.55 },
  farmstead: { inset: [0.18, 1.6, 1.6, 0.4], wallH: 0.74, rise: 0.56 },
  'herb-garden': { open: true },
  herbalist: { inset: [0.26, 0.3, 0.26, 0.55], wallH: 0.72, rise: 0.82, shape: 'halfHip' },
  orchard: { open: true },
  school: { inset: [0.3, 0.25, 0.3, 1.0], wallH: 1.12, rise: 0.95, alongX: false },
  'sheep-pasture': { open: true },
  shop: { inset: [0.16, 0.22, 0.16, 0.24], wallH: 1.56, rise: 0.88, alongX: false },
  smithy: { inset: [0.2, 0.2, 0.2, 1.05], wallH: 1.0, rise: 0.56, alongX: false },
  spinner: { inset: [0.22, 0.25, 0.22, 0.62], wallH: 0.74, shape: 'halfHip' },
  tavern: { inset: [0.2, 0.2, 0.2, 1.0], wallH: 1.5, rise: 0.9, shape: 'halfHip' },
  townhouse: { inset: [0.18, 0.25, 0.18, 0.26], wallH: 1.46, rise: 0.8 },
  'trading-post': { inset: [0.2, 0.2, 0.2, 1.0], wallH: 1.2, rise: 0.7 },
  weaver: { inset: [0.2, 0.2, 0.2, 0.75], wallH: 1.34, rise: 0.6, alongX: false },
  workshop: { inset: [0.2, 0.2, 1.05, 0.85], wallH: 0.86, rise: 0.62, alongX: false },
  'builders-yard': { inset: [0.12, 0.1, 0.12, 2.0], wallH: 0.9, rise: 0.28, shape: 'lean' },
  cottage: { wallH: 0.78 },
  farmhouse: { wallH: 0.72, rise: 0.95, shape: 'gambrel', alongX: false },
  'fishers-hut': { inset: [0.18, 0.15, 0.45, 1.0], wallH: 0.64, rise: 0.5 },
  'foresters-lodge': { inset: [0.2, 0.2, 0.2, 0.85], wallH: 0.74, rise: 0.78, shape: 'halfHip' },
  house: { wallH: 1.36, rise: 0.85, alongX: false },
  'market-stall': { inset: [0.1, 0.2, 0.1, 0.22], wallH: 0.86, rise: 0.2, shape: 'lean' },
  quarry: { open: true },
  sawpit: { inset: [0.32, 0.45, 0.32, 0.75], wallH: 0.95, rise: 0.48, alongX: false },
  shed: { inset: [0.14, 0.18, 0.14, 0.18], wallH: 0.62, rise: 0.26, shape: 'lean', alongX: false },
  storehouse: { inset: [0.18, 0.15, 0.18, 1.18], wallH: 1.3, rise: 0.78 },
  'town-hall': { inset: [0.3, 0.35, 0.3, 0.55], wallH: 1.55, rise: 1.0, shape: 'hip' },
  'vegetable-plot': { open: true },
  well: { inset: [0.2, 0.2, 0.2, 0.2], wallH: 0.6, rise: 0.25 },
  windmill: { inset: [0.3, 0.3, 0.3, 0.3], wallH: 1.9, rise: 0.6, shape: 'hip' },
  woodcutter: { inset: [0.3, 0.18, 0.2, 0.9], wallH: 0.66, rise: 0.48 },
};

export interface ConstructionOptions {
  /** The finished building's kit id. */
  kit: string;
  size: [number, number];
  /** 0 staked, 1 foundation, 2 frame, 3 roof. */
  stage: number;
  /** Delivered material levels (0 to 4) by good id. */
  delivered?: Record<string, number>;
  seed?: number;
}

const FRAME = 0xb88a58;
const POLE = 0xcfae7c;
const STRING = 0xf7f4ec;

function stake(s: ShapeBuilder, x: number, z: number, flag: number): void {
  beam(s, [x, 0, z], [x, 0.26, z], 0.014, FRAME);
  s.box(x - 0.002, 0.2, z, x + 0.002, 0.25, z + 0.06, flag);
}

function frame(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y0: number,
  y1: number,
  rnd: () => number,
): void {
  const wood = vary(FRAME, rnd, 0.5);
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ] as const)
    beam(s, [x, y0, z], [x, y1, z], 0.035, wood);
  const ring = (y: number, t: number): void => {
    beam(s, [x0, y, z0], [x1, y, z0], t, wood);
    beam(s, [x1, y, z0], [x1, y, z1], t, wood);
    beam(s, [x1, y, z1], [x0, y, z1], t, wood);
    beam(s, [x0, y, z1], [x0, y, z0], t, wood);
  };
  ring(y0 + 0.03, 0.03);
  ring(y1 - 0.03, 0.03);
  // Studs and a brace on each face.
  for (const [a, b] of [
    [
      [x0, z0],
      [x1, z0],
    ],
    [
      [x1, z0],
      [x1, z1],
    ],
    [
      [x1, z1],
      [x0, z1],
    ],
    [
      [x0, z1],
      [x0, z0],
    ],
  ] as [[number, number], [number, number]][]) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / 0.45));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      beam(s, [x, y0, z], [x, y1, z], 0.02, wood);
    }
    beam(
      s,
      [a[0], y0 + 0.05, a[1]],
      [a[0] + (b[0] - a[0]) * 0.35, y1 - 0.05, a[1] + (b[1] - a[1]) * 0.35],
      0.016,
      wood,
    );
  }
}

function scaffold(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h: number,
  rnd: () => number,
): void {
  const pole = vary(POLE, rnd, 0.5);
  const o = 0.16;
  const front = z1 + o;
  for (const x of [x0 - o, (x0 + x1) / 2, x1 + o]) beam(s, [x, 0, front], [x, h + 0.2, front], 0.014, pole);
  for (const z of [z0 - o, (z0 + z1) / 2]) beam(s, [x1 + o, 0, z], [x1 + o, h + 0.2, z], 0.014, pole);
  const level = h * 0.55;
  beam(s, [x0 - o, level, front], [x1 + o, level, front], 0.012, pole);
  beam(s, [x0 - o, h + 0.1, front], [x1 + o, h + 0.1, front], 0.012, pole);
  beam(s, [x1 + o, level, z0 - o], [x1 + o, level, front], 0.012, pole);
  // Planks to stand on, and a ladder up.
  s.box(x0 - o, level, z1 + 0.02, x1 + o, level + 0.025, front + 0.08, vary(0xd8ae78, rnd, 0.5));
  ladder(s, [x0 + 0.1, 0, front + 0.28], [x0 + 0.1, level + 0.1, front + 0.04], [1, 0, 0]);
}

/** Where delivered materials pile up: along the front of the site, then down the side. */
function materials(
  s: ShapeBuilder,
  w: number,
  d: number,
  delivered: Record<string, number>,
  rnd: () => number,
): void {
  const spots: [number, number][] = [
    [w * 0.25, d - 0.18],
    [w * 0.75, d - 0.18],
    [w - 0.18, d * 0.4],
  ];
  let i = 0;
  for (const good of ['logs', 'planks', 'stone']) {
    const lv = delivered[good] ?? 0;
    if (lv <= 0) continue;
    const [x, z] = spots[i++ % spots.length]!;
    pileOf(s, good, lv, x, 0, z, rnd);
  }
}

/**
 * C4E: scaffolding round a building while its home upgrade is under way (Settler cottage to
 * Craftsfolk townhouse): poles and planks up past the eaves, a ladder, a rope hoist and bricks
 * waiting on the planks. Drawn on top of the building as it stands.
 */
export function upgradeScaffold(kit: string, size: [number, number], seed = 1): BufferGeometry {
  const m: Massing = { ...DEFAULT_MASSING, ...(MASSING[kit] ?? {}) };
  const [w, d] = size;
  const rnd = seeded(seed * 29 + 3);
  const s = new ShapeBuilder();
  const x0 = m.inset[0];
  const z0 = m.inset[1];
  const x1 = w - m.inset[2];
  const z1 = d - m.inset[3];
  scaffold(s, x0, z0, x1, z1, Math.max(1.2, m.wallH + 0.55), rnd);
  // A rope hoist on the top rail and a bucket of mortar on the planks.
  const o = 0.16;
  beam(s, [x1 + o, m.wallH + 0.75, z1 + o], [x1 + o + 0.18, m.wallH + 0.75, z1 + o], 0.012, POLE);
  beam(s, [x1 + o + 0.16, m.wallH + 0.74, z1 + o], [x1 + o + 0.16, 0.25, z1 + o], 0.003, STRING);
  s.cylinder(
    (x0 + x1) / 2 + 0.2,
    z1 + o + 0.03,
    0.04,
    0.05,
    Math.max(1.2, m.wallH + 0.55) * 0.55 + 0.025,
    Math.max(1.2, m.wallH + 0.55) * 0.55 + 0.1,
    palette.metal,
    6,
  );
  // Bricks waiting on the planks.
  const level = Math.max(1.2, m.wallH + 0.55) * 0.55 + 0.025;
  for (let i = 0; i < 4; i++)
    s.box(
      x0 + 0.1 + i * 0.07,
      level,
      z1 + o - 0.04,
      x0 + 0.16 + i * 0.07,
      level + 0.03,
      z1 + o + 0.04,
      vary(0xb5654b, rnd, 0.6),
    );
  return s.build();
}

/** A construction site for a building kit at a stage. */
export function constructionGeometry(o: ConstructionOptions): BufferGeometry {
  const m: Massing = { ...DEFAULT_MASSING, ...(MASSING[o.kit] ?? {}) };
  const [w, d] = o.size;
  const rnd = seeded((o.seed ?? 1) * 17 + o.stage);
  const s = new ShapeBuilder();
  const x0 = m.inset[0];
  const z0 = m.inset[1];
  const x1 = w - m.inset[2];
  const z1 = d - m.inset[3];
  const stage = Math.max(0, Math.min(3, Math.round(o.stage)));
  groundPatch(s, 0.05, 0.05, w - 0.05, d - 0.05, 0xb59a6e, rnd);
  if (stage === 0 || m.open) {
    // Stakes at the corners with string lines between, a few pegs and the plan on a board.
    const flag = palette.accentRed;
    for (const [x, z] of [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ] as const)
      stake(s, x, z, flag);
    for (const [a, b] of [
      [
        [x0, z0],
        [x1, z0],
      ],
      [
        [x1, z0],
        [x1, z1],
      ],
      [
        [x1, z1],
        [x0, z1],
      ],
      [
        [x0, z1],
        [x0, z0],
      ],
    ] as [[number, number], [number, number]][])
      beam(s, [a[0], 0.14, a[1]], [b[0], 0.14, b[1]], 0.004, STRING);
    const bx = x0 + 0.25;
    const bz = z1 + 0.15;
    beam(s, [bx, 0, bz], [bx, 0.34, bz], 0.012, FRAME);
    s.box(bx - 0.12, 0.24, bz + 0.012, bx + 0.12, 0.4, bz + 0.024, palette.timber);
    s.box(bx - 0.105, 0.255, bz + 0.024, bx + 0.105, 0.385, bz + 0.03, palette.paper);
    s.box(bx - 0.07, 0.3, bz + 0.03, bx + 0.07, 0.34, bz + 0.032, palette.navy);
    if (m.open && stage >= 1) {
      // Open sites: the ground broken and the first rows or cuts laid out.
      for (let i = 0; i < stage + 1; i++) {
        const z = z0 + 0.2 + i * ((z1 - z0 - 0.4) / Math.max(1, stage));
        s.rbox(x0 + 0.1, 0, z - 0.1, x1 - 0.1, 0.05, z + 0.1, vary(palette.soil, rnd, 0.5), 0.03);
      }
    }
    materials(s, w, d, o.delivered ?? {}, rnd);
    return s.build();
  }
  // Stage 1 on: the foundation, with the last course still going in.
  const fh = 0.12;
  s.rbox(x0 - 0.05, 0, z0 - 0.05, x1 + 0.05, fh * 0.6, z1 + 0.05, vary(palette.foundation, rnd, 0.5), 0.02);
  const n = Math.max(4, Math.round(((x1 - x0) * 2 + (z1 - z0) * 2) / 0.22));
  const per = stage === 1 ? Math.floor(n * 0.6) : n;
  for (let i = 0; i < per; i++) {
    const t = i / n;
    const perim = (x1 - x0) * 2 + (z1 - z0) * 2;
    let p = t * perim;
    let x: number;
    let z: number;
    if (p < x1 - x0) [x, z] = [x0 + p, z0];
    else if ((p -= x1 - x0) < z1 - z0) [x, z] = [x1, z0 + p];
    else if ((p -= z1 - z0) < x1 - x0) [x, z] = [x1 - p, z1];
    else [x, z] = [x0, z1 - (p - (x1 - x0))];
    s.rbox(x - 0.09, fh * 0.6, z - 0.07, x + 0.09, fh, z + 0.07, vary(palette.stone, rnd, 1.4), 0.012);
  }
  if (stage === 1) {
    s.cylinder(x1 + 0.2, z1 + 0.05, 0.08, 0.09, 0, 0.09, vary(palette.wood, rnd, 0.5), 8);
    s.cylinder(x1 + 0.2, z1 + 0.05, 0.075, 0.075, 0.085, 0.09, 0xd8d2c4, 8);
    materials(s, w, d, o.delivered ?? {}, rnd);
    return s.build();
  }
  const top = fh + m.wallH;
  frame(s, x0, z0, x1, z1, fh, top, rnd);
  scaffold(s, x0, z0, x1, z1, top, rnd);
  if (stage >= 3) {
    // Walls going up to about half, rafters over the frame, and one slope already covered.
    s.box(
      x0 + 0.01,
      fh,
      z0 + 0.01,
      x1 - 0.01,
      fh + m.wallH * 0.45,
      z1 - 0.01,
      vary(palette.plasterCream, rnd, 0.5),
    );
    const ridge = top + m.rise;
    const along = m.alongX;
    const a0 = along ? x0 - 0.06 : z0 - 0.06;
    const a1 = along ? x1 + 0.06 : z1 + 0.06;
    const c0 = along ? z0 - 0.15 : x0 - 0.15;
    const c1 = along ? z1 + 0.15 : x1 + 0.15;
    const cm = m.shape === 'lean' ? c0 : (c0 + c1) / 2;
    const P = (a: number, y: number, c: number): V3 => (along ? [a, y, c] : [c, y, a]);
    const rafters = Math.max(3, Math.round((a1 - a0) / 0.3));
    for (let i = 0; i <= rafters; i++) {
      const a = a0 + ((a1 - a0) * i) / rafters;
      beam(s, P(a, top - 0.03, c1), P(a, ridge, cm), 0.018, vary(FRAME, rnd, 0.4));
      if (m.shape !== 'lean') beam(s, P(a, top - 0.03, c0), P(a, ridge, cm), 0.018, vary(FRAME, rnd, 0.4));
    }
    beam(s, P(a0, ridge, cm), P(a1, ridge, cm), 0.025, FRAME);
    roofPart(s, {
      shape: 'lean',
      material: 'tile',
      x0: along ? a0 : cm,
      z0: along ? cm : a0,
      x1: along ? a1 : c1,
      z1: along ? c1 : a1,
      y0: top - 0.02,
      y1: ridge + 0.01,
      color: vary(palette.roofTerracotta, rnd, 0.5),
      trim: palette.timber,
      ridgeAlongX: along,
      rnd,
    });
  }
  materials(s, w, d, o.delivered ?? {}, rnd);
  return s.build();
}
