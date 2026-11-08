// District styles (docs/spec/12-hearth.md, District styles): the look a grown building takes from
// the district it grew in. A style sets wall materials, plaster and accent swatches, roof shapes and
// materials, and how often the little things turn up (window boxes, shutters, ivy, porches,
// lean-tos, dormers, garden fences). Grown buildings pick their variant from the style with a
// stream keyed by their seed, so a home keeps its colors and materials when it upgrades in place
// (Settler cottage to Craftsfolk townhouse).
import { seeded, vary } from '../geometry';
import { palette } from '../palette';
import type { WallMaterial } from './parts';
import type { RoofMaterial, RoofShape } from './roofs';
import { customOf, pickWeighted, roofColor, type Custom } from './style';
import type { KitBuildOptions } from './types';

export type GardenEdge = 'picket' | 'wattle' | 'wall' | 'hedge' | 'railing';

export interface DistrictStyle {
  id: string;
  name: string;
  /** Ground floor walls. */
  walls: readonly [WallMaterial, number][];
  /** Upper floors of townhouses and shops (flats above). */
  upper: readonly [WallMaterial, number][];
  plasters: readonly number[];
  /** Base tint for stone and brick walls. */
  stone: number;
  brick: number;
  roofs: readonly [RoofShape, number][];
  roofMaterials: readonly [RoofMaterial, number][];
  /** Roof tints per material (a swatch list to pick from). */
  roofTints: Partial<Record<RoofMaterial, readonly number[]>>;
  accents: readonly number[];
  /** Timber frame and trim color. */
  trim: number;
  /** Window frames. */
  frame: number;
  /** Detail probabilities, 0 to 1. */
  detail: {
    windowBoxes: number;
    shutters: number;
    ivy: number;
    porch: number;
    leanTo: number;
    dormer: number;
    bench: number;
    garden: number;
  };
  edges: readonly [GardenEdge, number][];
}

/** Riverside Timber: black-and-white framing, thatch and warm plaster by the water. */
export const RIVERSIDE_TIMBER: DistrictStyle = {
  id: 'timber',
  name: 'Riverside Timber',
  walls: [
    ['timber', 6],
    ['plaster', 2],
    ['weatherboard', 1],
  ],
  upper: [['timber', 1]],
  plasters: [palette.plasterCream, palette.plasterButter, 0xf4ecd8, palette.plasterRose],
  stone: palette.stone,
  brick: palette.brick,
  roofs: [
    ['gable', 4],
    ['halfHip', 3],
  ],
  roofMaterials: [
    ['thatch', 5],
    ['tile', 2],
    ['shingle', 1],
  ],
  roofTints: { tile: [palette.roofTerracotta, 0xb0583a], shingle: [0x8a6f58, 0x7a6a5a] },
  accents: [palette.teal, palette.navy, palette.accentRed, 0x6e8a5a],
  trim: 0x3e2e24,
  frame: palette.white,
  detail: {
    windowBoxes: 0.7,
    shutters: 0.45,
    ivy: 0.15,
    porch: 0.4,
    leanTo: 0.35,
    dormer: 0.25,
    bench: 0.5,
    garden: 0.7,
  },
  edges: [
    ['wattle', 3],
    ['picket', 2],
    ['hedge', 1],
  ],
};

/** Hill Stone: rubble walls, slate, deep porches and ivy, built to shrug off weather. */
export const HILL_STONE: DistrictStyle = {
  id: 'stone',
  name: 'Hill Stone',
  walls: [
    ['stone', 8],
    ['plaster', 1],
  ],
  upper: [
    ['stone', 3],
    ['plaster', 1],
    ['weatherboard', 1],
  ],
  plasters: [palette.plasterCream, palette.plasterSage, 0xe8e0cc],
  stone: 0xb5ab98,
  brick: 0xa86450,
  roofs: [
    ['gable', 5],
    ['hip', 2],
    ['halfHip', 1],
  ],
  roofMaterials: [
    ['slate', 6],
    ['thatch', 2],
    ['tile', 1],
  ],
  roofTints: { slate: [palette.roofSlate, 0x56606c, 0x6a7380], tile: [0xa85a3c] },
  accents: [palette.mustard, palette.accentRed, 0x6e8a5a, palette.navy],
  trim: palette.timber,
  frame: 0xf3ecdc,
  detail: {
    windowBoxes: 0.4,
    shutters: 0.6,
    ivy: 0.5,
    porch: 0.55,
    leanTo: 0.4,
    dormer: 0.2,
    bench: 0.5,
    garden: 0.7,
  },
  edges: [
    ['wall', 5],
    ['hedge', 1],
  ],
};

