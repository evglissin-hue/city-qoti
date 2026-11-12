import {
  Color,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Vector3,
  type Material,
  Vector4,
  type DataArrayTexture,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { palette, palette2 } from './palette';
import {
  NOISE_LAYER,
  NOISE_SCALE,
  ROOM_LAYER,
  ROOM_LAYERS,
  SURFACE,
  SURFACE_LAYERS,
  SURFACES,
} from './surface';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * Hooks on the shared kit material: season tint, snow cover and wind sway. V1A: the lean kit
 * material draws them (the client sets them from the world env each season; C5E builds on them).
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

/**
 * Updates the hooks. V1A: on a lean kit material (`createLeanKitMaterial`) they set its uniforms:
 * the season tint, snow cover and sway strength. On the old standard material they are only
 * stored, as before.
 */
export function setKitMaterialHooks(m: Material, hooks: Partial<KitMaterialHooks>): void {
  const cur = (m.userData.kitHooks as KitMaterialHooks | undefined) ?? {
    season: 'spring',
    snow: 0,
    sway: 0,
  };
  const next: KitMaterialHooks = { ...cur, ...hooks };
  m.userData.kitHooks = next;
  const u = m.userData.kitUniforms as KitSurfaceUniforms | undefined;
  if (!u) return;
  u.uSeasonTint.value.setHex(SEASON_LOOK[next.season].tint);
  u.uSnow.value = next.snow;
  u.uSway.value = next.sway;
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

/**
 * C3D: the resident material. Vertex colors plus two per-vertex channels from rig.ts: `paint`
 * picks a tint (instance color for clothes, `iFur` and `iFur2` for fur), and `rig` swings arms,
 * feet, ears and tails about fixed pivots from the per-instance `iMotion` (anim, walk phase, seed,
 * and C4E the arm held out to a partner's hand, 0 for none) and the shared `uTime` uniform (seconds, in `material.userData.time`). Anim numbers follow
 * AgentAnim: 0 idle, 1 walk, 2 carry, 3 hop, 4 work. Body bob and squash live in the instance
 * matrix, so carried bundles can share them.
 */
/**
 * C4P: motions the client derives for residents on top of the sim's AgentAnim (0 to 7; values
 * below 16 belong to the sim), written to the same iMotion.x: chatting, waving while walking,
 * waving while standing, sitting on a bench.
 */
export const MOTION = { talk: 16, wave: 17, waveStill: 18, sit: 19 } as const;

/**
 * V2A: the resident's rim of lamplight, added after the kit's plain lamplight read. Needs the
 * `vQWNor`, `vQWPos`, `uLampNight` and `qLamp` that `patchKitShader` adds with a lamp.
 */
const RESIDENT_RIM_FRAGMENT = /* glsl */ `
{
  vec3 qn = normalize(vQWNor);
  vec3 qv = normalize(cameraPosition - vQWPos);
  float qRim = 1.0 - clamp(dot(qn, qv), 0.0, 1.0);
  qRim *= qRim;
  totalEmissiveRadiance += diffuseColor.rgb * qLamp(vQWPos.xz + qn.xz * 0.3, 0.0) * (uLampNight * uLampNight) * (2.2 * qRim);
}`;

interface ResidentBinding {
  surface?: KitSurfaceUniforms;
  lamp?: KitLampOptions;
}

/**
 * V2A: with `surface`, residents draw the kit's surface ids through its surface table (wood grain,
 * cloth, ...); with `lamp` as well they take the light map's lamplight plus a warm rim at night.
 * `lamp` is ignored without `surface`. With neither, the material compiles as it always did.
 * Both can also arrive later through `bindResidentMaterial`.
 */
export function createResidentMaterial(
  surface?: KitSurfaceUniforms,
  lamp?: KitLampOptions,
): MeshLambertMaterial {
  // V1A: Lambert like the kit material; the old matte standard material had next to no specular.
  const m = new MeshLambertMaterial({ vertexColors: true });
  const time = { value: 0 };
  m.userData.time = time;
  m.userData.residentBinding = { surface, lamp } satisfies ResidentBinding;
  // V2A: folk move, so their surfaces are laid from the figure's own position.
  if (surface) usePatternLocal(m);
  m.onBeforeCompile = (shader) => {
    const { surface: sf, lamp: lp } = m.userData.residentBinding as ResidentBinding;
    shader.uniforms.uTime = time;
    if (sf) patchKitShader(shader, sf, lp);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${RESIDENT_VERTEX_HEAD}`)
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nqRigSetup();\nobjectNormal = qRot(objectNormal);',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = qRigPoint(transformed);')
      .replace('#include <color_vertex>', RESIDENT_COLOR_VERTEX);
    if (sf && lp)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n${RESIDENT_RIM_FRAGMENT}`,
      );
  };
  m.customProgramCacheKey = () => {
    const { surface: sf, lamp: lp } = m.userData.residentBinding as ResidentBinding;
    return `qoti-resident${sf ? '-surface' : ''}${sf && lp ? '-lamp' : ''}`;
  };
  return m;
}

/** V2A: the define that lays a kit material's patterns from local position (`usePatternLocal`). */
export const KIT_PATTERN_LOCAL = 'Q_PATTERN_LOCAL';

/**
 * V2A: lays a kit material's patterns from each vertex's position before the instance (or batch)
 * matrix instead of from world position, for moving pieces (carts, folk), so wood grain and cloth
 * travel with them instead of sliding across them. Lighting, snow and the light map read stay in
 * world space. Set it on a material of moving pieces only: static pieces keep world-laid patterns,
 * which line up across neighbors. A define, so it compiles its own program.
 */
export function usePatternLocal(m: Material): void {
  m.defines = { ...m.defines, [KIT_PATTERN_LOCAL]: '' };
  m.needsUpdate = true;
}

/**
 * V2A: gives a resident material its surface table and lamp after creation (the env only exists
 * once the layer is initialised). Call before the first render.
 */
export function bindResidentMaterial(
  m: MeshLambertMaterial,
  surface: KitSurfaceUniforms,
  lamp?: KitLampOptions,
): void {
  m.userData.residentBinding = { surface, lamp } satisfies ResidentBinding;
  usePatternLocal(m);
}

const RESIDENT_VERTEX_HEAD = /* glsl */ `
attribute float paint;
attribute float rig;
attribute vec3 iFur;
attribute vec3 iFur2;
attribute vec4 iMotion;
uniform float uTime;
vec3 qPivot;
vec3 qShift;
float qAx;
float qAy;
float qAz;
vec3 qRot(vec3 p) {
  float c = cos(qAx), s = sin(qAx);
  p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
  c = cos(qAz); s = sin(qAz);
  p = vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
  c = cos(qAy); s = sin(qAy);
  return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}
void qRigSetup() {
  qPivot = vec3(0.0); qShift = vec3(0.0); qAx = 0.0; qAy = 0.0; qAz = 0.0;
  float anim = iMotion.x;
  float ph = iMotion.y;
  float seed = iMotion.z;
  // AgentAnim from the sim below 16 (C5E draws run and dance); the client's own motions from 16
  // (MOTION, C4P): 16 talk, 17 wave while walking, 18 wave standing, 19 sit.
  bool wave = anim > 16.5 && anim < 18.5;
  bool walk = (anim > 0.5 && anim < 2.5) || (anim > 16.5 && anim < 17.5);
  bool carry = anim > 1.5 && anim < 2.5;
  bool hop = anim > 2.5 && anim < 3.5;
  bool work = anim > 3.5 && anim < 4.5;
  bool talk = anim > 15.5 && anim < 16.5;
  bool sit = anim > 18.5 && anim < 19.5;
  if (rig > 0.5 && rig < 2.5) {
    float side = rig < 1.5 ? 1.0 : -1.0;
    qPivot = vec3(0.066 * side, 0.15, 0.0);
    // C4E: iMotion.w names an arm (1 or 2) held out to a partner's hand, swinging a little.
    if (iMotion.w > 0.5 && abs(iMotion.w - rig) < 0.5) {
      qAz = side * 0.42;
      qAx = -0.22 + (walk ? sin(ph) * 0.12 : 0.0);
    } else if (wave && side < 0.0) {
      // C4P: a hand up and waving to a friend.
      qAz = side * (2.45 + sin(uTime * 11.0 + seed) * 0.32);
      qAx = -0.25;
    } else if (carry) qAx = -1.3;
    else if (walk) qAx = sin(ph) * 0.75 * side;
    else if (hop) qAz = side * (2.2 + sin(uTime * 9.0 + seed) * 0.25);
    else if (work) qAx = -1.05 + sin(uTime * 9.0 + seed) * 0.6;
    else if (talk && side * (fract(seed * 0.37) - 0.5) > 0.0) {
      // C4P: talking with one hand, the way folk do over a fence.
      qAx = -0.7 + sin(uTime * 3.1 + seed) * 0.35;
      qAz = side * (0.22 + sin(uTime * 2.3 + seed * 2.0) * 0.14);
    } else if (sit) {
      qAx = -0.55;
      qAz = side * 0.1;
    } else qAx = sin(uTime * 1.7 + seed) * 0.07;
  } else if (rig > 2.5 && rig < 4.5) {
    float side = rig < 3.5 ? 1.0 : -1.0;
    if (walk) qShift = vec3(0.0, max(0.0, -cos(ph) * side) * 0.03, -sin(ph) * side * 0.045);
    else if (hop) qShift = vec3(0.0, 0.012, -0.01);
    // C4P: seated, the feet come forward off the edge of the bench and swing a little.
    else if (sit) qShift = vec3(0.0, -0.006, 0.05 + sin(uTime * 2.1 + seed + side) * 0.008);
  } else if (rig > 4.5 && rig < 5.5) {
    qPivot = vec3(0.0, 0.255, 0.01);
    if (walk) qAx = -0.08 + sin(ph * 2.0) * 0.1;
    else if (hop) qAx = -0.35;
    else if (talk) qAx = -0.1 + sin(uTime * 3.0 + seed) * 0.08;
    else qAx = sin(uTime * 2.3 + seed) * 0.05 + max(0.0, sin(uTime * 0.7 + seed * 3.0) - 0.96) * 4.0;
  } else if (rig > 5.5) {
    qPivot = vec3(0.0, 0.07, -0.06);
    qAy = walk ? sin(ph) * 0.3 : sit ? sin(uTime * 1.3 + seed) * 0.1 : sin(uTime * (hop ? 12.0 : talk ? 4.0 : 2.6) + seed) * 0.22;
  }
}
vec3 qRigPoint(vec3 p) { return qRot(p - qPivot) + qPivot + qShift; }
`;

const RESIDENT_COLOR_VERTEX = /* glsl */ `
  vColor = vec4( 1.0 );
#ifdef USE_COLOR
  vColor.rgb *= color.rgb;
#endif
#ifdef USE_INSTANCING_COLOR
  if (paint > 0.5 && paint < 1.5) vColor.rgb *= instanceColor.rgb;
#endif
  if (paint > 1.5 && paint < 2.5) vColor.rgb *= iFur;
  else if (paint > 2.5) vColor.rgb *= iFur2;
`;

/** Translucent material for placement ghosts, tinted valid or invalid. */
export function createGhostMaterial(valid: boolean): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: valid ? palette.ghostValid : palette.ghostInvalid,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
}

