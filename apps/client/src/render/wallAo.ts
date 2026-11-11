import type { WebGLProgramParametersWithUniforms } from 'three';
import type { WorldEnv } from './env';
import { AO_FLOOR, GROUND_AO_GLSL, groundAoFor } from './groundAo';

/**
 * V2C: wall occlusion. Binds V1C's ground AO texture (`groundAoFor(env)`, shared, so the terrain
 * layer's later texture swaps reach it) in the kit material and darkens walls toward the ground:
 * most in narrow streets and courtyards, nothing on an open lawn.
 *
 * Height: the kit shader has no ground height, but every kit piece stands its origin on the ground
 * (buildings at their stand level, decor and carts on their tile), so the vertex shader passes the
 * piece's base (its instance or batch origin in world space) and the block fades out from the foot
 * to `WALL_AO_FADE` tiles above it. Only faces whose normal is mostly horizontal take it (|n.y| 0.35
 * to 0.6, so roofs and tops get nothing), scaled by how deep the AO is on the ground the face looks
 * at, a third of a tile out along its normal (the contact pass at every foot, the enclosure pass
 * most in narrow streets and courtyards).
 *
 * Anchor: `#include <aomap_fragment>`, kept in place with the block after it (V2A's patches leave
 * that chunk alone). Lambert has already summed the lights there and emissive is added later, so
 * lit panes and flames do not darken.
 */

/** The most a wall darkens at the darkest AO texel, in the indirect light. *(tune)* */
export const WALL_AO_STRENGTH = 0.35;
/** The sun's share of that darkening: walls read darker in the sun too, but gentler. */
export const WALL_AO_DIRECT = 0.5;
/** Tiles above a piece's foot where the darkening has faded out. *(tune)* */
export const WALL_AO_FADE = 1.8;

const ANCHOR = '#include <aomap_fragment>';
/** The vertex anchor: after the position is final and before fog, a chunk no other patch replaces. */
const VERTEX_ANCHOR = '#include <fog_vertex>';

const VERTEX = /* glsl */ `
{
  // V2C wall occlusion: the piece's foot in world space (wallAo.ts)
  vec4 qFoot = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
  qFoot = instanceMatrix * qFoot;
#endif
#ifdef USE_BATCHING
  qFoot = batchingMatrix * qFoot;
#endif
  vQFootY = (modelMatrix * qFoot).y;
}`;

const BLOCK = /* glsl */ `
{
  // V2C wall occlusion (wallAo.ts)
  vec3 qWn = normalize(vQWNor);
  float qSide = 1.0 - smoothstep(0.35, 0.6, abs(qWn.y));
  float qAo = qGroundAo(vQWPos.xz + qWn.xz * 0.33);
  float qDark = clamp((1.0 - qAo) / ${(1 - AO_FLOOR).toFixed(2)}, 0.0, 1.0);
  float qUp = max(vQWPos.y - vQFootY, 0.0) / ${WALL_AO_FADE.toFixed(2)};
  float qLow = 1.0 - smoothstep(0.0, 1.0, qUp);
  float qWall = 1.0 - ${WALL_AO_STRENGTH.toFixed(2)} * qDark * qSide * qLow;
  reflectedLight.indirectDiffuse *= qWall;
  reflectedLight.directDiffuse *= mix(1.0, qWall, ${WALL_AO_DIRECT.toFixed(2)});
}`;

/**
 * Adds `uGroundAo`, the foot varying and the wall block to a kit shader (after `patchKitShader`,
 * which declares `vQWPos` and `vQWNor`). Throws if an anchor chunk is gone.
 */
export function patchWallAo(shader: WebGLProgramParametersWithUniforms, env: WorldEnv): void {
  if (!shader.fragmentShader.includes(ANCHOR) || !shader.fragmentShader.includes('void main()')) {
    throw new Error(`patchWallAo: the fragment shader has no ${ANCHOR} chunk or no main()`);
  }
  if (!shader.vertexShader.includes(VERTEX_ANCHOR) || !shader.vertexShader.includes('void main()')) {
    throw new Error(`patchWallAo: the vertex shader has no ${VERTEX_ANCHOR} chunk or no main()`);
  }
  shader.uniforms.uGroundAo = groundAoFor(env);
  shader.vertexShader = shader.vertexShader
    .replace('void main()', 'varying float vQFootY;\nvoid main()')
    .replace(VERTEX_ANCHOR, `${VERTEX}\n${VERTEX_ANCHOR}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main()', `${GROUND_AO_GLSL}\nvarying float vQFootY;\nvoid main()`)
    .replace(ANCHOR, `${ANCHOR}\n${BLOCK}`);
}
