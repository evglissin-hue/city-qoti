// C5E: the Watch's defenses (docs/spec/14-challenge.md, Defenses), storybook rather than grim: a
// palisade of pointed logs, a dry stone wall (with ivy or a flower box when fitted), a gate under a
// little shingle cap with a lantern on each post, a log watchtower, the Watch House, a bell tower,
// a net trap and a pit trap. Wall pieces join the wall pieces beside them (params `wx-`, `wx+`,
// `wz-`, `wz+`, kit-local); damage (`dmg` 1 chipped, 2 breached, 3 down) shows as broken logs or
// fallen stones, with fresh timber or stone stacked ready for the builders to mend it; a gate is
// shut with `open: false`; a sprung trap has `sprung`. Both levels from one code path.
import { seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam } from '../shapes';
import { SURFACE } from '../surface';
import { shell, windowRow, windowStyle, type Built } from './buildings';
import { ivyPart } from './details';
import { chimneyPart, doorPart, faceBox, facePoint, hangingSign, kitBuilder, type Face } from './parts';
import { wallLantern } from './props';
import { customOf, streams, FLOWERS } from './style';
import type { Kit, KitAnchors, KitBuildOptions } from './types';

const IRON = 0x4b4f55;
const LOG = 0x8a6440;
const FRESH = 0xd9b98a;
const ROPE = 0xc9b07a;

/** Directions a wall piece runs from its middle, kit-local: [dx, dz]. */
const DIRS: readonly [string, number, number][] = [
  ['wx-', -1, 0],
  ['wx+', 1, 0],
  ['wz-', 0, -1],
  ['wz+', 0, 1],
];

/** The arms of a wall piece: the joined sides, or a straight run along x when it stands alone. */
function armsOf(opts: KitBuildOptions | undefined): [number, number][] {
  const p = opts?.params ?? {};
  const arms = DIRS.filter(([k]) => p[k] === true).map(([, dx, dz]) => [dx, dz] as [number, number]);
  if (arms.length === 0)
    return [
      [-1, 0],
      [1, 0],
    ];
  // A piece joined on one side only still reaches across its tile, so a run ends on a full piece.
  if (arms.length === 1) arms.push([-arms[0]![0], -arms[0]![1]]);
  return arms;
}

function damageOf(opts: KitBuildOptions | undefined): number {
  const d = Number(opts?.params?.dmg ?? 0);
  return d >= 1 && d <= 3 ? Math.floor(d) : 0;
}

/** A point `t` (0 at the middle, 1 at the edge) along an arm, `side` across it. */
function along(arm: [number, number], t: number, side = 0): [number, number] {
  return [0.5 + arm[0] * 0.5 * t - arm[1] * side, 0.5 + arm[1] * 0.5 * t + arm[0] * side];
}

/** Fresh timber or dressed stone stacked by a damaged piece, ready for mending. */
function mendingPile(s: ShapeBuilder, stone: boolean, rnd: () => number): void {
  s.nearOnly(() => {
    const x = 0.2 + rnd() * 0.1;
    const z = 0.8 + rnd() * 0.08;
    if (stone) {
      for (let i = 0; i < 4; i++) {
        const ox = (i % 2) * 0.09;
        const oy = Math.floor(i / 2) * 0.045;
        s.surface(SURFACE.stone);
        s.rbox(
          x + ox - 0.04,
          oy,
          z - 0.035,
          x + ox + 0.04,
          oy + 0.045,
          z + 0.035,
          vary(0xd8d0c0, rnd, 0.8),
          0.01,
        );
      }
    } else {
      s.surface(SURFACE.timber);
      for (let i = 0; i < 3; i++) {
        const y = 0.025 + (i === 2 ? 0.045 : 0);
        const zz = z - 0.03 + (i === 2 ? 0.025 : i * 0.05);
        beam(s, [x - 0.12, y, zz], [x + 0.12, y, zz], 0.022, vary(FRESH, rnd, 0.5));
      }
      // The mallet, waiting.
      beam(s, [x + 0.16, 0.012, z + 0.02], [x + 0.26, 0.012, z - 0.04], 0.008, palette.wood);
      s.box(x + 0.14, 0, z - 0.0, x + 0.19, 0.04, z + 0.05, palette.darkWood);
    }
    s.surface(SURFACE.plain);
  });
}

// --- Palisade -----------------------------------------------------------------------------------

