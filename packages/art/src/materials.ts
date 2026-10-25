import { Color, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { palette } from './palette';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * Hooks on the shared kit material. Season tint, snow and wind sway are stubbed to Spring in I0:
 * the values are stored on `material.userData` for a later shader pass (I3) and change nothing yet.
 */
export interface KitMaterialHooks {
  season: Season;
  /** 0 to 1; snow cover on upward faces (I3). */
  snow: number;
  /** Wind sway strength for foliage (I3). */
  sway: number;
}

/** The shared kit material: vertex colors, matte, with season, snow and sway hooks. */
export function createKitMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const hooks: KitMaterialHooks = { season: 'spring', snow: 0, sway: 0 };
  m.userData.kitHooks = hooks;
  return m;
}

/** Updates the hooks; a no-op on the look until the I3 seasons pass. */
export function setKitMaterialHooks(m: MeshStandardMaterial, hooks: Partial<KitMaterialHooks>): void {
  const cur = (m.userData.kitHooks as KitMaterialHooks | undefined) ?? {
    season: 'spring',
    snow: 0,
    sway: 0,
  };
  m.userData.kitHooks = { ...cur, ...hooks, season: 'spring' };
}

/**
 * The emissive variant for glowing pieces (window panes, lantern flames). `night` 0 to 1 sets the
 * strength; at 0 it looks like the plain kit material.
 */
export function createEmissiveKitMaterial(night = 1): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0,
    emissive: new Color(palette.window),
    emissiveIntensity: 1.6 * night,
  });
  m.userData.kitHooks = { season: 'spring', snow: 0, sway: 0 } satisfies KitMaterialHooks;
  return m;
}

/** Translucent material for placement ghosts, tinted valid or invalid. */
export function createGhostMaterial(valid: boolean): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: valid ? palette.ghostValid : palette.ghostInvalid,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
}
