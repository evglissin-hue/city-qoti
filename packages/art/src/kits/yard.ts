// V3A: the yard and household pieces that dress a plot ("goods you can see"). Each is a small decor
// kit: centered on the origin, base at y 0, in tile units, facing +z (its back, toward -z, stands
// against the wall it is placed at). Each has a near level and a far level through
// `ShapeBuilder.levels`; random draws and colors are made before the levels so both match.
import { mixHex, seeded, ShapeBuilder, vary } from '../geometry';
import { palette } from '../palette';
import { beam, cylX, cylZ, panel } from '../shapes';
import { SURFACE } from '../surface';
import { farBox, farCylinder } from './decorFar';
import { GOOD_COLORS as C } from './goods';
import type { Kit, KitAnchors, KitBuildOptions } from './types';

type V3 = [number, number, number];
type Params = Record<string, number | string | boolean>;

interface Ctx {
  s: ShapeBuilder;
  rnd: () => number;
  seed: number;
  params: Params;
}

function piece(id: string, defSeed: number, draw: (c: Ctx) => void, anchors?: Kit['anchors']): Kit {
  return {
    id,
    kind: 'decor',
    build: (opts) => {
      const seed = opts?.seed ?? defSeed;
      const s = new ShapeBuilder(opts?.lod ?? 'high');
      draw({ s, rnd: seeded(seed), seed, params: opts?.params ?? {} });
      s.glow(0);
      s.surface(SURFACE.plain);
      return s.build();
    },
    ...(anchors ? { anchors } : {}),
  };
}

const pick = <T>(list: readonly T[], seed: number): T => list[Math.abs(Math.floor(seed)) % list.length]!;

/** A flat fan (an ellipse of `n` triangles) facing +z at depth z. */
function fan(
  s: ShapeBuilder,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  z: number,
  hex: number,
): void {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    s.tri(
      [cx, cy, z],
      [cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry, z],
      [cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry, z],
      hex,
      [0, 0, 1],
    );
  }
}

// --- 1. woodpile ---------------------------------------------------------------------------------

export const yardWoodpile: Kit = piece('yard-woodpile', 51, ({ s, rnd, seed }) => {
  // One short stack, 0.2 wide: repeats set 0.22 apart along a wall read as one longer pile.
  const r = 0.031 + (Math.abs(seed) % 3) * 0.0016;
  const pitch = r * 1.75;
  const ends: [number, number, number][] = [];
  for (let row = 0; row < 3; row++) {
    const xs = row % 2 === 0 ? [-2 * r * 1.04, 0, 2 * r * 1.04] : [-r * 1.04, r * 1.04];
    for (const x of xs) ends.push([x, r + row * pitch, vary(C.logEnd, rnd, 0.8)]);
  }
  const top = [-r * 1.04, r * 1.04].map((x) => ({
    x,
    hex: vary(C.bark, rnd, 0.8),
    cap: vary(C.logEnd, rnd, 0.8),
  }));
  const bark = vary(C.bark, rnd, 0.6);
  const boxTop = r + 2 * pitch + r * 0.8;
  const frontZ = 0.09;
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      s.box(-0.1, 0, -0.09, 0.1, boxTop, frontZ, bark, 'b');
      for (const [x, y, hex] of ends) {
        for (let i = 0; i < 6; i++) {
          const a0 = (i / 6) * Math.PI * 2;
          const a1 = ((i + 1) / 6) * Math.PI * 2;
          s.tri(
            [x, y, frontZ + 0.001],
            [x + Math.cos(a0) * r * 0.95, y + Math.sin(a0) * r * 0.95, frontZ + 0.001],
            [x + Math.cos(a1) * r * 0.95, y + Math.sin(a1) * r * 0.95, frontZ + 0.001],
            hex,
            [0, 0, 1],
          );
        }
      }
      for (const t of top) cylZ(s, -0.09, frontZ, t.x, r + 3 * pitch - 0.002, r, t.hex, 5, t.cap);
    },
    () => {
      s.surface(SURFACE.woodGrain);
      const h = r + 3 * pitch + r * 0.6;
      farBox(s, -0.1, 0, -0.09, 0.1, h, frontZ, bark, 'bf');
      s.quad([-0.1, 0, frontZ], [0.1, 0, frontZ], [0.1, h, frontZ], [-0.1, h, frontZ], C.logEnd, [0, 0, 1]);
    },
  );
});

// --- 2. nets -------------------------------------------------------------------------------------

export const yardNets: Kit = piece('yard-nets', 52, ({ s, rnd }) => {
  const net = vary(0x6f7f74, rnd, 0.8);
  const net2 = vary(0x7a8a7c, rnd, 0.8);
  const poles = [-0.3, 0.0, 0.3];
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      for (const x of poles) {
        beam(s, [x, 0, 0], [x, 0.5, 0], 0.012, palette.timber);
        beam(s, [x, 0.01, 0], [x + (x < 0.1 ? -0.03 : 0.03), 0.01, 0.08], 0.008, palette.timber);
      }
      beam(s, [-0.32, 0.47, 0], [0.32, 0.47, 0], 0.008, palette.timber);
      s.surface(SURFACE.cloth);
      for (const [i, x0, x1, sag, hex] of [
        [0, -0.3, 0.0, 0.17, net],
        [1, 0.0, 0.3, 0.24, net2],
      ] as const) {
        const n = 3;
        for (let k = 0; k < n; k++) {
          const t0 = k / n;
          const t1 = (k + 1) / n;
          const xa = x0 + (x1 - x0) * t0;
          const xb = x0 + (x1 - x0) * t1;
          const ya = 0.46 - sag * (1 - Math.pow(2 * t0 - 1, 2));
          const yb = 0.46 - sag * (1 - Math.pow(2 * t1 - 1, 2));
          const z = 0.012 + i * 0.006;
          panel(
            s,
            [xa, 0.46, z],
            [xb, 0.46, z],
            [xb, yb, z + 0.02],
            [xa, ya, z + 0.02],
            hex,
            vary(hex, () => 0.3, 1.5),
          );
        }
      }
      s.surface(SURFACE.plain);
      for (const [x, y, hex] of [
        [-0.15, 0.31, palette.white],
        [0.15, 0.25, palette.accentRed],
        [0.05, 0.27, palette.white],
      ] as const)
        s.blob(x, y, 0.036, 0.022, 0.022, 0.022, hex, 0);
    },
    () => {
      s.surface(SURFACE.woodGrain);
      for (const x of poles) farBox(s, x - 0.012, 0, -0.012, x + 0.012, 0.5, 0.012, palette.timber, 'bkt');
      s.surface(SURFACE.cloth);
      panel(s, [-0.3, 0.46, 0.012], [0, 0.46, 0.012], [0, 0.24, 0.03], [-0.3, 0.24, 0.03], net);
      panel(s, [0, 0.46, 0.018], [0.3, 0.46, 0.018], [0.3, 0.2, 0.036], [0, 0.2, 0.036], net2);
    },
  );
});

