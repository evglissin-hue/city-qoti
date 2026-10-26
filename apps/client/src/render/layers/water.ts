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
import { createWorldEnv, NOISE_GLSL, type WorldEnv } from '../env';
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
          'glint *= clamp(1.6 - length(fwidth(wp)) * 9.0, 0.0, 1.0);',
          'totalEmissiveRadiance += uSun * glint * (0.25 + 1.1 * twinkle) * (1.0 - uNight);',
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

  return {
    id: 'water',
    init(ctx: LayerContext) {
      env = ctx.env ?? createWorldEnv(new PerspectiveCamera());
      const flow = ctx.mirror.meta.flow === 'ns' ? new Vector2(0, 0.35) : new Vector2(0.35, 0);
      material = createWaterMaterial(env, flow);
      const tiles = new SurfaceTiles(ctx.mirror);
      chunks = new ChunkedMeshes(ctx.scene, material, (cx, cz) => waterGeometry(tiles, cx, cz), 2);
      chunks.markAll();
      chunks.rebuild();
    },
    update(change) {
      if (!chunks) return;
      if (change.full) chunks.markAll();
      for (const layer of ['water', 'height', 'occupant'] as const) {
        for (const rect of change.rects.get(layer) ?? []) chunks.markRect(rect);
      }
    },
    frame() {
      const rebuilt = chunks ? chunks.rebuild(2) : false;
      return rebuilt || !!env?.motion;
    },
    dispose() {
      chunks?.dispose();
      material?.dispose();
    },
  };
}