/** Market Brick: warm brick, tiled roofs, dormers and painted doors on busy streets. */
export const MARKET_BRICK: DistrictStyle = {
  id: 'brick',
  name: 'Market Brick',
  walls: [
    ['brick', 7],
    ['plaster', 1],
  ],
  upper: [
    ['brick', 4],
    ['timber', 1],
    ['plaster', 1],
  ],
  plasters: [palette.plasterCream, palette.plasterButter, palette.plasterSky],
  stone: palette.stone,
  brick: palette.brick,
  roofs: [
    ['gable', 4],
    ['hip', 2],
    ['halfHip', 1],
  ],
  roofMaterials: [
    ['tile', 5],
    ['slate', 3],
  ],
  roofTints: { tile: [palette.roofTerracotta, 0xb0583a, 0xc77a4c], slate: [palette.roofSlate, 0x5a5f72] },
  accents: [palette.navy, palette.teal, palette.accentRed, 0x2f5a46, palette.white],
  trim: palette.timber,
  frame: palette.white,
  detail: {
    windowBoxes: 0.5,
    shutters: 0.25,
    ivy: 0.2,
    porch: 0.35,
    leanTo: 0.25,
    dormer: 0.55,
    bench: 0.35,
    garden: 0.5,
  },
  edges: [
    ['railing', 3],
    ['picket', 1],
    ['hedge', 1],
  ],
};

/** Garden Plaster: pastel lime-wash, roses round the door and window boxes everywhere. */
export const GARDEN_PLASTER: DistrictStyle = {
  id: 'plaster',
  name: 'Garden Plaster',
  walls: [
    ['plaster', 8],
    ['timber', 2],
  ],
  upper: [
    ['plaster', 3],
    ['timber', 1],
  ],
  plasters: [
    palette.plasterRose,
    palette.plasterSky,
    palette.plasterSage,
    palette.plasterButter,
    palette.plasterCream,
  ],
  stone: palette.stone,
  brick: palette.brick,
  roofs: [
    ['halfHip', 4],
    ['hip', 3],
    ['gable', 2],
  ],
  roofMaterials: [
    ['tile', 4],
    ['thatch', 3],
    ['shingle', 1],
  ],
  roofTints: { tile: [palette.roofTerracotta, 0xc77a4c, palette.roofPlum], shingle: [0x8a6f58] },
  accents: [palette.white, palette.teal, palette.mustard, palette.accentRed, 0x7fa7c4],
  trim: 0x6b5040,
  frame: palette.white,
  detail: {
    windowBoxes: 0.9,
    shutters: 0.7,
    ivy: 0.3,
    porch: 0.6,
    leanTo: 0.25,
    dormer: 0.3,
    bench: 0.6,
    garden: 0.9,
  },
  edges: [
    ['picket', 4],
    ['hedge', 2],
  ],
};

/**
 * Not a district: the mixed look of hand-placed homes, used when a home that grew outside any
 * district upgrades (its townhouse keeps the cottage's own choices, see grown.ts).
 */
export const VILLAGE_MIX: DistrictStyle = {
  id: 'village',
  name: 'Village',
  walls: [
    ['timber', 5],
    ['plaster', 3],
    ['stone', 3],
  ],
  upper: [['timber', 1]],
  plasters: [
    palette.plasterCream,
    palette.plasterRose,
    palette.plasterSage,
    palette.plasterSky,
    palette.plasterButter,
  ],
  stone: palette.stone,
  brick: palette.brick,
  roofs: [
    ['gable', 4],
    ['halfHip', 4],
    ['hip', 2],
  ],
  roofMaterials: [
    ['thatch', 4],
    ['tile', 4],
    ['slate', 2],
  ],
  roofTints: {},
  accents: [palette.teal, palette.accentRed, palette.navy, palette.mustard],
  trim: palette.timber,
  frame: palette.white,
  detail: {
    windowBoxes: 1,
    shutters: 1,
    ivy: 0.2,
    porch: 0.4,
    leanTo: 0.2,
    dormer: 0.3,
    bench: 0.5,
    garden: 0.5,
  },
  edges: [
    ['picket', 2],
    ['wattle', 2],
    ['hedge', 1],
  ],
};

/** The four starter styles, in the order the gallery shows them. */
export const DISTRICT_STYLES: readonly DistrictStyle[] = [
  RIVERSIDE_TIMBER,
  HILL_STONE,
  MARKET_BRICK,
  GARDEN_PLASTER,
];

/**
 * The style for a style id: exact ids ('timber', 'stone', 'brick', 'plaster') or anything naming
 * one ('riverside-timber', 'hill-stone'); null for none or an unknown id.
 */
