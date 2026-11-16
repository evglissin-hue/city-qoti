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
import { RIVER_HAZE_SIZE, setRiverHaze } from '../lighting';
import { LIGHT_LOOP, LIGHT_MAP_GLSL, lampQuality, lightMapUniforms } from '../lightMap';
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

/** What the river's builders read: the water's depth per tile (0 dry). */
export interface WaterReader {
  water(x: number, z: number): number;
}

/** Roads over water are bridges: foam gathers at their piers and trails downstream. */
export interface BridgeReader {
  road(x: number, z: number): number;
}

/** How far (tiles) the flow direction looks around a point to find the river's course. */
const FLOW_REACH = 9;
/** Foam trails this far (tiles) downstream of a bridge tile, and this far around it. */
const FOAM_TRAIL = 1.8;
const FOAM_AROUND = 0.5;

function clampTile(v: number): number {
  return v < 0 ? 0 : v >= MAP_SIZE ? MAP_SIZE - 1 : v;
}

function smooth(a: number, b: number, v: number): number {
  const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a);
  return t * t * (3 - 2 * t);
}

/**
 * The river's local flow direction at the lattice point (x, z): along the banks, found as the
 * perpendicular of the gradient of the water mask blurred over `FLOW_REACH` tiles, signed downstream
 * by `dir` (the valley's flow axis). Mid-river, where the gradient vanishes, it falls back to `dir`;
 * where the course turns sideways to `dir` it slows to a halt: calm beats a seam. Length 0 to 1.
 */
export function flowAt(m: WaterReader, x: number, z: number, dir: Vector2, out: Vector2): Vector2 {
  let gx = 0;
  let gz = 0;
  let sum = 0;
  for (let dz = -FLOW_REACH; dz <= FLOW_REACH; dz++) {
    for (let dx = -FLOW_REACH; dx <= FLOW_REACH; dx++) {
      const r = Math.sqrt(dx * dx + dz * dz);
      if (r > FLOW_REACH) continue;
      const w = 1 - r / (FLOW_REACH + 1);
      sum += w;
      if (m.water(clampTile(x + dx), clampTile(z + dz)) > 0) {
        gx += w * dx;
        gz += w * dz;
      }
    }
  }
  gx /= sum;
  gz /= sum;
  const len = Math.sqrt(gx * gx + gz * gz);
  if (len < 1e-4) return out.copy(dir);
  // Perpendicular to the gradient, signed downstream.
  let tx = -gz / len;
  let tz = gx / len;
  const along = tx * dir.x + tz * dir.y;
  if (along < 0) {
    tx = -tx;
    tz = -tz;
  }
  const k = smooth(0.05, 0.35, len);
  out.set(dir.x + (tx - dir.x) * k, dir.y + (tz - dir.y) * k);
  return out.multiplyScalar(k > 0.5 ? smooth(0.1, 0.4, Math.abs(along)) : 1);
}

/**
 * One chunk of river surface. Per vertex: `wdepth` (water depth below it), `wflow` (the local flow
 * direction, unit length or less) and `wfoam` (0 to 1, foam around bridge tiles and trailing
 * downstream of them). `dir` is the valley's flow axis in x, z; `road` finds the bridges.
 */