// ---------------------------------------------------------------- V1A: the lean kit material

/**
 * The uniforms the lean kit material reads. Pass shared `{ value }` objects (the client binds the
 * world env's, so one change reaches every material without a recompile).
 */
export interface KitSurfaceUniforms {
  /** The pattern array (patterns.ts), shared with the ground shader. */
  uPat: { value: DataArrayTexture };
  /** Per surface id: 1 / scale, mapping (0 facade, 1 roof, 2 top), strength, accent mix. */
  uSurf: { value: Vector4[] };
  /** Per surface id: the accent color (linear). */
  uSurfAccent: { value: Color[] };
  /** Per surface id: snow hint (how much of the pattern shows through snow), foliage (season tint). */
  uSurfExtra: { value: Vector4[] };
  /** Global pattern strength, 0 (flat colors) to 1. */
  uPatternK: { value: number };
  /** Grass flower dots, 0 to 1. */
  uFlowerK: { value: number };
  /** Meadow patches on grass (linear). */
  uMeadow: { value: Color };
  /** The horizon and the top of the sky, for the fresnel on glass and water. */
  uSky: { value: Color };
  uSkyTop: { value: Color };
  /** Towards the sun, and its color, for the glint. */
  uSunDir: { value: Vector3 };
  uSunColor: { value: Color };
  /** Snow cover on upward faces, 0 to 1 (winter), and its color. */
  uSnow: { value: number };
  uSnowColor: { value: Color };
  /** Season tint multiplied into foliage surfaces (grass, leaf, field). */
  uSeasonTint: { value: Color };
  /** Wind sway on leaf and flower surfaces: strength and its clock (static time). */
  uSway: { value: number };
  uSwayTime: { value: number };
}

