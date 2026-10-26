import { palette, seeded, ShapeBuilder, vary } from '@qoti/art';
import { CHUNK_SIZE, Flags, MAP_SIZE, Road } from '@qoti/sim';
import { levelY } from '../coords';
import { ChunkedMeshes } from '../chunks';
import { WATER_Y } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * C3D-1 roads. Road surfaces are painted by the ground shader (see ROAD_GLSL), which joins each
 * road tile to its road neighbors with soft rounded corners, so runs, corners and T-junctions come
 * out of the neighbors with no stripes or gaps. This layer adds what paint cannot: plank bridges
 * with posts and rails where a road crosses water.
 */

/** Ground shader chunk: `qRoadPaint(wp, ground)` paints roads over the ground color. */
export const ROAD_GLSL = /* glsl */ `
float qRoadHalf(float k) { return k < 1.5 ? 0.21 : k < 2.5 ? 0.33 : 0.43; }
float qSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
void qRoadSeg(vec2 p, vec2 a, vec2 b, float ka, float kb, inout float edge, inout float center, inout float kind, inout float best, inout vec2 dir) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float d = length(pa - ba * h);
  float e = d - mix(qRoadHalf(ka), qRoadHalf(kb), h);
  edge = qSmin(edge, e, 0.14);
  center = min(center, d);
  if (e < best) { best = e; kind = h < 0.5 ? ka : kb; dir = ba; }
}

// C4E: streets. Granite setts in rows across the street, each stone domed and lit from above, set
// in dark joints, between kerbs of long pale dressed stone with a gutter shadow on the inside.
vec3 qStreet(vec2 wp, vec3 grass, float e, vec2 dir) {
  vec2 along = normalize(abs(dir.x) > abs(dir.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  vec2 across = vec2(-along.y, along.x);
  float u = dot(wp, along) * 8.0;
  float v = dot(wp, across) * 6.5;
  float row = floor(u);
  v += mod(row, 2.0) * 0.5;
  vec2 cell = vec2(row, floor(v));
  vec2 f = vec2(fract(u), fract(v)) - 0.5;
  float h = qHash(cell + 0.37);
  // Rounded rectangles: soft where the joints are.
  vec2 q = abs(f) - vec2(0.36, 0.38);
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.07;
  float stone = 1.0 - smoothstep(-0.02, 0.05, sd);
  vec3 granite = mix(qSrgb(vec3(0.60, 0.59, 0.56)), qSrgb(vec3(0.71, 0.68, 0.62)), h);
  granite = mix(granite, qSrgb(vec3(0.66, 0.57, 0.48)), step(0.82, qHash(cell + 5.3)) * 0.7);
  granite = mix(granite, qSrgb(vec3(0.52, 0.55, 0.56)), step(0.9, qHash(cell + 9.1)) * 0.6);
  // Domed: lighter toward the middle, a little shade toward the sun-away edge.
  granite *= 0.86 + 0.2 * (1.0 - length(f) * 1.3) + 0.06 * (qNoise(wp * 23.0) - 0.5);
  vec3 joint = qSrgb(vec3(0.34, 0.32, 0.28)) * (0.9 + 0.2 * qNoise(wp * 11.0));
  // Moss creeps into the joints near the kerbs.
  joint = mix(joint, qSrgb(vec3(0.36, 0.45, 0.26)), smoothstep(-0.2, -0.08, e) * 0.5);
  vec3 col = mix(joint, granite, stone);
  // The kerb: long dressed stones along the edge, a highlight on the top, a gutter shadow inside.
  float kerb = smoothstep(-0.105, -0.095, e);
  float ku = dot(wp, along) * 2.6;
  float kh = qHash(vec2(floor(ku), floor(dot(wp, across) * 2.0)));
  vec3 kc = mix(qSrgb(vec3(0.80, 0.77, 0.70)), qSrgb(vec3(0.72, 0.69, 0.63)), kh);
  kc *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.04, abs(fract(ku) - 0.5) * 2.0 - 0.94));
  kc *= 1.0 + 0.12 * smoothstep(-0.03, -0.012, e);
  col = mix(col, kc, kerb);
  col *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.03, abs(e + 0.11)));
  return col;
}

vec3 qRoadPaint(vec2 wp, vec3 col) {
  ivec2 t = ivec2(floor(wp));
  float k[9];
  float any = 0.0;
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) {
      float v = qGroundFetch(t + ivec2(i - 1, j - 1), 0);
      k[j * 3 + i] = v;
      any = max(any, v);
    }
  }
  if (any < 0.5) return col;
  float edge = 9.0;
  float center = 9.0;
  float kind = 0.0;
  float best = 9.0;
  vec2 dir = vec2(1.0, 0.0);
  vec2 o = vec2(t) - 0.5;
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 2; i++) {
      float ka = k[j * 3 + i];
      float kb = k[j * 3 + i + 1];
      if (ka < 0.5 || kb < 0.5) continue;
      vec2 a = o + vec2(float(i), float(j));
      qRoadSeg(wp, a, a + vec2(1.0, 0.0), ka, kb, edge, center, kind, best, dir);
    }
  }
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 3; i++) {
      float ka = k[j * 3 + i];
      float kb = k[(j + 1) * 3 + i];
      if (ka < 0.5 || kb < 0.5) continue;
      vec2 a = o + vec2(float(i), float(j));
      qRoadSeg(wp, a, a + vec2(0.0, 1.0), ka, kb, edge, center, kind, best, dir);
    }
  }
  if (k[4] > 0.5 && k[1] + k[3] + k[5] + k[7] < 0.5) {
    vec2 c = o + vec2(1.0);
    qRoadSeg(wp, c, c + vec2(0.001, 0.0), k[4], k[4], edge, center, kind, best, dir);
  }
  if (kind < 0.5) return col;

  bool street = kind > 2.5;
  float e = edge + (street ? 0.0 : (qNoise(wp * 6.5) - 0.5) * 0.08 + (qNoise(wp * 17.0 + 9.0) - 0.5) * 0.035);
  // Trampled grass just outside the edge.
  col *= 1.0 - 0.08 * (1.0 - smoothstep(0.0, 0.09, e));
  float inside = 1.0 - smoothstep(-0.015, 0.02, e);
  if (inside <= 0.0) return col;
  if (street) return mix(col, qStreet(wp, col, e, dir), inside);
  bool lane = kind > 1.5;
  vec3 dirt = lane ? qSrgb(vec3(0.69, 0.58, 0.42)) : qSrgb(vec3(0.80, 0.67, 0.47));
  dirt *= 0.9 + 0.16 * qNoise(wp * 2.7) + 0.08 * (qNoise(wp * 13.0) - 0.5);
  // Pebbles.
  vec2 pc = floor(wp * 14.0);
  float ph = qHash(pc + 5.0);
  float pr = length(fract(wp * 14.0) - 0.5);
  dirt = mix(dirt, dirt * (ph > 0.93 ? 1.2 : 0.78), step(0.86, ph) * (1.0 - smoothstep(0.16, 0.3, pr)));
  if (lane) {
    // Two cart ruts and a hint of grass down the middle.
    float rut = 1.0 - smoothstep(0.02, 0.055, abs(center - 0.15));
    dirt *= 1.0 - 0.2 * rut;
    float median = (1.0 - smoothstep(0.02, 0.06, center)) * smoothstep(0.35, 0.65, qNoise(wp * 4.0));
    dirt = mix(dirt, col * 0.95, median * 0.75);
  } else {
    // A worn, lighter middle; grass creeping in at the sides.
    dirt *= 1.0 + 0.07 * (1.0 - smoothstep(0.0, 0.14, center));
    float tuft = smoothstep(0.62, 0.8, qNoise(wp * 8.0)) * smoothstep(-0.12, -0.03, e);
    dirt = mix(dirt, col, tuft * 0.85);
  }
  dirt *= 1.0 - 0.1 * smoothstep(-0.08, 0.0, e);
  return mix(col, dirt, inside);
}

// C4E: desire paths. Tiles residents keep walking over (the wear layer, packed into the data
// texture's third channel off fields) join their worn neighbors with a narrow trodden line, wider
// and barer the more it is used, broken by tufts so it reads as a shortcut, not a road.
float qWearOf(ivec2 t) {
  float terrain = qGroundFetch(t, 1);
  if (terrain > 6.5 && terrain < 7.5) return 0.0;
  if (qGroundFetch(t, 0) > 0.5) return 0.0;
  return clamp((qGroundFetch(t, 2) - 24.0) / 150.0, 0.0, 1.0);
}
vec3 qTrailPaint(vec2 wp, vec3 col) {
  ivec2 t = ivec2(floor(wp));
  float w[9];
  float any = 0.0;
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) {
      float v = qWearOf(t + ivec2(i - 1, j - 1));
      w[j * 3 + i] = v;
      any = max(any, v);
    }
  }
  if (any <= 0.0) return col;
  float d = 9.0;
  float s = 0.0;
  vec2 o = vec2(t) - 0.5;
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) {
      float wa = w[j * 3 + i];
      if (wa <= 0.0) continue;
      vec2 a = o + vec2(float(i), float(j));
      // Toward each worn neighbor to the right and below (and the diagonals), so lines join up.
      for (int n = 0; n < 4; n++) {
        ivec2 dd = n == 0 ? ivec2(1, 0) : n == 1 ? ivec2(0, 1) : n == 2 ? ivec2(1, 1) : ivec2(-1, 1);
        int ni = i + dd.x;
        int nj = j + dd.y;
        if (ni < 0 || ni > 2 || nj > 2) continue;
        float wb = w[nj * 3 + ni];
        if (wb <= 0.0) continue;
        vec2 b = a + vec2(dd);
        vec2 pa = wp - a;
        vec2 ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        float sw = mix(wa, wb, h);
        float e = length(pa - ba * h) - (0.05 + 0.09 * sw);
        if (e < d) { d = e; s = sw; }
      }
      // A worn spot where several ways meet, or a dead end.
      float e0 = length(wp - a) - (0.04 + 0.08 * wa);
      if (e0 < d) { d = e0; s = wa; }
    }
  }
  d += (qNoise(wp * 9.0) - 0.5) * 0.05;
  float on = 1.0 - smoothstep(-0.02, 0.03, d);
  if (on <= 0.0) return col;
  vec3 trod = mix(col * vec3(1.08, 1.02, 0.82), qSrgb(vec3(0.70, 0.60, 0.44)), 0.35 + 0.45 * s);
  trod *= 0.94 + 0.12 * qNoise(wp * 14.0);
  float tufts = smoothstep(0.55, 0.75, qNoise(wp * 10.0 + 3.0)) * (1.0 - s * 0.7);
  return mix(col, mix(trod, col, tufts), on * (0.55 + 0.4 * s));
}
`;

