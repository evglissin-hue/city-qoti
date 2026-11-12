import {
  artKitId,
  kitById,
  moduleAnchors,
  type KitAnchors,
  type KitBuildOptions,
  type KitPart,
} from '@qoti/art';
import { drawDef } from '../defs';
import {
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  Quaternion,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type BufferGeometry,
} from 'three';
import type { BuildingView } from '@qoti/sim';
import { buildingKey, buildingKitOptions, buildingMatrix, standLevel } from '../kitGeometry';
import { LIGHT_MAP_GLSL, lightMapUniforms } from '../lightMap';
import type { WorldEnv } from '../env';
import type { LayerContext, RenderLayer } from './types';

/** Kit anchors and parts rerun the generator, so cache them per def. */
const anchorCache = new Map<string, KitAnchors>();
const partCache = new Map<string, { geometry: BufferGeometry; part: KitPart }[]>();

function kitOptions(defId: string): { kitId: string; opts: KitBuildOptions } | null {
  const def = drawDef(defId);
  if (!def) return null;
  return {
    kitId: artKitId(def.art),
    opts: {
      size: def.size,
      entrance: def.entrance,
      ...(def.art.params ? { params: def.art.params } : {}),
    },
  };
}

/** C3D: anchors per building variant (chimneys move with the seeded look and customization). */
function anchorsOf(b: BuildingView): KitAnchors {
  if (b.stage !== 'built') return {};
  const key = buildingKey(b);
  let a = anchorCache.get(key);
  if (!a) {
    const def = drawDef(b.def);
    const kit = def ? kitById.get(artKitId(def.art)) : undefined;
    const opts = buildingKitOptions(b);
    a = moduleAnchors(kit?.anchors?.(opts) || {}, opts);
    anchorCache.set(key, a);
  }
  return a;
}

function partsOf(defId: string): { geometry: BufferGeometry; part: KitPart }[] {
  let list = partCache.get(defId);
  if (!list) {
    const k = kitOptions(defId);
    const kit = k ? kitById.get(k.kitId) : undefined;
    const parts = (k && kit?.parts?.(k.opts)) || [];
    // Part geometry is in kit-local coordinates: move it so the pivot sits at the origin.
    list = parts.map((part) => ({
      part,
      geometry: part.geometry.clone().translate(-part.pivot[0], -part.pivot[1], -part.pivot[2]),
    }));
    partCache.set(defId, list);
  }
  return list;
}

/** V2C: ribbons of smoke per chimney (two, crossed a little, so a stack reads as a soft column). */
export const RIBBONS_PER_CHIMNEY = 2;
/** At most this many ribbons in the one draw (the puffs' cap before them was 400 puffs). */
export const MAX_RIBBONS = 400;
/** Segments along a ribbon: two vertices each, so a ribbon is 2 x SEGMENTS triangles. */
export const RIBBON_SEGMENTS = 12;

/**
 * V2C ribbon smoke. Every ribbon is a strip from its chimney's anchor, placed and animated in the
 * vertex shader from the chimney (an instance attribute), its seed and the clock: it rises about a
 * tile and a half, widens, leans downwind (more in a storm), wavers in waves that travel up it and
 * fades out at the top. The strip turns to face the camera about its own line. At night it takes
 * the light map's glow (`qLamp`, scaled by the night) where it passes lamps and lit windows.
 * The CPU writes nothing per frame but the clock, so an idle frame costs one small draw.
 */