/** Snow shows a hint of courses on these roofs (C5E can tune it per surface). */
const SNOW_HINT: Partial<Record<number, number>> = {
  [SURFACE.thatch]: 0.35,
  [SURFACE.slate]: 0.3,
  [SURFACE.tile]: 0.25,
  [SURFACE.cobble]: 0.2,
  [SURFACE.flags]: 0.2,
};
/** Surfaces the season tint reaches. */
const FOLIAGE = new Set<number>([SURFACE.grass, SURFACE.leaf, SURFACE.field]);

/** The surface table as uniform arrays (from surface.ts and palette 2.0). */
export function surfaceTable(): Pick<KitSurfaceUniforms, 'uSurf' | 'uSurfAccent' | 'uSurfExtra'> {
  const surf: Vector4[] = [];
  const accent: Color[] = [];
  const extra: Vector4[] = [];
  for (let id = 0; id < SURFACE_LAYERS; id++) {
    const d = SURFACES[id];
    const mapping = !d ? 0 : d.mapping === 'roof' ? 1 : d.mapping === 'top' ? 2 : 0;
    surf.push(new Vector4(d ? 1 / d.scale : 1 / NOISE_SCALE, mapping, d?.strength ?? 0, d?.accent?.mix ?? 0));
    accent.push(new Color(d?.accent ? palette2[d.accent.token] : 0x000000));
    extra.push(new Vector4(SNOW_HINT[id] ?? 0.1, FOLIAGE.has(id) ? 1 : 0, 0, 0));
  }
  return { uSurf: { value: surf }, uSurfAccent: { value: accent }, uSurfExtra: { value: extra } };
}

