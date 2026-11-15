// R1E: businesses drawn by trade and level (docs/spec/13-ledger.md, Zoning and growth: "Levels are
// drawn"; 17-presentation.md, Visual direction, second pass, item 4). A workshop, farmstead or shop
// with a trade draws its trade's look (`look`: the kit id content's `TradeDef.look` names) in its
// lot's district style, fitted to its own footprint, at its level:
//
//   1  a modest building and a small yard, the trade's signature piece already in it;
//   2  a painted sign by the door with the keeper's family name (the buildings layer letters the
//      name on `anchors.sign`) and the trade's goods set out front;
//   3  a bigger building (an extension or a loft), an awning over the front and a bigger yard.
//
// The footprint never changes. Without a look (a lot whose trade is not chosen yet, a gallery cell)
// the C4E generators draw the plain grown building, as before.
import { vary, type ShapeBuilder, type V3 } from '../geometry';
import { palette } from '../palette';
import { houseKit, type Built } from './buildings';
import { farmsteadOf, shopOf, workshopOf } from './grown';
import { FARM_LOOKS } from './farms';
import { faceBox, facePoint, type Face } from './parts';
import { crateOf, pileOf } from './goods';
import type { Kit, KitAnchors, KitBuildOptions } from './types';
import { WORKSHOP_LOOKS } from './workshops';

export type BusinessLevel = 1 | 2 | 3;

/** A trade's look drawn into a business kit's footprint. */
export type BusinessDraw = (opts: KitBuildOptions | undefined) => Built;

/**
 * Kit params for a business: its look's kit id, its level (absent is 1) and the good it makes,
 * plus any params the trade's look carries (but `kit`). The client's `buildingParams` adds these
 * to a business's params (`render/kitGeometry.ts`); the gallery does the same.
 */
export function businessParams(
  look: string,
  makes: string | null,
  level: number | undefined,
  lookParams?: Readonly<Record<string, unknown>>,
): Record<string, string | number | boolean> {
  const p: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(lookParams ?? {}))
    if (k !== 'kit' && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) p[k] = v;
  p.look = look;
  p.level = clampLevel(level);
  if (makes) p.make = makes;
  return p;
}

function clampLevel(level: number | undefined): BusinessLevel {
  return level === 3 ? 3 : level === 2 ? 2 : 1;
}

/** A business's level from its params (absent is 1). */
export function levelOf(opts: KitBuildOptions | undefined): BusinessLevel {
  const v = opts?.params?.level;
  return clampLevel(typeof v === 'number' ? v : undefined);
}

/** The trade look a business draws, or null for the plain grown building. */
export function lookOf(opts: KitBuildOptions | undefined): string | null {
  const v = opts?.params?.look;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** The output pile level a business shows for its good (0 to 4), at least `min` when it has a good. */
export function outLevel(opts: KitBuildOptions | undefined, good: string | null, min = 0): number {
  if (!good) return 0;
  const v = opts?.params?.[`out:${good}`];
  return Math.max(min, typeof v === 'number' ? Math.round(v) : 0);
}

/**
 * Level 2: the painted sign. A board on the face with a frame in the business's paint and a cream
 * panel where the keeper's family name is lettered (`anchors.sign`; the player's own sign words
 * take the same board). Drawn at both levels of detail, so the board's color still reads far off.
 */
export function paintedSign(
  s: ShapeBuilder,
  f: Face,
  u: number,
  y: number,
  w: number,
  o: number,
  paint: number,
  anchors: KitAnchors,
): void {
  const h = 0.17;
  faceBox(
    s,
    f,
    u - w / 2 - 0.025,
    y - h / 2 - 0.025,
    o,
    u + w / 2 + 0.025,
    y + h / 2 + 0.025,
    o + 0.025,
    paint,
  );
  faceBox(s, f, u - w / 2, y - h / 2, o + 0.025, u + w / 2, y + h / 2, o + 0.035, palette.paper);
  const n: V3 =
    f.dir === 'z+' ? [0, 0, 1] : f.dir === 'z-' ? [0, 0, -1] : f.dir === 'x+' ? [1, 0, 0] : [-1, 0, 0];
  anchors.sign = { center: facePoint(f, u, y, o + 0.037), normal: n, width: w, height: h };
}

/**
 * Level 2: goods out front. A trestle along x at (x, z) with the good piled on it and crates of it
 * at its feet; `n` crates (1 to 3).
 */
export function goodsOutFront(
  s: ShapeBuilder,
  good: string | null,
  x: number,
  z: number,
  rnd: () => number,
  n = 2,
): void {
  const top = vary(palette.wood, rnd, 0.5);
  s.box(x - 0.24, 0.16, z - 0.09, x + 0.24, 0.19, z + 0.09, top);
  for (const dx of [-0.2, 0.2])
    for (const dz of [-0.06, 0.06])
      s.box(x + dx - 0.012, 0, z + dz - 0.012, x + dx + 0.012, 0.16, z + dz + 0.012, palette.timber);
  if (good) pileOf(s, good, 1, x, 0.19, z, rnd);
  s.detail(() => {
    for (let i = 0; i < Math.min(3, n); i++) crateOf(s, good ?? '', x - 0.22 + i * 0.22, 0, z + 0.2, rnd);
  });
}

// The look tables are read when a kit builds, not when this module loads: workshops.ts and farms.ts
// import their helpers from here.
function drawOf(looks: () => Readonly<Record<string, BusinessDraw>>, fallback: BusinessDraw): BusinessDraw {
  return (opts) => {
    const look = lookOf(opts);
    const draw = look ? looks()[look] : undefined;
    return (draw ?? fallback)(opts);
  };
}

/** The workshop business (crafts zone, 3x3): its trade's look, else the C4E workshop. */
export const workshop: Kit = {
  ...houseKit(
    'workshop',
    drawOf(() => WORKSHOP_LOOKS, workshopOf),
  ),
  footprint: { size: [3, 3], entrance: [1, 2] },
};

/** The farmstead business (farms zone, 3x3): its trade's look, else the C4E farmstead. */
export const farmstead: Kit = {
  ...houseKit(
    'farmstead',
    drawOf(() => FARM_LOOKS, farmsteadOf),
  ),
  footprint: { size: [3, 3], entrance: [1, 2] },
};

/** The shop business (shops zone, 2x3): the shop with a flat above, drawn at its level. */
export const shop: Kit = { ...houseKit('shop', shopOf), footprint: { size: [2, 3], entrance: [1, 2] } };
