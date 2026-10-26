// Small props that dress the hamlet buildings: barrels, benches, pots, hay bales, sawhorses,
// ladders, a chopping block, a scarecrow, a rowboat, drying racks, fences and dirt yards.
// All in kit-local coordinates on the ground (y is the base height).
import { vary, type ShapeBuilder, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam, cylX, cylZ, panel } from '../shapes';

export function barrel(s: ShapeBuilder, x: number, y: number, z: number, rnd: () => number, k = 1): void {
  const r = 0.07 * k;
  const h = 0.18 * k;
  const wood = vary(palette.wood, rnd);
  s.cylinder(x, z, r * 0.88, r, y, y + h / 2, wood, 8);
  s.cylinder(x, z, r, r * 0.88, y + h / 2, y + h, wood, 8);
  s.cylinder(x, z, r * 0.93, r * 0.95, y + h * 0.18, y + h * 0.24, palette.metal, 8);
  s.cylinder(x, z, r * 0.95, r * 0.93, y + h * 0.76, y + h * 0.82, palette.metal, 8);
}

export function bench(
  s: ShapeBuilder,
  x: number,
  z: number,
  alongX: boolean,
  rnd: () => number,
  hex = palette.wood,
): void {
  const wood = vary(hex, rnd, 0.6);
  const L = 0.2;
  const box = (a0: number, y0: number, c0: number, a1: number, y1: number, c1: number, c: number): void => {
    if (alongX) s.box(x + a0, y0, z + c0, x + a1, y1, z + c1, c);
    else s.box(x + c0, y0, z + a0, x + c1, y1, z + a1, c);
  };
  box(-L, 0.1, -0.05, L, 0.125, 0.05, wood);
  box(-L, 0.15, 0.04, L, 0.23, 0.06, wood);
  for (const a of [-L + 0.03, L - 0.05]) {
    box(a, 0, -0.045, a + 0.025, 0.1, 0.045, palette.timber);
    box(a, 0.1, 0.035, a + 0.025, 0.23, 0.06, palette.timber);
  }
}

export function flowerPot(
  s: ShapeBuilder,
  x: number,
  y: number,
  z: number,
  rnd: () => number,
  bloom?: number,
): void {
  s.cylinder(x, z, 0.04, 0.055, y, y + 0.07, vary(palette.roofTerracotta, rnd, 0.6), 6);
  s.blob(x, y + 0.095, z, 0.055, 0.045, 0.055, vary(palette.leaf, rnd), 0);
  const blooms = [palette.flowerA, palette.flowerB, palette.flowerC, palette.blossom];
  s.blob(x + 0.01, y + 0.125, z, 0.03, 0.022, 0.03, bloom ?? blooms[Math.floor(rnd() * blooms.length)]!, 0);
}

/** A square hay bale with two twine bands, lying along x or z. */
export function hayBale(
  s: ShapeBuilder,
  x: number,
  y: number,
  z: number,
  alongX: boolean,
  rnd: () => number,
): void {
  const hx = alongX ? 0.17 : 0.11;
  const hz = alongX ? 0.11 : 0.17;
  const c = vary(0xdcbc6a, rnd, 0.8);
  s.rbox(x - hx, y, z - hz, x + hx, y + 0.14, z + hz, c, 0.025);
  for (const t of [-0.07, 0.07]) {
    if (alongX)
      s.box(x + t - 0.008, y - 0.002, z - hz - 0.004, x + t + 0.008, y + 0.143, z + hz + 0.004, 0xb08c48);
    else s.box(x - hx - 0.004, y - 0.002, z + t - 0.008, x + hx + 0.004, y + 0.143, z + t + 0.008, 0xb08c48);
  }
}

