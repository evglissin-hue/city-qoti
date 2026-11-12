// V2B: read access to the painted ground's textures (`GroundTextures` in ground.ts) for layers that
// take their color from the ground, such as the meadow carpet (`layers/meadow.ts`), without editing
// the ground shader. The terrain layer owns the textures and sets the holder once at init; readers
// bind the textures in their own materials. One holder per world env, as `groundAoFor` does.
import type { GroundTextures } from './ground';

const holders = new WeakMap<object, { value: GroundTextures | null }>();

/** The ground textures of an env's terrain layer (`value` null until the terrain layer has run init). */
export function groundTexturesFor(env: object): { value: GroundTextures | null } {
  let h = holders.get(env);
  if (!h) {
    h = { value: null };
    holders.set(env, h);
  }
  return h;
}