function palisade(opts: KitBuildOptions | undefined): Built {
  const rnd = seeded(opts?.seed ?? 31);
  const s = kitBuilder(opts);
  const dmg = damageOf(opts);
  const arms = armsOf(opts);
  const H = 0.62;
  s.surface(SURFACE.timber);
  // The middle post, a little taller, with a rope lashing.
  const postH = H + 0.06;
  s.levels(
    () => {
      s.cylinder(0.5, 0.5, 0.065, 0.06, 0, postH, vary(LOG, rnd, 0.5), 7);
      s.cylinder(0.5, 0.5, 0.06, 0, postH, postH + 0.09, vary(FRESH, rnd, 0.4), 7);
      s.cylinder(0.5, 0.5, 0.068, 0.068, H - 0.16, H - 0.12, ROPE, 7);
    },
    () => {
      s.box(0.44, 0, 0.44, 0.56, postH, 0.56, LOG);
    },
  );
  for (const arm of arms) {
    const n = 4;
    // Which logs are broken, by damage: one snapped short, then a gap, then most of the arm down.
    const broken = dmg >= 1 ? 1 + Math.floor(rnd() * (n - 1)) : -1;
    s.levels(
      () => {
        for (let i = 0; i < n; i++) {
          const t = (i + 0.75) / n;
          const [x, z] = along(arm, t);
          const h = H - 0.04 + (rnd() - 0.5) * 0.08;
          const r = 0.052 + rnd() * 0.01;
          const wood = vary(LOG, rnd, 0.7);
          let top = h;
          if (dmg >= 3 && i > 0) top = 0.08 + rnd() * 0.06;
          else if (dmg >= 2 && (i === broken || i === broken - 1)) top = i === broken ? 0 : 0.18;
          else if (dmg >= 1 && i === broken) top = h * 0.55;
          if (top > 0) {
            s.cylinder(x, z, r, r * 0.92, 0, top, wood, 6);
            if (top === h) s.cylinder(x, z, r * 0.92, 0, top, top + 0.1, vary(FRESH, rnd, 0.5), 6);
            else s.cylinder(x, z, r * 0.92, r * 0.5, top, top + 0.03, FRESH, 6);
          }
          if (top < h && (dmg >= 2 || i === broken)) {
            // The fallen piece lies beside its stump.
            const [fx, fz] = along(arm, t, 0.12 + rnd() * 0.06);
            const [tx, tz] = along(arm, t - 0.15, 0.12 + (h - top) * 0.8);
            beam(s, [fx, r, fz], [tx, r * 0.8, tz], r * 0.85, wood);
          }
        }
        // Two lashed rails on the inner (z-) face.
        if (dmg < 3)
          for (const y of [0.18, H - 0.14]) {
            const [ax, az] = along(arm, 0.05, -0.065);
            const [bx, bz] = along(arm, dmg >= 2 ? 0.45 : 1, -0.065);
            beam(s, [ax, y, az], [bx, y, bz], 0.018, vary(palette.wood, rnd, 0.5));
          }
      },
      () => {
        const top = dmg >= 3 ? 0.14 : dmg >= 2 ? H * 0.6 : H;
        const [ax, az] = along(arm, 0.18, 0);
        const [bx, bz] = along(arm, 1, 0);
        s.box(
          Math.min(ax, bx) - Math.abs(arm[1]) * 0.055,
          0,
          Math.min(az, bz) - Math.abs(arm[0]) * 0.055,
          Math.max(ax, bx) + Math.abs(arm[1]) * 0.055,
          top,
          Math.max(az, bz) + Math.abs(arm[0]) * 0.055,
          LOG,
        );
        if (dmg < 3) {
          // A row of points along the top, as two long teeth.
          for (const t of [0.4, 0.8]) {
            const [x, z] = along(arm, t);
            s.cylinder(x, z, 0.08, 0, top, top + 0.1, FRESH, 4, Math.PI / 4);
          }
        }
      },
    );
  }
  s.surface(SURFACE.plain);
  if (dmg > 0) mendingPile(s, false, rnd);
  return { s, anchors: {} };
}

// --- Stone wall ---------------------------------------------------------------------------------

/** Modules fitted on a building, from its params (`mod:<slot>` is the module id). */
export function moduleIn(opts: KitBuildOptions | undefined, slot: string): string | undefined {
  const v = opts?.params?.[`mod:${slot}`];
  return typeof v === 'string' ? v : undefined;
}

