import { palette, seeded, ShapeBuilder, vary, type V3 } from '@qoti/art';
import { CHUNK_SIZE, Flags, MAP_SIZE, Road } from '@qoti/sim';
import { ChunkedMeshes } from '../chunks';
import { groundY, WATER_Y } from '../surface';
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
// C4P: kind comes out continuous along a segment between two kinds (a path running into a lane
// turns into it over the middle half of the joint), so a join changes width and dirt smoothly
// instead of cutting from one to the other. Streets still switch at the middle: setts end at a kerb.
void qRoadSeg(vec2 p, vec2 a, vec2 b, float ka, float kb, inout float edge, inout float center, inout float kind, inout float best, inout vec2 dir) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float d = length(pa - ba * h);
  float hs = smoothstep(0.25, 0.75, h);
  float e = d - mix(qRoadHalf(ka), qRoadHalf(kb), hs);
  edge = qSmin(edge, e, 0.14);
  center = min(center, d);
  if (e < best) {
    best = e;
    kind = max(ka, kb) > 2.5 && min(ka, kb) < 2.5 ? (h < 0.5 ? ka : kb) : mix(ka, kb, hs);
    dir = ba;
  }
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
  // C4P: a square of four road tiles is paved right across, instead of leaving a hole of grass.
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      if (min(min(k[j * 3 + i], k[j * 3 + i + 1]), min(k[(j + 1) * 3 + i], k[(j + 1) * 3 + i + 1])) < 0.5) continue;
      vec2 q = abs(wp - (o + vec2(float(i), float(j)) + 0.5)) - 0.5;
      float sq = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
      edge = qSmin(edge, sq, 0.14);
    }
  }
  if (k[4] > 0.5 && k[1] + k[3] + k[5] + k[7] < 0.5) {
    vec2 c = o + vec2(1.0);
    qRoadSeg(wp, c, c + vec2(0.001, 0.0), k[4], k[4], edge, center, kind, best, dir);
  }
  if (kind < 0.5) return col;

  bool street = kind > 2.5;
  // One edge for every road: a little irregular, never lumpy (C4P halved the wobble).
  float e = edge + (street ? 0.0 : (qNoise(wp * 5.0) - 0.5) * 0.045 + (qNoise(wp * 17.0 + 9.0) - 0.5) * 0.02);
  // Trampled grass just outside the edge.
  col *= 1.0 - 0.08 * (1.0 - smoothstep(0.0, 0.09, e));
  float inside = 1.0 - smoothstep(-0.015, 0.02, e);
  if (inside <= 0.0) return col;
  if (street) return mix(col, qStreet(wp, col, e, dir), inside);
  // C4P: paths and lanes are one dirt. A lane (lw 1) is the same earth packed a little darker by
  // cart wheels, with two soft ruts and a ragged grass crown; a path (lw 0) is lighter where feet
  // wear its middle. Joins blend lw, so a path running into a lane changes over gradually.
  float lw = clamp(kind - 1.0, 0.0, 1.0);
  vec3 dirt = qSrgb(vec3(0.77, 0.65, 0.46)) * mix(1.0, 0.9, lw);
  dirt *= 0.92 + 0.12 * qNoise(wp * 2.7) + 0.07 * (qNoise(wp * 13.0) - 0.5);
  // Pebbles.
  vec2 pc = floor(wp * 14.0);
  float ph = qHash(pc + 5.0);
  float pr = length(fract(wp * 14.0) - 0.5);
  dirt = mix(dirt, dirt * (ph > 0.93 ? 1.18 : 0.8), step(0.87, ph) * (1.0 - smoothstep(0.16, 0.3, pr)));
  // Ruts: two soft darker bands where the wheels run, coming and going a little along the lane.
  float rut = (1.0 - smoothstep(0.025, 0.07, abs(center - 0.15))) * (0.75 + 0.25 * qNoise(wp * 3.1));
  dirt *= 1.0 - 0.13 * rut * lw;
  // The crown: long, ragged patches of grass down the middle, not a dashed line.
  float crown = (1.0 - smoothstep(0.03, 0.075, center + (qNoise(wp * 9.0) - 0.5) * 0.03));
  crown *= smoothstep(0.42, 0.72, qNoise(wp * 1.3 + 4.0));
  dirt = mix(dirt, col * 0.97, crown * 0.6 * lw);
  // A path's worn, lighter middle, and grass creeping in at its sides.
  dirt *= 1.0 + 0.06 * (1.0 - smoothstep(0.0, 0.14, center)) * (1.0 - lw);
  float tuft = smoothstep(0.64, 0.8, qNoise(wp * 8.0)) * smoothstep(-0.12, -0.03, e);
  dirt = mix(dirt, col, tuft * 0.75);
  dirt *= 1.0 - 0.08 * smoothstep(-0.08, 0.0, e);
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
        float e = length(pa - ba * h) - (0.04 + 0.07 * sw);
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
  // C4P: trampled grass going to bare earth of the same dirt as the paths (never paler than them),
  // broken by tufts, so a shortcut reads as a shortcut and not as a smear beside the road.
  vec3 trod = mix(col * vec3(0.92, 0.9, 0.78), qSrgb(vec3(0.71, 0.6, 0.43)), 0.25 + 0.55 * s);
  trod *= 0.94 + 0.12 * qNoise(wp * 14.0);
  float tufts = smoothstep(0.5, 0.72, qNoise(wp * 10.0 + 3.0)) * (1.0 - s * 0.6);
  return mix(col, mix(trod, col, tufts), on * (0.5 + 0.4 * s));
}
`;

const DECK_Y = WATER_Y + 0.2;

/** Stone for steps: a warm sandstone that sits with the dirt of the paths it carries. */
const STEP_STONE = 0xc4b49a;
const STEP_KERB = 0xa89a84;
/** Treads per level climbed (a level is 0.5 world units, so 0.1 risers on 0.2 treads). */
const STEPS = 5;
/** Half the width of a flight: a little wider than the path it carries (qRoadHalf for paths). */
const STEP_HALF = 0.24;

/**
 * Stone steps where a path with the stairs flag climbs one level to a road neighbor (C4E, rebuilt
 * in C4P). The ground already climbs from the lower tile's center to the upper one's as an even
 * slope, so the flight is cut into that slope: each tread's back is flush with the ground and its
 * front rises one riser above it, and every height comes from the drawn ground (`groundY`), so no
 * tread floats where the hillside falls away to one side. A sloped kerb runs along each side,
 * sinking into the ground at both ends. Consecutive climbs meet at tile centers, so a path that
 * climbs on and on reads as one flight. Each flight is built once, from the lower tile (or the
 * upper one when only it carries the flag).
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
    const [lx, lz] = lowerHere ? [x, z] : [nx, nz];
    const [ux, uz] = lowerHere ? [nx, nz] : [x, z];
    flight(ctx, s, lx, lz, ux - lx, uz - lz);
  }
}

/** One flight from the center of tile (lx, lz) up to its neighbor in direction (ddx, ddz). */
function flight(ctx: LayerContext, s: ShapeBuilder, lx: number, lz: number, ddx: number, ddz: number): void {
  const m = ctx.mirror;
  const rnd = seeded(lx * 7919 + lz * 104729 + (lx + ddx) * 31 + (lz + ddz));
  // Along the climb (a: 0 at the lower center, 1 at the upper) and across it (c).
  const cxp = ddz !== 0 ? 1 : 0;
  const czp = ddx !== 0 ? 1 : 0;
  const at = (a: number, c: number): [number, number] => [
    lx + 0.5 + ddx * a + cxp * c,
    lz + 0.5 + ddz * a + czp * c,
  ];
  const g = (a: number, c: number): number => {
    const [px, pz] = at(a, c);
    return groundY(m, px, pz);
  };
  const y0 = g(0, 0);
  const y1 = g(1, 0);
  const rise = (y1 - y0) / STEPS;
  // A box between two (a, c) corners and two heights, mapped back to x and z.
  const box = (
    a0: number,
    c0: number,
    a1: number,
    c1: number,
    yb: number,
    yt: number,
    hex: number,
    bev: number,
  ) => {
    const [px, pz] = at(a0, c0);
    const [qx, qz] = at(a1, c1);
    s.rbox(Math.min(px, qx), yb, Math.min(pz, qz), Math.max(px, qx), yt, Math.max(pz, qz), hex, bev);
  };
  let prevTop = y0;
  for (let i = 0; i < STEPS; i++) {
    const a0 = i / STEPS;
    const a1 = (i + 1) / STEPS;
    // The back of the tread is flush with the ground; never lower than the tread below.
    const top = Math.max(prevTop + rise * 0.5, g(a1, 0)) - 0.005;
    prevTop = top;
    let low = top;
    for (const a of [a0, a1]) for (const c of [-STEP_HALF, 0, STEP_HALF]) low = Math.min(low, g(a, c));
    // Each tread laps a little under the next riser, so no gap opens between them.
    const tone = vary(STEP_STONE, rnd, 1.2);
    box(a0, -STEP_HALF, Math.min(1, a1 + 0.03), STEP_HALF, low - 0.08, top, tone, 0.014);
  }
  // Kerbs: sloped stones along both sides, a little above the tread fronts in the middle and
  // dipping to the ground at both ends, so they start and stop without a post.
  const lip = Math.abs(rise) + 0.035;
  const knots = [-0.06, 0.18, 0.5, 0.82, 1.06];
  const kw = 0.04;
  for (const side of [-1, 1]) {
    const cIn = side * STEP_HALF;
    const cOut = side * (STEP_HALF + 2 * kw);
    const top = (a: number): number => {
      const t = Math.min(1, Math.max(0, a));
      const ends = a <= 0 || a >= 1 ? 0.02 : lip;
      return y0 + (y1 - y0) * t + ends;
    };
    const bottom = (a: number): number => Math.min(g(a, cIn), g(a, cOut), y0 + (y1 - y0) * a) - 0.1;
    const tone = vary(STEP_KERB, rnd, 1);
    for (let k = 0; k + 1 < knots.length; k++) {
      const a0 = knots[k]!;
      const a1 = knots[k + 1]!;
      const corner = (a: number, c: number, y: number): V3 => {
        const [px, pz] = at(a, c);
        return [px, y, pz];
      };
      const t0 = top(a0);
      const t1 = top(a1);
      const b0 = bottom(a0);
      const b1 = bottom(a1);
      const i0t = corner(a0, cIn, t0);
      const i1t = corner(a1, cIn, t1);
      const o0t = corner(a0, cOut, t0);
      const o1t = corner(a1, cOut, t1);
      const i0b = corner(a0, cIn, b0);
      const i1b = corner(a1, cIn, b1);
      const o0b = corner(a0, cOut, b0);
      const o1b = corner(a1, cOut, b1);
      const outSide: V3 = [cxp * side, 0, czp * side];
      const inSide: V3 = [-cxp * side, 0, -czp * side];
      s.quad(i0t, i1t, o1t, o0t, tone, [0, 1, 0]);
      s.quad(o0b, o1b, o1t, o0t, tone, outSide);
      s.quad(i0b, i1b, i1t, i0t, tone, inSide);
      if (k === 0) s.quad(i0b, o0b, o0t, i0t, tone, [-ddx, 0, -ddz]);
      if (k + 2 === knots.length) s.quad(i1b, o1b, o1t, i1t, tone, [ddx, 0, ddz]);
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
