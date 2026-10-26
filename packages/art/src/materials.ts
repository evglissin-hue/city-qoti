import { MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { palette } from './palette';

/** The shared kit material: vertex colors, matte. C2B extends it with season tint, snow and sway. */
export function createKitMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
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