function stoneWall(opts: KitBuildOptions | undefined): Built {
  const rnd = seeded(opts?.seed ?? 37);
  const s = kitBuilder(opts);
  const dmg = damageOf(opts);
  const arms = armsOf(opts);
  const H = 0.5;
  const T = 0.11;
  const tone = vary(0xc4bcab, rnd, 0.5);
  const mod = moduleIn(opts, 'wall');
  // The middle: a pier with a capstone.
  s.surface(SURFACE.stone);
  s.rbox(0.5 - T - 0.02, 0, 0.5 - T - 0.02, 0.5 + T + 0.02, H + 0.04, 0.5 + T + 0.02, tone, 0.02);
  s.rbox(
    0.5 - T - 0.04,
    H + 0.04,
    0.5 - T - 0.04,
    0.5 + T + 0.04,
    H + 0.09,
    0.5 + T + 0.04,
    vary(palette.foundation, rnd, 0.5),
    0.02,
  );
  for (const arm of arms) {
    const gap = dmg >= 2 ? 0.45 + rnd() * 0.25 : 2;
    const box = (t0: number, t1: number, y0: number, y1: number, half: number, hex: number, b = 0.015) => {
      const [ax, az] = along(arm, t0);
      const [bx, bz] = along(arm, t1);
      s.rbox(
        Math.min(ax, bx) - Math.abs(arm[1]) * half,
        y0,
        Math.min(az, bz) - Math.abs(arm[0]) * half,
        Math.max(ax, bx) + Math.abs(arm[1]) * half,
        y1,
        Math.max(az, bz) + Math.abs(arm[0]) * half,
        hex,
        b,
      );
    };
    s.levels(
      () => {
        // Courses of chunky stones, staggered, the top course broken where the wall is damaged.
        const courses = 4;
        for (let c = 0; c < courses; c++) {
          const y0 = (c * H) / courses;
          const y1 = ((c + 1) * H) / courses;
          if (dmg >= 3 && c >= 1) break;
          let t = 0.2 + (c % 2) * 0.12;
          if (c % 2) box(0.2, t, y0, y1, T, vary(tone, rnd, 1.6));
          while (t < 1 - 0.001) {
            const len = Math.min(1 - t, 0.22 + rnd() * 0.08);
            const hole =
              (dmg >= 2 && c >= 1 && t + len > gap - 0.15 && t < gap + 0.1) ||
              (dmg === 1 && c === courses - 1 && rnd() < 0.35);
            if (!hole) box(t + 0.006, t + len - 0.006, y0, y1, T, vary(tone, rnd, 1.6));
            t += len;
          }
        }
        // The coping: flat stones on edge.
        if (dmg < 2) box(0.2, 1, H, H + 0.05, T + 0.02, vary(palette.foundation, rnd, 0.5), 0.02);
        else if (dmg === 2)
          box(0.2, gap - 0.2, H, H + 0.05, T + 0.02, vary(palette.foundation, rnd, 0.5), 0.02);
        if (dmg >= 2) {
          // Tumbled stones at its foot.
          for (let i = 0; i < 5; i++) {
            const [x, z] = along(
              arm,
              Math.min(0.95, gap - 0.1 + rnd() * 0.3),
              (rnd() < 0.5 ? -1 : 1) * (0.16 + rnd() * 0.1),
            );
            s.rbox(x - 0.04, 0, z - 0.035, x + 0.04, 0.05, z + 0.035, vary(tone, rnd, 1.4), 0.012);
          }
        }
      },
      () => {
        const top = dmg >= 3 ? H / 4 : dmg >= 2 ? H * 0.7 : H + 0.04;
        box(0.2, 1, 0, top, T, tone, 0.02);
      },
    );
  }
  // Modules: ivy over the stones, or a box of flowers on the coping.
  if (mod === 'ivy' && dmg < 3) {
    const arm = arms[0]!;
    const f: Face = arm[0] !== 0 ? { dir: 'z+', plane: 0.5 + T } : { dir: 'x+', plane: 0.5 + T };
    const u0 = arm[0] !== 0 ? 0.1 : 0.1;
    ivyPart(s, f, u0, 0.9, H, rnd);
  } else if (mod === 'flower-boxes' && dmg < 2) {
    s.detail(() => {
      for (const arm of arms) {
        const [ax, az] = along(arm, 0.35);
        const [bx, bz] = along(arm, 0.9);
        const x0 = Math.min(ax, bx) - Math.abs(arm[1]) * 0.07;
        const x1 = Math.max(ax, bx) + Math.abs(arm[1]) * 0.07;
        const z0 = Math.min(az, bz) - Math.abs(arm[0]) * 0.07;
        const z1 = Math.max(az, bz) + Math.abs(arm[0]) * 0.07;
        s.surface(SURFACE.timber);
        s.box(x0, H + 0.05, z0, x1, H + 0.12, z1, vary(palette.wood, rnd, 0.5));
        s.surface(SURFACE.leaf);
        s.blob(
          (x0 + x1) / 2,
          H + 0.14,
          (z0 + z1) / 2,
          (x1 - x0) / 2,
          0.05,
          (z1 - z0) / 2,
          vary(palette.leaf, rnd),
          1,
          rnd,
          0.1,
        );
        s.surface(SURFACE.flowers);
        for (let i = 0; i < 4; i++) {
          const k = (i + 0.5) / 4;
          s.blob(
            x0 + (x1 - x0) * k,
            H + 0.18,
            z0 + (z1 - z0) * k,
            0.03,
            0.025,
            0.03,
            FLOWERS[Math.floor(rnd() * FLOWERS.length)]!,
            0,
          );
        }
      }
    });
  }
  s.surface(SURFACE.plain);
  if (dmg > 0) mendingPile(s, true, rnd);
  return { s, anchors: {} };
}

// --- Gate ---------------------------------------------------------------------------------------