export function sawhorse(s: ShapeBuilder, x: number, z: number, alongX: boolean, rnd: () => number): void {
  const wood = vary(palette.wood, rnd, 0.6);
  const L = 0.16;
  const P = (a: number, y: number, c: number): V3 => (alongX ? [x + a, y, z + c] : [x + c, y, z + a]);
  beam(s, P(-L, 0.2, 0), P(L, 0.2, 0), 0.02, wood);
  for (const a of [-L + 0.03, L - 0.03]) {
    beam(s, P(a, 0.19, 0), P(a, 0, -0.07), 0.012, palette.timber);
    beam(s, P(a, 0.19, 0), P(a, 0, 0.07), 0.012, palette.timber);
  }
}

export function ladder(s: ShapeBuilder, a: V3, b: V3, side: V3): void {
  const w = 0.07;
  const rail = (k: number): [V3, V3] => [
    [a[0] + side[0] * k, a[1], a[2] + side[2] * k],
    [b[0] + side[0] * k, b[1], b[2] + side[2] * k],
  ];
  const [l0, l1] = rail(-w);
  const [r0, r1] = rail(w);
  beam(s, l0, l1, 0.012, palette.wood);
  beam(s, r0, r1, 0.012, palette.wood);
  const n = 5;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = (q0: V3, q1: V3): V3 => [
      q0[0] + (q1[0] - q0[0]) * t,
      q0[1] + (q1[1] - q0[1]) * t,
      q0[2] + (q1[2] - q0[2]) * t,
    ];
    beam(s, p(l0, l1), p(r0, r1), 0.008, palette.wood);
  }
}

/** A stump with an axe bitten into it and a few split logs around. */
export function choppingBlock(s: ShapeBuilder, x: number, z: number, rnd: () => number): void {
  s.cylinder(x, z, 0.1, 0.09, 0, 0.16, vary(palette.bark, rnd, 0.5), 8);
  s.cylinder(x, z, 0.088, 0.088, 0.16, 0.165, 0xd9b98a, 8);
  // Axe: handle leaning, head buried in the top.
  beam(s, [x + 0.01, 0.17, z], [x + 0.17, 0.33, z + 0.04], 0.011, palette.wood);
  s.box(x - 0.03, 0.15, z - 0.012, x + 0.04, 0.2, z + 0.012, palette.metal);
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    const px = x + Math.cos(a) * 0.2;
    const pz = z + Math.sin(a) * 0.2;
    s.box(px - 0.05, 0, pz - 0.02, px + 0.05, 0.035, pz + 0.02, vary(0xd2ae78, rnd, 0.6));
  }
}

/** A scarecrow: a post and crossbar in an old coat with a straw hat. */
export function scarecrow(s: ShapeBuilder, x: number, z: number, coat: number): void {
  beam(s, [x, 0, z], [x, 0.62, z], 0.018, palette.timber);
  beam(s, [x - 0.2, 0.44, z], [x + 0.2, 0.44, z], 0.015, palette.timber);
  s.rbox(x - 0.09, 0.26, z - 0.05, x + 0.09, 0.47, z + 0.05, coat, 0.02);
  s.box(x - 0.2, 0.42, z - 0.035, x - 0.09, 0.47, z + 0.035, coat);
  s.box(x + 0.09, 0.42, z - 0.035, x + 0.2, 0.47, z + 0.035, coat);
  s.blob(x - 0.21, 0.44, z, 0.03, 0.025, 0.02, 0xdcbc6a, 0);
  s.blob(x + 0.21, 0.44, z, 0.03, 0.025, 0.02, 0xdcbc6a, 0);
  s.blob(x, 0.54, z, 0.07, 0.07, 0.065, 0xe8d6a8, 1);
  s.cylinder(x, z, 0.13, 0.13, 0.585, 0.6, 0xd9b96a, 10);
  s.cylinder(x, z, 0.065, 0.05, 0.6, 0.66, 0xd9b96a, 8);
  s.cylinder(x, z, 0.066, 0.066, 0.6, 0.62, palette.accentRed, 8);
}

