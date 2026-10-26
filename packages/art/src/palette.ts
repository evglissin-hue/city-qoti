// Placeholder palette for the I0 kit. C2B replaces it with the palette in docs/spec/17-presentation.md.

export const palette = {
  // Terrain tops, by terrain index (0 grass to 7 field).
  grass: 0x8fbf5a,
  meadow: 0xa9cd6b,
  forestFloor: 0x6d9849,
  sand: 0xe0cd93,
  rock: 0x9c968c,
  mountain: 0x878279,
  riverbed: 0x587f98,
  field: 0xc8b06a,
  water: 0x6fb6dd,

  path: 0xd8bf8e,
  lane: 0xb39a70,

  wallCream: 0xf0e4c8,
  wallSand: 0xe5d3aa,
  wallStone: 0xcfc5b2,
  wood: 0x9a6b43,
  darkWood: 0x6e4a2e,
  roofTerracotta: 0xb5543c,
  roofSlate: 0x5d6d7c,
  roofMoss: 0x6f7f4a,
  roofRed: 0x8e3b2c,
  door: 0x4a3324,
  stone: 0xa8a297,
  plinth: 0x9d968a,

  leaf: 0x5f9a3f,
  leafLight: 0x8cc25a,
  pine: 0x3e6f45,
  birchBark: 0xece6da,
  bark: 0x6b4a30,
  blossom: 0xf2b6c8,
  apple: 0xc7432f,
  flowerA: 0xe9707a,
  flowerB: 0xf3d35b,
  flowerC: 0x8f7fd9,
  soil: 0x6b4e35,
  lampGlow: 0xffd27a,
  metal: 0x4b4f55,

  ghostValid: 0x6fd47c,
  ghostInvalid: 0xe0605a,
  noteRed: 0xd9534f,
} as const;

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
