// R3F: lamplight and resting pieces (docs/spec/19-evenings.md, Supplies; 17-presentation.md, The
// world carries what it can). What the supplied pieces' kits share: the `rest` and `flame` params,
// the faded cloth's wash, the lit lantern glass the client draws over a lamp the lamplighter has
// reached, and the brazier's kit of its own (it stood in as a lantern until now).
//
// Params every supplied piece's kit reads (absent: today's look, the piece supplied):
// - `rest`: how it looks resting tonight, one of the RestKinds (`unlit`, `cold`, `bare`, `faded`,
//   `dry`). A kit ignores a rest that is not its own.
// - `flame: 'off'` (lanterns, hanging lanterns, lamp posts): the glass is drawn unlit (glow 0), for
//   a client that lights it itself when the lamp is reached (`lampFlameGeometry`, `KitAnchors.flames`).
import type { BufferGeometry } from 'three';
import { mixHex, seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam } from '../shapes';
import { SURFACE } from '../surface';
import type { Kit, KitBuildOptions } from './types';

/** How a supplied piece rests (content's `RestKind`, kept as a string here: art reads no content). */
export type PieceRest = 'unlit' | 'cold' | 'bare' | 'faded' | 'dry';

const RESTS: readonly PieceRest[] = ['bare', 'cold', 'dry', 'faded', 'unlit'];

/** The rest a build asks for (`params.rest`), or null when the piece is supplied. */
export function restOf(opts?: KitBuildOptions): PieceRest | null {
  const r = opts?.params?.rest;
  return typeof r === 'string' && (RESTS as readonly string[]).includes(r) ? (r as PieceRest) : null;
}

/**
 * The glow written on a lamp's glass: 2 (lit every night, today's) unless the lamp rests unlit or the
 * client lights it itself (`flame: 'off'`), then 0.
 */
export function lampGlassGlow(opts?: KitBuildOptions): number {
  return restOf(opts) === 'unlit' || opts?.params?.flame === 'off' ? 0 : 2;
}

/**
 * A lamp's glass color: warm, lit every night (today's); clean and cool while it waits for the
 * lamplighter (`flame: 'off'`), so the lit glass's warmth is the change; sooty and dark resting
 * unlit (no candle tonight).
 */
export function lampGlassColor(opts?: KitBuildOptions): number {
  if (lampGlassGlow(opts)) return palette.lantern;
  return restOf(opts) === 'unlit' ? palette.lanternDark : palette.lanternGlass;
}

/** The candle seen low in a lamp's clean glass, waiting for the lamplighter (cream wax). */
const WAX = 0xf0e2bc;

/**
 * R3F: a lamp's glass from (x0, y0, z0) to (x1, y1, z1), at either level. Lit every night (no
 * params): one warm pane box, glow 2, as before R3. Unlit for the client to light (`flame: 'off'`):
 * clean cool glass with the candle's wax showing in its lower third, so a lamp waiting for the
 * lamplighter (and every lamp by day) reads as a lamp with a candle in it. Resting unlit (no candle
 * tonight): sooty glass alone, empty. The lit glass the client draws covers the whole box.
 */
export function lampGlass(
  s: ShapeBuilder,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  opts: KitBuildOptions | undefined,
  far: (
    s: ShapeBuilder,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    hex: number,
  ) => void,
): void {
  const glow = lampGlassGlow(opts);
  const glass = lampGlassColor(opts);
  s.glow(glow);
  const candle = !glow && restOf(opts) !== 'unlit';
  const wax = y0 + (y1 - y0) * 0.36;
  s.levels(
    () => {
      if (!candle) s.box(x0, y0, z0, x1, y1, z1, glass);
      else {
        s.box(x0, y0, z0, x1, wax, z1, mixHex(glass, WAX, 0.7));
        s.box(x0, wax, z0, x1, y1, z1, glass);
      }
    },
    () => far(s, x0, y0, z0, x1, y1, z1, glass),
  );
  s.glow(0);
}

/** How far faded cloth is washed toward the paper. *(tune)* */
export const FADE = 0.58;

/** A cloth color washed toward the paper (bunting, ribbons, a canopy, an arch's flowers). */
export function faded(hex: number): number {
  // Washed toward the paper, and a little grey so the hues sit back rather than turn pastel.
  return mixHex(mixHex(hex, palette.paper, FADE), 0xb9b2a6, 0.18);
}

/** A cloth color for a build: washed when it rests faded. */
export function clothOf(hex: number, opts?: KitBuildOptions): number {
  return restOf(opts) === 'faded' ? faded(hex) : hex;
}

/**
 * The glow written on a lit lamp's glass drawn by the client (`lampFlameGeometry`): 3, a lamp the
 * lamplighter lit, which burns from his round at dusk (the kit material gives it a floor of
 * brightness before full night; 2 is a light that is only seen once it is dark).
 */
export const LAMP_LIT_GLOW = 3;