/** A small rowboat resting on the ground, bow toward +z (or +x). */
export function rowboat(
  s: ShapeBuilder,
  x: number,
  y: number,
  z: number,
  alongX: boolean,
  hull: number,
  rnd: () => number,
): void {
  const L = 0.36;
  const W = 0.14;
  const P = (a: number, yy: number, c: number): V3 =>
    alongX ? [x + a, y + yy, z + c] : [x + c, y + yy, z + a];
  const stations = [-L, -L * 0.5, 0, L * 0.5, L];
  const widths = [0.6, 0.95, 1, 0.85, 0];
  const depth = 0.09;
  const inner = vary(palette.wood, rnd, 0.5);
  for (let i = 0; i < stations.length - 1; i++) {
    const a0 = stations[i]!;
    const a1 = stations[i + 1]!;
    const w0 = W * widths[i]!;
    const w1 = W * widths[i + 1]!;
    for (const side of [-1, 1]) {
      // Hull side from the gunwale down to the keel line.
      s.quad(
        P(a0, depth, side * w0),
        P(a1, depth, side * w1),
        P(a1, 0.01, side * w1 * 0.3),
        P(a0, 0.01, side * w0 * 0.3),
        hull,
        alongX ? [0, -0.2, side] : [side, -0.2, 0],
      );
      s.quad(
        P(a0, depth, side * w0),
        P(a1, depth, side * w1),
        P(a1, 0.02, side * w1 * 0.3),
        P(a0, 0.02, side * w0 * 0.3),
        inner,
        alongX ? [0, 1, -side] : [-side, 1, 0],
      );
      beam(s, P(a0, depth, side * w0), P(a1, depth, side * w1), 0.008, palette.white);
    }
  }
  // Transom and a thwart.
  s.quad(
    P(-L, depth, -W * 0.6),
    P(-L, depth, W * 0.6),
    P(-L, 0.01, W * 0.18),
    P(-L, 0.01, -W * 0.18),
    hull,
    alongX ? [-1, 0, 0] : [0, 0, -1],
  );
  beam(s, P(0, depth * 0.8, -W * 0.95), P(0, depth * 0.8, W * 0.95), 0.012, inner);
  // Oars resting inside.
  beam(s, P(-L * 0.6, depth * 0.9, -W * 0.3), P(L * 0.5, depth * 0.9, -W * 0.5), 0.008, palette.wood);
}

/** A frame with fish hanging to dry. */
export function dryingRack(
  s: ShapeBuilder,
  x: number,
  z: number,
  alongX: boolean,
  fish: number,
  rnd: () => number,
): void {
  const L = 0.32;
  const P = (a: number, y: number, c: number): V3 => (alongX ? [x + a, y, z + c] : [x + c, y, z + a]);
  for (const a of [-L, L]) {
    beam(s, P(a, 0, -0.06), P(a, 0.42, 0), 0.014, palette.timber);
    beam(s, P(a, 0, 0.06), P(a, 0.42, 0), 0.014, palette.timber);
  }
  beam(s, P(-L - 0.04, 0.4, 0), P(L + 0.04, 0.4, 0), 0.012, palette.wood);
  for (let i = 0; i < fish; i++) {
    const a = -L + 0.07 + ((2 * L - 0.14) * i) / Math.max(1, fish - 1);
    const c = P(a, 0.3, 0);
    s.blob(c[0], c[1], c[2], 0.022, 0.07, 0.014, vary(0x9fb4bd, rnd, 0.8), 0);
    beam(s, P(a, 0.37, 0), P(a, 0.4, 0), 0.003, 0xbfa27a);
  }
}

/** Two poles with a net draped between them, a few floats on the hem. */
export function netFrame(s: ShapeBuilder, x: number, z: number, alongX: boolean): void {
  const L = 0.24;
  const P = (a: number, y: number, c: number): V3 => (alongX ? [x + a, y, z + c] : [x + c, y, z + a]);
  for (const a of [-L, L]) beam(s, P(a, 0, 0), P(a, 0.46, 0), 0.014, palette.timber);
  beam(s, P(-L, 0.44, 0), P(L, 0.44, 0), 0.01, palette.timber);
  const net = 0x6f7f74;
  panel(
    s,
    P(-L + 0.02, 0.43, 0.004),
    P(L - 0.02, 0.43, 0.004),
    P(L - 0.06, 0.12, 0.03),
    P(-L + 0.06, 0.16, 0.03),
    net,
    vary(net, () => 0.3, 2),
  );
  for (const a of [-0.14, 0, 0.14]) {
    const c = P(a, 0.14 + Math.abs(a) * 0.1, 0.035);
    s.blob(c[0], c[1], c[2], 0.022, 0.022, 0.022, a === 0 ? palette.white : palette.accentRed, 0);
  }
}

