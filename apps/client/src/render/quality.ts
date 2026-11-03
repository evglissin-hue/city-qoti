export type Quality = 'low' | 'medium' | 'high' | 'ultra';

/** Ambient critters (butterflies, bees, ducks, frogs, fireflies) by preset. */
export type CritterLevel = 'none' | 'some' | 'all';

/**
 * A quality preset, with the values in docs/spec/17-presentation.md, Quality presets. The lean
 * renderer (V1D) reads every field; `maxDpr` is kept for the classic engine (`?engine=classic`).
 */
export interface QualityPreset {
  /** Cap on the device pixel ratio for the classic engine (`?engine=classic`); V1D reads `renderScale`. */
  maxDpr: number;
  /** Size of the cached sun shadow map (V1D: every preset has shadows; 0 would turn them off). */
  shadowMap: number;
  /** V1.0: MSAA samples on the scene target, 0 or 4 (the canvas itself has no antialiasing). */
  msaa: 0 | 4;
  /** Keep redrawing while gentle ambient motion (water, smoke, sails) is in view. */
  ambientMotion: boolean;
  /** C3D addition: residents within this many tiles get full figures (docs/spec/17, Quality presets). */
  residentDetail: number;
  /** C3D-1: decor and small prop detail distance in tiles (17-presentation.md, Quality presets). */
  decorDistance: number;
  // V1 additions (V1.0).
  /**
   * The pixel ratio moving frames are drawn at, at most: the device's, capped here (Low draws at
   * 0.75 of a pixel ratio of 1). Dynamic resolution scales it down from there while the camera moves.
   */
  renderScale: number;
  /** The still-frame cache: static layers drawn once while the camera rests (V1D). */
  stillCache: boolean;
  /** Screen-space ambient occlusion on still frames (Ultra; V1D). */
  stillAo: boolean;
  /** Buildings at full detail within this many tiles, the low version beyond (V1D's lod.ts). */
  buildingDetail: number;
  /** Bloom at golden hour and night in the final pass. */
  bloom: boolean;
  /** Ambient critters (V1C and the seasons art). */
  critters: CritterLevel;
  // V1D additions.
  /**
   * The pixel ratio still and idle frames (the camera at rest) are drawn at, at most: the device's,
   * capped here, and never below `renderScale`. The still-frame cache draws the static layers once,
   * so a rest can afford a sharper picture than a pan (17-presentation.md, Quality presets).
   */
  stillScale: number;
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  high: {
    maxDpr: 2,
    shadowMap: 4096,
    msaa: 4,
    ambientMotion: true,
    residentDetail: 100,
    decorDistance: 140,
    renderScale: 1.5,
    stillCache: true,
    stillAo: false,
    buildingDetail: 75,
    bloom: true,
    critters: 'all',
    stillScale: 2,
  },
  low: {
    maxDpr: 1,
    shadowMap: 1024,
    msaa: 0,
    ambientMotion: false,
    residentDetail: 30,
    decorDistance: 40,
    renderScale: 0.75,
    stillCache: false,
    stillAo: false,
    buildingDetail: 40,
    bloom: false,
    critters: 'none',
    stillScale: 0.75,
  },
  medium: {
    // Playtest round three: 1.5 on a Retina screen looked soft. V1D: moving frames draw at 1 (with
    // dynamic resolution below that), and the camera at rest draws at the device's ratio, up to 2.
    maxDpr: 2,
    shadowMap: 2048,
    msaa: 4,
    ambientMotion: true,
    residentDetail: 60,
    decorDistance: 80,
    renderScale: 1,
    stillCache: true,
    stillAo: false,
    buildingDetail: 60,
    bloom: true,
    critters: 'some',
    stillScale: 2,
  },
  // V1.0: for the stronger laptop or a desktop; never auto-detected.
  ultra: {
    maxDpr: 2,
    shadowMap: 4096,
    msaa: 4,
    ambientMotion: true,
    residentDetail: 140,
    decorDistance: 200,
    renderScale: 2,
    stillCache: true,
    stillAo: true,
    buildingDetail: 110,
    bloom: true,
    critters: 'all',
    stillScale: 3,
  },
};

/**
 * A floor under every preset's building distance. It was 75 tiles while a building's far level had
 * no windows (a town past 60 tiles went dark at night); V1B's far levels keep their panes as flat,
 * lit quads, so it is 0 and the presets' own distances apply (docs/build/v1-wave-notes.md).
 */
export const BUILDING_DETAIL_FLOOR = 0;

/** The building detail distance in tiles (`env.buildingDetail`): the preset's own, above the floor. */
export function buildingDetailNow(q: Quality): number {
  return Math.max(QUALITY_PRESETS[q].buildingDetail, BUILDING_DETAIL_FLOOR);
}

/**
 * The pixel ratios a preset draws at on a device: `moving` for frames while the camera moves
 * (before dynamic resolution) and `still` for frames while it rests. `cap` overrides the moving cap
 * (`?debug&dpr=2`, to compare caps on one screen).
 */
export function pixelRatios(
  preset: QualityPreset,
  devicePixelRatio: number,
  cap?: number,
): { moving: number; still: number } {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const moving = Math.min(dpr, cap ?? preset.renderScale);
  const still = preset.stillCache ? Math.max(moving, Math.min(dpr, preset.stillScale)) : moving;
  return { moving, still };
}

/** Whether a stored or typed value names a preset. */
export function isQuality(q: unknown): q is Quality {
  return q === 'low' || q === 'medium' || q === 'high' || q === 'ultra';
}

/**
 * A first guess from the device; players can change it in settings. Core counts say little about
 * the GPU (a 10-core laptop still drives a Retina screen from integrated graphics), so the guess
 * never picks High or Ultra: Medium plus dynamic resolution suits most laptops, and High and Ultra
 * are a choice.
 */
export function detectQuality(
  nav: { hardwareConcurrency?: number; userAgent?: string } = navigator,
): Quality {
  const cores = nav.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(nav.userAgent ?? '');
  if (mobile || cores <= 2) return 'low';
  return 'medium';
}