// --- 3. loaf tray --------------------------------------------------------------------------------

export const yardLoafTray: Kit = piece('yard-loaf-tray', 53, ({ s, rnd, seed }) => {
  const n = 3 + (Math.abs(seed) % 2);
  const board = vary(palette.wood, rnd, 0.6);
  const loaves = Array.from({ length: n }, (_, i) => ({
    x: -0.105 + (i * 0.21) / (n - 1),
    hex: vary(C.bread, rnd, 0.8),
    k: 0.9 + rnd() * 0.2,
  }));
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      s.box(-0.15, 0, -0.055, 0.15, 0.012, 0.055, board, 'b');
      s.surface(SURFACE.plain);
      for (const l of loaves)
        s.blob(l.x, 0.032, 0.0, 0.05 * l.k, 0.026 * l.k, 0.036, l.hex, 1, rnd, 0.003, C.breadTop);
    },
    () => {
      s.surface(SURFACE.woodGrain);
      farBox(s, -0.15, 0, -0.055, 0.15, 0.012, 0.055, board);
      s.surface(SURFACE.plain);
      farBox(s, -0.145, 0.012, -0.036, 0.145, 0.056, 0.036, C.bread, 'b');
    },
  );
});

// --- 4. cloth frame ------------------------------------------------------------------------------

const CLOTH_PALETTE = [C.cloth, C.clothB, 0x8fa37a, 0xd6c49a, 0x9f8fc4, C.yarnA, C.yarnB] as const;

export const yardClothFrame: Kit = piece('yard-cloth-frame', 54, ({ s, rnd, seed }) => {
  const lengths = [0, 1, 2].map((i) => ({
    x: -0.15 + i * 0.15,
    h: 0.28 + rnd() * 0.14,
    z: i % 2 === 0 ? 0.012 : -0.012,
    hex: vary(CLOTH_PALETTE[(Math.abs(seed) + i * 3) % CLOTH_PALETTE.length]!, rnd, 0.7),
  }));
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      for (const x of [-0.27, 0.27]) {
        beam(s, [x, 0, 0], [x, 0.55, 0], 0.013, palette.timber);
        beam(s, [x, 0.012, -0.07], [x, 0.012, 0.07], 0.012, palette.timber);
      }
      beam(s, [-0.29, 0.53, 0], [0.29, 0.53, 0], 0.01, palette.wood);
      beam(s, [-0.27, 0.1, 0], [0.27, 0.1, 0], 0.008, palette.wood);
      s.surface(SURFACE.cloth);
      for (const l of lengths) {
        const w = 0.065;
        panel(
          s,
          [l.x - w, 0.52, l.z],
          [l.x + w, 0.52, l.z],
          [l.x + w, 0.52 - l.h, l.z + 0.01],
          [l.x - w, 0.52 - l.h, l.z + 0.01],
          l.hex,
        );
        panel(
          s,
          [l.x - w, 0.52 - l.h, l.z + 0.01],
          [l.x + w, 0.52 - l.h, l.z + 0.01],
          [l.x + w, 0.5 - l.h, l.z + 0.012],
          [l.x - w, 0.5 - l.h, l.z + 0.012],
          mixHex(l.hex, palette.ink, 0.25),
        );
      }
    },
    () => {
      s.surface(SURFACE.woodGrain);
      for (const x of [-0.27, 0.27])
        farBox(s, x - 0.013, 0, -0.013, x + 0.013, 0.55, 0.013, palette.timber, 'bkt');
      s.surface(SURFACE.cloth);
      for (const l of lengths)
        panel(
          s,
          [l.x - 0.065, 0.52, l.z],
          [l.x + 0.065, 0.52, l.z],
          [l.x + 0.065, 0.52 - l.h, l.z],
          [l.x - 0.065, 0.52 - l.h, l.z],
          l.hex,
        );
    },
  );
});

// --- 5. half-made chair --------------------------------------------------------------------------

