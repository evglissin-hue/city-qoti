// The world's shared kit material (V1.0 split from renderer.ts; V1A's file). V1A: the lean kit
// material, Lambert with the pattern array laid on each face by its surface id (packages/art
// materials.ts holds the shader so the gallery draws the same thing), the night glow from `glow`,
// a sky fresnel and sun glint on glass and water, the season tint, snow and sway, all bound to the
// world env's uniform objects, so the hour and the season never recompile anything.
import {
  KIT_FRESNEL_GLSL,
  palette2,
  patchKitShader,
  surfaceTable,
  type KitSurfaceUniforms,
  type KitMaterialHooks,
} from '@qoti/art';
import { Color, MeshLambertMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import type { WorldEnv } from './env';
import { WINDOW_HASH_GLSL } from './lighting';

/**
 * Sky fresnel and sun glint as GLSL (`qFresnel`, `qSkyFresnel`, `qSunGlint`; see packages/art
 * materials.ts), for V1C's water shader.
 */
export const FRESNEL_GLSL = KIT_FRESNEL_GLSL;

/** The night glow's color (a warm lamp) and strength at full night. */
const GLOW = 'vec3(1.0, 0.7, 0.36) * 2.4';

/**
 * The night glow as shader replacements: vertices with the optional `glow` attribute (window panes,
 * flames) shine warm at night, on a seeded share of windows that changes with the hour (C3D-1: the
 * share and the hash come from lighting.ts, so ground spill matches lit panes). A missing
 * attribute reads as 0. `glint` adds the kit material's glass and water glint after it.
 */
function patchNightGlow(
  shader: WebGLProgramParametersWithUniforms,
  night: { value: number },
  share: { value: number },
  glint: boolean,
): void {
  shader.uniforms.uNight = night;
  shader.uniforms.uWindowShare = share;
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>\nattribute float glow;\nvarying float vGlow;\nuniform float uNight;\nuniform float uWindowShare;\n${WINDOW_HASH_GLSL}`,
    )
    .replace(
      '#include <project_vertex>',
      [
        '#include <project_vertex>',
        'vec4 qWorld = vec4(transformed, 1.0);',
        '#ifdef USE_INSTANCING',
        'qWorld = instanceMatrix * qWorld;',
        '#endif',
        // C3D: buildings are batched; glow 2 marks lights that are always on (lanterns, shops).
        '#ifdef USE_BATCHING',
        'qWorld = batchingMatrix * qWorld;',
        '#endif',
        'qWorld = modelMatrix * qWorld;',
        `vGlow = glow > 1.5 ? 1.0 : glow * qWindowLit(qWorld.xyz, uWindowShare);`,
      ].join('\n'),
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform float uNight;')
    .replace(
      '#include <emissivemap_fragment>',
      [
        '#include <emissivemap_fragment>',
        `totalEmissiveRadiance += ${GLOW} * vGlow * uNight;`,
        glint ? 'totalEmissiveRadiance += qKitGlint(min(vGlow * uNight * 2.0, 1.0));' : '',
      ].join('\n'),
    );
}

/** Adds the night glow to any kit material (C3D-1; the kit material below has it built in). */
export function addNightGlow(material: Material, night: { value: number }, share: { value: number }): void {
  material.onBeforeCompile = (shader) => patchNightGlow(shader, night, share, false);
  material.customProgramCacheKey = () => 'qoti-night-glow';
  material.needsUpdate = true;
}

/** The kit material's uniforms, bound to the world env's objects where it has them. */
export function kitUniforms(env: WorldEnv): KitSurfaceUniforms {
  return {
    uPat: env.patterns,
    ...surfaceTable(),
    uPatternK: { value: 1 },
    uFlowerK: { value: 1 },
    uMeadow: { value: new Color(palette2.meadow) },
    uSky: env.sky,
    uSkyTop: env.skyTop,
    uSunDir: env.sunDir,
    uSunColor: env.sunColor,
    uSnow: env.snow,
    uSnowColor: { value: new Color(0xf2f5f7) },
    uSeasonTint: env.seasonTint,
    uSway: env.sway,
    uSwayTime: env.staticTime,
  };
}

/**
 * The material every kit layer shares (`LayerContext.material`): the lean kit material (Lambert,
 * vertex colors, patterns by surface id) with the night glow, reading the night, the share of lit
 * windows, the sky, the sun and the season from the world's look state.
 */
export function createWorldMaterial(env: WorldEnv): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ vertexColors: true });
  const u = kitUniforms(env);
  material.onBeforeCompile = (shader) => {
    patchKitShader(shader, u);
    patchNightGlow(shader, env.night, env.windowShare, true);
  };
  material.customProgramCacheKey = () => 'qoti-lean-kit-world';
  material.userData.kitHooks = { season: 'spring', snow: 0, sway: 1 } satisfies KitMaterialHooks;
  material.userData.kitUniforms = u;
  return material;
}
