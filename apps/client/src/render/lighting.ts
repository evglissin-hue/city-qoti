import { LAMP_COLORS } from '@qoti/art';
import type { Era } from '@qoti/content';
import { MAP_SIZE } from '@qoti/sim';
import {
  Color,
  DataTexture,
  LinearFilter,
  RedFormat,
  ShaderChunk,
  ShaderLib,
  UniformsLib,
  Vector4,
  type IUniform,
} from 'three';

export interface Lighting {
  sky: Color;
  sun: Color;
  sunIntensity: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  /** Sun direction (towards the sun), roughly east at dawn and west at dusk. */
  sunDir: [number, number, number];
  /** C2B: top of the sky gradient (sky is the horizon color, shared with the fog). */
  skyTop: Color;
  /** C2B: cool fill light from the side opposite the sun. */
  fill: Color;
  fillIntensity: number;
  /** C2B: tone mapping exposure. */
  exposure: number;
  /** C2B: 0 by day, 1 at full night; drives window glow and lantern strength. */
  night: number;
  /** C3D-1: share of windows lit in occupied homes at this hour (busy evenings, a few night owls). */
  windowShare: number;
  /** C3D-1: 0 to 1, the dusk and dawn color grade (rose highlights, violet shadows). */
  warmth: number;
}

interface Key {
  hour: number;
  sky: number;
  skyTop: number;
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  fill: number;
  fillI: number;
  exposure: number;
  night: number;
  /** Rose highlights and violet shadows in the grade, strongest at dusk. */
  warmth: number;
}

// The dawn, day, dusk and night table from docs/spec/17-presentation.md (sun, ambient sky and
// ground), with a golden hour and a violet twilight in between. V1A: retuned for the Lambert kit
// material and Khronos Neutral tone mapping, with the Painted Miniature concept's day, golden hour
// and night as the target (docs/concepts/v0-look, `TIMES`): a warm grey haze by day, honey light
// and a peach haze at golden hour, and a deep blue night where lit windows carry the warmth. The
// fill is gentler than before, since Lambert has no specular to lose. Shadows stay cool and
// blue-violet at dusk so greens never turn to mud; night is never pitch black.
const NIGHT: Omit<Key, 'hour'> = {
  sky: 0x2b3a55,
  skyTop: 0x0f1628,
  sun: 0xa9bfe0,
  sunI: 0.85,
  hemiSky: 0x3a4b6b,
  hemiGround: 0x232a3a,
  hemiI: 1.15,
  fill: 0x6f86c8,
  fillI: 0.2,
  exposure: 1.3,
  night: 1,
  warmth: 0,
};
const DAWN: Omit<Key, 'hour'> = {
  sky: 0xf0cdb0,
  skyTop: 0x8ea2d0,
  sun: 0xf6c28b,
  sunI: 1.8,
  hemiSky: 0xe9c9b0,
  hemiGround: 0x6b5e50,
  hemiI: 1.0,
  fill: 0x9aa8e0,
  fillI: 0.3,
  exposure: 1.06,
  night: 0.15,
  warmth: 0.6,
};
const DAY: Omit<Key, 'hour'> = {
  sky: 0xd8e2e3,
  skyTop: 0x8fbadb,
  sun: 0xfff4e0,
  sunI: 2.5,
  hemiSky: 0xdde8f0,
  hemiGround: 0x7a8f5a,
  hemiI: 1.0,
  fill: 0x9cc4ff,
  fillI: 0.2,
  exposure: 0.9,
  night: 0,
  warmth: 0,
};
const GOLDEN: Omit<Key, 'hour'> = {
  sky: 0xeccaa6,
  skyTop: 0x8fa5c8,
  sun: 0xf7b878,
  sunI: 2.7,
  hemiSky: 0xead0b8,
  hemiGround: 0x6a5a4c,
  // V1X: more sky fill, so the long golden shadows stay warm rather than olive (the concept's
  // golden ground is bright honey green even in shade).
  hemiI: 1.3,
  fill: 0x9aa4e8,
  fillI: 0.25,
  // V1X: a little over the concept's 1.08; at 1.0 the low sun left the grass olive and dull.
  exposure: 1.12,
  night: 0.05,
  warmth: 0.3,
};
const DUSK: Omit<Key, 'hour'> = {
  sky: 0xeaa886,
  skyTop: 0x7d7cbc,
  sun: 0xf4a261,
  sunI: 1.7,
  hemiSky: 0xd9a8b4,
  hemiGround: 0x4e4660,
  hemiI: 1.05,
  fill: 0x8a8ef0,
  fillI: 0.5,
  exposure: 1.15,
  night: 0.35,
  warmth: 1,
};
const TWILIGHT: Omit<Key, 'hour'> = {
  sky: 0x6f6a96,
  skyTop: 0x262c58,
  sun: 0xc8909c,
  sunI: 0.8,
  hemiSky: 0x5e6494,
  hemiGround: 0x2b2a40,
  hemiI: 1.15,
  fill: 0x6f7ad0,
  fillI: 0.35,
  exposure: 1.26,
  night: 0.8,
  warmth: 0.45,
};
const KEYS: Key[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.6, ...NIGHT },
  { hour: 5.6, ...TWILIGHT },
  { hour: 6.4, ...DAWN },
  { hour: 8, ...DAY },
  { hour: 16.6, ...DAY },
  { hour: 18.2, ...GOLDEN },
  { hour: 19.2, ...DUSK },
  { hour: 20.4, ...TWILIGHT },
  { hour: 21.5, ...NIGHT },
  { hour: 24, ...NIGHT },
];