const SMOKE_VERT = /* glsl */ `
attribute vec4 chimney;
uniform float uTime;
uniform float uCold;
uniform float uStorm;
uniform float uNight;
${LIGHT_MAP_GLSL}
varying vec2 vUv;
varying float vFade;
varying vec3 vGlow;
#include <fog_pars_vertex>

// Where the ribbon's line passes at t (0 at the chimney, 1 at its top), in world space.
vec3 qSmokeAt(float t, vec3 base, float seed, float climb, float lean, vec2 wind) {
  float rise = t * climb;
  // Waves that travel up the ribbon: the smoke seems to rise while the strip stays put.
  float w1 = sin(t * 7.0 - uTime * 1.6 + seed * 6.28);
  float w2 = sin(t * 13.0 - uTime * 2.3 + seed * 17.0);
  vec2 across = vec2(-wind.y, wind.x);
  vec2 drift = wind * (t * t * 0.7 + t * 0.3) * lean + across * (w1 * 0.06 + w2 * 0.025) * t;
  return base + vec3(drift.x, rise, drift.y);
}

void main() {
  float seed = chimney.w;
  float t = position.y;
  vUv = vec2(position.x + 0.5, t);
  vec3 base = chimney.xyz;
  // Winter: every hearth is lit, so smoke is fuller, slower and climbs less before it spreads.
  float climb = (1.45 - uCold * 0.3) * (0.85 + 0.3 * fract(seed * 7.13));
  float gust = 0.8 + 0.2 * sin(uTime * 0.27 + seed * 9.0);
  float lean = (0.75 + uStorm * 1.6) * gust;
  vec2 wind = normalize(vec2(0.92, 0.39));
  vec3 c = qSmokeAt(t, base, seed, climb, lean, wind);
  vec3 c2 = qSmokeAt(min(t + 0.05, 1.0), base, seed, climb, lean, wind);
  vec3 tangent = normalize(c2 - c + vec3(0.0, 1e-4, 0.0));
  vec3 view = normalize(cameraPosition - c);
  vec3 side = normalize(cross(tangent, view) + vec3(1e-5, 0.0, 0.0));
  float width = (0.09 + t * 0.4) * (1.0 + uCold * 0.45);
  vec3 p = c + side * position.x * width;
  vFade = smoothstep(0.0, 0.07, t) * (1.0 - smoothstep(0.35, 1.0, t));
  // V2X: the shared curve's ceiling (qLamp), not its height fade: smoke over a lamplit street
  // takes the glow from below however high it climbs.
  vGlow = qLamp(c.xz, 0.0) * uNight;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const SMOKE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uCold;
uniform float uNight;
uniform vec3 uSky;
uniform vec3 uSunColor;
uniform vec3 uSmoke;
varying vec2 vUv;
varying float vFade;
varying vec3 vGlow;
#include <fog_pars_fragment>
void main() {
  // Soft across the ribbon, thinning in slow wisps that travel up it.
  float across = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 1.6);
  float wisp = 0.72 + 0.28 * sin(vUv.y * 9.0 - uTime * 1.1 + vUv.x * 2.0);
  // V2X: softer by day (a fifth less opaque), as V2C left it by night.
  float a = across * wisp * vFade * (0.5 + uCold * 0.18) * mix(0.78, 1.0, uNight);
  if (a < 0.01) discard;
  // Lit by the sky and the sun by day, a dim blue-gray by night, warm where it passes a lamp.
  vec3 light = uSky * 0.5 + uSunColor * 0.52 * (1.0 - uNight);
  vec3 col = uSmoke * light * mix(1.0, 0.45, uNight) + uSmoke * vGlow * 1.4;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** The strip every ribbon draws: x across (-0.5 to 0.5), y along (0 to 1). */
function ribbonStrip(): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  const pos: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= RIBBON_SEGMENTS; i++) {
    const t = i / RIBBON_SEGMENTS;
    pos.push(-0.5, t, 0, 0.5, t, 0);
    if (i < RIBBON_SEGMENTS) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  return g;
}

/** The smoke's material, bound to the world env's clock-free look state and the light map. */
function smokeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uCold: { value: 0 },
        uSmoke: { value: new Vector3(0.9, 0.87, 0.82) },
      },
    ]),
    vertexShader: SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
}

/** Binds the env's shared look uniforms (the objects, so the hour reaches the smoke as it changes). */
function bindSmoke(m: ShaderMaterial, env: WorldEnv): void {
  m.uniforms.uNight = env.night;
  m.uniforms.uSky = env.sky;
  m.uniforms.uSunColor = env.sunColor;
  m.uniforms.uStorm = env.storm;
  Object.assign(m.uniforms, lightMapUniforms(env));
}

interface Spinner {
  mesh: Mesh;
  base: Matrix4;
  pivot: Vector3;
  axis: Vector3;
  speed: number;
  phase: number;
}

/**
 * Effects: windmill sails that turn slowly and soft chimney smoke that rises in ribbons, leans with
 * the wind and fades (V2C; the stacked puffs before it). Both come from the optional kit contract
 * (`parts`, `anchors().smoke`); kits without them add nothing.
 */
export interface EffectsLayer extends RenderLayer {
  /** Smoke is a Medium and High nicety; Low hides it and stops its redraws. */
  setSmoke(on: boolean): void;
}

export function effectsLayer(): EffectsLayer {
  let ctx: LayerContext | null = null;
  let smokeOn = true;
  let spinners: Spinner[] = [];
  let chimneys: Vector3[] = [];
  let smoke: Mesh<InstancedBufferGeometry, ShaderMaterial> | null = null;
  let time = 0;
  const material = smokeMaterial();
  const q = new Quaternion();
  const s = new Vector3();
  function clearSpinners(): void {
    for (const sp of spinners) ctx?.scene.remove(sp.mesh);
    spinners = [];
  }

  function rebuild(): void {
    if (!ctx) return;
    clearSpinners();
    chimneys = [];
    for (const b of ctx.mirror.buildings.values()) {
      const level = standLevel(ctx.mirror, b.def, b.x, b.z, b.rot);
      const place = buildingMatrix(b.def, b.x, b.z, b.rot, level);
      for (const [x, y, z] of anchorsOf(b).smoke ?? [])
        chimneys.push(new Vector3(x, y, z).applyMatrix4(place));
      for (const { geometry, part } of b.stage === 'built' ? partsOf(b.def) : []) {
        const mesh = new Mesh(geometry, ctx.material);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = true;
        const pivot = new Vector3(part.pivot[0], part.pivot[1], part.pivot[2]);
        const axis = new Vector3(...(part.spinAxis ?? [0, 0, 1])).normalize();
        spinners.push({
          mesh,
          base: place.clone(),
          pivot,
          axis,
          speed: part.spinSpeed ?? 0.6,
          phase: b.id * 0.7,
        });
        ctx.scene.add(mesh);
      }
    }
    if (smoke) {
      ctx.scene.remove(smoke);
      smoke.geometry.dispose();
      smoke = null;
    }
    const count = Math.min(MAX_RIBBONS, chimneys.length * RIBBONS_PER_CHIMNEY);
    if (count > 0) {
      const g = ribbonStrip();
      const data = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        const c = chimneys[Math.floor(i / RIBBONS_PER_CHIMNEY)]!;
        const k = i % RIBBONS_PER_CHIMNEY;
        // The second ribbon of a stack starts a hair aside and has its own seed, so they cross.
        data[i * 4] = c.x + k * 0.03;
        data[i * 4 + 1] = c.y + 0.03;
        data[i * 4 + 2] = c.z - k * 0.02;
        data[i * 4 + 3] = (((c.x * 12.9898 + c.z * 78.233 + k * 37.719) % 1) + 1) % 1;
      }
      g.setAttribute('chimney', new InstancedBufferAttribute(data, 4));
      g.instanceCount = count;
      smoke = new Mesh(g, material);
      smoke.frustumCulled = false;
      smoke.renderOrder = 3;
      smoke.visible = smokeOn;
      ctx.scene.add(smoke);
    }
    animate(0);
    ctx.invalidate();
  }

  function animate(dt: number): void {
    time += dt;
    const local = new Matrix4();
    for (const sp of spinners) {
      q.setFromAxisAngle(sp.axis, time * sp.speed + sp.phase);
      local.compose(sp.pivot, q, s.set(1, 1, 1));
      sp.mesh.matrix.multiplyMatrices(sp.base, local);
      sp.mesh.matrixWorldNeedsUpdate = true;
    }
    // Smoke moves on the GPU from the clock; C5E part 2: winter smoke is fuller and slower.
    material.uniforms.uTime!.value = time;
    material.uniforms.uCold!.value = Math.min(1, ctx?.env?.snow.value ?? 0);
  }

  return {
    id: 'effects',
    motion: 'moving',
    init(c) {
      ctx = c;
      if (c.env) bindSmoke(material, c.env);
      rebuild();
    },
    update(change) {
      if (change.full || change.buildings || change.rects.has('height')) rebuild();
    },
    frame(dt) {
      if (spinners.length === 0 && !(smoke && smokeOn)) return false;
      animate(dt);
      return true;
    },
    setSmoke(on) {
      smokeOn = on;
      if (smoke) smoke.visible = on;
      ctx?.invalidate();
    },
    dispose() {
      clearSpinners();
      if (smoke) {
        ctx?.scene.remove(smoke);
        smoke.geometry.dispose();
      }
      material.dispose();
    },
  };
}