function gateKit(opts: KitBuildOptions | undefined): Built {
  const rnd = seeded(opts?.seed ?? 41);
  const s = kitBuilder(opts);
  const dmg = damageOf(opts);
  const open = opts?.params?.open !== false;
  const lights: V3[] = [];
  const wood = vary(palette.wood, rnd, 0.6);
  const paint = vary([0x5f7a52, 0x8a4f43, 0x4e6f86][Math.floor(rnd() * 3)]!, rnd, 0.4);
  const P = 0.085;
  const H = 0.82;
  // Two stout posts on stone footings.
  for (const x of [0.07, 0.93]) {
    s.surface(SURFACE.stone);
    s.rbox(
      x - P - 0.02,
      0,
      0.5 - P - 0.02,
      x + P + 0.02,
      0.12,
      0.5 + P + 0.02,
      vary(palette.stone, rnd, 0.6),
      0.02,
    );
    s.surface(SURFACE.timber);
    s.rbox(x - P, 0.12, 0.5 - P, x + P, H, 0.5 + P, vary(LOG, rnd, 0.5), 0.015);
  }
  // A beam across with a little shingle cap: a lychgate for the valley's front door.
  s.surface(SURFACE.timber);
  s.box(-0.02, H, 0.5 - 0.06, 1.02, H + 0.08, 0.5 + 0.06, palette.timber);
  s.surface(SURFACE.tile);
  s.gable(
    -0.08,
    0.5 - 0.22,
    1.08,
    0.5 + 0.22,
    H + 0.08,
    H + 0.26,
    vary(palette.roofTerracotta, rnd, 0.5),
    true,
  );
  s.surface(SURFACE.timber);
  // The leaves: planked, braced, painted; open they swing in to rest against the posts.
  const leaf = (hinge: number, dir: number): void => {
    const L = 0.4;
    const y0 = 0.08;
    const y1 = 0.6 - (dmg >= 2 ? 0.12 : 0);
    if (dmg >= 3 && dir > 0) return;
    if (open) {
      const x = hinge + dir * 0.04;
      s.box(x - 0.02, y0, 0.5 - 0.02 - L, x + 0.02, y1, 0.5 - 0.02, paint);
      s.nearOnly(() =>
        beam(
          s,
          [x + dir * 0.025, y0 + 0.05, 0.5 - 0.05],
          [x + dir * 0.025, y1 - 0.05, 0.5 - L + 0.02],
          0.012,
          wood,
        ),
      );
    } else {
      const x0 = Math.min(hinge + dir * 0.02, hinge + dir * (0.02 + L));
      const x1 = Math.max(hinge + dir * 0.02, hinge + dir * (0.02 + L));
      s.box(x0, y0, 0.48, x1, y1, 0.52, paint);
      s.nearOnly(() => {
        for (const y of [y0 + 0.08, y1 - 0.08]) s.box(x0, y - 0.02, 0.52, x1, y + 0.02, 0.535, wood);
        beam(s, [x0 + 0.02, y0 + 0.08, 0.535], [x1 - 0.02, y1 - 0.08, 0.535], 0.012, wood);
        s.box(x0, y0 + 0.2, 0.465, x1, y0 + 0.24, 0.48, wood);
      });
    }
  };
  leaf(0.07 + P, 1);
  leaf(0.93 - P, -1);
  if (!open && dmg < 3) {
    // The bar across, dropped into its brackets.
    s.nearOnly(() => s.box(0.12, 0.33, 0.45, 0.88, 0.37, 0.47, palette.darkWood));
  }
  // A lantern on each post, lit every night: the gate reads from afar after dark.
  for (const x of [0.07, 0.93]) lights.push(wallLantern(s, [x, 0.66, 0.5 + P], [0, 0, 1]));
  s.surface(SURFACE.plain);
  if (dmg > 0) mendingPile(s, false, rnd);
  return { s, anchors: { lights } };
}

// --- Watchtower ---------------------------------------------------------------------------------