export function waterGeometry(
  tiles: SurfaceTiles,
  cx: number,
  cz: number,
  opts: { dir?: Vector2; road?: BridgeReader } = {},
): BufferGeometry | null {
  const m = tiles.reader;
  // The Mirror carries both: its flow axis and its road layer.
  const mirror = m as Partial<BridgeReader> & { meta?: { flow?: string } };
  const dir = opts.dir ?? (mirror.meta?.flow === 'we' ? new Vector2(1, 0) : new Vector2(0, 1));
  const road: BridgeReader | undefined =
    opts.road ?? (mirror.road ? (m as unknown as BridgeReader) : undefined);
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  tiles.cache(x0 - 2, z0 - 2, x0 + CHUNK_SIZE + 1, z0 + CHUNK_SIZE + 1);
  const pos: number[] = [];
  const depth: number[] = [];
  const flowOut: number[] = [];
  const foamOut: number[] = [];
  const d = new Float32Array((GRID + 1) * (GRID + 1));
  // Flow on the chunk's tile corners (computed once, on demand), blended across each tile.
  const L = CHUNK_SIZE + 1;
  let lattice: Float32Array | null = null;
  const latticeAt = (): Float32Array => {
    if (lattice) return lattice;
    const out = new Float32Array(L * L * 2);
    const v = new Vector2();
    for (let j = 0; j < L; j++)
      for (let i = 0; i < L; i++) {
        flowAt(m, x0 + i, z0 + j, dir, v);
        out[(j * L + i) * 2] = v.x;
        out[(j * L + i) * 2 + 1] = v.y;
      }
    lattice = out;
    return out;
  };
  // Bridges near the chunk (a road tile over water), as tile corners.
  const bridges: number[] = [];
  if (road) {
    for (let z = Math.max(0, z0 - 3); z < Math.min(MAP_SIZE, z0 + CHUNK_SIZE + 3); z++)
      for (let x = Math.max(0, x0 - 3); x < Math.min(MAP_SIZE, x0 + CHUNK_SIZE + 3); x++)
        if (road.road(x, z) && m.water(x, z)) bridges.push(x, z);
  }
  const put = (tx: number, tz: number, i: number, j: number) => {
    const wx = tx + i / GRID;
    const wz = tz + j / GRID;
    pos.push(wx, WATER_Y, wz);
    depth.push(d[j * (GRID + 1) + i]!);
    const lat = latticeAt();
    const u = i / GRID;
    const w = j / GRID;
    let fx = 0;
    let fz = 0;
    for (let c = 0; c < 4; c++) {
      const ox = c & 1;
      const oz = c >> 1;
      const wgt = (ox ? u : 1 - u) * (oz ? w : 1 - w);
      const o = ((tz - z0 + oz) * L + (tx - x0) + ox) * 2;
      fx += lat[o]! * wgt;
      fz += lat[o + 1]! * wgt;
    }
    flowOut.push(fx, fz);
    const fl = Math.sqrt(fx * fx + fz * fz);
    const ux = fl > 1e-4 ? fx / fl : dir.x;
    const uz = fl > 1e-4 ? fz / fl : dir.y;
    let foam = 0;
    for (let b = 0; b < bridges.length; b += 2) {
      const bx = bridges[b]!;
      const bz = bridges[b + 1]!;
      const qx = wx < bx ? bx : wx > bx + 1 ? bx + 1 : wx;
      const qz = wz < bz ? bz : wz > bz + 1 ? bz + 1 : wz;
      const ex = wx - qx;
      const ez = wz - qz;
      const dist = Math.sqrt(ex * ex + ez * ez);
      const down = ex * ux + ez * uz > 1e-6;
      const f = down ? 1 - smooth(0.1, FOAM_TRAIL, dist) : 1 - smooth(0.05, FOAM_AROUND, dist);
      if (f > foam) foam = f;
    }
    foamOut.push(foam);
  };
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
      for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
          // Skip cells that are entirely under the bank.
          const a = d[j * (GRID + 1) + i]!;
          const b = d[j * (GRID + 1) + i + 1]!;
          const c = d[(j + 1) * (GRID + 1) + i]!;
          const e = d[(j + 1) * (GRID + 1) + i + 1]!;
          if (Math.max(a, b, c, e) < -0.01) continue;
          put(tx, tz, i, j);
          put(tx, tz, i, j + 1);
          put(tx, tz, i + 1, j + 1);
          put(tx, tz, i, j);
          put(tx, tz, i + 1, j + 1);
          put(tx, tz, i + 1, j);
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
  g.setAttribute('wflow', new Float32BufferAttribute(flowOut, 2));
  g.setAttribute('wfoam', new Float32BufferAttribute(foamOut, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * V3C: the river's nearness over the valley for the dawn haze: `RIVER_HAZE_SIZE` squared bytes, row by
 * row in z, texel i covering tiles [i * 3, i * 3 + 3). 255 over water, easing smoothly to 0 about 9
 * tiles away. Pure.
 */
export function riverNearness(reader: WaterReader): Uint8Array {
  const N = RIVER_HAZE_SIZE;
  const per = MAP_SIZE / N;
  const reach = 9;
  const dist = new Float32Array(N * N).fill(1e9);
  const span = Math.ceil((reach + per * 1.5) / per);
  for (let z = 0; z < MAP_SIZE; z++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (!reader.water(x, z)) continue;
      const ti = Math.floor(x / per);
      const tj = Math.floor(z / per);
      for (let j = Math.max(0, tj - span); j <= Math.min(N - 1, tj + span); j++) {
        for (let i = Math.max(0, ti - span); i <= Math.min(N - 1, ti + span); i++) {
          const ex = (i + 0.5) * per - (x + 0.5);
          const ez = (j + 0.5) * per - (z + 0.5);
          // A texel holding the water tile, or touching it, counts as over it.
          const dd = Math.max(0, Math.sqrt(ex * ex + ez * ez) - per * 0.75);
          if (dd < dist[j * N + i]!) dist[j * N + i] = dd;
        }
      }
    }
  }
  const out = new Uint8Array(N * N);
  for (let k = 0; k < out.length; k++) out[k] = Math.round(255 * (1 - smooth(0, reach, dist[k]!)));
  return out;
}

/** The river's course for maps: a centerline (x, z pairs, in tiles) and its width in tiles per sample. */
export interface RiverCourse {
  points: Float32Array;
  widths: Float32Array;
}

/**
 * V3C: the river's centerline sampled every 3 tiles from where it enters the valley to where it
 * leaves, in order of increasing coordinate along its long axis (north to south, or west to east, `we`;
 * `flow` names the axis, found from the water's extent when absent). Each sample is the middle of
 * the water run nearest the previous sample (the longest run at the start); its width is the run's
 * length across the course. Empty arrays when there is no water. Pure and deterministic.
 */
export function riverCourse(reader: WaterReader, flow?: 'ns' | 'we'): RiverCourse {
  const STEP = 3;
  let minX = MAP_SIZE;
  let maxX = -1;
  let minZ = MAP_SIZE;
  let maxZ = -1;
  for (let z = 0; z < MAP_SIZE; z++)
    for (let x = 0; x < MAP_SIZE; x++)
      if (reader.water(x, z)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
  if (maxX < 0) return { points: new Float32Array(0), widths: new Float32Array(0) };
  const ns = flow ? flow === 'ns' : maxZ - minZ >= maxX - minX;
  const lo = ns ? minZ : minX;
  const hi = ns ? maxZ : maxX;
  const px: number[] = [];
  const pz: number[] = [];
  const ww: number[] = [];
  let prev = -1;
  const slices: number[] = [];
  for (let s = lo; s <= hi; s += STEP) slices.push(s);
  if (slices[slices.length - 1] !== hi) slices.push(hi);
  for (const s of slices) {
    const runs: [number, number][] = [];
    let start = -1;
    for (let c = 0; c <= MAP_SIZE; c++) {
      const wet = c < MAP_SIZE && (ns ? reader.water(c, s) : reader.water(s, c)) > 0;
      if (wet && start < 0) start = c;
      else if (!wet && start >= 0) {
        runs.push([start, c]);
        start = -1;
      }
    }
    if (runs.length === 0) continue;
    let best = runs[0]!;
    let bestScore = -1e9;
    for (const r of runs) {
      const score = prev < 0 ? r[1] - r[0] : -Math.abs((r[0] + r[1]) / 2 - prev);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    prev = (best[0] + best[1]) / 2;
    px.push(ns ? prev : s + 0.5);
    pz.push(ns ? s + 0.5 : prev);
    ww.push(best[1] - best[0]);
  }
  // A slanting course crosses a slice on the slant: shorten the width to the true cross section.
  for (let k = 0; k < ww.length; k++) {
    const a = Math.max(0, k - 1);
    const b = Math.min(ww.length - 1, k + 1);
    const ex = px[b]! - px[a]!;
    const ez = pz[b]! - pz[a]!;
    const len = Math.sqrt(ex * ex + ez * ez);
    if (len > 1e-6) ww[k] = (ww[k]! * Math.abs(ns ? ez : ex)) / len;
  }
  const points = new Float32Array(px.length * 2);
  for (let k = 0; k < px.length; k++) {
    points[k * 2] = px[k]!;
    points[k * 2 + 1] = pz[k]!;
  }
  return { points, widths: Float32Array.from(ww) };
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

// V3C: ripple height and its two neighbors for the normal, at one phase of the flow. The noise is
// advected along the river's local course dir; two phases half a cycle apart cross-fade so the
// reset of each is never seen. Low draws one octave (QWATER_RICH false).
vec3 qWaterH(vec2 p, vec2 dir, float ph) {
  vec2 q1 = p - dir * (ph * 2.4);
  vec2 q2 = p - dir * (ph * 3.4);
  float e = 0.06;
  vec3 h = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    vec2 o = k == 1 ? vec2(e, 0.0) : (k == 2 ? vec2(0.0, e) : vec2(0.0));
    float v = qNoise((q1 + o) * 1.7) * (QWATER_RICH ? 0.6 : 0.8);
    if (QWATER_RICH) v += qNoise((q2 + o) * 3.9 + 3.0) * 0.4;
    h[k] = v;
  }
  return h;
}
vec3 qWaterNormal(vec2 p, vec2 dir) {
  float t = uTime * 0.075;
  float pa = fract(t);
  float pb = fract(t + 0.5);
  float wa = 1.0 - abs(2.0 * pa - 1.0);
  vec3 h = qWaterH(p, dir, pa) * wa + qWaterH(p, dir, pb) * (1.0 - wa);
  float e = 0.06;
  return normalize(vec3(-(h.y - h.x) / e * 0.09, 1.0, -(h.z - h.x) / e * 0.09));
}
`;

/**
 * V2A: lamplight trembling on the river. Light reflected toward the viewer comes from lamps beyond
 * the point, so the map is read a little farther from the camera, shaken by the ripples' normal
 * (it moves with them), stronger at grazing angles, by night squared; less on ice. One fetch, none
 * by day or on Low (`uLampWater`).
 */
const WATER_LAMP_GLSL = /* glsl */ `
if (uLampWater > 0.5 && uNight > 0.01) {
  vec2 qAway = vQWorld.xz - cameraPosition.xz;
  qAway *= inversesqrt(max(dot(qAway, qAway), 1e-4));
  vec3 qLampL = qLightMap(wp + qAway * 1.1 + wn.xz * 6.0);
  totalEmissiveRadiance += qLampL * (0.35 + 0.9 * fres) * (uNight * uNight) * (1.0 - uFrozen * 0.7) * 1.5;
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
  const shallow = new Color(palette.riverShallow);
  const mid = new Color(palette.riverMid);
  const deep = new Color(palette.riverDeep);
  const foam = new Color(palette.foam);
  // V2A: lamplight on the river from the light map (not with ?debug&lights=loop; off on Low).
  const map = !LIGHT_LOOP;
  m.onBeforeCompile = (shader) => {
    if (map) Object.assign(shader.uniforms, lightMapUniforms(env), lampQuality(env));
    Object.assign(shader.uniforms, {
      // V3C: the ripples run on the static clock, so they rest when the camera does.
      uTime: env.staticTime,
      uNight: env.night,
      uSky: env.sky,
      uSun: env.sunColor,
      uSunDir: env.sunDir,
      uFlow: { value: flow },
      uFrozen: env.frozen,
      uSnow: env.snow,
      uShallow: { value: shallow },
      uMid: { value: mid },
      uDeep: { value: deep },
      uFoam: { value: foam },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float wdepth;\nattribute vec2 wflow;\nattribute float wfoam;\nvarying float vDepth;\nvarying vec2 vFlow;\nvarying float vFoam;\nvarying vec3 vQWorld;',
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvQWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvDepth = wdepth;\nvFlow = wflow;\nvFoam = wfoam;',
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
          'uniform vec3 uMid;',
          'uniform vec3 uDeep;',
          'uniform vec3 uFoam;',
          'varying float vDepth;',
          'varying vec2 vFlow;',
          'varying float vFoam;',
          'varying vec3 vQWorld;',
          map ? `${LIGHT_MAP_GLSL}\nuniform float uLampWater;` : '',
          // V3C: Low (no lamp water) draws one ripple octave.
          map ? '#define QWATER_RICH (uLampWater > 0.5)' : '#define QWATER_RICH true',
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
          // The local course (unit length; the valley's axis where the river has none).
          'float flowLen = length(vFlow);',
          'vec2 fdir = flowLen > 0.02 ? vFlow / flowLen : normalize(uFlow);',
          'vec3 wn = qWaterNormal(wp, vFlow);',
          // Far away the ripples are finer than a pixel: flatten them instead of letting them shimmer.
          'wn = normalize(mix(wn, vec3(0.0, 1.0, 0.0), clamp(length(fwidth(wp)) * 6.0 - 0.2, 0.0, 0.85)));',
          'float depthK = smoothstep(0.03, 0.42, vDepth);',
          // Sand-gold shallows, green-blue middle, deep pools.
          'vec3 waterCol = mix(mix(uShallow, uMid, smoothstep(0.02, 0.36, vDepth)), uDeep * 0.92, smoothstep(0.3, 0.7, vDepth));',
          'waterCol *= 0.94 + 0.1 * qNoise(wp * 0.8 - vFlow * uTime * 0.05);',
          // Foam: a soft band at the bank with a slow, broken pulse.
          'float pulse = 0.5 + 0.5 * sin(uTime * 0.9 + qNoise(wp * 2.0) * 6.2831);',
          'float band = 1.0 - smoothstep(0.0, 0.035 + 0.025 * pulse, vDepth);',
          'float broken = smoothstep(0.35, 0.6, qNoise(wp * 7.0 + vFlow * uTime * 0.3));',
          'float foam = band * mix(0.55, 1.0, broken);',
          // V3C: white water streaks trailing downstream of bridge piers, stretched along the course.
          'if (vFoam > 0.01) {',
          '  vec2 fp = vec2(dot(wp, fdir), dot(wp, vec2(-fdir.y, fdir.x)));',
          '  float streak = smoothstep(0.42, 0.7, qNoise(vec2(fp.x * 0.7 - uTime * 0.45, fp.y * 4.5)));',
          '  foam = max(foam, vFoam * mix(0.3, 1.0, streak) * smoothstep(0.0, 0.05, vDepth) * (1.0 - uFrozen));',
          '}',
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
          map ? WATER_LAMP_GLSL : '',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => (map ? 'qoti-water-lightmap' : 'qoti-water');
  return m;
}

export function waterLayer(): RenderLayer {
  let chunks: ChunkedMeshes | null = null;
  let material: MeshStandardMaterial | null = null;
  let env: WorldEnv | null = null;
  let start: readonly number[] = [0, 0, 0, 0];
  let mirror: LayerContext['mirror'] | null = null;

  return {
    id: 'water',
    motion: 'moving',
    init(ctx: LayerContext) {
      env = ctx.env ?? createWorldEnv(new PerspectiveCamera());
      mirror = ctx.mirror;
      setRiverHaze(env.haze, riverNearness(mirror));
      const flow = ctx.mirror.meta.flow === 'ns' ? new Vector2(0, 0.35) : new Vector2(0.35, 0);
      material = createWaterMaterial(env, flow);
      const tiles = new SurfaceTiles(ctx.mirror);
      chunks = new ChunkedMeshes(ctx.scene, material, (cx, cz) => waterGeometry(tiles, cx, cz), 2, true, 4);
      chunks.markAll();
      chunks.rebuild(Infinity, nearOf(env, ctx.mirror.meta.startArea), FIRST_FRAME_RADIUS);
      start = ctx.mirror.meta.startArea;
    },
    update(change) {
      if (!chunks) return;
      if (change.full) chunks.markAll();
      let wet = change.full;
      for (const layer of ['water', 'height', 'occupant', 'road'] as const) {
        // The flow reads the water a few tiles out, and foam reaches a bridge's neighbors.
        const pad = layer === 'water' ? 6 : 2;
        for (const rect of change.rects.get(layer) ?? []) {
          chunks.markRect(rect, pad);
          if (layer === 'water') wet = true;
        }
      }
      if (wet && env && mirror) setRiverHaze(env.haze, riverNearness(mirror));
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