export const yardChairHalf: Kit = piece('yard-chair-half', 55, ({ s, rnd }) => {
  const wood = vary(C.chair, rnd, 0.6);
  const plank = vary(C.plank, rnd, 0.6);
  const plank2 = vary(C.plankDark, rnd, 0.6);
  const shave = vary(C.logEnd, rnd, 0.6);
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      s.rbox(-0.14, 0.13, -0.06, 0.0, 0.145, 0.06, wood, 0.004);
      for (const x of [-0.13, -0.01]) {
        beam(s, [x, 0, 0.045], [x, 0.13, 0.045], 0.009, wood);
        beam(s, [x, 0, -0.045], [x, 0.27, -0.045], 0.009, wood);
      }
      beam(s, [-0.13, 0.05, 0.045], [-0.01, 0.05, 0.045], 0.006, wood);
      beam(s, [0.1, 0.012, 0.03], [0.12, 0.28, -0.03], 0.018, plank);
      beam(s, [0.15, 0.012, 0.03], [0.17, 0.26, -0.03], 0.018, plank2);
      s.surface(SURFACE.plain);
      s.blob(0.07, 0.008, 0.07, 0.014, 0.008, 0.01, shave, 0);
      s.blob(0.05, 0.007, 0.09, 0.012, 0.007, 0.01, shave, 0);
    },
    () => {
      s.surface(SURFACE.woodGrain);
      farBox(s, -0.14, 0.13, -0.06, 0.0, 0.145, 0.06, wood);
      for (const x of [-0.13, -0.01]) farBox(s, x - 0.009, 0, -0.054, x + 0.009, 0.27, -0.036, wood, 'bkt');
    },
  );
});

// --- 6. skep -------------------------------------------------------------------------------------

export const yardSkep: Kit = piece('yard-skep', 56, ({ s, rnd }) => {
  const straw = [
    vary(0xd2b469, rnd, 0.6),
    vary(0xc4a459, rnd, 0.6),
    vary(0xd6b972, rnd, 0.6),
    vary(0xc9a85c, rnd, 0.6),
  ];
  const wood = vary(palette.wood, rnd, 0.5);
  const rings: [number, number, number, number][] = [
    [0.075, 0.07, 0.095, 0.125],
    [0.07, 0.058, 0.125, 0.155],
    [0.058, 0.04, 0.155, 0.185],
    [0.04, 0.012, 0.185, 0.215],
  ];
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      s.box(-0.08, 0.08, -0.08, 0.08, 0.095, 0.08, wood);
      for (const x of [-0.06, 0.045]) s.box(x, 0, -0.06, x + 0.015, 0.08, 0.06, palette.timber);
      s.surface(SURFACE.thatch);
      rings.forEach(([rb, rt, y0, y1], i) => farCylinder(s, 0, 0, rb, rt, y0, y1, straw[i]!, 7));
      s.surface(SURFACE.plain);
      s.box(-0.015, 0.098, 0.066, 0.015, 0.118, 0.08, palette.ink);
    },
    () => {
      s.surface(SURFACE.woodGrain);
      farBox(s, -0.08, 0, -0.06, 0.08, 0.095, 0.06, wood);
      s.surface(SURFACE.thatch);
      farCylinder(s, 0, 0, 0.075, 0, 0.095, 0.22, straw[0]!, 6);
    },
  );
});

// --- 7. pram -------------------------------------------------------------------------------------

const PRAM_BLANKETS = [0xe9e1cf, 0xc9d8d2, 0xe6c6b5, 0xd8cde0] as const;

export const yardPram: Kit = piece('yard-pram', 57, ({ s, rnd, seed }) => {
  const wicker = vary(C.wicker, rnd, 0.6);
  const hood = vary(pick([0x4e7c78, 0x7a5a6c, 0x6b7f93, 0x9c4f43], seed), rnd, 0.6);
  const blanket = vary(pick(PRAM_BLANKETS, seed + 1), rnd, 0.5);
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      s.rbox(-0.07, 0.07, -0.1, 0.07, 0.14, 0.08, wicker, 0.012);
      s.surface(SURFACE.cloth);
      s.box(-0.062, 0.14, -0.02, 0.062, 0.15, 0.075, blanket, 'b');
      panel(s, [-0.07, 0.2, -0.11], [0.07, 0.2, -0.11], [0.07, 0.15, -0.015], [-0.07, 0.15, -0.015], hood);
      for (const x of [-0.07, 0.07])
        s.tri([x, 0.14, -0.11], [x, 0.2, -0.11], [x, 0.14, -0.015], hood, [x < 0 ? -1 : 1, 0, 0]);
      s.surface(SURFACE.wroughtIron);
      for (const x of [-0.05, 0.05]) beam(s, [x, 0.13, -0.1], [x, 0.24, -0.16], 0.006, palette.metal);
      beam(s, [-0.05, 0.24, -0.16], [0.05, 0.24, -0.16], 0.007, palette.metal);
      for (const x of [-0.088, 0.088]) {
        cylX(s, x - 0.006, x + 0.006, 0.045, -0.06, 0.045, palette.ink, 5, palette.metal);
        cylX(s, x - 0.006, x + 0.006, 0.032, 0.06, 0.032, palette.ink, 5, palette.metal);
      }
    },
    () => {
      s.surface(SURFACE.woodGrain);
      farBox(s, -0.07, 0.07, -0.1, 0.07, 0.14, 0.08, wicker, 'bk');
      s.surface(SURFACE.cloth);
      s.quad(
        [-0.07, 0.2, -0.11],
        [0.07, 0.2, -0.11],
        [0.07, 0.15, -0.015],
        [-0.07, 0.15, -0.015],
        hood,
        [0, 1, 0],
      );
      s.surface(SURFACE.wroughtIron);
      for (const x of [-0.09, 0.09])
        farBox(s, x - 0.006, 0, -0.1, x + 0.006, 0.09, 0.09, palette.ink, 'btfk');
    },
  );
});

// --- 8. boots ------------------------------------------------------------------------------------

export const yardBoots: Kit = piece('yard-boots', 58, ({ s, rnd, seed }) => {
  const leather = vary(pick([0x6b4a30, 0x4a3324, 0x6f5a3a, 0x4e6a4a], seed), rnd, 0.8);
  const sole = palette.ink;
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      for (const [x, z, tilt] of [
        [-0.035, 0.0, 0.0],
        [0.035, 0.015, 0.01],
      ] as const) {
        farCylinder(s, x, z - 0.02, 0.018, 0.021, 0.02, 0.09, leather, 6);
        s.box(x - 0.02, 0.0, z - 0.035, x + 0.02 + tilt, 0.012, z + 0.06, sole, 'b');
        s.rbox(x - 0.019, 0.012, z - 0.035, x + 0.019 + tilt, 0.04, z + 0.058, leather, 0.008);
      }
    },
    () => {
      s.surface(SURFACE.woodGrain);
      for (const x of [-0.035, 0.035]) farBox(s, x - 0.02, 0, -0.05, x + 0.02, 0.07, 0.06, leather);
    },
  );
});