function watchtower(opts: KitBuildOptions | undefined): Built {
  const rnd = seeded(opts?.seed ?? 43);
  const s = kitBuilder(opts);
  const lights: V3[] = [];
  const logs = vary(LOG, rnd, 0.5);
  const deck = 1.55;
  const a = 0.14;
  const b = 0.86;
  const ta = 0.24;
  const tb = 0.76;
  s.surface(SURFACE.stone);
  for (const [x, z] of [
    [a, a],
    [b, a],
    [a, b],
    [b, b],
  ] as const)
    s.rbox(x - 0.07, 0, z - 0.07, x + 0.07, 0.08, z + 0.07, vary(palette.stone, rnd, 0.6), 0.015);
  s.surface(SURFACE.timber);
  // Four splayed legs, cross braces on two levels.
  const legs: [V3, V3][] = [
    [
      [a, 0.08, a],
      [ta, deck, ta],
    ],
    [
      [b, 0.08, a],
      [tb, deck, ta],
    ],
    [
      [a, 0.08, b],
      [ta, deck, tb],
    ],
    [
      [b, 0.08, b],
      [tb, deck, tb],
    ],
  ];
  for (const [p, q] of legs) beam(s, p, q, 0.045, logs);
  s.detail(() => {
    const at = (leg: [V3, V3], t: number): V3 => [
      leg[0][0] + (leg[1][0] - leg[0][0]) * t,
      leg[0][1] + (leg[1][1] - leg[0][1]) * t,
      leg[0][2] + (leg[1][2] - leg[0][2]) * t,
    ];
    for (const [i, j] of [
      [0, 1],
      [2, 3],
      [0, 2],
      [1, 3],
    ] as const) {
      beam(s, at(legs[i]!, 0.1), at(legs[j]!, 0.55), 0.018, vary(palette.wood, rnd, 0.5));
      beam(s, at(legs[j]!, 0.1), at(legs[i]!, 0.55), 0.018, vary(palette.wood, rnd, 0.5));
      beam(s, at(legs[i]!, 0.55), at(legs[j]!, 0.55), 0.02, logs);
    }
    // A ladder up the front.
    const lz = 0.92;
    for (const x of [0.42, 0.58]) beam(s, [x, 0, lz], [x, deck, tb + 0.04], 0.014, palette.wood);
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const z = lz + (tb + 0.04 - lz) * t;
      s.box(0.42, deck * t - 0.008, z - 0.008, 0.58, deck * t + 0.008, z + 0.008, palette.darkWood);
    }
  });
  // The deck, a waist-high railing of planks, corner posts and a pointed roof.
  const d0 = 0.12;
  const d1 = 0.88;
  s.rbox(d0, deck, d0, d1, deck + 0.06, d1, vary(palette.wood, rnd, 0.5), 0.01);
  const rail = 0.24;
  s.levels(
    () => {
      for (const [x0, z0, x1, z1] of [
        [d0, d0, d1, d0 + 0.03],
        [d0, d1 - 0.03, 0.4, d1],
        [0.6, d1 - 0.03, d1, d1],
        [d0, d0, d0 + 0.03, d1],
        [d1 - 0.03, d0, d1, d1],
      ] as const) {
        s.box(x0, deck + 0.06, z0, x1, deck + 0.06 + rail, z1, vary(palette.wood, rnd, 0.7));
      }
    },
    () => {
      s.box(d0, deck + 0.06, d0, d1, deck + 0.06 + rail, d1, palette.wood);
    },
  );
  const roofY = deck + 0.62;
  for (const [x, z] of [
    [d0 + 0.03, d0 + 0.03],
    [d1 - 0.03, d0 + 0.03],
    [d0 + 0.03, d1 - 0.03],
    [d1 - 0.03, d1 - 0.03],
  ] as const)
    beam(s, [x, deck + 0.06, z], [x, roofY, z], 0.022, logs);
  s.surface(SURFACE.thatch);
  s.cylinder(0.5, 0.5, 0.54, 0, roofY, roofY + 0.42, vary(palette.roofThatch, rnd, 0.5), 8, Math.PI / 8);
  s.surface(SURFACE.timber);
  // A pennant on a staff (static: no shadow worth a moving layer), and a lantern for the night watch.
  s.detail(() => {
    beam(s, [0.5, roofY + 0.38, 0.5], [0.5, roofY + 0.62, 0.5], 0.01, palette.darkWood);
    s.surface(SURFACE.plain);
    s.tri(
      [0.5, roofY + 0.6, 0.5],
      [0.5, roofY + 0.5, 0.5],
      [0.72, roofY + 0.56, 0.5],
      palette.mustard,
      [0, 0, 1],
    );
    s.tri(
      [0.5, roofY + 0.6, 0.5],
      [0.5, roofY + 0.5, 0.5],
      [0.72, roofY + 0.56, 0.5],
      palette.mustard,
      [0, 0, -1],
    );
  });
  lights.push(wallLantern(s, [0.5, deck + 0.5, d1 - 0.03], [0, 0, 1]));
  s.surface(SURFACE.plain);
  return { s, anchors: { lights } };
}

// --- Bell tower ---------------------------------------------------------------------------------

function bellTower(opts: KitBuildOptions | undefined): Built {
  const rnd = seeded(opts?.seed ?? 47);
  const s = kitBuilder(opts);
  const lights: V3[] = [];
  const tone = vary(0xc9c0ae, rnd, 0.5);
  // A stone base with a little arched door, a timber belfry open on four sides, a pyramid roof.
  s.surface(SURFACE.stone);
  s.jitter(0.03);
  s.rbox(0.18, 0, 0.18, 0.82, 1.0, 0.82, tone, 0.02);
  s.jitter(0);
  s.rbox(0.15, 0.98, 0.15, 0.85, 1.05, 0.85, vary(palette.foundation, rnd, 0.5), 0.015);
  const front: Face = { dir: 'z+', plane: 0.82 };
  doorPart(s, front, 0.5, 0.2, 0.42, vary(0x6e4a2e, rnd, 0.4), palette.stone, 'arched', 0.005);
  s.surface(SURFACE.timber);
  const top = 1.55;
  for (const [x, z] of [
    [0.2, 0.2],
    [0.8, 0.2],
    [0.2, 0.8],
    [0.8, 0.8],
  ] as const)
    s.box(x - 0.035, 1.05, z - 0.035, x + 0.035, top, z + 0.035, palette.timber);
  s.nearOnly(() => {
    for (const z of [0.2, 0.8]) s.box(0.2, 1.12, z - 0.02, 0.8, 1.16, z + 0.02, palette.timber);
    for (const x of [0.2, 0.8]) s.box(x - 0.02, 1.12, 0.2, x + 0.02, 1.16, 0.8, palette.timber);
  });
  s.box(0.16, top, 0.16, 0.84, top + 0.05, 0.84, palette.timber);
  // The bell on its headstock.
  s.box(0.24, top - 0.08, 0.47, 0.76, top - 0.04, 0.53, palette.darkWood);
  s.surface(SURFACE.zinc);
  s.cylinder(0.5, 0.5, 0.13, 0.07, 1.2, 1.4, 0xc8963e, 10);
  s.cylinder(0.5, 0.5, 0.07, 0.03, 1.4, top - 0.08, 0xb07f30, 10);
  s.surface(SURFACE.slate);
  s.cylinder(0.5, 0.5, 0.5, 0, top + 0.05, top + 0.55, vary(palette.roofSlate, rnd, 0.5), 4, Math.PI / 4);
  s.surface(SURFACE.plain);
  s.detail(() => {
    // A weathercock, and the rope hanging down to the door.
    beam(s, [0.5, top + 0.5, 0.5], [0.5, top + 0.7, 0.5], 0.008, IRON);
    s.blob(0.5, top + 0.68, 0.5, 0.05, 0.03, 0.012, IRON, 0);
    beam(s, [0.56, 1.2, 0.5], [0.56, 0.98, 0.83], 0.006, ROPE);
  });
  lights.push(wallLantern(s, facePoint(front, 0.72, 0.62, 0), [0, 0, 1]));
  return { s, anchors: { lights } };
}

