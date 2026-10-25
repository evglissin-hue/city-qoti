// Palette tokens for the style kit, from docs/spec/17-presentation.md. Older C1 token names are
// kept (some now share a value with a spec token) so existing callers keep working.

export const palette = {
  // Ground.
  grass: 0x8db360,
  grassSummer: 0x7fa650,
  grassAutumn: 0xb5a048,
  meadow: 0xa7c46a,
  forestFloor: 0x5e7f43,
  dirtPath: 0xc9a877,
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
  ice: 0xcfe3ea,

  path: 0xc9a877,
  lane: 0xb39a70,

  // Foliage.
  leaf: 0x5c8a3a,
  oakLeaf: 0x5c8a3a,
  birchLeaf: 0x8db84a,
  leafLight: 0x8db84a,
  pine: 0x3f6b45,
  autumnOrange: 0xd98a3a,
  autumnRed: 0xc9603a,
  autumnGold: 0xe0b84a,
  blossom: 0xf2b8c6,
  birchBark: 0xf1ece0,
  birchMark: 0x4e4640,
  bark: 0x6b4a30,
  apple: 0xc7432f,

  // Plaster.
  plasterCream: 0xf1e6cf,
  plasterRose: 0xebc7b9,
  plasterSage: 0xc9d3b4,
  plasterSky: 0xbfd0d8,
  plasterButter: 0xf0dda0,
  wallCream: 0xf1e6cf,
  wallSand: 0xf0dda0,
  wallStone: 0xcfc5b2,

  // Structure.
  timber: 0x5b4232,
  stone: 0xb9b1a3,
  brick: 0xb5654b,
  foundation: 0x8f877a,
  plinth: 0x8f877a,
  wood: 0x9a6b43,
  darkWood: 0x6e4a2e,
  door: 0x4a3324,

  // Roofs.
  roofTerracotta: 0xc0643e,
  roofSlate: 0x5e6b7a,
  roofThatch: 0xc9a35f,
  roofMoss: 0x6e7f4e,
  roofPlum: 0x7a5468,
  roofRed: 0x8e3b2c,

  // Accents.
  teal: 0x3f7f7a,
  accentRed: 0xa8473b,
  mustard: 0xd6a73e,
  navy: 0x34506b,
  white: 0xf7f4ec,

  // Flowers and small things.
  flowerA: 0xe9707a,
  flowerB: 0xf3d35b,
  flowerC: 0x8f7fd9,
  flowerD: 0xf7f4ec,
  soil: 0x6b4e35,
  metal: 0x4b4f55,

  // Light.
  lantern: 0xffc977,
  lampGlow: 0xffc977,
  window: 0xffd58a,
  windowDay: 0x7d95a6,
  sunset: 0xf4a261,
  nightAmbient: 0x2b3a55,
  moon: 0x9db4d8,

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