// --- 9. cat --------------------------------------------------------------------------------------

const COATS = [0xc9884a, 0x8f8d88, 0x34302f, 0xe6d4b0] as const;

export const yardCat: Kit = piece('yard-cat', 59, ({ s, rnd, seed }) => {
  const coat = vary(COATS[Math.abs(seed) % 4]!, rnd, 0.5);
  const dark = mixHex(coat, 0x1e1a18, 0.35);
  const curled = Math.floor(Math.abs(seed) / 4) % 2 === 1;
  s.levels(
    () => {
      s.surface(SURFACE.plain);
      if (curled) {
        s.blob(0, 0.044, 0, 0.06, 0.04, 0.052, coat, 1, rnd, 0.004);
        s.blob(0.005, 0.047, 0.05, 0.03, 0.027, 0.027, coat, 1, rnd, 0.002);
        s.blob(0.05, 0.015, 0.035, 0.016, 0.014, 0.025, dark, 0);
        s.blob(0.07, 0.014, 0.0, 0.016, 0.014, 0.025, dark, 0);
      } else {
        s.blob(0, 0.058, -0.01, 0.045, 0.058, 0.05, coat, 1, rnd, 0.004);
        s.blob(0, 0.122, 0.022, 0.034, 0.03, 0.03, coat, 1, rnd, 0.002);
        for (const x of [-0.022, 0.022]) s.blob(x, 0.029, 0.04, 0.012, 0.025, 0.014, coat, 0);
        for (const [x, z] of [
          [0.052, -0.04],
          [0.07, 0.0],
          [0.062, 0.04],
        ] as const)
          s.blob(x, 0.017, z, 0.015, 0.013, 0.02, dark, 0);
      }
      const earY = curled ? 0.07 : 0.146;
      const earZ = curled ? 0.052 : 0.024;
      for (const x of [-0.02, 0.02]) s.cylinder(x, earZ, 0.012, 0, earY, earY + 0.024, dark, 3);
      s.box(-0.016, earY - 0.02, earZ + 0.025, -0.008, earY - 0.013, earZ + 0.03, 0xa8c26a);
      s.box(0.008, earY - 0.02, earZ + 0.025, 0.016, earY - 0.013, earZ + 0.03, 0xa8c26a);
    },
    () => {
      s.surface(SURFACE.plain);
      if (curled) farBox(s, -0.055, 0, -0.05, 0.055, 0.08, 0.075, coat);
      else farBox(s, -0.045, 0, -0.06, 0.045, 0.15, 0.05, coat);
    },
  );
});

// --- 10. washing line ----------------------------------------------------------------------------

const WASHING = [0xe9e1cf, 0x7f9bb5, 0xc98a7e, 0xb5c18a, 0xd6a73e, 0xd8cde0, 0x8fa8b5] as const;

export const yardWashingLine: Kit = piece('yard-washing-line', 60, ({ s, rnd, seed }) => {
  const items = [
    { x: -0.3, kind: 0 },
    { x: -0.12, kind: 1 },
    { x: 0.08, kind: 0 },
    { x: 0.27, kind: 0 },
  ].map((it, i) => ({
    ...it,
    hex: vary(WASHING[(Math.abs(seed) + i * 2) % WASHING.length]!, rnd, 0.6),
    z: (rnd() - 0.5) * 0.02,
  }));
  const lineY = 0.44;
  const sag = (x: number): number => lineY - 0.025 * (1 - (x / 0.42) * (x / 0.42));
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      for (const x of [-0.42, 0.42]) {
        beam(s, [x, 0, 0], [x, 0.5, 0], 0.014, palette.timber);
        beam(s, [x, 0.01, 0], [x * 0.88, 0.01, 0.1], 0.008, palette.timber);
      }
      s.surface(SURFACE.plain);
      const xs = [-0.42, -0.14, 0.14, 0.42];
      for (let i = 0; i < 3; i++)
        beam(
          s,
          [xs[i]!, i === 0 || i === 2 ? lineY : sag(xs[i]!), 0],
          [xs[i + 1]!, sag(xs[i + 1]!), 0],
          0.003,
          C.rope,
        );
      s.surface(SURFACE.cloth);
      for (const it of items) {
        const t = sag(it.x);
        if (it.kind === 1) {
          // A sheet, sagging in the middle.
          panel(
            s,
            [it.x - 0.09, t, it.z],
            [it.x + 0.09, t, it.z],
            [it.x + 0.09, t - 0.2, it.z + 0.012],
            [it.x - 0.09, t - 0.2, it.z + 0.012],
            it.hex,
          );
          continue;
        }
        panel(
          s,
          [it.x - 0.045, t, it.z],
          [it.x + 0.045, t, it.z],
          [it.x + 0.045, t - 0.15, it.z],
          [it.x - 0.045, t - 0.15, it.z],
          it.hex,
        );
        for (const d of [-1, 1])
          panel(
            s,
            [it.x + d * 0.045, t, it.z],
            [it.x + d * 0.045, t - 0.045, it.z],
            [it.x + d * 0.095, t - 0.1, it.z],
            [it.x + d * 0.085, t - 0.06, it.z],
            it.hex,
          );
      }
    },
    () => {
      s.surface(SURFACE.woodGrain);
      for (const x of [-0.42, 0.42])
        farBox(s, x - 0.014, 0, -0.014, x + 0.014, 0.5, 0.014, palette.timber, 'bkt');
      s.surface(SURFACE.cloth);
      for (const it of items) {
        const w = it.kind === 1 ? 0.09 : 0.07;
        const h = it.kind === 1 ? 0.2 : 0.15;
        if (it.kind === 1 || it.x < 0.2)
          panel(
            s,
            [it.x - w, lineY, it.z],
            [it.x + w, lineY, it.z],
            [it.x + w, lineY - h, it.z],
            [it.x - w, lineY - h, it.z],
            it.hex,
          );
      }
    },
  );
});

