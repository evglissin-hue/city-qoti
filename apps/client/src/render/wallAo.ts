import type { WebGLProgramParametersWithUniforms } from 'three';
import type { WorldEnv } from './env';
import { AO_FLOOR, GROUND_AO_GLSL, groundAoFor } from './groundAo';

/**
 * V2C: wall occlusion. Binds V1C's ground AO texture (`groundAoFor(env)`, shared, so the terrain
 * layer's later texture swaps reach it) in the kit material and darkens walls toward the ground:
 * most in narrow streets and courtyards, nothing on an open lawn.
 *
 * Height variant: the kit shader has no ground height (no height texture is bound anywhere), so the
 * block cannot fade by height above the ground. It uses the fallback: only faces whose normal is
 * mostly horizontal take it (a smooth fade from |n.y| 0.35 to 0.6, so roofs and tops get nothing),
 * scaled by how deep the AO is where the face stands (the texture is itself pooled around walls, so
 * it fades a tile or two out from them). The sample sits a third of a tile out along the normal, on
 * the ground the wall faces.
 *
 * Anchor: `#include <aomap_fragment>`, kept in place with the block after it (V2A's patches leave
 * that chunk alone). Lambert has already summed the lights there and emissive is added later, so
 * lit panes and flames do not darken.
 */

/** The most a wall darkens at the darkest AO texel, in the indirect light. *(tune)* */
export const WALL_AO_STRENGTH = 0.35;
/** The sun's share of that darkening: walls read darker in the sun too, but gentler. */
export const WALL_AO_DIRECT = 0.5;

const ANCHOR = '#include <aomap_fragment>';

const BLOCK = /* glsl */ `
{
  // V2C wall occlusion (wallAo.ts)
  vec3 qWn = normalize(vQWNor);
  float qSide = 1.0 - smoothstep(0.35, 0.6, abs(qWn.y));
  float qAo = qGroundAo(vQWPos.xz + qWn.xz * 0.33);
  float qDark = clamp((1.0 - qAo) / ${(1 - AO_FLOOR).toFixed(2)}, 0.0, 1.0);
  float qWall = 1.0 - ${WALL_AO_STRENGTH.toFixed(2)} * qDark * qSide;
  reflectedLight.indirectDiffuse *= qWall;
  reflectedLight.directDiffuse *= mix(1.0, qWall, ${WALL_AO_DIRECT.toFixed(2)});
}`;

/** Adds `uGroundAo` and the wall block to a kit fragment shader. Throws if the anchor chunk is gone. */
export function patchWallAo(shader: WebGLProgramParametersWithUniforms, env: WorldEnv): void {
  if (!shader.fragmentShader.includes(ANCHOR) || !shader.fragmentShader.includes('void main()')) {
    throw new Error(`patchWallAo: the fragment shader has no ${ANCHOR} chunk or no main()`);
  }
  shader.uniforms.uGroundAo = groundAoFor(env);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main()', `${GROUND_AO_GLSL}\nvoid main()`)
    .replace(ANCHOR, `${ANCHOR}\n${BLOCK}`);
}