/** Season tints for foliage surfaces and how much snow lies, per season. */
export const SEASON_LOOK: Record<Season, { tint: number; snow: number }> = {
  spring: { tint: 0xfdfff2, snow: 0 },
  summer: { tint: 0xf2f7e4, snow: 0 },
  autumn: { tint: 0xffe9b8, snow: 0 },
  winter: { tint: 0xe6e8e2, snow: 1 },
};

/** Fresh uniforms for a kit material outside the game (the gallery); the client binds its env's. */
export function kitSurfaceUniforms(patterns: DataArrayTexture): KitSurfaceUniforms {
  return {
    uPat: { value: patterns },
    ...surfaceTable(),
    uPatternK: { value: 1 },
    uFlowerK: { value: 1 },
    uMeadow: { value: new Color(palette2.meadow) },
    uSky: { value: new Color(0xd8e2e3) },
    uSkyTop: { value: new Color(0x8fb6d8) },
    uSunDir: { value: new Vector3(0.4, 0.8, 0.45).normalize() },
    uSunColor: { value: new Color(0xfff4e0) },
    uSnow: { value: 0 },
    uSnowColor: { value: new Color(palette.snow) },
    uSeasonTint: { value: new Color(SEASON_LOOK.spring.tint) },
    uSway: { value: 1 },
    uSwayTime: { value: 0 },
  };
}

/**
 * Sky fresnel and sun glint as GLSL, for glass and water (the kit material here, V1C's water
 * shader). `n` and `v` are world-space unit vectors (normal, and towards the camera).
 * - `qFresnel(n, v, power)`: 0 facing the camera, 1 at grazing angles.
 * - `qSkyFresnel(c, sky, n, v, base, k, power)`: mixes a color toward the sky by base + k * fresnel.
 * - `qSunGlint(n, v, sunDir, sunColor, shininess, k)`: a cheap Blinn highlight, to add to emissive.
 */
export const KIT_FRESNEL_GLSL = /* glsl */ `
float qFresnel(vec3 n, vec3 v, float power) {
  return pow(1.0 - clamp(dot(n, v), 0.0, 1.0), power);
}
vec3 qSkyFresnel(vec3 c, vec3 sky, vec3 n, vec3 v, float base, float k, float power) {
  return mix(c, sky, clamp(base + k * qFresnel(n, v, power), 0.0, 1.0));
}
vec3 qSunGlint(vec3 n, vec3 v, vec3 sunDir, vec3 sunColor, float shininess, float k) {
  vec3 h = normalize(sunDir + v);
  return sunColor * pow(max(dot(n, h), 0.0), shininess) * k;
}
`;