// --- 11. sign ------------------------------------------------------------------------------------

/** Emblem painters: flat shapes on the board face, u across and v up, within about 0.06 by 0.065. */
interface Brush {
  fan(cx: number, cy: number, rx: number, ry: number, n: number, hex: number): void;
  rect(x0: number, y0: number, x1: number, y1: number, hex: number): void;
  tri(a: [number, number], b: [number, number], c: [number, number], hex: number): void;
}

const EMBLEMS: Readonly<Record<string, { main: number; draw: (b: Brush) => void }>> = {
  apples: {
    main: C.apple,
    draw: (b) => {
      b.rect(-0.003, 0.03, 0.005, 0.055, 0x6b4a30);
      b.fan(0, -0.008, 0.042, 0.038, 8, C.apple);
      b.tri([0.005, 0.045], [0.04, 0.05], [0.015, 0.025], 0x6f9a4a);
    },
  },
  bread: {
    main: C.bread,
    draw: (b) => {
      b.fan(0, 0, 0.052, 0.032, 8, C.bread);
      for (const x of [-0.025, 0, 0.025]) b.rect(x - 0.004, -0.012, x + 0.004, 0.018, 0xf0dcb0);
    },
  },
  candles: {
    main: C.candle,
    draw: (b) => {
      b.rect(-0.048, -0.05, 0.048, -0.034, 0x6e4a2e);
      for (const [x, h] of [
        [-0.03, 0.03],
        [0, 0.05],
        [0.03, 0.02],
      ] as const) {
        b.rect(x - 0.009, -0.034, x + 0.009, h, C.candle);
        b.tri([x - 0.009, h], [x + 0.009, h], [x, h + 0.02], 0xe0a02c);
      }
    },
  },
  cheese: {
    main: C.cheese,
    draw: (b) => {
      b.tri([-0.055, -0.035], [0.055, -0.035], [0.055, 0.04], C.cheese);
      b.rect(-0.055, -0.035, 0.055, -0.02, C.cheeseRind);
      for (const [x, y] of [
        [0.03, 0.0],
        [0.01, -0.01],
        [0.04, 0.02],
      ] as const)
        b.fan(x, y, 0.008, 0.008, 4, 0xb98a3a);
    },
  },
  chair: {
    main: C.chair,
    draw: (b) => {
      b.rect(-0.03, 0.04, 0.03, 0.054, C.chair);
      b.rect(-0.03, -0.01, -0.02, 0.054, C.chair);
      b.rect(0.02, -0.01, 0.03, 0.054, C.chair);
      b.rect(-0.034, -0.015, 0.034, -0.002, C.chair);
      b.rect(-0.034, -0.055, -0.024, -0.015, C.chair);
      b.rect(0.024, -0.055, 0.034, -0.015, C.chair);
      b.rect(-0.02, 0.01, 0.02, 0.02, C.chair);
    },
  },
  cider: {
    main: C.jug,
    draw: (b) => {
      b.fan(0, -0.015, 0.036, 0.04, 8, C.jug);
      b.rect(-0.012, 0.02, 0.012, 0.05, C.jug);
      b.rect(-0.014, 0.05, 0.014, 0.058, 0x6e4a2e);
      b.fan(0.04, 0.0, 0.016, 0.022, 4, 0x6e4a2e);
    },
  },
  cloth: {
    main: C.cloth,
    draw: (b) => {
      b.rect(-0.05, -0.035, 0.04, 0.035, 0x9c4f43);
      b.rect(-0.05, -0.008, 0.04, 0.012, 0xefe3cc);
      b.fan(0.045, 0, 0.012, 0.035, 6, 0x7a3a34);
    },
  },
  fish: {
    main: C.fish,
    draw: (b) => {
      b.fan(-0.008, 0, 0.045, 0.026, 8, 0x6f8f9f);
      b.tri([0.03, 0], [0.058, 0.03], [0.058, -0.03], 0x6f8f9f);
      b.fan(-0.03, 0.007, 0.006, 0.006, 4, palette.ink);
    },
  },
  grain: {
    main: C.wheat,
    draw: (b) => {
      b.rect(-0.003, -0.06, 0.003, 0.04, 0xb98a3a);
      for (const y of [-0.02, 0.005, 0.03]) {
        b.tri([0, y], [-0.03, y + 0.03], [-0.004, y + 0.012], C.wheatDark);
        b.tri([0, y], [0.03, y + 0.03], [0.004, y + 0.012], C.wheatDark);
      }
      b.tri([-0.012, 0.04], [0.012, 0.04], [0, 0.065], C.wheatDark);
    },
  },
  honey: {
    main: C.honey,
    draw: (b) => {
      b.fan(0, -0.01, 0.04, 0.036, 8, C.honey);
      b.rect(-0.032, 0.026, 0.032, 0.04, 0xf3ecdc);
      b.tri([-0.01, 0.026], [0.01, 0.026], [0, 0.0], C.honeyDark);
      b.fan(0.045, 0.04, 0.012, 0.009, 4, palette.ink);
    },
  },
  sundries: {
    main: C.wicker,
    draw: (b) => {
      b.fan(-0.02, -0.01, 0.03, 0.03, 6, C.wicker);
      b.rect(-0.04, 0.02, 0.0, 0.032, 0x6e4a2e);
      b.fan(0.04, 0.02, 0.018, 0.018, 5, C.yarnA);
      b.rect(0.032, -0.05, 0.048, 0.0, C.candle);
    },
  },
  veg: {
    main: C.cabbage,
    draw: (b) => {
      b.tri([-0.05, 0.03], [-0.01, 0.03], [-0.03, -0.05], C.carrot);
      b.tri([-0.045, 0.03], [-0.015, 0.03], [-0.03, 0.058], 0x6f9a4a);
      b.fan(0.025, -0.01, 0.035, 0.035, 7, C.cabbage);
      b.fan(0.025, -0.005, 0.018, 0.018, 5, 0x5f8a3e);
    },
  },
  wool: {
    main: C.wool,
    draw: (b) => {
      for (const [x, y] of [
        [-0.025, 0.005],
        [0.005, 0.015],
        [0.03, 0.0],
      ] as const)
        b.fan(x, y, 0.028, 0.026, 6, C.wool);
      b.fan(-0.05, -0.005, 0.014, 0.016, 5, 0x4a3a2c);
      b.rect(-0.03, -0.055, -0.022, -0.02, 0x4a3a2c);
      b.rect(0.015, -0.055, 0.023, -0.02, 0x4a3a2c);
    },
  },
};

