import {
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Float32BufferAttribute,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { WorldEnv } from '../env';
import type { LayerContext, RenderLayer } from './types';

/**
 * C5E weather particles: rain, snow and falling leaves, sized for the miniature (a raindrop's
 * streak is a third of a tile, a snowflake a few hundredths). One instanced draw for all three:
 * each particle is a seed, and the vertex shader places it from the seed and the clock in a box
 * that follows the view, wrapping in world space so nothing slides with the camera. The CPU does
 * nothing per particle. Moving layer, no shadows; it draws only while something falls.
 */

/** Particles per preset (critters level): Low gets a light sprinkle, Ultra a proper shower. */
export const WEATHER_PARTICLES = { none: 700, some: 1600, all: 3200 } as const;

/** Leaves at most, as a share of the particles (autumn, mostly in its second half). */
const LEAF_SHARE = 0.12;

const VERT = /* glsl */ `
attribute vec4 seed;
uniform float uTime;
uniform vec3 uFocus;
uniform float uSpan;
uniform float uRain;
uniform float uSnowfall;
uniform float uLeaves;
uniform float uLeafShare;
uniform float uStorm;
uniform float uSize;
varying vec2 vUv;
varying float vKind;
varying float vFade;
varying vec3 vTint;

float wrap(float v, float lo, float span) { return lo + mod(v - lo, span); }

void main() {
  vUv = position.xy + 0.5;
  // Kind: leaves for the first share of seeds (as many as are falling), else rain or snow by
  // today's mix, as many as the weather's strength asks for.
  float leaf = step(seed.w, uLeafShare * uLeaves);
  float snowK = uSnowfall / max(uSnowfall + uRain, 0.001);
  float isSnow = (1.0 - leaf) * step(seed.z, snowK);
  float precip = max(uRain, uSnowfall);
  float on = leaf + (1.0 - leaf) * step(0.001, precip) * step((seed.w - uLeafShare) / (1.0 - uLeafShare), precip);
  vKind = leaf > 0.5 ? 2.0 : isSnow > 0.5 ? 1.0 : 0.0;
  float span = uSpan;
  float height = span * 0.42;
  // Fall speed in tiles a second: rain quick, snow drifting, leaves tumbling.
  float speed = vKind == 0.0 ? 9.0 + seed.z * 3.0 : vKind == 1.0 ? 0.55 + seed.z * 0.35 : 0.7 + seed.z * 0.4;
  vec2 wind = vec2(0.6, 0.25) * (vKind == 0.0 ? 1.0 + uStorm * 2.5 : 1.0 + uStorm);
  float t = uTime;
  float y = height - mod(seed.y * height + t * speed, height);
  vec2 drift = wind * (height - y) / max(speed, 0.1);
  // Snow and leaves wander a little as they fall.
  vec2 wander = vKind == 0.0 ? vec2(0.0) : vec2(sin(t * 0.9 + seed.x * 40.0), cos(t * 0.7 + seed.y * 40.0)) * (vKind == 2.0 ? 0.6 : 0.25);
  float x = wrap(seed.x * 977.0 + drift.x + wander.x, uFocus.x - span * 0.5, span);
  float z = wrap(seed.z * 613.0 + seed.y * 211.0 + drift.y + wander.y, uFocus.z - span * 0.5, span);
  vec3 p = vec3(x, uFocus.y + y - 0.3, z);
  // Fade in at the top of the box, out at the ground and at its sides.
  vec2 edge = abs(vec2(x, z) - uFocus.xz) / (span * 0.5);
  vFade = on * smoothstep(0.0, 0.08, y / height) * (1.0 - smoothstep(0.85, 1.0, y / height))
    * (1.0 - smoothstep(0.7, 1.0, max(edge.x, edge.y)));
  // Billboard: rain as a streak along its fall, snow and leaves facing the camera.
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec2 corner = position.xy;
  if (vKind == 0.0) {
    vec3 dir = normalize(vec3(wind.x, -speed, wind.y));
    vec3 vd = (viewMatrix * vec4(dir, 0.0)).xyz;
    vec2 a = normalize(vd.xy + vec2(1e-4));
    vec2 side = vec2(-a.y, a.x);
    mv.xy += a * corner.y * 0.34 * uSize + side * corner.x * 0.02 * uSize;
  } else if (vKind == 1.0) {
    mv.xy += corner * 0.085 * uSize;
  } else {
    float spin = t * (1.5 + seed.x * 2.0) + seed.y * 6.28;
    mat2 r = mat2(cos(spin), sin(spin), -sin(spin), cos(spin));
    mv.xy += r * (corner * vec2(0.09, 0.05 + 0.04 * abs(sin(spin * 0.7)))) * uSize;
  }
  float pick = fract(seed.x * 13.7 + seed.y * 7.3);
  vTint = pick < 0.4 ? vec3(0.85, 0.5, 0.12) : pick < 0.7 ? vec3(0.78, 0.3, 0.08) : pick < 0.88 ? vec3(0.6, 0.16, 0.06) : vec3(0.82, 0.68, 0.2);
  gl_Position = projectionMatrix * mv;
  if (vFade <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSky;
uniform float uNight;
varying vec2 vUv;
varying float vKind;
varying float vFade;
varying vec3 vTint;
void main() {
  vec2 c = vUv - 0.5;
  vec3 col;
  float a;
  if (vKind == 0.0) {
    // Rain: a pale streak, brighter at its head, taking the sky's color.
    col = mix(uSky, vec3(0.92, 0.95, 1.0), 0.55);
    a = (1.0 - smoothstep(0.2, 0.5, abs(c.x))) * smoothstep(-0.5, 0.3, c.y) * 0.45;
  } else if (vKind == 1.0) {
    // Snow: a soft round flake.
    col = vec3(0.97, 0.98, 1.0);
    a = 1.0 - smoothstep(0.18, 0.5, length(c));
    a *= 0.95;
  } else {
    // A leaf: an almond in autumn colors with a darker vein.
    float l = length(c * vec2(1.0, 1.6));
    col = vTint * (0.85 + 0.3 * smoothstep(0.0, 0.1, abs(c.y)));
    a = 1.0 - smoothstep(0.36, 0.5, l);
  }
  col *= mix(1.0, 0.38, uNight);
  a *= vFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

export function weatherLayer(): RenderLayer {
  let mesh: Mesh<InstancedBufferGeometry, ShaderMaterial> | null = null;
  let env: WorldEnv | undefined;
  const focus = new Vector3();
  let shown = false;

  function build(n: number): InstancedBufferGeometry {
    const g = new InstancedBufferGeometry();
    g.setAttribute(
      'position',
      new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
    );
    g.setIndex([0, 1, 2, 0, 2, 3]);
    // Seeds from a fixed little generator: the same pattern on both laptops and every run.
    let s = 0x9e3779b9;
    const next = (): number => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = next();
    g.setAttribute('seed', new InstancedBufferAttribute(seeds, 4));
    g.instanceCount = n;
    return g;
  }

  return {
    id: 'weather',
    motion: 'moving',
    init(ctx: LayerContext) {
      env = ctx.env;
      if (!env) return;
      const material = new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          uTime: env.time,
          uFocus: { value: focus },
          uSpan: { value: 60 },
          uRain: env.wet,
          uSnowfall: env.snowfall,
          uLeaves: { value: 0 },
          uLeafShare: { value: LEAF_SHARE },
          uStorm: env.storm,
          uSize: { value: 1 },
          uSky: env.sky,
          uNight: env.night,
        },
      });
      mesh = new Mesh(build(WEATHER_PARTICLES[env.critters]), material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      mesh.userData.noCast = true;
      mesh.visible = false;
      ctx.scene.add(mesh);
    },
    update() {},
    frame() {
      if (!mesh || !env) return false;
      const u = mesh.material.uniforms;
      // Leaves fall through autumn, most as the branches thin.
      const leaves = env.autumn.value * (0.35 + 0.65 * Math.min(1, env.bare.value * 2));
      const snowfall = env.snowfall.value;
      u.uLeaves!.value = env.motion ? leaves : 0;
      const any = env.motion && (env.wet.value > 0.01 || snowfall > 0.01 || leaves > 0.05);
      const n = WEATHER_PARTICLES[env.critters];
      if (mesh.geometry.instanceCount !== n) {
        mesh.geometry.dispose();
        mesh.geometry = build(n);
      }
      if (!any) {
        const was = shown;
        shown = mesh.visible = false;
        return was;
      }
      shown = mesh.visible = true;
      // The box follows the view: wider when the camera is back, with flakes and streaks a little
      // larger so they still read, but never beyond a miniature's.
      const d = env.camera.position.distanceTo(env.focus);
      focus.copy(env.focus);
      u.uSpan!.value = Math.min(110, Math.max(26, d * 0.95));
      u.uSize!.value = Math.min(2.4, Math.max(1, Math.sqrt(d / 30)));
      return true;
    },
    dispose() {
      mesh?.geometry.dispose();
      mesh?.material.dispose();
    },
  };
}