const KIT_VERTEX_HEAD = /* glsl */ `
attribute float surface;
varying vec3 vQWPos;
varying vec3 vQWNor;
varying float vQSurf;
uniform float uSway;
uniform float uSwayTime;
#ifdef Q_PATTERN_LOCAL
varying vec3 vQPPos;
varying vec3 vQPNor;
#endif
`;

/** Sway: leaf and flower faces (hedges, planters, window boxes) breathe a little with height. */
const KIT_SWAY_VERTEX = /* glsl */ `
vQSurf = surface;
{
  float qLeafy = step(abs(surface - ${SURFACE.leaf}.0), 0.5) + step(abs(surface - ${SURFACE.flowers}.0), 0.5);
  float qH = max(transformed.y - 0.15, 0.0) * qLeafy * uSway;
  float qPh = transformed.x * 2.1 + transformed.z * 1.7;
  transformed.x += sin(uSwayTime * 1.3 + qPh) * qH * 0.02;
  transformed.z += cos(uSwayTime * 1.05 + qPh * 1.3) * qH * 0.015;
}
`;

const KIT_WORLD_VERTEX = /* glsl */ `
{
  vec4 qW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  qW = instanceMatrix * qW;
#endif
#ifdef USE_BATCHING
  qW = batchingMatrix * qW;
#endif
  vQWPos = (modelMatrix * qW).xyz;
  vQWNor = inverseTransformDirection(transformedNormal, viewMatrix);
#ifdef Q_PATTERN_LOCAL
  vQPPos = transformed;
  vQPNor = objectNormal;
#endif
}
`;

const KIT_FRAGMENT_HEAD = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray uPat;
uniform vec4 uSurf[${SURFACE_LAYERS}];
uniform vec3 uSurfAccent[${SURFACE_LAYERS}];
uniform vec4 uSurfExtra[${SURFACE_LAYERS}];
uniform float uPatternK;
uniform float uFlowerK;
uniform vec3 uMeadow;
uniform vec3 uSky;
uniform vec3 uSkyTop;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSnow;
uniform vec3 uSnowColor;
uniform vec3 uSeasonTint;
varying vec3 vQWPos;
varying vec3 vQWNor;
varying float vQSurf;
// V2A: where the pattern is laid from: world position, or (Q_PATTERN_LOCAL, moving pieces such as
// carts and folk) the vertex's own position before the instance matrix, so wood grain and cloth
// travel with the piece instead of sliding across it. Lighting, snow and the light map stay in
// world space.
#ifdef Q_PATTERN_LOCAL
varying vec3 vQPPos;
varying vec3 vQPNor;
#define Q_PPOS vQPPos
#else
#define Q_PPOS vQWPos
#endif
${KIT_FRESNEL_GLSL}
// Set by qKitSurface for the emissive glint: 1 on glass, 2 on water, else 0.
float qShiny = 0.0;
// V2A: set by qKitSurface on glass when rooms are on: the little room's color for the window's
// night glow to light (the client's glow multiplies by it); 1 is the flat glow.
vec3 qRoomTint = vec3(1.0);
#ifdef Q_ROOMS
vec3 qKitRoom(vec3 n, vec3 dx, vec3 dy);
#endif

