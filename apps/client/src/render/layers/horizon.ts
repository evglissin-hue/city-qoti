import { palette } from '@qoti/art';
import { MAP_SIZE } from '@qoti/sim';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
} from 'three';
import type { Mirror } from '../../state/mirror';
import { hash2 } from '../coords';
import { createWorldEnv, NOISE_GLSL, type WorldEnv } from '../env';
import { SurfaceTiles, surfaceY, WATER_Y } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * V3C horizon: the land that goes on past the valley, painted in three bands in one mesh and one
 * draw. Near hills with woods (the rim's surface at their inner edge, so they join the terrain and
 * hide its skirt), paler far hills, and a haze curtain whose top is the sky's horizon color. The
 * river leaves the valley as a narrowing channel that fades into the hills. Built once, from the
 * shared map and a seed from the valley's meta, so both players see the same bands.
 */

/** Rows of the rings, in tiles out from the valley's boundary. */
// V3C round two: a crest just outside the rim (rows 3 and 9) rises above the rim's edge, so from a
// far camera no straight edge of the valley's square shows.
const ROWS = [0, 3, 9, 24, 50, 100, 230];
/** Hill amplitude (world units above the base) at the control distances. */
const AMP_AT = [
  [0, 0],
  [30, 15],
  [80, 18],
  [150, 36],
  [230, 6],
] as const;
/** The haze curtain's height above the outer far row. */
const CURTAIN_HEIGHT = 60;
/** Outline points per valley side, and arc steps per corner. */
const SIDE_SEGS = 24;
const CORNER_STEPS = 3;
/** Reach and look of the river's channel in the near band. */
const CHANNEL_LENGTH = 72;
const CHANNEL_Y = WATER_Y - 0.02;
const TROUGH_Y = WATER_Y - 0.3;
/** How far the inner edge sits under the terrain. */
const SINK = 0.03;

export interface RiverExit {
  /** The point on the valley's boundary where the river leaves, and the outward direction. */
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** Tiles of water across the exit. */
  width: number;
}

export interface HorizonInput {
  size: number;
  seed: number;
  /** The terrain's surface height at a point on the valley's boundary (or just inside). */
  edgeY(px: number, pz: number): number;
  exits: RiverExit[];
}

export interface HorizonBuild {
  geometry: BufferGeometry;
  triangles: number;
  /** Vertices of the outline (one ring), and the rows built, for tests. */
  outlineCount: number;
  rows: number;
}

interface OutlinePoint {
  bx: number;
  bz: number;
  nx: number;
  nz: number;
  /** An exit's edge or middle: sampled exactly (the edge ones a little onto the rim), not by window. */
  exact?: number;
}

/** Each side: its start corner (as a share of the size), direction along it, outward normal. */
const SIDES = [
  { x: 0, z: 0, tx: 1, tz: 0, nx: 0, nz: -1 },
  { x: 1, z: 0, tx: 0, tz: 1, nx: 1, nz: 0 },
  { x: 1, z: 1, tx: -1, tz: 0, nx: 0, nz: 1 },
  { x: 0, z: 1, tx: 0, tz: -1, nx: -1, nz: 0 },
] as const;

/** The valley's outline: points along each side, and arcs round each corner (a rounded square). */
export function outlineOf(size: number, exits: readonly RiverExit[] = []): OutlinePoint[] {
  const out: OutlinePoint[] = [];
  for (let s = 0; s < 4; s++) {
    const a = SIDES[s]!;
    // Points along the side: regular ones, but where the river leaves there are points on the
    // notch's two edges and its middle instead, so the hills' inner edge follows the notch.
    const along: { u: number; exact?: number }[] = [];
    const notches = exits
      .filter((e) => e.nx === a.nx && e.nz === a.nz)
      .map((e) => ({ c: (e.x - a.x * size) * a.tx + (e.z - a.z * size) * a.tz, w: e.width }));
    for (let j = 0; j <= SIDE_SEGS; j++) {
      const u = (j / SIDE_SEGS) * size;
      if (notches.some((q) => Math.abs(u - q.c) < q.w / 2 + 5)) continue;
      along.push({ u });
    }
    for (const q of notches) {
      // The notch's two walls, nearly upright like the terrain's, and its floor between them.
      along.push(
        { u: q.c - q.w / 2, exact: -0.6 },
        { u: q.c - q.w / 2 + 0.3, exact: 0.6 },
        { u: q.c + q.w / 2 - 0.3, exact: -0.6 },
        { u: q.c + q.w / 2, exact: 0.6 },
      );
    }
    along.sort((p, q) => p.u - q.u);
    for (const { u, exact } of along) {
      out.push({ bx: a.x * size + a.tx * u, bz: a.z * size + a.tz * u, nx: a.nx, nz: a.nz, exact });
    }
    // The corner at this side's end: its normal turns from this side's to the next one's.
    const endX = (a.x + a.tx) * size;
    const endZ = (a.z + a.tz) * size;
    for (let k = 1; k < CORNER_STEPS; k++) {
      const th = (k / CORNER_STEPS) * (Math.PI / 2);
      const c = Math.cos(th);
      const sn = Math.sin(th);
      out.push({ bx: endX, bz: endZ, nx: a.nx * c + a.tx * sn, nz: a.nz * c + a.tz * sn });
    }
  }
  return out;
}