// --- Watch House --------------------------------------------------------------------------------

function watchHouse(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const { rnd, look } = streams(opts, 53);
  const c = customOf(opts);
  const s = kitBuilder(opts);
  const anchors: KitAnchors = { smoke: [], lights: [] };
  const x0 = 0.22;
  const x1 = w - 0.22;
  const z0 = 0.25;
  const z1 = d - 0.5;
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.1,
    wallH: 1.05,
    wall: 'stone',
    wallColor: c.wall ?? vary(0xcfc6b2, rnd, 0.4),
    trim: palette.timber,
    upper: { at: 0.55, wall: 'timber', color: vary(palette.plasterCream, rnd, 0.4), jetty: 0.06 },
    roof: {
      shape: 'hip',
      material: c.roofMaterial ?? 'slate',
      color: vary(c.roof ?? palette.roofSlate, rnd, 0.5),
      rise: 0.7,
      overhang: 0.18,
      ridgeAlongX: true,
    },
    rnd,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = (opts?.entrance?.[0] ?? 0) + 0.5;
  const accent = c.accent ?? 0x45607a;
  doorPart(s, front, doorU, 0.28, 0.48, accent, palette.timber, 'plank', 0.012);
  const style = windowStyle(c, accent, { box: false, shutters: true });
  windowRow(s, front, x0, x1, 0.92, style, rnd, anchors.lights!, [doorU], 0.55, [0.18, 0.2], 0.06);
  windowRow(
    s,
    { dir: 'x+', plane: x1 },
    z0,
    z1,
    0.92,
    style,
    rnd,
    anchors.lights!,
    [],
    0.6,
    [0.18, 0.2],
    0.06,
  );
  windowRow(
    s,
    { dir: 'x-', plane: x0 },
    z0,
    z1,
    0.92,
    style,
    rnd,
    anchors.lights!,
    [],
    0.6,
    [0.18, 0.2],
    0.06,
  );
  // A shield over the door: a blue field with a gold lantern on it.
  s.detail(() => {
    const p = facePoint(front, doorU, 0.66, 0.02);
    faceBox(s, front, doorU - 0.09, 0.58, 0.012, doorU + 0.09, 0.74, 0.03, palette.navy);
    s.glow(0);
    s.blob(p[0], 0.66, p[2] + 0.02, 0.03, 0.045, 0.012, palette.mustard, 0);
    // The notice board for duty rotas, and a rack of staffs and nets.
    const nu = doorU < w / 2 ? doorU + 0.42 : doorU - 0.42;
    faceBox(s, front, nu - 0.15, 0.2, 0.012, nu + 0.15, 0.44, 0.03, palette.darkWood);
    for (let i = 0; i < 4; i++) {
      const u = nu - 0.11 + (i % 2) * 0.12 + rnd() * 0.02;
      const y = 0.26 + Math.floor(i / 2) * 0.09;
      faceBox(s, front, u, y, 0.03, u + 0.08, y + 0.07, 0.035, vary(palette.paper, rnd, 0.3));
    }
    const ru = doorU < w / 2 ? x1 - 0.12 : x0 + 0.12;
    const rz = z1 + 0.08;
    s.box(ru - 0.14, 0.32, rz - 0.01, ru + 0.14, 0.35, rz + 0.03, palette.timber);
    for (let i = 0; i < 4; i++) {
      const x = ru - 0.11 + i * 0.07;
      beam(s, [x, 0.02, rz + 0.04], [x + 0.01, 0.5, rz], 0.01, vary(palette.wood, rnd, 0.6));
    }
    s.blob(ru + 0.2, 0.08, rz + 0.06, 0.07, 0.07, 0.05, vary(ROPE, rnd, 0.4), 1, rnd, 0.15);
    // A bench by the door for whoever is on duty.
    const bu = doorU < w / 2 ? doorU + 0.4 : doorU - 0.4;
    s.box(bu - 0.16, 0.1, z1 + 0.08, bu + 0.16, 0.12, z1 + 0.16, palette.wood);
    for (const k of [-0.13, 0.11]) s.box(bu + k, 0, z1 + 0.09, bu + k + 0.02, 0.1, z1 + 0.15, palette.timber);
  });
  anchors.lights!.push(wallLantern(s, facePoint(front, doorU - 0.26, 0.58, 0.02), [0, 0, 1]));
  anchors.lights!.push(wallLantern(s, facePoint(front, doorU + 0.26, 0.58, 0.02), [0, 0, 1]));
  if (c.chimney ?? true)
    anchors.smoke!.push(
      chimneyPart(s, x0 + 0.28, (z0 + z1) / 2, sh.top - 0.1, sh.ridge + 0.12, vary(palette.stone, rnd)),
    );
  if (look() < 0.7)
    hangingSign(s, front, doorU < w / 2 ? doorU + 0.3 : doorU - 0.3, 0.86, palette.paper, (ss, ctr) => {
      ss.blob(ctr[0], ctr[1], ctr[2], 0.025, 0.04, 0.012, palette.lantern, 0);
    });
  s.surface(SURFACE.plain);
  return { s, anchors };
}