export const SIGN_EMBLEMS: readonly string[] = Object.keys(EMBLEMS);
const FRAMES = [0x9c4f43, 0x6f8c73, 0x4f6f86, 0xb98a3a] as const;

export const yardSign: Kit = piece('yard-sign', 61, ({ s, rnd, seed, params }) => {
  const key = typeof params.emblem === 'string' && EMBLEMS[params.emblem] ? params.emblem : 'sundries';
  const em = EMBLEMS[key]!;
  const frame = vary(pick(FRAMES, seed), rnd, 0.6);
  const face = vary(0xeadcb8, rnd, 0.4);
  const wood = vary(palette.timber, rnd, 0.5);
  const cx = 0.03;
  const cy = 0.345;
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      beam(s, [-0.15, 0, 0], [-0.15, 0.5, 0], 0.014, wood);
      beam(s, [-0.15, 0.46, 0], [0.14, 0.46, 0], 0.01, wood);
      beam(s, [-0.15, 0.34, 0], [-0.05, 0.455, 0], 0.008, wood);
      for (const x of [-0.04, 0.1]) beam(s, [x, 0.46, 0], [x, 0.42, 0], 0.004, palette.metal);
      s.surface(SURFACE.paintedWood);
      s.box(cx - 0.1, 0.27, -0.01, cx + 0.1, 0.42, 0.01, frame);
      s.box(cx - 0.088, 0.282, 0.01, cx + 0.088, 0.408, 0.014, face, 'b');
      s.surface(SURFACE.plain);
      let layer = 0;
      const z = (): number => 0.0145 + layer++ * 0.0004;
      em.draw({
        fan: (x, y, rx, ry, n, hex) => fan(s, cx + x, cy + y, rx, ry, n, z(), hex),
        rect: (x0, y0, x1, y1, hex) =>
          s.quad(
            [cx + x0, cy + y0, z()],
            [cx + x1, cy + y0, z()],
            [cx + x1, cy + y1, z()],
            [cx + x0, cy + y1, z()],
            hex,
            [0, 0, 1],
          ),
        tri: (a, b, c, hex) => {
          const zz = z();
          s.tri(
            [cx + a[0], cy + a[1], zz],
            [cx + b[0], cy + b[1], zz],
            [cx + c[0], cy + c[1], zz],
            hex,
            [0, 0, 1],
          );
        },
      });
    },
    () => {
      s.surface(SURFACE.woodGrain);
      farBox(s, -0.164, 0, -0.014, -0.136, 0.5, 0.014, wood, 'bkt');
      farBox(s, -0.15, 0.455, -0.006, 0.14, 0.465, 0.006, wood, 'bfkrlb');
      s.surface(SURFACE.paintedWood);
      farBox(s, cx - 0.1, 0.27, -0.01, cx + 0.1, 0.42, 0.014, frame, 'bk');
      s.surface(SURFACE.plain);
      s.quad(
        [cx - 0.05, cy - 0.05, 0.0145],
        [cx + 0.05, cy - 0.05, 0.0145],
        [cx + 0.05, cy + 0.05, 0.0145],
        [cx - 0.05, cy + 0.05, 0.0145],
        em.main,
        [0, 0, 1],
      );
    },
  );
});

// --- 12. awning ----------------------------------------------------------------------------------

const AWNING_PAIRS: readonly (readonly [number, number])[] = [
  [0xa4574a, 0xefe3cc],
  [0x7f9a7c, 0xefe3cc],
  [0xc79a45, 0xefe3cc],
  [0x5f7a93, 0xefe3cc],
];

export const yardAwning: Kit = piece('yard-awning', 62, ({ s, rnd, seed }) => {
  const [a, b] = pick(AWNING_PAIRS, seed);
  const stripes = Array.from({ length: 6 }, (_, i) => vary(i % 2 === 0 ? a : b, rnd, 0.4));
  const x0 = -0.45;
  const w = 0.15;
  const backY = 0.62;
  const frontY = 0.48;
  const dropY = 0.41;
  const D = 0.42;
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      for (const x of [-0.44, 0.44]) {
        beam(s, [x, 0, D - 0.02], [x, frontY, D - 0.02], 0.011, palette.timber);
        beam(s, [x, frontY - 0.01, D - 0.02], [x, backY - 0.02, 0.0], 0.008, palette.timber);
      }
      beam(s, [-0.45, backY, 0.01], [0.45, backY, 0.01], 0.01, palette.timber);
      s.surface(SURFACE.awning);
      stripes.forEach((hex, i) => {
        const xa = x0 + i * w;
        const xb = xa + w;
        panel(s, [xa, backY, 0], [xb, backY, 0], [xb, frontY, D], [xa, frontY, D], hex);
        panel(s, [xa, frontY, D], [xb, frontY, D], [xb, dropY, D + 0.005], [xa, dropY, D + 0.005], hex);
        panel(
          s,
          [xa, dropY, D + 0.005],
          [xb, dropY, D + 0.005],
          [(xa + xb) / 2, dropY - 0.035, D + 0.005],
          [(xa + xb) / 2, dropY - 0.035, D + 0.005],
          hex,
        );
      });
    },
    () => {
      s.surface(SURFACE.woodGrain);
      for (const x of [-0.44, 0.44])
        farBox(s, x - 0.011, 0, D - 0.03, x + 0.011, frontY, D - 0.01, palette.timber, 'bkt');
      s.surface(SURFACE.awning);
      stripes.forEach((hex, i) => {
        const xa = x0 + i * w;
        const xb = xa + w;
        s.quad([xa, backY, 0], [xb, backY, 0], [xb, frontY, D], [xa, frontY, D], hex, [0, 1, 0.4]);
        s.quad([xa, frontY, D], [xb, frontY, D], [xb, dropY, D], [xa, dropY, D], hex, [0, 0, 1]);
      });
    },
  );
});