export function districtStyle(id: unknown): DistrictStyle | null {
  if (typeof id !== 'string' || id.length === 0) return null;
  const s = id.toLowerCase();
  for (const st of DISTRICT_STYLES) if (s === st.id) return st;
  for (const st of DISTRICT_STYLES) if (s.includes(st.id)) return st;
  if (s.includes('river')) return RIVERSIDE_TIMBER;
  if (s.includes('hill')) return HILL_STONE;
  if (s.includes('market')) return MARKET_BRICK;
  if (s.includes('garden')) return GARDEN_PLASTER;
  return null;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Everything a grown building takes from its district and seed. The same seed and style always
 * give the same look, whatever the kit, so a cottage and the townhouse it becomes match.
 */
export interface DistrictLook {
  style: DistrictStyle;
  wall: WallMaterial;
  upper: WallMaterial;
  wallColor: number;
  upperColor: number;
  plaster: number;
  roofShape: RoofShape;
  roofMaterial: RoofMaterial;
  roofColor: number;
  accent: number;
  trim: number;
  frame: number;
  windowBoxes: boolean;
  shutters: boolean;
  chimney: boolean;
  ivy: boolean;
  porch: boolean;
  leanTo: boolean;
  dormer: boolean;
  bench: boolean;
  garden: GardenEdge | null;
  /** Jitter for this building (separate from the choices, so tweaks never reshuffle them). */
  rnd: () => number;
  /** A further choice stream for kit-specific picks after the shared ones. */
  look: () => number;
  custom: Custom;
}

function wallTint(st: DistrictStyle, m: WallMaterial, plaster: number, rnd: () => number): number {
  switch (m) {
    case 'stone':
      return vary(st.stone, rnd, 0.8);
    case 'brick':
      return vary(st.brick, rnd, 0.6);
    case 'weatherboard':
      return vary([0x9a6b43, 0x7d9a84, 0x8a6f58, 0x6e8aa0][Math.floor(rnd() * 4)]!, rnd, 0.5);
    case 'log':
      return vary(palette.wood, rnd, 0.5);
    default:
      return vary(plaster, rnd, 0.45);
  }
}

/**
 * The district look for a building: `params.style` names the district (null when it has none), the
 * seed picks the variant, and the player's customization (wall, roof, accent, window boxes...) wins
 * over both. `salt` separates the jitter of different kits without touching the shared choices.
 */
export function districtLook(opts: KitBuildOptions | undefined, salt: number): DistrictLook | null {
  const style = districtStyle(opts?.params?.style);
  if (!style) return null;
  const seed = opts?.seed ?? 1;
  const choose = seeded(seed * 977 + (hashString(style.id) % 10007) * 13 + 5);
  const rnd = seeded(seed * 7 + salt * 131 + 11);
  const look = seeded(seed * 389 + salt * 17 + 29);
  const c = customOf(opts);
  const wall = pickWeighted(choose, style.walls);
  const upper = pickWeighted(choose, style.upper);
  const plaster = style.plasters[Math.floor(choose() * style.plasters.length)]!;
  const roofShape = pickWeighted(choose, style.roofs);
  const roofMaterial = c.roofMaterial ?? pickWeighted(choose, style.roofMaterials);
  const tints = style.roofTints[roofMaterial];
  const tint = tints ? tints[Math.floor(choose() * tints.length)]! : undefined;
  const accent = c.accent ?? style.accents[Math.floor(choose() * style.accents.length)]!;
  const d = style.detail;
  const roll = (p: number): boolean => choose() < p;
  const windowBoxes = c.windowBoxes ?? roll(d.windowBoxes);
  const shutters = c.shutters ?? roll(d.shutters);
  const ivy = roll(d.ivy);
  const porch = roll(d.porch);
  const leanTo = roll(d.leanTo);
  const dormer = roll(d.dormer);
  const bench = roll(d.bench);
  const garden = roll(d.garden) ? pickWeighted(choose, style.edges) : null;
  // Colors come from a jitter stream keyed by the seed alone, so they match across kits too.
  const tone = seeded(seed * 53 + 7);
  const wallColor = c.wall ?? wallTint(style, wall, plaster, tone);
  const upperColor = c.wall ?? (upper === wall ? wallColor : wallTint(style, upper, plaster, tone));
  return {
    style,
    wall,
    upper,
    wallColor,
    upperColor,
    plaster: c.wall ?? plaster,
    roofShape,
    roofMaterial,
    roofColor: vary(roofColor(c, roofMaterial, tint), tone, 0.5),
    accent,
    trim: vary(style.trim, tone, 0.3),
    frame: style.frame,
    windowBoxes,
    shutters,
    chimney: c.chimney ?? true,
    ivy,
    porch,
    leanTo,
    dormer,
    bench,
    garden,
    rnd,
    look,
    custom: c,
  };
}
