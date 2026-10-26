import { BackSide, Mesh, PerspectiveCamera, ShaderMaterial, SphereGeometry } from 'three';
import { createWorldEnv, NOISE_GLSL, type WorldEnv } from '../env';
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

export function skyLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let env: WorldEnv | null = null;
  let dome: Mesh | null = null;
  const geometry = new SphereGeometry(1200, 32, 16);
  let material: ShaderMaterial | null = null;

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
          uTime: env.time,
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
      ctx.scene.add(dome);
    },
    update() {},
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