// --- 13 and 14. lamps ----------------------------------------------------------------------------

const lampAnchors =
  (at: V3): Kit['anchors'] =>
  (_opts?: KitBuildOptions): KitAnchors => ({ lights: [at] });

export const yardLamp: Kit = piece(
  'yard-lamp',
  63,
  ({ s, rnd }) => {
    const post = vary(palette.wood, rnd, 0.6);
    s.levels(
      () => {
        s.surface(SURFACE.woodGrain);
        s.box(-0.03, 0, -0.03, 0.03, 0.04, 0.03, palette.stone);
        beam(s, [0, 0.04, 0], [0, 0.34, 0], 0.014, post);
        beam(s, [-0.06, 0.3, 0], [0, 0.34, 0], 0.006, post);
        beam(s, [0.06, 0.3, 0], [0, 0.34, 0], 0.006, post);
        s.surface(SURFACE.wroughtIron);
        s.box(-0.034, 0.34, -0.034, 0.034, 0.355, 0.034, palette.metal);
        s.surface(SURFACE.plain);
        s.glow(2);
        s.box(-0.026, 0.355, -0.026, 0.026, 0.415, 0.026, palette.lantern);
        s.glow(0);
        s.surface(SURFACE.wroughtIron);
        s.cylinder(0, 0, 0.044, 0.0, 0.415, 0.455, palette.metal, 4, Math.PI / 4);
      },
      () => {
        s.surface(SURFACE.woodGrain);
        farBox(s, -0.016, 0, -0.016, 0.016, 0.34, 0.016, post, 'btk');
        s.surface(SURFACE.plain);
        s.glow(2);
        farBox(s, -0.03, 0.34, -0.03, 0.03, 0.42, 0.03, palette.lantern, 'b');
        s.glow(0);
      },
    );
  },
  lampAnchors([0, 0.385, 0]),
);

export const yardSillLamp: Kit = piece(
  'yard-sill-lamp',
  64,
  ({ s, rnd, seed }) => {
    const jar = Math.abs(seed) % 2 === 0;
    const glass = vary(0xcfe0d8, rnd, 0.4);
    s.levels(
      () => {
        if (jar) {
          s.surface(SURFACE.plain);
          farCylinder(s, 0, 0, 0.028, 0.03, 0, 0.05, glass, 8);
          farCylinder(s, 0, 0, 0.009, 0.009, 0.05, 0.072, C.candle, 5);
          s.glow(2);
          s.box(-0.006, 0.072, -0.006, 0.006, 0.09, 0.006, palette.lantern);
          s.glow(0);
        } else {
          s.surface(SURFACE.wroughtIron);
          s.box(-0.03, 0, -0.03, 0.03, 0.01, 0.03, palette.metal);
          s.surface(SURFACE.plain);
          s.glow(2);
          s.box(-0.022, 0.01, -0.022, 0.022, 0.06, 0.022, palette.lantern);
          s.glow(0);
          s.surface(SURFACE.wroughtIron);
          s.cylinder(0, 0, 0.034, 0.0, 0.06, 0.085, palette.metal, 4, Math.PI / 4);
        }
      },
      () => {
        s.surface(SURFACE.plain);
        farBox(s, -0.028, 0, -0.028, 0.028, 0.05, 0.028, jar ? glass : palette.metal, 'b');
        s.glow(2);
        farBox(s, -0.012, 0.05, -0.012, 0.012, 0.085, 0.012, palette.lantern, 'b');
        s.glow(0);
      },
    );
  },
  (opts) => lampAnchors(Math.abs(opts?.seed ?? 64) % 2 === 0 ? [0, 0.081, 0] : [0, 0.035, 0])!(opts),
);

// --- 15. chopping block, water butt, wheelbarrow -------------------------------------------------