/** A wicker fish trap. */
export function trap(s: ShapeBuilder, x: number, z: number, alongX: boolean): void {
  if (alongX) cylX(s, x - 0.1, x + 0.1, 0.06, z, 0.06, 0xa8794a, 6, 0x6b4a30);
  else cylZ(s, z - 0.1, z + 0.1, x, 0.06, 0.06, 0xa8794a, 6, 0x6b4a30);
}

export function birdBox(s: ShapeBuilder, x: number, z: number, hex: number): void {
  beam(s, [x, 0, z], [x, 0.55, z], 0.014, palette.timber);
  s.box(x - 0.05, 0.52, z - 0.045, x + 0.05, 0.64, z + 0.045, hex);
  s.gable(x - 0.065, z - 0.06, x + 0.065, z + 0.06, 0.64, 0.7, palette.roofTerracotta, false);
  s.box(x - 0.015, 0.575, z + 0.045, x + 0.015, 0.605, z + 0.05, palette.ink);
}

export function wateringCan(s: ShapeBuilder, x: number, y: number, z: number): void {
  s.cylinder(x, z, 0.035, 0.035, y, y + 0.06, palette.teal, 8);
  beam(s, [x + 0.03, y + 0.02, z], [x + 0.08, y + 0.07, z], 0.006, palette.teal);
  beam(s, [x - 0.02, y + 0.07, z], [x + 0.02, y + 0.07, z], 0.005, palette.teal);
}

/** A flat ground patch (packed earth, gravel, chips), drawn just above the grass. */
export function groundPatch(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  hex: number,
  rnd: () => number,
): void {
  const y = 0.006;
  const r = 0.12;
  // A softened rectangle: corners cut so the patch does not look like a rug.
  const pts: V3[] = [
    [x0 + r, y, z0],
    [x1 - r, y, z0],
    [x1, y, z0 + r],
    [x1, y, z1 - r],
    [x1 - r, y, z1],
    [x0 + r, y, z1],
    [x0, y, z1 - r],
    [x0, y, z0 + r],
  ];
  const c: V3 = [(x0 + x1) / 2, y, (z0 + z1) / 2];
  for (let i = 0; i < pts.length; i++)
    s.tri(c, pts[i]!, pts[(i + 1) % pts.length]!, vary(hex, rnd, 0.4), [0, 1, 0]);
}

/** A woven wattle fence along a line: stakes and two woven rails. */
export function wattle(s: ShapeBuilder, a: [number, number], b: [number, number], rnd: () => number): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  const n = Math.max(2, Math.round(len / 0.25));
  const hex = vary(0x9a7a52, rnd, 0.5);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + dx * t;
    const z = a[1] + dz * t;
    beam(s, [x, 0, z], [x, 0.2, z], 0.012, palette.timber);
  }
  for (const y of [0.08, 0.15]) beam(s, [a[0], y, a[1]], [b[0], y, b[1]], 0.022, hex);
}

/** A picket fence run (low, painted). */
export function picket(s: ShapeBuilder, a: [number, number], b: [number, number], hex: number): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  const n = Math.max(2, Math.round(len / 0.1));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    beam(s, [a[0] + dx * t, 0, a[1] + dz * t], [a[0] + dx * t, 0.2, a[1] + dz * t], 0.012, hex);
  }
  beam(s, [a[0], 0.14, a[1]], [b[0], 0.14, b[1]], 0.01, hex);
}

