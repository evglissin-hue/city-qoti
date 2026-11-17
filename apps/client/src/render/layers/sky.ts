import { BackSide, Mesh, PerspectiveCamera, ShaderMaterial, SphereGeometry } from 'three';
import type { Mirror } from '../../state/mirror';
import { createWorldEnv, NOISE_GLSL, type WorldEnv } from '../env';
import { HAZE_LIFT, HAZE_SPAN, hazeTermsAt, MOON, moonTermsAt } from '../lighting';
import type { LayerContext, RenderLayer } from './types';

/**
 * C3D-1 sky: a dome around the camera with the hour's gradient, a few soft painterly clouds that
 * drift and catch the sun on their edges, and faint stars at night. Below the horizon it fades into
 * the fog color, so the valley's rim melts into haze.
 */

const SKY_GLSL = /* glsl */ `
uniform vec3 uSky;
uniform vec3 uSkyTop;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uNight;
varying vec3 vDir;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 col = mix(uSky, uSkyTop, smoothstep(0.0, 0.55, up));
  // A warm glow around the sun near the horizon.
  float sunAmt = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSun * pow(sunAmt, 12.0) * 0.25 * (1.0 - uNight);
  if (up > 0.0) {
    // Clouds painted on a plane high above: soft-edged puffs, lit from the sun's side.
    vec2 p = d.xz / (up + 0.18) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
    float c = qFbm(p * 1.3);
    float puff = smoothstep(0.55, 0.78, c) * smoothstep(0.0, 0.25, up);
    float rim = smoothstep(0.55, 0.65, c) - smoothstep(0.65, 0.8, c);
    vec3 cloud = mix(uSky * 1.06 + vec3(0.05), vec3(1.0, 0.98, 0.95), 0.55) * (1.0 - uNight * 0.75);
    cloud += uSun * rim * 0.15 * (1.0 - uNight);
    col = mix(col, cloud, puff * 0.85);
    // Stars at night, a sparse twinkling few.
    vec2 sp = d.xz / (up + 0.05) * 60.0;
    float star = step(0.9965, qHash(floor(sp))) * (0.6 + 0.4 * sin(uTime * 2.0 + qHash(floor(sp) + 3.0) * 6.28));
    col += vec3(0.9, 0.92, 1.0) * star * uNight * smoothstep(0.1, 0.4, up) * (1.0 - puff);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** V3C: the hearths (households with a home) and where they gather, for the chimneys' winter haze. */
export function hearthsOf(mirror: Mirror): { count: number; x: number; z: number; radius: number } {
  let count = 0;
  let sx = 0;
  let sz = 0;
  const homes: [number, number][] = [];
  for (const h of mirror.households.values()) {
    const b = mirror.buildings.get(h.homeId);
    if (!b) continue;
    count++;
    sx += b.x;
    sz += b.z;
    homes.push([b.x, b.z]);
  }
  if (count === 0) return { count: 0, x: 0, z: 0, radius: 1 };
  const x = sx / count;
  const z = sz / count;
  let r2 = 0;
  for (const [hx, hz] of homes) r2 += (hx - x) ** 2 + (hz - z) ** 2;
  // Most homes fall inside 1.6 times the spread; the haze reaches a little past them.
  return { count, x, z, radius: Math.sqrt(r2 / count) * 1.6 + 8 };
}

export function skyLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let env: WorldEnv | null = null;
  let dome: Mesh | null = null;
  const geometry = new SphereGeometry(1200, 32, 16);
  let material: ShaderMaterial | null = null;
  let hearths = { count: 0, x: 0, z: 0, radius: 1 };
  let hearthsRevision = -1;
  let mirrorRevision = 0;

  return {
    id: 'sky',
    init(c) {
      ctx = c;
      env = c.env ?? createWorldEnv(new PerspectiveCamera());
      material = new ShaderMaterial({
        uniforms: {
          uSky: env.sky,
          uSkyTop: env.skyTop,
          uSun: env.sunColor,
          uSunDir: env.sunDir,
          uTime: env.staticTime,
          uNight: env.night,
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: SKY_GLSL,
        side: BackSide,
        depthWrite: false,
        fog: false,
      });
      dome = new Mesh(geometry, material);
      dome.frustumCulled = false;
      dome.renderOrder = -1000;
      dome.userData.qotiShadows = false;
      dome.matrixAutoUpdate = true;
      // V3C: the haze's terms are set as the dome draws (it is drawn first and every frame the scene
      // is), from the light step the renderer has just applied, so every material that fogs reads
      // the same terms on that frame and a still frame keeps them.
      dome.onBeforeRender = () => {
        if (!env) return;
        if (hearthsRevision !== mirrorRevision && ctx) {
          hearths = hearthsOf(ctx.mirror);
          hearthsRevision = mirrorRevision;
        }
        const winter = env.shown.season === 3 ? 1 : 0;
        const t = hazeTermsAt(env.shown.hour, winter, hearths.count);
        env.haze.terms.value.set(HAZE_LIFT, 0, HAZE_SPAN, 0);
        env.haze.adds.value.set(t.river, t.chimney, 0, 0);
        env.haze.town.value.set(hearths.x, hearths.z, hearths.radius, 0);
        // P3C: the moon's muting follows the light step's night (lighting.ts, MOON).
        const moon = moonTermsAt(env.night.value);
        const tune = (globalThis as { __p3cMoon?: number[] }).__p3cMoon;
        if (tune) MOON.value.set((tune[0]! * moon.mute) / 0.55, tune[1]!, tune[2]! * (moon.hold / 30), 0);
        else MOON.value.set(moon.mute, moon.knee, moon.hold, 0);
      };
      ctx.scene.add(dome);
    },
    update(change) {
      if (change.full || change.households || change.buildings) mirrorRevision++;
    },
    frame() {
      if (dome && env) dome.position.copy(env.camera.position);
      return false;
    },
    dispose() {
      if (dome) ctx?.scene.remove(dome);
      geometry.dispose();
      material?.dispose();
    },
  };
}
