import type { SwatchDef } from './types';

// Customization swatches for build.customize (docs/spec/10-world-and-building.md, Customization
// phase 1). Names follow the palette in docs/spec/17-presentation.md; `token` is the matching
// entry in packages/art/src/palette.ts, which the renderer uses to pick the color.

// Accents: doors, shutters and window boxes.
export const accentMustard: SwatchDef = { id: 'mustard', name: 'Mustard', group: 'accent', token: 'mustard' };
export const accentNavy: SwatchDef = { id: 'navy', name: 'Navy', group: 'accent', token: 'navy' };
export const accentRed: SwatchDef = { id: 'red', name: 'Red', group: 'accent', token: 'accentRed' };
export const accentTeal: SwatchDef = { id: 'teal', name: 'Teal', group: 'accent', token: 'teal' };
export const accentWhite: SwatchDef = { id: 'white', name: 'White', group: 'accent', token: 'white' };

// Roof materials (shape and texture; the roof color is a separate swatch).
export const materialShingle: SwatchDef = {
  id: 'shingle',
  name: 'Shingle',
  group: 'roofMaterial',
  token: 'wood',
};
export const materialSlate: SwatchDef = {
  id: 'slate',
  name: 'Slate',
  group: 'roofMaterial',
  token: 'roofSlate',
};
export const materialThatch: SwatchDef = {
  id: 'thatch',
  name: 'Thatch',
  group: 'roofMaterial',
  token: 'roofThatch',
};
export const materialTile: SwatchDef = {
  id: 'tile',
  name: 'Clay tile',
  group: 'roofMaterial',
  token: 'roofTerracotta',
};

// Roof colors.
export const roofMoss: SwatchDef = { id: 'moss', name: 'Moss', group: 'roof', token: 'roofMoss' };
export const roofPlum: SwatchDef = { id: 'plum', name: 'Plum', group: 'roof', token: 'roofPlum' };
export const roofSlate: SwatchDef = { id: 'slate', name: 'Slate', group: 'roof', token: 'roofSlate' };
export const roofTerracotta: SwatchDef = {
  id: 'terracotta',
  name: 'Terracotta',
  group: 'roof',
  token: 'roofTerracotta',
};
export const roofThatch: SwatchDef = { id: 'thatch', name: 'Thatch', group: 'roof', token: 'roofThatch' };

// Walls: the five plasters, plus stone and brick.
export const wallBrick: SwatchDef = { id: 'brick', name: 'Brick', group: 'wall', token: 'brick' };
export const wallButter: SwatchDef = { id: 'butter', name: 'Butter', group: 'wall', token: 'plasterButter' };
export const wallCream: SwatchDef = { id: 'cream', name: 'Cream', group: 'wall', token: 'plasterCream' };
export const wallRose: SwatchDef = { id: 'rose', name: 'Rose', group: 'wall', token: 'plasterRose' };
export const wallSage: SwatchDef = { id: 'sage', name: 'Sage', group: 'wall', token: 'plasterSage' };
export const wallSky: SwatchDef = { id: 'sky', name: 'Sky', group: 'wall', token: 'plasterSky' };
export const wallStone: SwatchDef = { id: 'stone', name: 'Stone', group: 'wall', token: 'stone' };
