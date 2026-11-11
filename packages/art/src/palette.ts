// Palette tokens for the style kit, from docs/spec/17-presentation.md. Older C1 token names are
// kept (some now share a value with a spec token) so existing callers keep working; V1X retired
// the ones nothing read any more (palette 2.0 below is where new kits read from).
import type { Era } from '@qoti/content';

export const palette = {
  // Ground.
  grass: 0x8db360,
  meadow: 0xa7c46a,
  forestFloor: 0x5e7f43,
  sand: 0xe3d2a1,
  rock: 0x9a9a92,
  snow: 0xeef2f5,
  mountain: 0x878279,
  riverbed: 0x587f98,
  field: 0xc8b06a,

  // Water.
  water: 0x6fb7c2,
  waterShallow: 0x6fb7c2,
  waterDeep: 0x3e8fa6,
  foam: 0xe8f4f2,

  path: 0xc9a877,
  lane: 0xb39a70,

  // Foliage.
  leaf: 0x5c8a3a,
  oakLeaf: 0x5c8a3a,
  birchLeaf: 0x8db84a,
  pine: 0x3f6b45,
  autumnGold: 0xe0b84a,
  blossom: 0xf2b8c6,
  birchBark: 0xf1ece0,
  birchMark: 0x4e4640,
  bark: 0x6b4a30,
  apple: 0xc7432f,

  // Plaster.
  // V1A: the customization swatches read palette 2.0 (palette2.plasters, tiles, slates, thatch,
  // moss, plum, doors and frames), so a player's choice keeps meaning the same color.
  plasterCream: 0xefe3cc,
  plasterRose: 0xe6c6b5,
  plasterSage: 0xcdd2b3,
  plasterSky: 0xc3cfd0,
  plasterButter: 0xeddaa6,

  // Structure.
  timber: 0x5b4232,
  stone: 0xb9b1a3,
  brick: 0xb5654b,
  foundation: 0x8f877a,
  wood: 0x9a6b43,
  darkWood: 0x6e4a2e,
  door: 0x4a3324,

  // Roofs.
  roofTerracotta: 0xbb6e4c,
  roofSlate: 0x67707d,
  roofThatch: 0xc2a16a,
  roofMoss: 0x74805a,
  roofPlum: 0x7a5a6c,

  // Accents.
  teal: 0x4e7c78,
  accentRed: 0x9c4f43,
  mustard: 0xd1a24a,
  navy: 0x45607a,
  white: 0xf4ecdd,

  // Flowers and small things.
  flowerA: 0xe9707a,
  flowerB: 0xf3d35b,
  flowerC: 0x8f7fd9,
  flowerD: 0xf7f4ec,
  flowerGeranium: 0xd6403a,
  flowerCornflower: 0x5b86d6,
  soil: 0x6b4e35,
  metal: 0x4b4f55,

  // Light.
  lantern: 0xffc977,
  window: 0xffd58a,
  windowDay: 0x7d95a6,
  lampCandle: 0xffc977,
  lampGas: 0xe8de80,
  lampElectric: 0xffecce,

  // UI.
  paper: 0xf7f0e1,
  paperShade: 0xe9dec6,
  ink: 0x3b3229,
  inkSoft: 0x6b5e50,
  hearth: 0xc7604a,
  ledger: 0x3e6e5a,
  warning: 0xc98b2b,
  danger: 0xa8473b,

  ghostValid: 0x6fd47c,
  ghostInvalid: 0xe0605a,
  noteRed: 0xd9534f,
} as const;

/** V2A: a lamp's light by era: candle gold, greener gas, paler electric white. */
export const LAMP_COLORS: Readonly<Record<Era, number>> = {
  old: palette.lampCandle,
  steam: palette.lampGas,
  bright: palette.lampElectric,
};

/**
 * Palette 2.0 (V1.0): the Painted Miniature look (B) from the V0 concept viewer (`PALHEX.b`, docs/
 * concepts/v0-look/index.html): softer, more harmonious colors, each a little greyed toward its
 * neighbors, for a material that draws brick courses, tile rows and plaster grain on top. V1A tuned
 * the values against the concept stills and points the customization swatches at them (the old
 * tokens they read now hold palette 2.0 values); V1B and V1C move their kits' reads over; V1X
 * retired the old tokens nothing read. Lists are swatches a kit picks from by seed, in the
 * concept's order. `stuccos` are the Age of Steam's walls, `deco` and `pastels` the Bright Age's.
 */
