export { mixHex, seeded, ShapeBuilder, vary, type V3 } from './geometry';
export { kitById, kits, type Kit, type KitAnchors, type KitBuildOptions, type KitPart } from './kits';
export {
  CLOTH_COLORS,
  EXTRA_KINDS,
  extraGeometry,
  HAT_KINDS,
  isSpecies,
  residentGeometry,
  residentLook,
  SPECIES_ART,
  SPECIES_IDS,
  type ExtraKind,
  type HatKind,
  type ResidentDetail,
  type ResidentLook,
  type ResidentLookInput,
  type SpeciesId,
} from './kits/residents';
export { PAINT, RIG, RIG_PIVOTS, RigBuilder, type Channel } from './rig';
export {
  createEmissiveKitMaterial,
  createGhostMaterial,
  createKitMaterial,
  createResidentMaterial,
  setKitMaterialHooks,
  type KitMaterialHooks,
  type Season,
} from './materials';
export { ACCENTS, palette, PLASTERS, ROOFS, SEAT_COLORS, TERRAIN_COLORS } from './palette';