function smooth(u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth value noise in [0, 1], one lattice cell per `scale` tiles. */
function vnoise(x: number, z: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const u = smooth(fx - ix);
  const v = smooth(fz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return mix(mix(a, b, u), mix(c, d, u), v);
}

function ampAt(d: number): number {
  for (let i = 1; i < AMP_AT.length; i++) {
    const [d1, a1] = AMP_AT[i]!;
    if (d <= d1) {
      const [d0, a0] = AMP_AT[i - 1]!;
      return mix(a0, a1, smooth((d - d0) / (d1 - d0)));
    }
  }
  return AMP_AT[AMP_AT.length - 1]![1];
}

/** Finds where the river leaves the valley: the widest run of water tiles on each side, if any. */
export function findRiverExits(size: number, waterAt: (tx: number, tz: number) => boolean): RiverExit[] {
  const exits: RiverExit[] = [];
  for (let s = 0; s < 4; s++) {
    const a = SIDES[s]!;
    let best: { start: number; len: number } | null = null;
    let start = -1;
    for (let i = 0; i <= size; i++) {
      let wet = false;
      if (i < size) {
        const tx = a.nx === 0 ? i : a.nx > 0 ? size - 1 : 0;
        const tz = a.nz === 0 ? i : a.nz > 0 ? size - 1 : 0;
        wet = waterAt(tx, tz);
      }
      if (wet && start < 0) start = i;
      if (!wet && start >= 0) {
        if (!best || i - start > best.len) best = { start, len: i - start };
        start = -1;
      }
    }
    if (!best) continue;
    const mid = best.start + best.len / 2;
    exits.push({
      x: a.nx === 0 ? mid : a.nx > 0 ? size : 0,
      z: a.nz === 0 ? mid : a.nz > 0 ? size : 0,
      nx: a.nx,
      nz: a.nz,
      width: best.len,
    });
  }
  return exits;
}

/** The seed for a valley: a hash of its meta, the same on both screens. */
export function horizonSeed(meta: {
  startArea: readonly number[];
  valleyGate: readonly number[];
  flow: string;
}): number {
  let s = 17;
  for (const v of [...meta.startArea, ...meta.valleyGate, meta.flow === 'ns' ? 1 : 2])
    s = (Math.imul(s, 31) + v) | 0;
  return Math.floor(hash2(s, s >>> 7, 91) * 65536);
}

/** An sRGB hex as a GLSL vec3 in 0 to 1 (for qSrgb). */
function glslHex(hex: number): string {
  const c = (v: number): string => (v / 255).toFixed(4);
  return `vec3(${c((hex >> 16) & 255)}, ${c((hex >> 8) & 255)}, ${c(hex & 255)})`;
}

const COL_NEAR = new Color().setHex(palette.horizonNear);
const COL_WOODS = new Color().setHex(palette.horizonWoods);
const COL_FAR = new Color().setHex(palette.horizonFar);
const COL_HAZE = new Color().setHex(palette.horizonHaze);
const COL_RIVER = new Color().setHex(palette.riverMid);

/** Vertex attributes grow as plain arrays, then become one indexed geometry. */
class Soup {
  pos: number[] = [];
  col: number[] = [];
  /** Per vertex: haze (0 to 1 toward the sky), woods weight, foliage tint weight. */
  meta: number[] = [];
  idx: number[] = [];
  vertex(x: number, y: number, z: number, c: Color, haze: number, woods: number, tint: number): number {
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    this.meta.push(haze, woods, tint);
    return this.pos.length / 3 - 1;
  }
}

/** Builds the horizon: pure and deterministic from its input. */
export function buildHorizon(input: HorizonInput): HorizonBuild {
  const { size, seed } = input;
  // The river winds on into the hills: its sideways drift (tiles) at a distance past the rim.
  const meander = (e: RiverExit, along: number): number =>
    Math.sin(along * 0.075 + (seed % 97) * 0.13 + e.x * 0.01) * Math.min(Math.max(along, 0) * 0.3, 9);
  const outline = outlineOf(size, input.exits);
  const n = outline.length;
  const soup = new Soup();

  // The rim's surface at each outline point, the lowest of three samples along the edge so the
  // inner edge stays a hair under the terrain; and the mean as the hills' base level.
  const rim: number[] = [];
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const o = outline[i]!;
    // Samples along the edge (its tangent is the normal turned a quarter), a hair inside.
    const tx = -o.nz;
    const tz = o.nx;
    const clamp = (v: number) => Math.min(size - 1e-3, Math.max(1e-3, v));
    let y = Infinity;
    for (const k of o.exact === undefined ? [-4, 0, 4] : [o.exact]) {
      y = Math.min(y, input.edgeY(clamp(o.bx + tx * k - o.nx * 0.002), clamp(o.bz + tz * k - o.nz * 0.002)));
    }
    rim.push(y - SINK);
    mean += y;
  }
  mean /= n;
  const base = Math.max(mean, 1);

  const troughAt = (x: number, z: number): number => {
    let t = 0;
    for (const e of input.exits) {
      const along = (x - e.x) * e.nx + (z - e.z) * e.nz;
      if (along < -2) continue;
      const lat = Math.abs((x - e.x) * e.nz - (z - e.z) * e.nx - meander(e, along));
      const w = 5 + e.width * 0.5;
      const lengthFade = 1 - smooth((along - CHANNEL_LENGTH * 0.6) / (CHANNEL_LENGTH * 0.5));
      t = Math.max(t, (1 - smooth((lat - w) / 10)) * lengthFade);
    }
    return t;
  };

  const heightAt = (i: number, d: number, x: number, z: number): number => {
    const h =
      0.55 * vnoise(x, z, 46, seed) + 0.3 * vnoise(x, z, 19, seed + 7) + 0.15 * vnoise(x, z, 8, seed + 13);
    // The crest: hills right outside the rim, 1.5 to 6.5 above its edge, rising within 3 tiles.
    const crest = smooth(d / 3) * (1 - smooth((d - 9) / 18)) * (1.5 + 5 * vnoise(x, z, 11, seed + 51));
    let y = mix(rim[i]!, base, smooth(d / 40)) + ampAt(d) * h * 1.25 + crest;
    y = mix(y, TROUGH_Y, troughAt(x, z) * smooth(d / 14));
    return y;
  };

  // Rings of hills.
  const ring: number[][] = [];
  const woodsAt: number[][] = [];
  const ys: number[][] = [];
  for (let r = 0; r < ROWS.length; r++) {
    const d = ROWS[r]!;
    const row: number[] = [];
    const wrow: number[] = [];
    const yrow: number[] = [];
    for (let i = 0; i < n; i++) {
      const o = outline[i]!;
      const x = o.bx + o.nx * d;
      const z = o.bz + o.nz * d;
      const y = heightAt(i, d, x, z);
      const wn = vnoise(x, z, 24, seed + 29);
      const woods =
        smooth((wn - 0.4) / 0.12) * smooth((d - 1) / 4) * (1 - smooth((d - 62) / 28)) * (1 - troughAt(x, z));
      const far = smooth((d - 55) / 75);
      const c = COL_NEAR.clone().lerp(COL_FAR, far);
      // A little tonal drift so the bands are painted, not flat.
      c.multiplyScalar(0.8 + 0.4 * vnoise(x, z, 26, seed + 3) + (0.06 * (y - base)) / 10);
      c.lerp(COL_WOODS, woods);
      // Aerial perspective: clear on the crest, half gone by 50 tiles out, nearly sky at the far row.
      const haze = d <= 3 ? 0 : 0.86 * (1 - Math.exp(-(d - 3) / 42));
      row.push(soup.vertex(x, y, z, c, haze, woods, mix(0.7, 0.2, far)));
      wrow.push(woods);
      yrow.push(y);
    }
    ring.push(row);
    woodsAt.push(wrow);
    ys.push(yrow);
  }
  for (let r = 0; r + 1 < ROWS.length; r++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = ring[r]![i]!;
      const b = ring[r]![j]!;
      const c = ring[r + 1]![j]!;
      const d = ring[r + 1]![i]!;
      soup.idx.push(a, b, c, a, c, d);
    }
  }

  // The haze curtain: from the outer far row up to the sky's color.
  const last = ring[ring.length - 1]!;
  const curtainBottom: number[] = [];
  const curtainTop: number[] = [];
  const outerD = ROWS[ROWS.length - 1]!;
  for (let i = 0; i < n; i++) {
    const o = outline[i]!;
    const x = o.bx + o.nx * outerD;
    const z = o.bz + o.nz * outerD;
    const y = ys[ROWS.length - 1]![i]!;
    const bi = last[i]!;
    const c = new Color(soup.col[bi * 3]!, soup.col[bi * 3 + 1]!, soup.col[bi * 3 + 2]!);
    curtainBottom.push(soup.vertex(x, y, z, c, soup.meta[bi * 3]!, 0, 0));
    curtainTop.push(soup.vertex(x, y + CURTAIN_HEIGHT, z, COL_HAZE, 1, 0, 0));
  }
  const curtainStart = soup.idx.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = curtainBottom[i]!;
    const b = curtainBottom[j]!;
    const c = curtainTop[j]!;
    const d = curtainTop[i]!;
    soup.idx.push(a, b, c, a, c, d);
  }
  const curtainEnd = soup.idx.length;

  // The river's channels: a ribbon that narrows and takes the hills' color as it goes.
  const CH_ROWS = 12;
  for (const e of input.exits) {
    const tx = -e.nz;
    const tz = e.nx;
    const w0 = Math.max(2.2, e.width * 0.5);
    const rows: [number, number][] = [];
    for (let k = 0; k < CH_ROWS; k++) {
      const a = 0.3 + (k / (CH_ROWS - 1)) * (CHANNEL_LENGTH - 0.3);
      const t = k / (CH_ROWS - 1);
      // It narrows as it goes and winds away into the haze, rather than ending at a stub.
      const w = w0 * (1 - 0.6 * t);
      const m = meander(e, a);
      const x = e.x + e.nx * a - tx * m;
      const z = e.z + e.nz * a - tz * m;
      const c = COL_RIVER.clone().lerp(COL_HAZE, smooth(t) * 0.5);
      const hz = mix(0.02, 0.5, smooth(t));
      const l = soup.vertex(x - tx * w, CHANNEL_Y, z - tz * w, c, hz, 0, 0);
      const rr = soup.vertex(x + tx * w, CHANNEL_Y, z + tz * w, c, hz, 0, 0);
      rows.push([l, rr]);
    }
    for (let k = 0; k + 1 < CH_ROWS; k++) {
      const [l0, r0] = rows[k]!;
      const [l1, r1] = rows[k + 1]!;
      soup.idx.push(l0, r0, r1, l0, r1, l1);
    }
  }
  const channelsEnd = soup.idx.length;

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(soup.pos), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(soup.col), 3));
  geometry.setAttribute('aMeta', new BufferAttribute(new Float32Array(soup.meta), 3));
  geometry.setIndex(soup.idx);
  geometry.computeVertexNormals();
  // The curtain and the channels' ribbons face up or inward by hand, so light never darkens them.
  const normal = geometry.getAttribute('normal') as BufferAttribute;
  const fix = (from: number, to: number) => {
    for (let t = from; t < to; t++) {
      const vi = soup.idx[t]!;
      normal.setXYZ(vi, 0, 1, 0);
    }
  };
  fix(curtainStart, curtainEnd);
  fix(curtainEnd, channelsEnd);
  normal.needsUpdate = true;
  geometry.computeBoundingSphere();
  return { geometry, triangles: soup.idx.length / 3, outlineCount: n, rows: ROWS.length };
}