/** How much bigger than its glass the lit glass is drawn, so it covers the unlit glass beneath. */
export const LAMP_LIT_GROW: V3 = [1.08, 1.02, 1.08];

/**
 * R3F: a lit lamp's glass, a unit box (-0.5 to 0.5) in the lantern's warm glass color with glow
 * `LAMP_LIT_GLOW`. The client scales one instance over each flame box (`KitAnchors.flames`) of each
 * lamp lit tonight, so lighting a lamp is a matrix in one instanced draw, never a change to the
 * lantern's own geometry (no shadow redrawn, no decor rebuilt).
 */
export function lampFlameGeometry(): BufferGeometry {
  const s = new ShapeBuilder('high');
  s.surface(SURFACE.plain);
  s.glow(LAMP_LIT_GLOW);
  s.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, mixHex(palette.lantern, 0xfff1c8, 0.25));
  s.glow(0);
  return s.build(false);
}

/** A flame box in kit-local space: its middle and half its size on each axis. */
export interface FlameBox {
  center: V3;
  half: V3;
}

/** A flame box from its corners. */
export function flameBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): FlameBox {
  return {
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    half: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2],
  };
}

// --- Brazier ------------------------------------------------------------------------------------

/** Where the brazier's fire sits (its light's anchor). */
export const BRAZIER_FIRE: V3 = [0, 0.4, 0];

/**
 * R3F: a brazier of its own (it was drawn as a lantern): a wrought iron fire basket of bars on three
 * splayed legs over a stone pad, with live coals and a few tongues of flame, or, resting `cold`, a
 * heap of grey ash and charred ends and no glow. The far level keeps the basket, the legs as one
 * column, and the coals or the ash.
 */
export const brazier: Kit = {
  id: 'brazier',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 61);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    const cold = restOf(opts) === 'cold';
    const iron = palette.metal;
    s.surface(SURFACE.stone);
    s.levels(
      () => s.cylinder(0, 0, 0.17, 0.16, 0, 0.03, vary(palette.stone, rnd, 0.8), 8, Math.PI / 8),
      () => s.cylinder(0, 0, 0.17, 0.16, 0, 0.03, palette.stone, 6),
    );
    s.surface(SURFACE.wroughtIron);
    // Three splayed legs from the pad to the basket's foot ring.
    s.levels(
      () => {
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + 0.3;
          beam(
            s,
            [Math.cos(a) * 0.13, 0.03, Math.sin(a) * 0.13],
            [Math.cos(a) * 0.06, 0.27, Math.sin(a) * 0.06],
            0.014,
            iron,
          );
        }
        s.cylinder(0, 0, 0.075, 0.075, 0.25, 0.27, iron, 8);
      },
      () => s.cylinder(0, 0, 0.05, 0.04, 0.03, 0.27, iron, 4, Math.PI / 4),
    );
    // The basket: a shallow bowl and a rim, with upright bars between (near only).
    s.cylinder(0, 0, 0.075, 0.13, 0.27, 0.33, iron, 8, Math.PI / 8);
    s.levels(
      () => {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          beam(
            s,
            [Math.cos(a) * 0.13, 0.33, Math.sin(a) * 0.13],
            [Math.cos(a) * 0.15, 0.42, Math.sin(a) * 0.15],
            0.008,
            iron,
          );
        }
        s.cylinder(0, 0, 0.155, 0.155, 0.41, 0.425, iron, 10);
      },
      () => s.cylinder(0, 0, 0.13, 0.155, 0.33, 0.42, iron, 6),
    );
    s.surface(SURFACE.plain);
    if (cold) {
      // A heap of grey ash over the rim with a few charred ends poking out: no glow anywhere.
      s.blob(0, 0.395, 0, 0.14, 0.06, 0.14, palette.ash, 1, rnd, 0.15);
      s.nearOnly(() => {
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + rnd();
          beam(
            s,
            [Math.cos(a) * 0.09, 0.42, Math.sin(a) * 0.09],
            [Math.cos(a + 2.4) * 0.05, 0.46, Math.sin(a + 2.4) * 0.05],
            0.016,
            vary(palette.char, rnd, 0.5),
          );
        }
      });
    } else {
      // Live coals under a few tongues of flame (lit every night: glow 2).
      s.glow(2);
      s.blob(0, 0.4, 0, 0.14, 0.05, 0.14, palette.coals, 1, rnd, 0.15);
      s.nearOnly(() => {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + rnd() * 0.6;
          const r = i === 0 ? 0 : 0.055;
          const h = i === 0 ? 0.2 : 0.12 + rnd() * 0.05;
          s.cylinder(
            Math.cos(a) * r,
            Math.sin(a) * r,
            0.035,
            0,
            0.42,
            0.42 + h,
            i === 0 ? 0xffc35a : 0xff9a4a,
            5,
            a,
          );
        }
      });
      s.glow(0);
    }
    return s.build();
  },
  anchors: () => ({ lights: [BRAZIER_FIRE] }),
};
