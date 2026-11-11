// The world's shared kit material (V1.0 split from renderer.ts; V1A's file). V1A: the lean kit
// material, Lambert with the pattern array laid on each face by its surface id (packages/art
// materials.ts holds the shader so the gallery draws the same thing), the night glow from `glow`,
// a sky fresnel and sun glint on glass and water, the season tint, snow and sway, all bound to the
// world env's uniform objects, so the hour and the season never recompile anything.
import {
  KIT_FRESNEL_GLSL,
  LAMP_COLORS,
  palette2,
  patchKitShader,
  surfaceTable,
  type KitSurfaceUniforms,
  type KitMaterialHooks,
} from '@qoti/art';
import { Color, MeshLambertMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import type { WorldEnv } from './env';
import type { Era } from '@qoti/content';
import { kitLamp } from './lightMap';
import { lampEra, WINDOW_HASH_GLSL } from './lighting';

/**
 * Sky fresnel and sun glint as GLSL (`qFresnel`, `qSkyFresnel`, `qSunGlint`; see packages/art
 * materials.ts), for V1C's water shader.
 */
export const FRESNEL_GLSL = KIT_FRESNEL_GLSL;

/** The night glow's color (a warm lamp) and strength at full night. */
const GLOW = 'vec3(1.0, 0.7, 0.36) * 2.4';

/** The Old Age's flame: the glow's own color (a candle), so a valley before I4 looks as it did. */
const CANDLE_FLAME = new Color(1.0, 0.7, 0.36);

/**
 * V2A: the color lamp flames (`glow` 2) burn for an era: the glow's candle in the Old Age, and the
 * era's lamp token (linear, brightest channel 1) for gas and electric light. Windows keep the
 * candle (`18-eras.md`: a district's lamps set its night color).
 */
export function flameColor(era: Era): Color {
  if (era === 'old') return CANDLE_FLAME.clone();
  const c = new Color().setHex(LAMP_COLORS[era]);
  return c.multiplyScalar(1 / Math.max(c.r, c.g, c.b));
}

/**
 * The night glow as shader replacements: vertices with the optional `glow` attribute (window panes,
 * flames) shine warm at night, on a seeded share of windows that changes with the hour (C3D-1: the
 * share and the hash come from lighting.ts, so ground spill matches lit panes). A missing
 * attribute reads as 0. `glint` adds the kit material's glass and water glint after it.
 * V2A: with `lamp`, flames (`glow` 2) take the era's flame color and flicker a little on the static
 * clock (so they hold still at rest, like the sway; the light map's pools never flicker).
 */
function patchNightGlow(
  shader: WebGLProgramParametersWithUniforms,
  night: { value: number },
  share: { value: number },
  glint: boolean,
  lamp?: { flame: { value: Color }; time: { value: number } },
): void {
  shader.uniforms.uNight = night;
  shader.uniforms.uWindowShare = share;
  if (lamp) {
    shader.uniforms.uFlame = lamp.flame;
    shader.uniforms.uFlickerTime = lamp.time;
  }
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>\nattribute float glow;\nvarying float vGlow;\nuniform float uNight;\nuniform float uWindowShare;\n${WINDOW_HASH_GLSL}${lamp ? FLICKER_VERTEX_HEAD : ''}`,
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
        lamp ? 'vFlame = glow > 1.5 ? qFlicker(qWorld.xz) : 0.0;' : '',
      ].join('\n'),
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>\nvarying float vGlow;\nuniform float uNight;${lamp ? '\nvarying float vFlame;\nuniform vec3 uFlame;' : ''}`,
    )
    .replace(
      '#include <emissivemap_fragment>',
      [
        '#include <emissivemap_fragment>',
        lamp
          ? // A flame burns its era's color at its flicker; a pane keeps the candle glow.
            `totalEmissiveRadiance += (vFlame > 0.0 ? uFlame * vFlame : vec3(1.0, 0.7, 0.36)) * 2.4 * vGlow * uNight;`
          : `totalEmissiveRadiance += ${GLOW} * vGlow * uNight;`,
        glint ? 'totalEmissiveRadiance += qKitGlint(min(vGlow * uNight * 2.0, 1.0));' : '',
      ].join('\n'),
    );
}

/**
 * V2A: a flame's flicker (0.8 to 1.1 of its glow), two slow waves and a quick one at a phase hashed
 * from where the flame stands, so neighbors never pulse together. On the static clock, so it holds
 * still while the camera rests.
 */
const FLICKER_VERTEX_HEAD = /* glsl */ `
varying float vFlame;
uniform float uFlickerTime;
float qFlicker(vec2 xz) {
  vec2 c = floor(xz * 3.0);
  float h = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
  float t = uFlickerTime + h * 37.0;
  float f = sin(t * 5.3) * 0.5 + sin(t * 8.9 + h * 6.0) * 0.32 + sin(t * 17.1 + h * 3.0) * 0.18;
  return 0.95 + 0.15 * f;
}
`;

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
  // V2A: lamp flames burn the era's color (?debug&era=steam or bright shows the later two).
  const flame = { value: flameColor(lampEra()) };
  material.onBeforeCompile = (shader) => {
    // V2A: walls, decor, carts and animals take the light map's lamplight (lightMap.ts).
    patchKitShader(shader, u, kitLamp(env));
    patchNightGlow(shader, env.night, env.windowShare, true, { flame, time: env.staticTime });
  };
  material.customProgramCacheKey = () => 'qoti-lean-kit-world';
  material.userData.kitHooks = { season: 'spring', snow: 0, sway: 1 } satisfies KitMaterialHooks;
  material.userData.kitUniforms = u;
  return material;
}