const a = new Color();
const b = new Color();

function mix(from: number, to: number, t: number): Color {
  return a.setHex(from).lerp(b.setHex(to), t).clone();
}

/** Lit windows by hour: busy evenings, a few night owls, early risers before dawn. */
const WINDOW_KEYS: [number, number][] = [
  [0, 0.42],
  [1.5, 0.28],
  [4.5, 0.2],
  [6, 0.5],
  [8, 0.3],
  [17, 0.35],
  [19, 0.72],
  [22.5, 0.72],
  [24, 0.42],
];

export function windowShareAt(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < WINDOW_KEYS.length - 2 && WINDOW_KEYS[i + 1]![0] <= h) i++;
  const [h0, v0] = WINDOW_KEYS[i]!;
  const [h1, v1] = WINDOW_KEYS[i + 1]!;
  return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
}

/**
 * Whether the window pane at a world point is lit, for a share of lit windows. The kit material's
 * night glow uses the same integer hash on the GPU (WINDOW_HASH_GLSL), so ground spill under a
 * window always matches the pane above it.
 */
export function windowLit(x: number, y: number, z: number, share: number): boolean {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const iy = Math.floor(y * 1.2);
  const n = (((ix * 73 + iz * 151 + iy * 37 + ix * iz * 7) % 101) + 101) % 101;
  return n < share * 101;
}

/** GLSL twin of windowLit: 1 when the pane at world point `p` is lit for share `s`. */
export const WINDOW_HASH_GLSL = /* glsl */ `
float qWindowLit(vec3 p, float s) {
  vec3 c = floor(vec3(p.x, p.y * 1.2, p.z));
  float v = c.x * 73.0 + c.z * 151.0 + c.y * 37.0 + c.x * c.z * 7.0;
  // Exact in float (integers well under 2^24); the half offset keeps floor() off the boundary.
  float n = v - 101.0 * floor((v + 0.5) / 101.0);
  return step(n, s * 101.0 - 0.5);
}
`;

/**
 * V1X: the day sun's direction from the arc's angle (0 at 6:00, pi at 18:00) and its height (0 to
 * 1). It stands 12 to 50 degrees up (the concept's day is 47, its golden hour 21) and swings
 * evenly from 20 degrees east of the default camera's line of sight at 6:00 to 100 west at 18:00
 * (-40 at noon, near the concept's -38), so shadows fall to the side where the camera sees them. Before V1X it
 * climbed to about 69 degrees behind the camera, and the town looked shadowless from 10 to 14.
 */
