export type Quality = 'low' | 'medium' | 'high' | 'ultra';

/** Ambient critters (butterflies, bees, ducks, frogs, fireflies) by preset. */
export type CritterLevel = 'none' | 'some' | 'all';

/**
 * A quality preset. The V1 fields (V1.0) hold the values in docs/spec/17-presentation.md, Quality
 * presets; until V1D lands the lean renderer, today's renderer reads only `maxDpr`, `shadowMap`,
 * `msaa`, `ambientMotion`, `residentDetail`, `decorDistance` and, on Ultra alone,
 * `buildingDetail` (see `buildingDetailNow`), so nothing on screen changes.
 */
export interface QualityPreset {
  /** Cap on the device pixel ratio (today's renderer; V1D replaces it with `renderScale`). */
  maxDpr: number;
  /** Shadow map size, 0 for no shadows (V1D: Low gets a cached 1024). */
  shadowMap: number;
  /** V1.0: MSAA samples, 0 or 4 (on the default framebuffer today, on the scene target from V1D). */
  msaa: 0 | 4;
  /** Keep redrawing while gentle ambient motion (water, smoke, sails) is in view. */
  ambientMotion: boolean;
  /** C3D addition: residents within this many tiles get full figures (docs/spec/17, Quality presets). */
  residentDetail: number;
  /** C3D-1: decor and small prop detail distance in tiles (17-presentation.md, Quality presets). */
  decorDistance: number;
  // V1 additions (V1.0).
  /**
   * The pixel ratio the scene is drawn at, at most: the device's, capped here (Low draws at 0.75 of
   * a pixel ratio of 1). Dynamic resolution scales it down from there.
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
  },
  low: {
    maxDpr: 1,
    shadowMap: 0,
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
  },
  medium: {
    // Playtest round three: 1.5 on a Retina screen looked soft; dynamic resolution steps down instead.
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
  },
  // V1.0: for the stronger laptop or a desktop; never auto-detected. Until V1D it behaves as High
  // with Ultra's distances.
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
  },
};

/** Today's buildings swap to their low detail beyond 75 tiles on every preset but Ultra. */
const BUILDING_DETAIL_BEFORE_V1 = 75;

/**
 * The building detail distance today's renderer uses (`env.buildingDetail`): the 75 tiles every
 * preset had before V1, and Ultra's own distance. V1D switches to `buildingDetail` for all.
 */
export function buildingDetailNow(q: Quality): number {
  return q === 'ultra' ? QUALITY_PRESETS.ultra.buildingDetail : BUILDING_DETAIL_BEFORE_V1;
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