const DECK_Y = WATER_Y + 0.2;

/**
 * C4E: stone steps where a path with the stairs flag climbs one level to a road neighbor: five
 * treads from the lower tile's center to the upper one's, with cheek stones either side. Each pair
 * is built once, from the lower tile (or the upper one when only it carries the flag).
 */
function stairs(ctx: LayerContext, s: ShapeBuilder, x: number, z: number): void {
  const m = ctx.mirror;
  const flags = m.layers.flags as Uint8Array;
  const flagged = (tx: number, tz: number): boolean =>
    tx >= 0 && tz >= 0 && tx < MAP_SIZE && tz < MAP_SIZE && (flags[tz * MAP_SIZE + tx]! & Flags.stairs) !== 0;
  const h = m.height(x, z);
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + dx;
    const nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= MAP_SIZE || nz >= MAP_SIZE || !m.road(nx, nz) || m.water(nx, nz)) continue;
    const nh = m.height(nx, nz);
    if (Math.abs(nh - h) !== 1) continue;
    const lowerHere = nh > h;
    // Build each flight once: from the lower end when it is flagged, else from the upper end.
    if (!lowerHere && flagged(nx, nz)) continue;
    const [lx, lz, ly] = lowerHere ? [x, z, h] : [nx, nz, nh];
    const [ux, uz] = lowerHere ? [nx, nz] : [x, z];
    const rnd = seeded(lx * 7919 + lz * 104729 + ux * 31 + uz);
    const ax = lx + 0.5;
    const az = lz + 0.5;
    const ddx = ux - lx;
    const ddz = uz - lz;
    const y0 = levelY(ly);
    const rise = levelY(ly + 1) - y0;
    const steps = 5;
    const half = 0.24;
    for (let i = 0; i < steps; i++) {
      const t0 = (i + 0.1) / steps;
      const t1 = (i + 1.1) / steps;
      const top = y0 + (rise * (i + 1)) / steps - 0.01;
      const p0x = ax + ddx * t0;
      const p0z = az + ddz * t0;
      const p1x = ax + ddx * Math.min(1, t1);
      const p1z = az + ddz * Math.min(1, t1);
      const wx = ddz !== 0 ? half : 0;
      const wz = ddx !== 0 ? half : 0;
      s.rbox(
        Math.min(p0x, p1x) - wx,
        y0 - 0.12,
        Math.min(p0z, p1z) - wz,
        Math.max(p0x, p1x) + wx,
        top,
        Math.max(p0z, p1z) + wz,
        vary(palette.stone, rnd, 1.1),
        0.012,
      );
    }
    // Cheek stones along both sides, stepping up with the flight.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const t0 = i / 3;
        const t1 = (i + 1) / 3;
        const cxp = ax + ddx * ((t0 + t1) / 2) + (ddz !== 0 ? side * (half + 0.04) : 0);
        const czp = az + ddz * ((t0 + t1) / 2) + (ddx !== 0 ? side * (half + 0.04) : 0);
        const len = 1 / 3 / 2;
        const lxh = ddx !== 0 ? len : 0.045;
        const lzh = ddz !== 0 ? len : 0.045;
        s.rbox(
          cxp - lxh,
          y0 - 0.1,
          czp - lzh,
          cxp + lxh,
          y0 + rise * t1 + 0.05,
          czp + lzh,
          vary(0xa39c90, rnd, 1.2),
          0.015,
        );
      }
    }
  }
}