// The pattern laid on a face as the surface table says, the accent, meadow and flowers on grass,
// weathering from the noise layer, the season tint, then snow on upward faces. Branches only for
// plain faces (no pattern fetch), glass, water and flowers.
vec3 qKitSurface(vec3 c) {
  int si = int(vQSurf + 0.5);
  bool plain = si < 1 || si == ${NOISE_LAYER} || si >= ${SURFACE_LAYERS};
  // Plain faces cost nothing over a flat color unless it snows. The id is the same on every vertex
  // of a face, so this branch never splits a 2 x 2 pixel quad and the derivatives below stay valid.
  if (plain && uSnow <= 0.0) return c;
  vec3 n = normalize(vQWNor);
#ifdef Q_PATTERN_LOCAL
  vec3 pn = normalize(vQPNor);
#else
  vec3 pn = n;
#endif
  // Gradients before the branches that follow: textureGrad keeps mipmaps right across face edges.
  vec3 dx = dFdx(Q_PPOS);
  vec3 dy = dFdy(Q_PPOS);
  const float nk = 1.0 / ${NOISE_SCALE}.0;
  vec2 nuv = Q_PPOS.xz * nk + vec2(Q_PPOS.y * 0.02);
  float up = smoothstep(0.3, 0.75, n.y);
  float big = textureGrad(uPat, vec3(nuv, ${NOISE_LAYER}.0), dx.xz * nk, dy.xz * nk).r;
  float cover = up * clamp(uSnow * 1.3 - (1.0 - big) * 0.3, 0.0, 1.0);
  if (plain) return mix(c, uSnowColor, cover);
  vec4 sp = uSurf[si];
  vec4 sx = uSurfExtra[si];
  bool top = sp.y > 1.5 || abs(pn.y) > (sp.y > 0.5 ? 0.97 : 0.9);
  vec2 uv;
  vec2 gx;
  vec2 gy;
  if (top) {
    uv = Q_PPOS.xz; gx = dx.xz; gy = dy.xz;
  } else {
    float hl = length(pn.xz);
    vec2 t = hl > 1e-3 ? vec2(-pn.z, pn.x) / hl : vec2(1.0, 0.0);
    // Roof courses: v runs along the slope, so a steep and a shallow roof get the same courses.
    float vk = sp.y > 0.5 ? 1.0 / max(hl, 0.35) : 1.0;
    uv = vec2(dot(Q_PPOS.xz, t), Q_PPOS.y * vk);
    gx = vec2(dot(dx.xz, t), dx.y * vk);
    gy = vec2(dot(dy.xz, t), dy.y * vk);
  }
  vec4 p = textureGrad(uPat, vec3(uv * sp.x, float(si)), gx * sp.x, gy * sp.x);
  vec3 o;
  if (si == ${SURFACE.flowers}) {
    o = mix(c, p.rgb, p.a);
  } else if (si == ${SURFACE.glass} || si == ${SURFACE.water}) {
    vec3 v = normalize(cameraPosition - vQWPos);
    vec3 sky = mix(uSky, uSkyTop, 0.35);
    bool water = si == ${SURFACE.water};
    o = qSkyFresnel(c, sky, n, v, water ? 0.22 : 0.16, water ? 0.5 : 0.45, water ? 3.0 : 2.0);
    qShiny = water ? 2.0 : 1.0;
#ifdef Q_ROOMS
    if (!water) qRoomTint = qKitRoom(n, dx, dy);
#endif
  } else {
    o = c * mix(1.0, p.r * 2.0, sp.z * uPatternK);
    o = mix(o, uSurfAccent[si], p.g * sp.w * (si == ${SURFACE.awning} ? 1.0 : uPatternK));
    float grass = si == ${SURFACE.grass} ? 1.0 : 0.0;
    o = mix(o, uMeadow, smoothstep(0.42, 0.72, big) * 0.5 * uPatternK * grass);
    vec3 fc = p.b > 0.5 ? vec3(0.92, 0.86, 0.9) : vec3(0.95, 0.78, 0.3);
    o = mix(o, fc, p.g * 0.85 * uFlowerK * grass);
    // Weathering: broad, soft patches of light and shade on walls, roofs and ground.
    o *= mix(1.0, 0.9 + 0.2 * big, uPatternK * 0.8 * sp.z);
    o *= mix(vec3(1.0), uSeasonTint, sx.y);
  }
  // Snow covers the pattern gradually and keeps a hint of courses on thatch, slate and tile.
  vec3 snow = uSnowColor * (1.0 + (p.r * 2.0 - 1.0) * sx.x);
  return mix(o, snow, cover);
}

