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
import { MAP_SIZE } from '@qoti/sim';
import {
  Color,
  DataTexture,
  MeshLambertMaterial,
  NearestFilter,
  RedFormat,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { WorldEnv } from './env';
import type { Era } from '@qoti/content';
import { kitLamp, lampQuality } from './lightMap';
import { lampEra, WINDOW_HASH_GLSL } from './lighting';
import { patchWallAo } from './wallAo';

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
 * R3F: the tiles of homes with a candle tonight, while their windows burn (dusk to `candleUntil`):
 * one texel a tile, 255 on a candle home's footprint. The lights layer writes it; the kit material
 * reads it at each window pane (a little inside its wall), so such a home lights every window and the
 * others keep the share by the hour (`19-evenings.md`, Supplies: no home ever goes dark).
 */
export interface CandleMask {
  uCandles: { value: DataTexture };
}

const candleMasks = new WeakMap<object, CandleMask>();

/** The env's candle mask (all zero until the lights layer writes it). */
export function candleMask(env: object): CandleMask {
  let m = candleMasks.get(env);
  if (!m) {
    const t = new DataTexture(new Uint8Array(MAP_SIZE * MAP_SIZE), MAP_SIZE, MAP_SIZE, RedFormat);
    t.magFilter = NearestFilter;
    t.minFilter = NearestFilter;
    t.name = 'qoti.candles';
    t.needsUpdate = true;
    m = { uCandles: { value: t } };
    candleMasks.set(env, m);
  }
  return m;
}

/**
 * R3F: how far inside its wall a pane looks for its home's tile in the candle mask (tiles), so a
 * window on a row's party line reads its own house, not the street or the neighbor's.
 */
export const CANDLE_PROBE = 0.35;

/**
 * R3F: how bright a candle-lit pane burns against one lit by the share (1). Every home keeps its
 * share in the evening (about three panes in four), so a candle home lighting them all would barely
 * show; a candle's pane burns a little brighter as well, and its spill reaches a little farther, so
 * a well supplied street reads brighter home by home and no home ever goes dark. *(tune)*
 */
export const CANDLE_GLOW = 1.4;

// R3F: a pane's candle (1 when its home has one tonight), from its world point and normal.
const CANDLE_VERTEX_HEAD = /* glsl */ `
uniform sampler2D uCandles;
float qCandle(vec3 p, vec3 n) {
  float l = length(n.xz);
  vec2 q = p.xz - (l > 0.01 ? n.xz / l : vec2(0.0)) * ${CANDLE_PROBE.toFixed(2)};
  return texture2D(uCandles, q / ${MAP_SIZE.toFixed(1)}).r;
}
`;

/**
 * R3F: how bright a lamp the lamplighter lit (glow 3) burns before full night: lit at the round
 * (17:30 to 18:00), still golden hour, a flame that only showed at night's strength would not be
 * seen, so it burns at least this share of its night glow from the first breath of dusk. *(tune)*
 */
export const LAMP_DUSK_FLOOR = 0.9;

/**
 * The night glow as shader replacements: vertices with the optional `glow` attribute (window panes,
 * flames) shine warm at night, on a seeded share of windows that changes with the hour (C3D-1: the
 * share and the hash come from lighting.ts, so ground spill matches lit panes). A missing
 * attribute reads as 0. `glint` adds the kit material's glass and water glint after it.
 * V2A: with `lamp`, flames (`glow` 2) take the era's flame color and flicker a little on the static
 * clock (so they hold still at rest, like the sway; the light map's pools never flicker).
 * R3F: with `candles`, a pane of a home with a candle tonight is lit whatever the share; with
 * `lamp`, glow 3 (a lamp the lamplighter lit) burns from dusk at `LAMP_DUSK_FLOOR` at least.
 */
function patchNightGlow(
  shader: WebGLProgramParametersWithUniforms,
  night: { value: number },
  share: { value: number },
  glint: boolean,
  lamp?: { flame: { value: Color }; time: { value: number } },
  candles?: CandleMask,
): void {
  shader.uniforms.uNight = night;
  shader.uniforms.uWindowShare = share;
  if (lamp) {
    shader.uniforms.uFlame = lamp.flame;
    shader.uniforms.uFlickerTime = lamp.time;
  }
  if (candles) shader.uniforms.uCandles = candles.uCandles;
  // The pane's world normal, as its world point is found (instance, then batch, then model).
  const lit = candles
    ? [
        'float qPane = 0.0;',
        'if (glow > 0.0 && glow < 1.5) {',
        '  vec3 qWN = objectNormal;',
        '  #ifdef USE_INSTANCING',
        '  qWN = mat3(instanceMatrix) * qWN;',
        '  #endif',
        '  #ifdef USE_BATCHING',
        '  qWN = mat3(batchingMatrix) * qWN;',
        '  #endif',
        '  qWN = mat3(modelMatrix) * qWN;',
        `  qPane = max(qWindowLit(qWorld.xyz, uWindowShare), qCandle(qWorld.xyz, qWN) * ${CANDLE_GLOW.toFixed(2)});`,
        '}',
        `vGlow = glow > 1.5 ? 1.0 : glow * qPane;`,
      ].join('\n')
    : `vGlow = glow > 1.5 ? 1.0 : glow * qWindowLit(qWorld.xyz, uWindowShare);`;
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>\nattribute float glow;\nvarying float vGlow;\nuniform float uNight;\nuniform float uWindowShare;\n${WINDOW_HASH_GLSL}${candles ? CANDLE_VERTEX_HEAD : ''}${lamp ? FLICKER_VERTEX_HEAD : ''}`,
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
        lit,
        // R3F: a lamp the lamplighter lit (glow 3) flickers as a flame and is marked negative.
        lamp ? 'vFlame = glow > 1.5 ? qFlicker(qWorld.xz) * (glow > 2.5 ? -1.0 : 1.0) : 0.0;' : '',
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
          ? // A flame burns its era's color at its flicker; a pane keeps the candle glow, lighting
            // the little room behind it (qRoomTint, packages/art materials.ts; 1 with rooms off).
            // V2X, the owner's first night on the laptop: panes a third softer than flames (1.7, was
            // 2.4 like them), so lit windows glow rather than flare under the night's bloom.
            // R3F: a lamp the lamplighter lit (vFlame < 0) burns from dusk, LAMP_DUSK_FLOOR at least.
            `totalEmissiveRadiance += (vFlame != 0.0 ? uFlame * abs(vFlame) * 2.4 : vec3(1.0, 0.7, 0.36) * qRoomTint * 1.7) * vGlow * (vFlame < 0.0 ? max(uNight, ${LAMP_DUSK_FLOOR.toFixed(3)} * smoothstep(0.0, 0.025, uNight)) : uNight);`
          : `totalEmissiveRadiance += ${GLOW} * vGlow * uNight;`,
        // P3C: the moon's glint a twentieth of the sun's (its full strength on a well's water
        // bloomed into a cyan orb at night).
        glint
          ? 'totalEmissiveRadiance += qKitGlint(max(min(vGlow * uNight * 2.0, 1.0), uNight * 0.95));'
          : '',
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
    patchKitShader(shader, u, kitLamp(env), lampQuality(env).uRooms);
    patchNightGlow(
      shader,
      env.night,
      env.windowShare,
      true,
      { flame, time: env.staticTime },
      candleMask(env),
    );
    patchWallAo(shader, env);
  };
  material.customProgramCacheKey = () => 'qoti-lean-kit-world';
  material.userData.kitHooks = { season: 'spring', snow: 0, sway: 1 } satisfies KitMaterialHooks;
  material.userData.kitUniforms = u;
  return material;
}