/** Plank bridges over water road tiles (and C4E stairs on slopes), one mesh per chunk. */
function bridgeGeometry(ctx: LayerContext, cx: number, cz: number) {
  const m = ctx.mirror;
  const s = new ShapeBuilder();
  const flags = m.layers.flags as Uint8Array | undefined;
  const isRoad = (x: number, z: number) => x >= 0 && z >= 0 && x < MAP_SIZE && z < MAP_SIZE && !!m.road(x, z);
  for (let z = cz * CHUNK_SIZE; z < (cz + 1) * CHUNK_SIZE; z++) {
    for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
      const kind = m.road(x, z);
      if (kind && flags && (flags[z * MAP_SIZE + x]! & Flags.stairs) !== 0 && !m.water(x, z))
        stairs(ctx, s, x, z);
      if (!kind || !m.water(x, z)) continue;
      const rnd = seeded(x * 7919 + z * 104729);
      const ew = isRoad(x - 1, z) || isRoad(x + 1, z);
      const ns = isRoad(x, z - 1) || isRoad(x, z + 1);
      const alongX = ew || !ns;
      const half = kind === Road.path ? 0.26 : 0.36;
      // Work in (a = along the bridge, c = across) and map back to x and z.
      const P = (a: number, y: number, c: number): [number, number, number] =>
        alongX ? [x + a, y, z + 0.5 + c] : [x + 0.5 + c, y, z + a];
      const box = (a0: number, y0: number, c0: number, a1: number, y1: number, c1: number, hex: number) => {
        const p = P(a0, y0, c0);
        const q = P(a1, y1, c1);
        s.box(
          Math.min(p[0], q[0]),
          Math.min(p[1], q[1]),
          Math.min(p[2], q[2]),
          Math.max(p[0], q[0]),
          Math.max(p[1], q[1]),
          Math.max(p[2], q[2]),
          hex,
        );
      };
      // Planks across the bridge, a little uneven, with dark gaps between them.
      const planks = 8;
      for (let i = 0; i < planks; i++) {
        const a0 = i / planks + 0.008;
        const a1 = (i + 1) / planks - 0.008;
        const lift = (rnd() - 0.5) * 0.012;
        const wob = (rnd() - 0.5) * 0.04;
        box(
          a0,
          DECK_Y - 0.035 + lift,
          -half + wob,
          a1,
          DECK_Y + lift,
          half + wob,
          vary(palette.wood, rnd, 1.6),
        );
      }
      // Two stringers under the planks.
      for (const c of [-half * 0.6, half * 0.6])
        box(0, DECK_Y - 0.09, c - 0.035, 1, DECK_Y - 0.035, c + 0.035, palette.darkWood);
      // Posts into the river at both ends of the tile, and the rails between them.
      for (const c of [-half - 0.03, half + 0.03]) {
        for (const a of [0.08, 0.92]) {
          const [px, , pz] = P(a, 0, c);
          s.cylinder(px, pz, 0.045, 0.04, WATER_Y - 0.35, DECK_Y + 0.26, palette.darkWood, 5);
          s.cylinder(px, pz, 0.05, 0.05, DECK_Y + 0.26, DECK_Y + 0.29, palette.timber, 5);
        }
        box(0, DECK_Y + 0.2, c - 0.022, 1, DECK_Y + 0.245, c + 0.022, palette.wood);
        box(0, DECK_Y + 0.09, c - 0.016, 1, DECK_Y + 0.12, c + 0.016, palette.darkWood);
      }
    }
  }
  return s.triangles > 0 ? s.build(false) : null;
}

export function roadsLayer(): RenderLayer {
  let chunks: ChunkedMeshes | null = null;
  return {
    id: 'roads',
    init(ctx) {
      chunks = new ChunkedMeshes(ctx.scene, ctx.material, (cx, cz) => bridgeGeometry(ctx, cx, cz));
      chunks.markAll();
      chunks.rebuild();
    },
    update(change) {
      if (!chunks) return;
      if (change.full) chunks.markAll();
      for (const layer of ['road', 'water', 'flags', 'height'] as const) {
        for (const rect of change.rects.get(layer) ?? []) chunks.markRect(rect);
      }
    },
    frame() {
      return chunks ? chunks.rebuild(2) : false;
    },
    dispose() {
      chunks?.dispose();
    },
  };
}