// The glint on glass and water, for the emissive term (none on a lit window pane).
vec3 qKitGlint(float lit) {
  if (qShiny < 0.5) return vec3(0.0);
  vec3 n = normalize(vQWNor);
  vec3 v = normalize(cameraPosition - vQWPos);
  bool water = qShiny > 1.5;
  return qSunGlint(n, v, uSunDir, uSunColor, water ? 120.0 : 60.0, water ? 0.9 : 0.35) * (1.0 - lit);
}
`;

/**
 * V2A: what a kit or resident material needs to read the client's light map (the art package draws
 * none of its own): GLSL declaring the reader's uniforms and `vec3 qLamp(vec2 xz, float up)` (the
 * client's `LIGHT_MAP_GLSL`), those uniforms, and the night (0 by day, 1 at full night).
 */
export interface KitLampOptions {
  glsl: string;
  uniforms: Record<string, { value: unknown }>;
  night: { value: number };
}

/** How strongly kit faces take the lamplight (an emissive on the face's own color). */
const KIT_LAMP_GAIN = '0.8';

/**
 * V2A: walls, decor, carts and animals read the light map a little in front of the face along its
 * normal (a wall facing the lamp samples nearer it than one facing away, which gives the pool a
 * direction for free), fading out between 1.5 and 4 tiles up (`qLamp`'s curve, by the kit's own
 * height), as an emissive on the face's color, by night squared. A breath of light, not a wash:
 * a wall takes most of it low down, less toward its eaves (lamps hang about a tile up), and roofs
 * and other upward faces above a tile take little (the pools below them are not under the sky).
 */
const KIT_LAMP_FRAGMENT = /* glsl */ `
uniform float uLampNight;
vec3 qKitLamp(vec3 albedo) {
  if (uLampNight < 0.01) return vec3(0.0);
  vec3 n = normalize(vQWNor);
  vec2 xz = vQWPos.xz + n.xz * 0.45;
  float k = 1.0 - 0.45 * smoothstep(0.3, 1.4, vQUp);
  k *= 1.0 - 0.85 * smoothstep(0.3, 0.7, n.y) * smoothstep(0.6, 1.1, vQUp);
  return albedo * qLamp(xz, vQUp) * (k * uLampNight * uLampNight * ${KIT_LAMP_GAIN});
}
`;

/**
 * V2A: the room a lit pane looks into (rooms.ts), by parallax. The facade is cut into room cells,
 * a tile wide and a storey tall (0.72 tiles from 0.14 up, which keeps the kits' window rows inside
 * one storey), measured from the building's origin, and each cell is a box half a tile deep. The
 * view ray through the pane meets the box's back wall, a side wall, the floor or the ceiling, and
 * that face is read from the room's layer with one fetch (the layer holds all five; rooms.ts). The
 * room and whether someone is home come from the building's origin and the cell (`qRoomPick`, the
 * twin of rooms.ts `roomFor`). Returns the room's color, lit warm, for the window's glow to take;
 * 1 (the flat glow) with rooms off (`uRooms`, off on Low) or on a pane that is not upright.
 */
const KIT_ROOM_FRAGMENT = /* glsl */ `
uniform float uRooms;
varying vec3 vQOrigin;
vec2 qRoomPick(vec2 o, vec2 cell) {
  vec2 io = floor(o);
  float v = io.x * 73.0 + io.y * 151.0 + cell.x * 37.0 + cell.y * 91.0 + io.x * io.y * 7.0;
  float m = v - 40.0 * floor((v + 0.5) / 40.0);
  float k = floor((m + 0.5) / ${ROOM_LAYERS}.0);
  return vec2(m - ${ROOM_LAYERS}.0 * k, k < 1.5 ? 1.0 : 0.0);
}
vec3 qKitRoom(vec3 n, vec3 dx, vec3 dy) {
  float hl = length(n.xz);
  if (uRooms < 0.5 || hl < 0.7) return vec3(1.0);
  vec2 t = vec2(-n.z, n.x) / hl;
  vec3 v = normalize(cameraPosition - vQWPos);
  const vec3 CELL = vec3(1.0, 0.72, 0.5);
  float u = dot(vQWPos.xz - vQOrigin.xz, t) / CELL.x;
  float w = (vQUp - 0.14) / CELL.y;
  vec2 cell = floor(vec2(u, w));
  vec3 p = vec3(u - cell.x, w - cell.y, 0.0);
  vec3 rd = vec3(-dot(v.xz, t) / CELL.x, -v.y / CELL.y, max(dot(v, n), 0.05) / CELL.z);
  rd.x = abs(rd.x) < 1e-4 ? 1e-4 : rd.x;
  rd.y = abs(rd.y) < 1e-4 ? 1e-4 : rd.y;
  vec3 tt = (step(vec3(0.0), rd) - p) / rd;
  float tm = min(min(tt.x, tt.y), tt.z);
  vec3 h = p + rd * tm;
  vec2 uv;
  float lit;
  float back = 0.0;
  if (tm >= tt.z) {
    uv = vec2(0.06 + 0.88 * h.x, 0.1 + 0.8 * h.y);
    lit = 1.0;
    back = 1.0;
  } else if (tm >= tt.y) {
    uv = vec2(0.06 + 0.88 * h.x, rd.y < 0.0 ? 0.012 + 0.076 * h.z : 0.912 + 0.076 * h.z);
    lit = rd.y < 0.0 ? 0.85 : 0.62;
  } else {
    uv = vec2(rd.x < 0.0 ? 0.008 + 0.044 * h.z : 0.992 - 0.044 * h.z, 0.1 + 0.8 * h.y);
    lit = 0.78;
  }
  // The room's lamp stands near the window: a little dimmer toward the back.
  lit *= 1.08 - 0.22 * h.z;
  vec2 pick = qRoomPick(vQOrigin.xz, cell);
  float lod = log2(max(max(length(dx), length(dy)) * 240.0, 1.0));
  vec4 r = textureLod(uPat, vec3(uv, ${ROOM_LAYER}.0 + pick.x), lod);
  vec3 c = r.rgb * r.rgb;
  c = mix(c, vec3(0.06, 0.04, 0.03), r.a * pick.y * back);
  vec3 room = c * (lit * 1.15);
  // Far off a pane is a few pixels: it keeps the full glow with a hint of its room's color (livelier
  // windows from the default camera), and the room shows as the camera comes in.
  float far = smoothstep(2.6, 4.6, lod);
  vec3 hue = room / max(dot(room, vec3(0.3, 0.55, 0.15)), 0.05);
  return mix(room, mix(vec3(1.0), hue, 0.3), far);
}
`;

/** The vertex side of the rooms: the building's origin, and the height above its foot. */
const KIT_ROOM_VERTEX = /* glsl */ `
{
  vec4 qO = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
  qO = instanceMatrix * qO;
#endif
#ifdef USE_BATCHING
  qO = batchingMatrix * qO;
#endif
  vQOrigin = (modelMatrix * qO).xyz;
}
`;

/**
 * Patches a Lambert material's shaders into the lean kit material: call it first inside
 * `onBeforeCompile`, then add any further replacements (the client's night glow). The fragment
 * shader's emissive step adds the glint through `qKitGlint(lit)`; the caller adds it after its own
 * emissive (see the client's render/material.ts), passing how lit the face is (0 to 1).
 * V2A: with `lamp`, faces also take the light map's lamplight (`KitLampOptions`); with `rooms` (1 on,
 * 0 off), lit panes show a little room (`qRoomTint`, which the caller's window glow multiplies).
 */
export function patchKitShader(
  shader: WebGLProgramParametersWithUniforms,
  u: KitSurfaceUniforms,
  lamp?: KitLampOptions,
  rooms?: { value: number },
): void {
  Object.assign(shader.uniforms, u);
  if (lamp) Object.assign(shader.uniforms, lamp.uniforms, { uLampNight: lamp.night });
  if (rooms) shader.uniforms.uRooms = rooms;
  const up = lamp !== undefined || rooms !== undefined;
  const vertexHead = [
    KIT_VERTEX_HEAD,
    up ? 'varying float vQUp;' : '',
    rooms ? 'varying vec3 vQOrigin;' : '',
  ].join('\n');
  const world = [KIT_WORLD_VERTEX, up ? 'vQUp = transformed.y;' : '', rooms ? KIT_ROOM_VERTEX : ''].join(
    '\n',
  );
  const fragmentHead = [
    rooms ? '#define Q_ROOMS' : '',
    KIT_FRAGMENT_HEAD,
    up ? 'varying float vQUp;' : '',
    rooms ? KIT_ROOM_FRAGMENT : '',
    lamp ? `${lamp.glsl}\n${KIT_LAMP_FRAGMENT}` : '',
  ].join('\n');
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${vertexHead}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${KIT_SWAY_VERTEX}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${world}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${fragmentHead}`)
    .replace(
      '#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb = qKitSurface(diffuseColor.rgb);',
    );
  if (lamp)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += qKitLamp(diffuseColor.rgb);',
    );
}

/** A Lambert kit material with vertex colors, patched by `patchKitShader` (the gallery's). */
export function createLeanKitMaterial(u: KitSurfaceUniforms): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    patchKitShader(shader, u);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += qKitGlint(0.0);',
    );
  };
  m.customProgramCacheKey = () => 'qoti-lean-kit';
  m.userData.kitHooks = { season: 'spring', snow: 0, sway: 1 } satisfies KitMaterialHooks;
  m.userData.kitUniforms = u;
  return m;
}
