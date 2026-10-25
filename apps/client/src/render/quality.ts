export type Quality = 'low' | 'medium' | 'high';

export interface QualityPreset {
  /** Cap on the device pixel ratio. */
  maxDpr: number;
  /** Shadow map size, 0 for no shadows. */
  shadowMap: number;
  /** Multisample antialiasing on the default framebuffer (fixed at context creation). */
  msaa: boolean;
  /** Keep redrawing while gentle ambient motion (water, smoke, sails) is in view. */
  ambientMotion: boolean;
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  high: { maxDpr: 2, shadowMap: 2048, msaa: true, ambientMotion: true },
  low: { maxDpr: 1, shadowMap: 0, msaa: false, ambientMotion: false },
  medium: { maxDpr: 1.5, shadowMap: 1024, msaa: true, ambientMotion: true },
};

/** A first guess from the device; players can change it in settings. */
export function detectQuality(
  nav: { hardwareConcurrency?: number; userAgent?: string } = navigator,
): Quality {
  const cores = nav.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(nav.userAgent ?? '');
  if (mobile || cores <= 2) return 'low';
  if (cores >= 8) return 'high';
  return 'medium';
}
