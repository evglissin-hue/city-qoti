export { mixHex, seeded, ShapeBuilder, vary, type V3 } from './geometry';
export { kitById, kits, type Kit, type KitAnchors, type KitBuildOptions, type KitPart } from './kits';
export type { AnimalKind } from './kits/types';
export { animalArt, standingAnimal, type AnimalArt } from './kits/animals';
export {
  BED_Y,
  CARTER_SEAT,
  cartBodyGeometry,
  cartLoadGeometry,
  cartWheelGeometry,
  mergeFlat,
  PONY_OFFSET,
  WHEEL_RADIUS,
  WHEEL_X,
} from './kits/vehicles';
export {
  DISTRICT_STYLES,
  districtLook,
  districtStyle,
  type DistrictLook,
  type DistrictStyle,
  type GardenEdge,
} from './kits/district';
export { orchardTree, seasonOf } from './kits/village';
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
  storyOutfit,
  type ExtraKind,
  type HatKind,
  type ResidentDetail,
  type ResidentLook,
  type ResidentLookInput,
  type SpeciesId,
} from './kits/residents';
export { wheatTileGeometry } from './kits/fields';
export { constructionGeometry, upgradeScaffold, type ConstructionOptions } from './kits/construction';
export { ACCENT_SWATCHES, ROOF_MATERIALS, ROOF_SWATCHES, WALL_SWATCHES } from './kits/style';
export { isRowKit, ROW_EAVES } from './kits/rows';
export { BUNDLE_GOODS, bundleGeometry, crateOf, GOOD_COLORS, pileLevel, pileOf } from './kits/goods';
export { PAINT, RIG, RIG_PIVOTS, RigBuilder, type Channel } from './rig';
export { beam, cylX, cylZ, panel } from './shapes';
export {
  createEmissiveKitMaterial,
  createGhostMaterial,
  createKitMaterial,
  createLeanKitMaterial,
  createResidentMaterial,
  KIT_FRESNEL_GLSL,
  kitSurfaceUniforms,
  MOTION,
  patchKitShader,
  SEASON_LOOK,
  setKitMaterialHooks,
  surfaceTable,
  type KitMaterialHooks,
  type KitSurfaceUniforms,
  type Season,
} from './materials';
export {
  ACCENTS,
  palette,
  palette2,
  PLASTERS,
  ROOFS,
  SEAT_COLORS,
  TERRAIN_COLORS,
  type Palette2Single,
} from './palette';
export {
  createPatternArray,
  generatePatterns,
  lastPatternMs,
  PATTERN_CHANNELS,
  PATTERN_ONE,
  PATTERN_SIZE,
  type PatternFill,
} from './patterns';
export {
  NOISE_LAYER,
  NOISE_SCALE,
  PATTERN_LAYERS,
  SURFACE,
  surfaceDef,
  SURFACES,
  type SurfaceDef,
  type SurfaceId,
  type SurfaceMapping,
  type SurfaceName,
} from './surface';