export const yardChoppingBlock: Kit = piece('yard-chopping-block', 65, ({ s, rnd }) => {
  const stump = vary(palette.bark, rnd, 0.6);
  const logs = [
    { x: 0.1, z: 0.07, a: 0.3, hex: vary(0xd2ae78, rnd, 0.6) },
    { x: -0.12, z: 0.08, a: -0.4, hex: vary(0xd2ae78, rnd, 0.6) },
    { x: 0.13, z: -0.02, a: 1.2, hex: vary(0xc9a56d, rnd, 0.6) },
  ];
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      s.cylinder(-0.01, 0, 0.075, 0.068, 0, 0.16, stump, 7);
      farCylinder(s, -0.01, 0, 0.066, 0.066, 0.16, 0.164, 0xd9b98a, 7);
      beam(s, [0.0, 0.17, 0.0], [0.13, 0.31, 0.03], 0.01, palette.wood);
      s.surface(SURFACE.wroughtIron);
      s.box(-0.04, 0.15, -0.012, 0.03, 0.2, 0.012, palette.metal);
      s.surface(SURFACE.woodGrain);
      for (const l of logs) {
        const c = Math.cos(l.a);
        const sn = Math.sin(l.a);
        s.quad(
          [l.x - c * 0.045 - sn * 0.02, 0.0, l.z - sn * 0.045 + c * 0.02],
          [l.x + c * 0.045 - sn * 0.02, 0.0, l.z + sn * 0.045 + c * 0.02],
          [l.x + c * 0.045 - sn * 0.02, 0.03, l.z + sn * 0.045 + c * 0.02],
          [l.x - c * 0.045 - sn * 0.02, 0.03, l.z - sn * 0.045 + c * 0.02],
          l.hex,
          [0, 0, 1],
        );
        s.box(l.x - 0.04, 0, l.z - 0.02, l.x + 0.04, 0.036, l.z + 0.02, l.hex, 'b');
      }
    },
    () => {
      s.surface(SURFACE.woodGrain);
      farCylinder(s, -0.01, 0, 0.075, 0.068, 0, 0.16, stump, 4, Math.PI / 4);
      farBox(s, 0.07, 0, 0.05, 0.17, 0.036, 0.1, logs[0]!.hex);
    },
  );
});

export const yardWaterButt: Kit = piece('yard-water-butt', 66, ({ s, rnd }) => {
  const wood = vary(palette.wood, rnd, 0.6);
  const lid = vary(palette.darkWood, rnd, 0.5);
  s.levels(
    () => {
      s.surface(SURFACE.woodGrain);
      farCylinder(s, 0, 0, 0.068, 0.077, 0, 0.11, wood, 8);
      farCylinder(s, 0, 0, 0.077, 0.068, 0.11, 0.22, wood, 8);
      s.surface(SURFACE.wroughtIron);
      farCylinder(s, 0, 0, 0.07, 0.073, 0.04, 0.056, palette.metal, 8);
      farCylinder(s, 0, 0, 0.073, 0.07, 0.17, 0.186, palette.metal, 8);
      s.surface(SURFACE.woodGrain);
      farCylinder(s, 0, 0, 0.066, 0.064, 0.22, 0.234, lid, 8);
      beam(s, [0.0, 0.2, 0.072], [0.0, 0.2, 0.09], 0.004, palette.wood);
      beam(s, [0.0, 0.2, 0.09], [0.0, 0.14, 0.092], 0.004, palette.wood);
      farCylinder(s, 0.0, 0.092, 0.016, 0.014, 0.115, 0.145, palette.metal, 5);
    },
    () => {
      s.surface(SURFACE.woodGrain);
      farCylinder(s, 0, 0, 0.077, 0.066, 0, 0.234, wood, 6);
    },
  );
});

export const yardWheelbarrow: Kit = piece('yard-wheelbarrow', 67, ({ s, rnd, seed }) => {
  const wood = vary(palette.wood, rnd, 0.6);
  const paint = vary(pick([0x6f8c73, 0x9c4f43, 0x4f6f86, 0xb98a3a], seed), rnd, 0.6);
  const earth = Math.abs(seed) % 2 === 0;
  s.levels(
    () => {
      s.surface(SURFACE.paintedWood);
      // A tapered tray: narrow floor, wide mouth.
      const fl = 0.045;
      const fm = 0.08;
      const tz0 = -0.08;
      const tz1 = 0.11;
      const tf0 = -0.05;
      const tf1 = 0.1;
      panel(s, [-fm, 0.2, tz0], [fm, 0.2, tz0], [fl, 0.11, tf0], [-fl, 0.11, tf0], paint);
      panel(s, [-fm, 0.2, tz1], [fm, 0.2, tz1], [fl, 0.11, tf1], [-fl, 0.11, tf1], paint);
      panel(s, [-fm, 0.2, tz0], [-fm, 0.2, tz1], [-fl, 0.11, tf1], [-fl, 0.11, tf0], paint);
      panel(s, [fm, 0.2, tz0], [fm, 0.2, tz1], [fl, 0.11, tf1], [fl, 0.11, tf0], paint);
      s.quad(
        [-fl, 0.11, tf0],
        [fl, 0.11, tf0],
        [fl, 0.11, tf1],
        [-fl, 0.11, tf1],
        mixHex(paint, palette.ink, 0.3),
        [0, 1, 0],
      );
      s.surface(SURFACE.plain);
      if (earth) s.blob(0, 0.2, 0.02, 0.065, 0.04, 0.085, vary(palette.soil, rnd, 0.6), 1, rnd, 0.008);
      else s.blob(0, 0.2, 0.01, 0.06, 0.05, 0.08, vary(C.sack, rnd, 0.5), 1, rnd, 0.008);
      s.surface(SURFACE.woodGrain);
      for (const x of [-0.055, 0.055]) {
        beam(s, [x, 0.14, 0.02], [x, 0.19, -0.18], 0.01, wood);
        beam(s, [x, 0.12, -0.12], [x, 0, -0.12], 0.009, wood);
        beam(s, [x, 0.12, 0.09], [x * 0.7, 0.05, 0.16], 0.007, wood);
      }
      beam(s, [-0.055, 0.19, -0.18], [0.055, 0.19, -0.18], 0.008, wood);
      s.surface(SURFACE.wroughtIron);
      cylX(s, -0.012, 0.012, 0.05, 0.17, 0.05, palette.ink, 6, palette.metal);
    },
    () => {
      s.surface(SURFACE.paintedWood);
      farBox(s, -0.08, 0.11, -0.08, 0.08, 0.2, 0.11, paint, 'bk');
      s.surface(SURFACE.woodGrain);
      farBox(s, -0.06, 0.0, -0.13, 0.06, 0.02, -0.11, wood, 'b');
      farBox(s, -0.012, 0, 0.12, 0.012, 0.1, 0.22, palette.ink, 'btfk');
    },
  );
});