/**
 * V3C: woods along the valley's edge in world space, the same on both sides of it, so the ground's
 * rim (`qRim` in ground.ts) and the horizon's crest paint one ragged band of woods across the line
 * where they meet. `d` is tiles outside the valley's edge (negative inside). Needs `NOISE_GLSL`.
 */
export const RIM_WOODS_GLSL = /* glsl */ `
float qRimWoods(vec2 wp, float d) {
  float n = qFbm(wp * 0.1 + 3.7);
  float hug = 1.0 - smoothstep(0.0, 5.0, abs(d + 1.0));
  return smoothstep(0.46, 0.6, n + 0.06 * hug) * (1.0 - smoothstep(7.0, 13.0, abs(d)));
}
`;

const VERT = /* glsl */ `
attribute vec3 aMeta;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vMeta;
varying float vDist;
varying vec3 vWorld;
void main() {
  vColor = color;
  vNormal = normal;
  vMeta = aMeta;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDist = distance(wp.xyz, cameraPosition);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSky;
uniform vec3 uSkyTop;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uNight;
uniform vec3 uSeasonTint;
uniform float uSnow;
uniform float uAutumn;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vMeta;
varying float vDist;
varying vec3 vWorld;
${NOISE_GLSL}
${RIM_WOODS_GLSL}
void main() {
  vec3 n = normalize(vNormal);
  float haze = vMeta.x;
  float woods = vMeta.y;
  float tint = vMeta.z;
  vec3 col = vColor;
  // The ragged woods that cross the valley's edge, painted as the ground's rim paints them.
  vec2 wq = vWorld.xz;
  float edgeD = max(max(-wq.x, -wq.y), max(wq.x - ${MAP_SIZE.toFixed(1)}, wq.y - ${MAP_SIZE.toFixed(1)}));
  float rimWood = qRimWoods(wq, edgeD) * step(woods, 0.99);
  col = mix(col, qSrgb(${glslHex(palette.horizonWoods)}) * (0.86 + 0.24 * qNoise(wq * 0.7)), rimWood);
  woods = max(woods, rimWood);
  // The season: foliage takes the tint, woods warm in autumn, snow whitens upward faces.
  col *= mix(vec3(1.0), uSeasonTint, tint);
  // Autumn: the woods turn russet and gold (a warm color, not a tint: a tinted dark green stays green).
  vec3 fall = vec3(0.55, 0.22, 0.05) * (0.75 + 0.5 * fract(sin(dot(vColor.rg, vec2(91.3, 47.1))) * 4375.85));
  col = mix(col, fall, uAutumn * woods * 0.8);
  col = mix(col, vec3(0.9, 0.93, 0.98), uSnow * smoothstep(0.55, 0.9, n.y) * 0.85 * (1.0 - haze * 0.4));
  // Simple light: the sky's fill from above and the sun on the faces that look at it.
  float ndl = max(dot(n, normalize(uSunDir)), 0.0);
  vec3 fill = (vec3(0.55) + 0.2 * uSkyTop + 0.1 * n.y) * mix(vec3(1.0), uSky * 1.3, 0.4);
  vec3 lit = col * (fill + uSun * ndl * 0.6 * (1.0 - uNight));
  // Night: moonlit blue-gray, never black (the haze takes the rest toward the night sky).
  lit = mix(lit, col * vec3(0.2, 0.26, 0.42) + uSky * 0.12, uNight);
  // Aerial perspective: by band, and more with distance from the camera.
  // Aerial perspective toward the sky's own color (blue-grey by day, warm at golden hour): the
  // land goes paler and greyer with distance, never a saturated smear.
  float far = clamp(haze + (1.0 - haze) * 0.45 * smoothstep(140.0, 560.0, vDist), 0.0, 1.0);
  float luma = dot(lit, vec3(0.2126, 0.7152, 0.0722));
  lit = mix(lit, vec3(luma) * mix(vec3(1.0), uSky / max(dot(uSky, vec3(0.2126, 0.7152, 0.0722)), 0.05), 0.6), far * 0.75);
  vec3 outc = mix(lit, uSky, far);
  gl_FragColor = vec4(outc, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function horizonLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let env: WorldEnv | null = null;
  let mesh: Mesh | null = null;
  let geometry: BufferGeometry | null = null;
  let material: ShaderMaterial | null = null;
  let shown = true;

  return {
    id: 'horizon',
    init(c) {
      ctx = c;
      env = c.env ?? createWorldEnv(new PerspectiveCamera());
      const mirror: Mirror = c.mirror;
      const tiles = new SurfaceTiles(mirror);
      const size = MAP_SIZE;
      const input: HorizonInput = {
        size,
        seed: horizonSeed(mirror.meta),
        edgeY: (px, pz) => surfaceY(tiles, px, pz),
        exits: findRiverExits(size, (x, z) => mirror.water(x, z) > 0),
      };
      const built = buildHorizon(input);
      geometry = built.geometry;
      material = new ShaderMaterial({
        uniforms: {
          uSky: env.sky,
          uSkyTop: env.skyTop,
          uSun: env.sunColor,
          uSunDir: env.sunDir,
          uNight: env.night,
          uSeasonTint: env.seasonTint,
          uSnow: env.snow,
          uAutumn: env.autumn,
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        vertexColors: true,
        side: DoubleSide,
        fog: false,
      });
      mesh = new Mesh(geometry, material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.userData.qotiShadows = false;
      mesh.visible = !env.skipScene;
      shown = mesh.visible;
      ctx.scene.add(mesh);
    },
    update() {},
    frame() {
      if (!mesh || !env) return false;
      const want = !env.skipScene;
      if (want === shown) return false;
      shown = want;
      mesh.visible = want;
      return true;
    },
    dispose() {
      if (mesh) ctx?.scene.remove(mesh);
      geometry?.dispose();
      material?.dispose();
    },
  };
}
