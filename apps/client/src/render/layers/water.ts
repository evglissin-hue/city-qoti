import { palette } from '@qoti/art';
import { CHUNK_SIZE, MAP_SIZE } from '@qoti/sim';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector2,
} from 'three';
import { ChunkedMeshes } from '../chunks';
import { createWorldEnv, FIRST_FRAME_RADIUS, nearOf, NOISE_GLSL, type WorldEnv } from '../env';
import { surfaceY, SurfaceTiles, WATER_Y } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * C3D-1 water: one surface at the water line over river tiles and the banks around them. The
 * terrain's sloping banks cut the shoreline, so it follows the ground, not the tile grid. Each vertex
 * knows the water depth below it; the shader turns that into a shallow-to-deep gradient, see-through
 * shallows over the sand, soft foam where the water meets the bank, gentle moving ripples with sun
 * sparkle, and the sky's color reflected at grazing angles (warm at dusk).
 */

const GRID = 4;

function waterGeometry(tiles: SurfaceTiles, cx: number, cz: number): BufferGeometry | null {
  const m = tiles.reader;
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  tiles.cache(x0 - 2, z0 - 2, x0 + CHUNK_SIZE + 1, z0 + CHUNK_SIZE + 1);
  const pos: number[] = [];
  const depth: number[] = [];
  const d = new Float32Array((GRID + 1) * (GRID + 1));
  for (let tz = z0; tz < z0 + CHUNK_SIZE; tz++) {
    for (let tx = x0; tx < x0 + CHUNK_SIZE; tx++) {
      let near = false;
      for (let dz = -1; dz <= 1 && !near; dz++)
        for (let dx = -1; dx <= 1 && !near; dx++) {
          const nx = tx + dx;
          const nz = tz + dz;
          if (nx >= 0 && nz >= 0 && nx < MAP_SIZE && nz < MAP_SIZE && m.water(nx, nz)) near = true;
        }
      if (!near) continue;
      let wet = false;
      for (let j = 0; j <= GRID; j++) {
        for (let i = 0; i <= GRID; i++) {
          const v = WATER_Y - surfaceY(tiles, tx + i / GRID, tz + j / GRID);
          d[j * (GRID + 1) + i] = v;
          if (v > -0.01) wet = true;
        }
      }
      if (!wet) continue;
      const put = (i: number, j: number) => {
        pos.push(tx + i / GRID, WATER_Y, tz + j / GRID);
        depth.push(d[j * (GRID + 1) + i]!);
      };
      for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
          // Skip cells that are entirely under the bank.
          const a = d[j * (GRID + 1) + i]!;
          const b = d[j * (GRID + 1) + i + 1]!;
          const c = d[(j + 1) * (GRID + 1) + i]!;
          const e = d[(j + 1) * (GRID + 1) + i + 1]!;
          if (Math.max(a, b, c, e) < -0.01) continue;
          put(i, j);
          put(i, j + 1);
          put(i + 1, j + 1);
          put(i, j);
          put(i + 1, j + 1);
          put(i + 1, j);
        }
      }
    }
  }
  tiles.uncache();
  if (pos.length === 0) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const normals = new Float32Array(pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  g.setAttribute('wdepth', new Float32BufferAttribute(depth, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const WATER_GLSL = /* glsl */ `
// C5E: ice. Cracks are the edges of a jittered cell pattern; skate marks are long, gently curving
// scratches along the river; snow lies in drifts toward the banks.
float qIceCracks(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(qHash(i + g), qHash(i + g + 19.7));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
  return 1.0 - smoothstep(0.0, 0.05, d2 - d1);
}
vec3 qIce(vec2 wp, vec3 waterCol, float depth, float snow, float fine) {
  vec2 along = uFlow.x != 0.0 ? wp : wp.yx;
  vec3 ice = vec3(0.72, 0.83, 0.88) * (0.94 + 0.08 * qNoise(wp * 1.3));
  // Clear black ice over the deep middle, milky at the edges.
  ice = mix(ice, mix(waterCol, vec3(0.5, 0.64, 0.7), 0.55), smoothstep(0.15, 0.5, depth) * 0.45 * qNoise(wp * 0.6 + 3.0));
  float crack = qIceCracks(wp * 1.4) * fine;
  ice = mix(ice, ice * vec3(0.72, 0.8, 0.86), crack * 0.55);
  float lanes = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float y = along.y + sin(along.x * (0.35 + fk * 0.11) + fk * 2.1) * 0.6;
    lanes += 1.0 - smoothstep(0.0, 0.03, abs(fract(y * 0.8 + fk * 0.31) - 0.5));
  }
  ice = mix(ice, vec3(0.92, 0.95, 0.97), clamp(lanes, 0.0, 1.0) * 0.35 * fine);
  float drift = smoothstep(0.35, 0.75, qNoise(wp * 0.9) + (1.0 - smoothstep(0.0, 0.25, depth)) * 0.5);
  return mix(ice, vec3(0.93, 0.95, 0.98), drift * snow * 0.85);
}

vec3 qWaterNormal(vec2 p) {
  vec2 f = uFlow * uTime;
  float e = 0.06;
  float h0 = qNoise(p * 1.7 - f * 0.9) * 0.6 + qNoise(p * 3.9 + f.yx * 0.7 + 3.0) * 0.4;
  float hx = qNoise((p + vec2(e, 0.0)) * 1.7 - f * 0.9) * 0.6 + qNoise((p + vec2(e, 0.0)) * 3.9 + f.yx * 0.7 + 3.0) * 0.4;
  float hz = qNoise((p + vec2(0.0, e)) * 1.7 - f * 0.9) * 0.6 + qNoise((p + vec2(0.0, e)) * 3.9 + f.yx * 0.7 + 3.0) * 0.4;
  return normalize(vec3(-(hx - h0) / e * 0.09, 1.0, -(hz - h0) / e * 0.09));
}
`;

function createWaterMaterial(env: WorldEnv, flow: Vector2): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    roughness: 0.18,
    metalness: 0,
    depthWrite: false,
  });
  const shallow = new Color(palette.waterShallow);
  const deep = new Color(palette.waterDeep);
  const foam = new Color(palette.foam);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: env.time,
      uNight: env.night,
      uSky: env.sky,
      uSun: env.sunColor,
      uSunDir: env.sunDir,
      uFlow: { value: flow },
      uFrozen: env.frozen,
      uSnow: env.snow,
      uShallow: { value: shallow },
      uDeep: { value: deep },
      uFoam: { value: foam },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float wdepth;\nvarying float vDepth;\nvarying vec3 vQWorld;',
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvQWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvDepth = wdepth;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform float uTime;',
          'uniform float uNight;',
          'uniform vec3 uSky;',
          'uniform vec3 uSun;',
          'uniform vec3 uSunDir;',
          'uniform vec2 uFlow;',
          'uniform float uFrozen;',
          'uniform float uSnow;',
          'uniform vec3 uShallow;',
          'uniform vec3 uDeep;',
          'uniform vec3 uFoam;',
          'varying float vDepth;',
          'varying vec3 vQWorld;',
          NOISE_GLSL,
          WATER_GLSL,
        ].join('\n'),
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          'if (vDepth < -0.004) discard;',
          'vec2 wp = vQWorld.xz;',
          'vec3 wn = qWaterNormal(wp);',
          // Far away the ripples are finer than a pixel: flatten them instead of letting them shimmer.
          'wn = normalize(mix(wn, vec3(0.0, 1.0, 0.0), clamp(length(fwidth(wp)) * 6.0 - 0.2, 0.0, 0.85)));',
          'float depthK = smoothstep(0.03, 0.42, vDepth);',
          'vec3 waterCol = mix(uShallow, uDeep * 0.82, depthK) * (0.94 + 0.1 * qNoise(wp * 0.8 - uFlow * uTime * 0.3));',
          // Foam: a soft band at the bank with a slow, broken pulse.
          'float pulse = 0.5 + 0.5 * sin(uTime * 0.9 + qNoise(wp * 2.0) * 6.2831);',
          'float band = 1.0 - smoothstep(0.0, 0.035 + 0.025 * pulse, vDepth);',
          'float broken = smoothstep(0.35, 0.6, qNoise(wp * 7.0 + uFlow * uTime * 0.6));',
          'float foam = band * mix(0.55, 1.0, broken);',
          'diffuseColor.rgb = mix(waterCol, uFoam, foam * 0.85);',
          // See-through shallows over the sand; deep water nearly opaque.
          'diffuseColor.a = mix(0.35, 0.9, smoothstep(0.0, 0.35, vDepth)) + foam * 0.4;',
          // C5E: frozen, the river is still and nearly opaque: ice, cracks, skate marks, snow.
          'if (uFrozen > 0.001) {',
          '  float fine = clamp(1.0 - length(fwidth(wp)) * 5.0, 0.0, 1.0);',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, qIce(wp, waterCol, vDepth, uSnow, fine), uFrozen);',
          '  diffuseColor.a = mix(diffuseColor.a, 0.96, uFrozen);',
          '  wn = normalize(mix(wn, vec3(0.0, 1.0, 0.0), uFrozen));',
          '}',
        ].join('\n'),
      )
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);',
      )
      .replace(
        '#include <emissivemap_fragment>',
        [
          '#include <emissivemap_fragment>',
          'vec3 viewDir = normalize(cameraPosition - vQWorld);',
          'float fres = pow(1.0 - max(dot(wn, viewDir), 0.0), 3.0);',
          'totalEmissiveRadiance += uSky * (0.12 + fres * 0.55) * (1.0 - uNight * 0.6);',
          // Sun sparkle: tiny glints where the ripples catch the light.
          'vec3 refl = reflect(-viewDir, wn);',
          'float glint = pow(max(dot(refl, normalize(uSunDir)), 0.0), 180.0);',
          'float twinkle = step(0.8, qHash(floor(wp * 9.0) + floor(uTime * 3.0)));',
          // Far away the glints are smaller than a pixel: let them go rather than shimmer.
          'glint *= clamp(1.0 - length(fwidth(wp)) * 16.0, 0.0, 1.0);',
          'totalEmissiveRadiance += uSun * glint * (0.25 + 1.1 * twinkle) * (1.0 - uNight) * (1.0 - uFrozen * 0.8);',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => 'qoti-water';
  return m;
}

export function waterLayer(): RenderLayer {
  let chunks: ChunkedMeshes | null = null;
  let material: MeshStandardMaterial | null = null;
  let env: WorldEnv | null = null;
  let start: readonly number[] = [0, 0, 0, 0];

  return {
    id: 'water',
    motion: 'moving',
    init(ctx: LayerContext) {
      env = ctx.env ?? createWorldEnv(new PerspectiveCamera());
      const flow = ctx.mirror.meta.flow === 'ns' ? new Vector2(0, 0.35) : new Vector2(0.35, 0);
      material = createWaterMaterial(env, flow);
      const tiles = new SurfaceTiles(ctx.mirror);
      chunks = new ChunkedMeshes(ctx.scene, material, (cx, cz) => waterGeometry(tiles, cx, cz), 2);
      chunks.markAll();
      chunks.rebuild(Infinity, nearOf(env, ctx.mirror.meta.startArea), FIRST_FRAME_RADIUS);
      start = ctx.mirror.meta.startArea;
    },
    update(change) {
      if (!chunks) return;
      if (change.full) chunks.markAll();
      for (const layer of ['water', 'height', 'occupant'] as const) {
        for (const rect of change.rects.get(layer) ?? []) chunks.markRect(rect);
      }
    },
    frame() {
      const rebuilt = chunks ? chunks.rebuild(3, nearOf(env ?? undefined, start)) : false;
      return rebuilt || !!env?.motion;
    },
    dispose() {
      chunks?.dispose();
      material?.dispose();
    },
  };
}