/** A sapling in the nursery: a stem and a small cone or puff of leaves. */
export function sapling(
  s: ShapeBuilder,
  x: number,
  z: number,
  h: number,
  rnd: () => number,
  pine: boolean,
): void {
  beam(s, [x, 0.04, z], [x, 0.04 + h * 0.5, z], 0.006, palette.bark);
  if (pine) s.cylinder(x, z, h * 0.32, 0, 0.04 + h * 0.25, 0.04 + h, vary(palette.pine, rnd, 0.8), 5);
  else s.blob(x, 0.04 + h * 0.7, z, h * 0.3, h * 0.32, h * 0.3, vary(palette.birchLeaf, rnd, 0.8), 0);
}

/** A rooster weathervane on a short spike. */
export function weathervane(s: ShapeBuilder, x: number, y: number, z: number): void {
  beam(s, [x, y, z], [x, y + 0.26, z], 0.008, palette.metal);
  beam(s, [x - 0.07, y + 0.16, z], [x + 0.07, y + 0.16, z], 0.004, palette.metal);
  beam(s, [x, y + 0.16, z - 0.07], [x, y + 0.16, z + 0.07], 0.004, palette.metal);
  const c = palette.ink;
  panel(
    s,
    [x - 0.06, y + 0.24, z],
    [x + 0.04, y + 0.24, z],
    [x + 0.05, y + 0.33, z],
    [x - 0.02, y + 0.31, z],
    c,
  );
  panel(
    s,
    [x + 0.03, y + 0.3, z],
    [x + 0.06, y + 0.3, z],
    [x + 0.07, y + 0.36, z],
    [x + 0.04, y + 0.37, z],
    c,
  );
  panel(
    s,
    [x - 0.06, y + 0.24, z],
    [x - 0.03, y + 0.27, z],
    [x - 0.08, y + 0.35, z],
    [x - 0.1, y + 0.3, z],
    c,
  );
}

/** A lantern on a wall bracket; returns the flame position for night lights. */
export function wallLantern(s: ShapeBuilder, p: V3, out: V3): V3 {
  const q: V3 = [p[0] + out[0] * 0.1, p[1], p[2] + out[2] * 0.1];
  beam(s, p, q, 0.008, palette.metal);
  s.box(q[0] - 0.035, q[1] - 0.12, q[2] - 0.035, q[0] + 0.035, q[1] - 0.105, q[2] + 0.035, palette.metal);
  s.glow(1);
  s.box(q[0] - 0.028, q[1] - 0.105, q[2] - 0.028, q[0] + 0.028, q[1] - 0.03, q[2] + 0.028, palette.lantern);
  s.glow(0);
  s.cylinder(q[0], q[2], 0.05, 0, q[1] - 0.03, q[1] + 0.01, palette.metal, 4, Math.PI / 4);
  return [q[0], q[1] - 0.07, q[2]];
}

/** Split firewood stacked against something, along x or z. */
export function firewood(
  s: ShapeBuilder,
  x: number,
  z: number,
  alongX: boolean,
  rows: number,
  rnd: () => number,
): void {
  const r = 0.035;
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < 6; i++) {
      const a = -0.2 + i * 0.075 + (row % 2) * 0.035;
      const y = r + row * r * 1.8;
      if (alongX)
        cylZ(s, z - 0.09, z + 0.09, x + a, y, r, vary(palette.bark, rnd, 0.8), 5, vary(0xd9b98a, rnd, 0.5));
      else
        cylX(s, x - 0.09, x + 0.09, y, z + a, r, vary(palette.bark, rnd, 0.8), 5, vary(0xd9b98a, rnd, 0.5));
    }
  }
}

export function milkChurn(s: ShapeBuilder, x: number, z: number): void {
  s.cylinder(x, z, 0.045, 0.045, 0, 0.12, 0xb9bdc0, 8);
  s.cylinder(x, z, 0.045, 0.025, 0.12, 0.15, 0xb9bdc0, 8);
  s.cylinder(x, z, 0.03, 0.03, 0.15, 0.17, 0x8d9296, 8);
}