function daySun(angle: number, elevation: number): [number, number, number] {
  const el = ((12 + 38 * elevation) * Math.PI) / 180;
  const az = ((20 - (120 * angle) / Math.PI) * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

/** Light colors and sun direction for an hour of the day (fractional hours are fine). */
export function lightingAt(hour: number): Lighting {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.hour <= h) i++;
  const k0 = KEYS[i]!;
  const k1 = KEYS[i + 1]!;
  const t = (h - k0.hour) / (k1.hour - k0.hour);
  const lerp = (x: number, y: number): number => x + (y - x) * t;
  // The sun swings from east (6:00) through south (12:00) to west (18:00), low and long at the
  // ends of the day. At night the "sun" is a soft moon high in the south, so shadows stay gentle.
  const day = h >= 5 && h <= 20.5;
  const angle = day ? ((h - 6) / 12) * Math.PI : Math.PI / 2;
  const elevation = day ? Math.max(0.16, Math.sin(Math.min(Math.PI, Math.max(0, angle)))) : 0.9;
  return {
    sky: mix(k0.sky, k1.sky, t),
    sun: mix(k0.sun, k1.sun, t),
    sunIntensity: lerp(k0.sunI, k1.sunI),
    hemiSky: mix(k0.hemiSky, k1.hemiSky, t),
    hemiGround: mix(k0.hemiGround, k1.hemiGround, t),
    hemiIntensity: lerp(k0.hemiI, k1.hemiI),
    sunDir: day ? daySun(angle, elevation) : [Math.cos(angle) * 0.8, elevation + 0.3, 0.45],
    skyTop: mix(k0.skyTop, k1.skyTop, t),
    fill: mix(k0.fill, k1.fill, t),
    fillIntensity: lerp(k0.fillI, k1.fillI),
    exposure: lerp(k0.exposure, k1.exposure),
    night: lerp(k0.night, k1.night),
    windowShare: windowShareAt(h),
    warmth: lerp(k0.warmth, k1.warmth),
  };
}

/**
 * V1A: the warm haze follows the view, as in the concept (B: near at about 0.93 and far at about
 * 4.2 times the camera's distance to what it looks at), so a close street and a wide valley get
 * the same depth of air. The fog's color is the lighting's horizon (`sky`).
 */
export function hazeFor(distance: number, fog = 0): { near: number; far: number } {
  const near = distance * 0.93;
  const far = distance * 4.2 + 20;
  if (fog <= 0) return { near, far };
  // P3C: a fog day closes the view in world distance, not in multiples of the camera's: a street
  // close up keeps its contrast with the rooftops beyond going soft, and a wide view fills with
  // fog. Before, both ends were pulled in by the same share at every zoom (and the final pass laid
  // a flat wash over the screen), so even the nearest camera stood in a tan cloud.
  const k = Math.min(1, fog);
  const nearFog = Math.min(near, 6 + distance * 0.25);
  const farFog = Math.min(far, 70 + distance * 1.2);
  return { near: near + (nearFog - near) * k, far: far + (farFog - far) * k };
}

/**
 * V2A: the era a lamp burns in. `?debug&era=old|steam|bright` pins it for review; otherwise a def
 * that lists exactly one era keeps it, and every valley is in the Old Age until I4 (a building
 * keeps the era it was built in, which no state records yet).
 */
export const LAMP_ERA_PIN: Era | null = ((): Era | null => {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  const e = q.get('era');
  return q.has('debug') && (e === 'old' || e === 'steam' || e === 'bright') ? e : null;
})();

export function lampEra(eras?: readonly Era[]): Era {
  if (LAMP_ERA_PIN) return LAMP_ERA_PIN;
  return eras?.length === 1 ? eras[0]! : 'old';
}

/** The lamp color (sRGB hex) for a def's eras. */
export function lampColor(eras?: readonly Era[]): number {
  return LAMP_COLORS[lampEra(eras)];
}

// --- V3C: haze with height ------------------------------------------------------------------

/**
 * V3C: the haze's shared uniforms. Every material that fogs goes through three's fog chunks, which
 * `installHazeChunks` patches once at startup; these uniforms reach every one of those materials
 * with no edit in their files (`HAZE_UNIFORMS` below). All zero is plain fog, as before V3C.
 * - `terms`: x how much the fog thins at height (0 to 1), y the valley floor's world height, z the
 *   height over which it thins, w unused.
 * - `adds`: x the river's dawn mist (0 to 1), y the chimneys' winter evening haze (0 to 1), zw unused.
 * - `town`: the chimneys' haze center (xz, world) and radius (z), w unused.
 * - `river`: the river's nearness over the valley (`RIVER_HAZE_SIZE` square, 1 on the water fading to
 *   0 some tiles away), written by the water layer with `setRiverHaze`.
 */
export interface HazeUniforms {
  terms: { value: Vector4 };
  adds: { value: Vector4 };
  town: { value: Vector4 };
  river: { value: DataTexture };
}

/** Texels a side of the river's nearness map (3 tiles a texel on a 192-tile valley). */
export const RIVER_HAZE_SIZE = 64;

/**
 * A uniform value shared by reference: three clones every material's uniforms when it compiles
 * (`UniformsUtils.cloneUniforms` calls `clone()`), so the value's clone is itself, and a change to it
 * reaches every program that holds it.
 */
function shared<T extends { clone(): unknown }>(v: T): T {
  v.clone = () => v;
  return v;
}

function riverTexture(): DataTexture {
  const t = new DataTexture(
    new Uint8Array(RIVER_HAZE_SIZE * RIVER_HAZE_SIZE),
    RIVER_HAZE_SIZE,
    RIVER_HAZE_SIZE,
    RedFormat,
  );
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return shared(t);
}

/** The one set of haze uniforms (module-wide, like the fog chunks it feeds). */
export const HAZE: HazeUniforms = {
  terms: { value: shared(new Vector4(0, 0, 0, 0)) },
  adds: { value: shared(new Vector4(0, 0, 0, 0)) },
  town: { value: shared(new Vector4(0, 0, 1, 0)) },
  river: { value: riverTexture() },
};

/** Writes the river's nearness map (`RIVER_HAZE_SIZE` squared, 0 to 255, row by row in z). */
export function setRiverHaze(haze: HazeUniforms, data: Uint8Array): void {
  const t = haze.river.value;
  (t.image.data as Uint8Array).set(data.subarray(0, RIVER_HAZE_SIZE * RIVER_HAZE_SIZE));
  t.needsUpdate = true;
}

/** How much the fog thins at the top of the height span, and the span in world units. *(tune)* */
export const HAZE_LIFT = 0.55;
export const HAZE_SPAN = 6;

/**
 * The haze's time terms for an hour, a season blend and a count of hearths: the river's mist from
 * before dawn to mid morning, and a town of many chimneys hazing over on winter evenings. Pure, so
 * it is the same on every frame drawn at one light step.
 */
export function hazeTermsAt(
  hour: number,
  winter: number,
  hearths: number,
): { river: number; chimney: number } {
  const h = ((hour % 24) + 24) % 24;
  // Mist on the water: rises at 4:30, thickest from 5:30 to 7, gone by 10.
  const river = ramp(h, 4.5, 5.5) * (1 - ramp(h, 7, 10));
  // Hearth smoke on a still winter evening: from 16:00, thickest 18:30 to 22, thinning by 1:00.
  const evening = h >= 12 ? ramp(h, 16, 18.5) * (1 - ramp(h, 22, 25)) : 1 - ramp(h + 24, 22, 25);
  const town = Math.min(1, Math.max(0, (hearths - 12) / 60));
  return { river: river * 0.32, chimney: Math.round(evening * winter * town * 0.5 * 32) / 32 };
}

function ramp(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vQHazeWorld;
#endif
`;

// The world position from the view-space one (a rigid view matrix: w = R^T (mv - t)), so instanced
// and batched meshes need nothing of their own.
const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vQHazeWorld = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);
#endif
`;

const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vQHazeWorld;
  uniform vec4 qHazeTerms;
  uniform vec4 qHazeAdds;
  uniform vec4 qHazeTown;
  uniform sampler2D qHazeRiver;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;

// V3C: the fog thins with height above the valley floor (far views only: the fog's near distance
// follows the camera's, so a street close-up is untouched), and thickens low over the river at dawn
// and over a town of many chimneys on winter evenings. Unset uniforms (a shader material that never
// asked for them) are zero: plain fog.
const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    float qHzUp = clamp( ( vQHazeWorld.y - qHazeTerms.y ) / max( qHazeTerms.z, 0.001 ), 0.0, 1.0 );
    fogFactor *= 1.0 - qHazeTerms.x * smoothstep( 50.0, 110.0, fogNear ) * qHzUp * ( 2.0 - qHzUp );
    if ( qHazeAdds.x + qHazeAdds.y > 0.0 ) {
      float qHzLow = ( 1.0 - qHzUp ) * smoothstep( 25.0, 70.0, fogNear ) * smoothstep( fogNear * 0.3, fogNear * 1.2, vFogDepth );
      float qHzRiver = qHazeAdds.x > 0.0 ? pow( texture2D( qHazeRiver, vQHazeWorld.xz / ${MAP_SIZE.toFixed(1)} ).r, 2.0 ) * qHazeAdds.x : 0.0;
      float qHzTown = qHazeAdds.y * ( 1.0 - smoothstep( qHazeTown.z * 0.5, qHazeTown.z * 1.3, distance( vQHazeWorld.xz, qHazeTown.xy ) ) );
      fogFactor += ( 1.0 - fogFactor ) * clamp( qHzRiver + qHzTown, 0.0, 0.6 ) * qHzLow;
    }
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;

// --- P3C: the moon's light mutes color ---------------------------------------------------------

/**
 * P3C: how the moon and the night sky light the valley, one shared uniform for every lit material
 * (`installHazeChunks` adds it with the haze's): x how far moonlit color goes to the moon's grey (0
 * by day), y the luma (linear) above which a moonlit surface is held back, z how hard. Lamplight,
 * windows and flames are emissive in every material here, so they keep their warmth: at night only
 * what a lamp reaches is warm and colored (the owner's playtest of V3: "day colors pushed purple").
 */
export const MOON = { value: shared(new Vector4(0, 0, 0, 0)) };

/** The moon's tint for muted color, at luma 1 (a cool blue grey). *(tune)* */
const MOON_TINT = [0.84, 1.0, 1.26] as const;

/** The moon's terms for a night value (0 by day, 1 at full night). Pure. *(tune)* */
export function moonTermsAt(night: number): { mute: number; knee: number; hold: number } {
  const n = Math.min(1, Math.max(0, night));
  const k = n * n * (3 - 2 * n);
  return { mute: 0.72 * k, knee: 0.012, hold: 30 * k };
}

const MOON_PARS = /* glsl */ `
uniform vec4 qMoon;
vec3 qMoonlit(vec3 c) {
  if (qMoon.x <= 0.0) return c;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // A pale surface under the moon is held back, so blossom and plaster never outshine lamplit ground.
  float held = l / (1.0 + max(l - qMoon.y, 0.0) * qMoon.z);
  vec3 grey = vec3(held) * vec3(${MOON_TINT.map((v) => (v / (0.2126 * MOON_TINT[0] + 0.7152 * MOON_TINT[1] + 0.0722 * MOON_TINT[2])).toFixed(4)).join(', ')});
  return mix(c * (held / max(l, 1e-5)), grey, qMoon.x);
}
`;

const MOON_END = /* glsl */ `
reflectedLight.directDiffuse = qMoonlit( reflectedLight.directDiffuse );
reflectedLight.indirectDiffuse = qMoonlit( reflectedLight.indirectDiffuse );
reflectedLight.directSpecular = qMoonlit( reflectedLight.directSpecular );
`;

let hazeInstalled = false;

/**
 * V3C: patches three's fog chunks and adds the haze's uniforms to every built-in material that fogs
 * (and to `UniformsLib.fog`, which fogging shader materials merge). Idempotent; runs when this module
 * loads, before any material compiles.
 */
export function installHazeChunks(): void {
  if (hazeInstalled) return;
  hazeInstalled = true;
  ShaderChunk.fog_pars_vertex = FOG_PARS_VERTEX;
  ShaderChunk.fog_vertex = FOG_VERTEX;
  ShaderChunk.fog_pars_fragment = FOG_PARS_FRAGMENT;
  ShaderChunk.fog_fragment = FOG_FRAGMENT;
  // P3C: the moon's muting, after every light is gathered (emissive is added after this chunk).
  ShaderChunk.lights_pars_begin = `${ShaderChunk.lights_pars_begin}\n${MOON_PARS}`;
  ShaderChunk.lights_fragment_end = `${ShaderChunk.lights_fragment_end}\n${MOON_END}`;
  const add = (u: Record<string, IUniform>): void => {
    u.qHazeTerms = HAZE.terms;
    u.qHazeAdds = HAZE.adds;
    u.qHazeTown = HAZE.town;
    u.qHazeRiver = HAZE.river;
  };
  add(UniformsLib.fog as unknown as Record<string, IUniform>);
  (UniformsLib.lights as unknown as Record<string, IUniform>).qMoon = MOON;
  for (const lib of Object.values(ShaderLib) as {
    uniforms: Record<string, IUniform>;
    fragmentShader: string;
  }[]) {
    if (lib.fragmentShader.includes('<fog_fragment>')) add(lib.uniforms);
    if (lib.fragmentShader.includes('<lights_fragment_end>')) lib.uniforms.qMoon = MOON;
  }
}

installHazeChunks();