export const palette2 = {
  // Ground.
  grass: 0x93ad66,
  meadow: 0xb7c27c,
  forestFloor: 0x5f7a47,
  dirt: 0xc4a67e,
  lane: 0xb09673,
  cobble: 0xa39a8c,
  flags: 0xcdc4b2,
  /** Ripe wheat, a green crop, tilled earth. */
  fields: [0xd0b673, 0xa6b866, 0xa07f5a],

  // Walls.
  plasters: [0xefe3cc, 0xe6c6b5, 0xcdd2b3, 0xc3cfd0, 0xeddaa6, 0xe2c9a0],
  stuccos: [0xf0e6d2, 0xe8cbbd, 0xd3d8bd, 0xc8d4d6, 0xefdcae, 0xe6d1c0],
  deco: [0xf4efe4, 0xf1dfb6, 0xe9cfc2, 0xcfdccf],
  pastels: [0xeec4b8, 0xc8dfc8, 0xf1dca0, 0xc4d6e2, 0xf4eee2, 0xe6cde0],
  bricks: [0xae6a52, 0x9f5e4a, 0xb67d5f, 0x94583f],
  /** Between the bricks (the brick pattern's accent). */
  mortar: 0xc4bcb1,
  stones: [0xc8bfae, 0xd4cab6, 0xb9b09f],
  timber: 0x5a4434,
  foundation: 0x938a7c,

  // Roofs.
  tiles: [0xbb6e4c, 0xa95f43, 0xc27b55, 0x9a5a42],
  slates: [0x67707d, 0x5d6773, 0x707a83],
  thatch: [0xc2a16a, 0xb8975f],
  zinc: 0x8a959b,
  /** Customization roofs beyond the concept's: a mossy green and a soft plum. */
  moss: 0x74805a,
  plum: 0x7a5a6c,
  flatRoof: 0x857d73,
  copper: 0x76a594,
  chimney: 0xa1604b,

  // Accents.
  frames: 0xf4ecdd,
  doors: [0x4e7c78, 0x9c4f43, 0xd1a24a, 0x45607a, 0x6f8b68, 0x7a5468],
  shutters: [0x5f8a74, 0x9c5a4a, 0x4b6680, 0x7d8a5a],
  shopfronts: [0x4e6f6a, 0x45607a, 0x8c4a3f, 0x5f4a3a, 0x6f8b68],
  awnings: [0xb2564a, 0x4e7c78, 0xd1a24a, 0x45607a, 0x7a5468],
  /** The cream between awning stripes (the awning pattern's accent). */
  stripe: 0xefe7d7,
  glass: 0x34434f,
  metal: 0x33403a,
  wood: 0x957050,

  // Foliage.
  leaves: [0x67904a, 0x86ad55, 0x5a8243, 0x76984c],
  pine: 0x466d4c,
  bark: 0x6a4c36,

  // Water.
  water: 0x6aaab4,
  riverbed: 0x3d5c66,
} as const;

/** Palette 2.0 tokens that hold one color (not a swatch list), for references such as accents. */
export type Palette2Single = {
  [K in keyof typeof palette2]: (typeof palette2)[K] extends number ? K : never;
}[keyof typeof palette2];

/** Plaster wall swatches, in customization order. */
export const PLASTERS: readonly number[] = [
  palette.plasterCream,
  palette.plasterRose,
  palette.plasterSage,
  palette.plasterSky,
  palette.plasterButter,
];

/** Roof swatches, in customization order. */
export const ROOFS: readonly number[] = [
  palette.roofTerracotta,
  palette.roofSlate,
  palette.roofMoss,
  palette.roofPlum,
  palette.roofThatch,
];

/** Door and shutter accent swatches. */
export const ACCENTS: readonly number[] = [
  palette.teal,
  palette.accentRed,
  palette.mustard,
  palette.navy,
  palette.white,
];

/** Seat palettes: lantern gold, rose, teal, plum, sky, moss. */
export const SEAT_COLORS: readonly number[] = [0xffc977, 0xe9a0a8, 0x3f7f7a, 0x7a5468, 0x9cc3dd, 0x7f9a52];

/** Top color for a terrain index from the map's terrain layer. */
export const TERRAIN_COLORS: readonly number[] = [
  palette.grass,
  palette.meadow,
  palette.forestFloor,
  palette.sand,
  palette.rock,
  palette.mountain,
  palette.riverbed,
  palette.field,
];