// --- Traps --------------------------------------------------------------------------------------

function netTrap(opts: KitBuildOptions | undefined): Built {
  const rnd = seeded(opts?.seed ?? 59);
  const s = kitBuilder(opts);
  const sprung = opts?.params?.sprung === true;
  // A springy ash pole pegged down, a coil of rope and a net hidden under leaves; sprung, the pole
  // stands up and the net hangs in a bundle (empty: the Watch has already taken the catch away).
  s.surface(SURFACE.timber);
  s.cylinder(0.25, 0.3, 0.035, 0.03, 0, 0.12, palette.darkWood, 6);
  if (sprung) {
    beam(s, [0.25, 0.1, 0.3], [0.45, 0.9, 0.45], 0.025, vary(palette.wood, rnd, 0.4));
    beam(s, [0.45, 0.9, 0.45], [0.55, 0.55, 0.5], 0.005, ROPE);
    s.surface(SURFACE.plain);
    s.blob(0.55, 0.45, 0.5, 0.1, 0.13, 0.1, vary(ROPE, rnd, 0.4), 1, rnd, 0.2);
  } else {
    beam(s, [0.25, 0.1, 0.3], [0.85, 0.08, 0.6], 0.025, vary(palette.wood, rnd, 0.4));
    s.cylinder(0.85, 0.6, 0.02, 0.02, 0, 0.1, palette.darkWood, 5);
    s.surface(SURFACE.plain);
    s.nearOnly(() => {
      for (let i = 0; i < 9; i++) {
        const x = 0.35 + rnd() * 0.35;
        const z = 0.35 + rnd() * 0.35;
        const leaf = [palette.autumnGold, 0xc9783a, 0xa0522d, palette.oakLeaf][Math.floor(rnd() * 4)]!;
        s.box(x - 0.035, 0, z - 0.025, x + 0.035, 0.012, z + 0.025, vary(leaf, rnd, 0.5));
      }
    });
    s.blob(0.52, 0.01, 0.52, 0.2, 0.025, 0.18, vary(0x9a8a5a, rnd, 0.3), 0);
  }
  s.nearOnly(() => s.blob(0.18, 0.04, 0.4, 0.05, 0.03, 0.05, ROPE, 0));
  return { s, anchors: {} };
}

function pitTrap(opts: KitBuildOptions | undefined): Built {
  const rnd = seeded(opts?.seed ?? 61);
  const s = kitBuilder(opts);
  const sprung = opts?.params?.sprung === true;
  // A shallow pit under a lattice of sticks and turf; sprung, a dark hole with the sticks broken in.
  s.surface(SURFACE.dirt);
  s.rbox(0.18, 0, 0.18, 0.82, 0.02, 0.82, vary(0x8a6a48, rnd, 0.3), 0.01);
  if (sprung) {
    s.surface(SURFACE.plain);
    s.box(0.26, 0.02, 0.26, 0.74, 0.024, 0.74, 0x2f2620);
    s.surface(SURFACE.timber);
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI;
      const cx = 0.5 + (rnd() - 0.5) * 0.3;
      const cz = 0.5 + (rnd() - 0.5) * 0.3;
      beam(
        s,
        [cx - Math.cos(a) * 0.15, 0.03, cz - Math.sin(a) * 0.15],
        [cx + Math.cos(a) * 0.15, 0.06, cz + Math.sin(a) * 0.15],
        0.012,
        palette.wood,
      );
    }
  } else {
    s.surface(SURFACE.grass);
    s.box(0.24, 0.02, 0.24, 0.76, 0.03, 0.76, vary(palette.meadow, rnd, 0.4));
    s.surface(SURFACE.timber);
    s.nearOnly(() => {
      for (let i = 0; i < 4; i++) {
        const t = 0.28 + i * 0.15;
        beam(s, [0.22, 0.035, t], [0.78, 0.035, t], 0.01, palette.wood);
      }
    });
    s.surface(SURFACE.plain);
    s.nearOnly(() => {
      for (let i = 0; i < 6; i++) {
        const x = 0.28 + rnd() * 0.44;
        const z = 0.28 + rnd() * 0.44;
        s.box(x - 0.03, 0.03, z - 0.02, x + 0.03, 0.04, z + 0.02, vary(palette.autumnGold, rnd, 0.6));
      }
    });
  }
  // A little warning peg with a red rag, so the Watch's own folk know where it is.
  s.surface(SURFACE.timber);
  s.cylinder(0.12, 0.12, 0.015, 0.012, 0, 0.22, palette.darkWood, 5);
  s.surface(SURFACE.plain);
  s.box(0.12, 0.17, 0.11, 0.2, 0.21, 0.13, palette.accentRed);
  return { s, anchors: {} };
}

// --- Decor the C5D patterns unlock --------------------------------------------------------------

export const gateBanner: Kit = {
  id: 'gate-banner',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 67);
    const s = new ShapeBuilder();
    // A tall pole with a crossbar and a long swallowtail banner in the valley's colors.
    s.surface(SURFACE.stone);
    s.cylinder(0, 0, 0.06, 0.07, 0, 0.05, palette.stone, 8);
    s.surface(SURFACE.timber);
    s.cylinder(0, 0, 0.018, 0.015, 0.05, 0.95, palette.timber, 6);
    s.blob(0, 0.96, 0, 0.025, 0.025, 0.025, palette.mustard, 0);
    s.box(-0.14, 0.86, -0.008, 0.14, 0.88, 0.008, palette.darkWood);
    s.surface(SURFACE.plain);
    const cloth = vary([0x4e6f86, 0x8a4f43, 0x5f7a52][Math.floor(rnd() * 3)]!, rnd, 0.3);
    for (const z of [0.004, -0.004]) {
      const n: V3 = [0, 0, z > 0 ? 1 : -1];
      s.quad([-0.12, 0.86, z], [0.12, 0.86, z], [0.12, 0.42, z], [-0.12, 0.42, z], cloth, n);
      s.tri([-0.12, 0.42, z], [0, 0.48, z], [-0.12, 0.34, z], cloth, n);
      s.tri([0.12, 0.42, z], [0.12, 0.34, z], [0, 0.48, z], cloth, n);
      s.quad(
        [-0.08, 0.8, z * 2],
        [0.08, 0.8, z * 2],
        [0.08, 0.77, z * 2],
        [-0.08, 0.77, z * 2],
        palette.mustard,
        n,
      );
      s.blob(0, 0.63, z * 2.5, 0.04, 0.05, 0.004, palette.mustard, 0);
    }
    return s.build();
  },
};

export const lookoutBench: Kit = {
  id: 'lookout-bench',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 71);
    const s = new ShapeBuilder();
    const wood = vary(palette.wood, rnd, 0.6);
    // A bench (back to +z) and a brass spyglass on a post beside it, pointed at the horizon.
    s.surface(SURFACE.timber);
    for (const x of [-0.165, 0.135]) {
      s.box(x, 0, -0.05, x + 0.03, 0.1, 0.065, palette.timber);
      s.box(x, 0.1, 0.045, x + 0.03, 0.25, 0.065, palette.timber);
    }
    s.box(-0.18, 0.1, -0.055, 0.18, 0.125, 0.045, wood);
    s.box(-0.17, 0.17, 0.045, 0.17, 0.24, 0.065, vary(wood, rnd, 0.5));
    s.cylinder(0.27, -0.02, 0.018, 0.015, 0, 0.3, palette.timber, 6);
    s.surface(SURFACE.zinc);
    beam(s, [0.24, 0.32, 0.03], [0.31, 0.36, -0.12], 0.016, 0xc8963e);
    beam(s, [0.31, 0.36, -0.12], [0.33, 0.37, -0.17], 0.02, 0xb07f30);
    s.surface(SURFACE.plain);
    return s.build();
  },
};

function defenseKit(
  id: string,
  size: [number, number],
  entrance: [number, number],
  make: (o: KitBuildOptions | undefined) => Built,
): Kit {
  const withSize = (o: KitBuildOptions | undefined): KitBuildOptions => ({
    ...o,
    size: o?.size ?? size,
    entrance: o?.entrance ?? entrance,
  });
  return {
    id,
    kind: 'building',
    footprint: { size, entrance },
    build: (o) => make(withSize(o)).s.build(),
    anchors: (o) => make(withSize(o)).anchors,
  };
}

export const bellTowerKit = defenseKit('bell-tower', [1, 1], [0, 0], bellTower);
export const gateKitDef = defenseKit('gate', [1, 1], [0, 0], gateKit);
export const netTrapKit = defenseKit('net-trap', [1, 1], [0, 0], netTrap);
export const palisadeKit = defenseKit('palisade', [1, 1], [0, 0], palisade);
export const pitTrapKit = defenseKit('pit-trap', [1, 1], [0, 0], pitTrap);
export const stoneWallKit = defenseKit('stone-wall', [1, 1], [0, 0], stoneWall);
export const watchHouseKit = defenseKit('watch-house', [2, 2], [0, 1], watchHouse);
export const watchtowerKit = defenseKit('watchtower', [1, 1], [0, 0], watchtower);

/** C5E: kits that join the wall pieces beside them (params `wx-`, `wx+`, `wz-`, `wz+`). */
export const WALL_KITS: ReadonlySet<string> = new Set(['gate', 'palisade', 'stone-wall']);
