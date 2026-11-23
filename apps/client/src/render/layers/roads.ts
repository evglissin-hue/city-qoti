import { palette, seeded, ShapeBuilder, SURFACE, vary, type V3 } from '@qoti/art';
import { CHUNK_SIZE, Flags, MAP_SIZE, Road } from '@qoti/sim';
import { ChunkedMeshes } from '../chunks';
import { groundY, WATER_Y, type SurfaceReader } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * C3D-1 roads. Road surfaces are painted by the ground shader (see ROAD_GLSL), which joins each
 * road tile to its road neighbors with soft rounded corners, so runs, corners and T-junctions come
 * out of the neighbors with no stripes or gaps, and walks a narrow way from the road up to every
 * door that faces one (door tiles carry DOOR_KIND plus their building's rotation in the road
 * channel). This layer adds what paint cannot: plank bridges with posts and rails where a road
 * crosses water.
 */

/** Road channel value of a door tile at rotation 0; rotation r is DOOR_KIND + r. */
export const DOOR_KIND = 16;

/** Ground shader chunk: `qRoadPaint(wp, ground)` paints roads over the ground color. */
export const ROAD_GLSL = /* glsl */ `
float qRoadOnly(float k) { return k < 15.5 ? k : 0.0; }
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

// V1C: flagstones where streets make a square (four street tiles round a corner): big pale slabs in
// staggered courses, each a little different, with fine dark joints.
vec3 qFlags(vec2 wp) {
  vec2 u = wp * vec2(2.2, 2.9);
  float course = floor(u.y);
  float shift = qHash(vec2(course, 3.1)) * 0.8;
  vec2 cell = vec2(floor(u.x + shift), course);
  vec2 f = vec2(fract(u.x + shift), fract(u.y));
  float h = qHash(cell + 0.7);
  vec3 slab = mix(qSrgb(vec3(0.78, 0.75, 0.68)), qSrgb(vec3(0.86, 0.82, 0.73)), h);
  slab = mix(slab, qSrgb(vec3(0.74, 0.70, 0.63)), step(0.85, qHash(cell + 4.2)) * 0.6);
  slab *= 0.94 + 0.1 * qNoise(wp * 9.0) + 0.04 * (1.0 - length(f - 0.5));
  float joint = smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 1.6);
  return mix(qSrgb(vec3(0.42, 0.40, 0.36)), slab, joint);
}

vec3 qRoadPaint(vec2 wp, vec3 col) {
  ivec2 t = ivec2(floor(wp));
  float k[9];
  float any = 0.0;
  bool doors = false;
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) {
      float v = qGroundFetch(t + ivec2(i - 1, j - 1), 0);
      if (v > 15.5) doors = true;
      k[j * 3 + i] = v;
      any = max(any, v < 15.5 ? v : 0.0);
    }
  }
  if (any < 0.5 && !doors) return col;
  float edge = 9.0;
  float center = 9.0;
  float kind = 0.0;
  float best = 9.0;
  float square = 0.0;
  vec2 dir = vec2(1.0, 0.0);
  vec2 o = vec2(t) - 0.5;
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 2; i++) {
      float ka = k[j * 3 + i];
      float kb = k[j * 3 + i + 1];
      if (ka < 0.5 || kb < 0.5 || max(ka, kb) > 15.5) continue;
      vec2 a = o + vec2(float(i), float(j));
      qRoadSeg(wp, a, a + vec2(1.0, 0.0), ka, kb, edge, center, kind, best, dir);
    }
  }
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 3; i++) {
      float ka = k[j * 3 + i];
      float kb = k[(j + 1) * 3 + i];
      if (ka < 0.5 || kb < 0.5 || max(ka, kb) > 15.5) continue;
      vec2 a = o + vec2(float(i), float(j));
      qRoadSeg(wp, a, a + vec2(0.0, 1.0), ka, kb, edge, center, kind, best, dir);
    }
  }
  // C4P: a square of four road tiles is paved right across, instead of leaving a hole of grass.
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      float lo = min(min(k[j * 3 + i], k[j * 3 + i + 1]), min(k[(j + 1) * 3 + i], k[(j + 1) * 3 + i + 1]));
      float hi = max(max(k[j * 3 + i], k[j * 3 + i + 1]), max(k[(j + 1) * 3 + i], k[(j + 1) * 3 + i + 1]));
      if (lo < 0.5 || hi > 15.5) continue;
      vec2 q = abs(wp - (o + vec2(float(i), float(j)) + 0.5)) - 0.5;
      float sq = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
      edge = qSmin(edge, sq, 0.14);
      if (lo > 2.5) square = max(square, 1.0 - smoothstep(-0.12, -0.02, sq));
    }
  }
  if (k[4] > 0.5 && k[4] < 15.5 && qRoadOnly(k[1]) + qRoadOnly(k[3]) + qRoadOnly(k[5]) + qRoadOnly(k[7]) < 0.5) {
    vec2 c = o + vec2(1.0);
    qRoadSeg(wp, c, c + vec2(0.001, 0.0), k[4], k[4], edge, center, kind, best, dir);
  }
  // Doorsteps: a narrow walk from the middle of the road in front of a door up to the door,
  // ending under the building, joined to the road with the same soft fillet as any junction. Off a
  // street it is paved like the street; otherwise it is a path's dirt.
  if (doors) {
    for (int j = 0; j < 3; j++) {
      for (int i = 0; i < 3; i++) {
        float r = k[j * 3 + i] - 16.0;
        if (r < -0.5) continue;
        vec2 f = r < 0.5 ? vec2(0.0, 1.0) : r < 1.5 ? vec2(-1.0, 0.0) : r < 2.5 ? vec2(0.0, -1.0) : vec2(1.0, 0.0);
        ivec2 dt = t + ivec2(i - 1, j - 1);
        float kf = qGroundFetch(dt + ivec2(f), 0);
        if (kf < 0.5 || kf > 15.5) continue;
        vec2 c = vec2(dt) + 0.5;
        float kw = kf > 2.5 ? 3.0 : 1.0;
        vec2 a = c + f;
        vec2 b = c + f * 0.1;
        vec2 pa = wp - a;
        vec2 ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        float d = length(pa - ba * h);
        float e = d - (kw > 2.5 ? 0.2 : 0.14);
        edge = qSmin(edge, e, 0.12);
        center = min(center, d);
        if (e < best) {
          best = e;
          kind = kw;
          dir = ba;
        }
      }
    }
  }
  if (kind < 0.5) return col;

  bool street = kind > 2.5;
  // One edge for every road: a little irregular, never lumpy (C4P halved the wobble).
  float e = edge + (street ? 0.0 : (qNoise(wp * 5.0) - 0.5) * 0.045 + (qNoise(wp * 17.0 + 9.0) - 0.5) * 0.02);
  // Trampled grass just outside the edge.
  col *= 1.0 - 0.08 * (1.0 - smoothstep(0.0, 0.09, e));
  float inside = 1.0 - smoothstep(-0.015, 0.02, e);
  if (inside <= 0.0) return col;
  if (street) {
    vec3 paved = qStreet(wp, col, e, dir);
    if (square > 0.0) paved = mix(paved, qFlags(wp), square);
    return mix(col, paved, inside);
  }
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

/**
 * P3C: the risers of a flight. Weathered stone on lanes and streets, a shade under the dirt of the
 * paths it carries (C4P's pale sandstone stood out as a stand-in, the owner's playtest of V3), and
 * timber edging on footpaths, as a garden's steps are.
 */
const STEP_STONE = 0x8d8170;
const STEP_TIMBER = palette.darkWood;
/** Risers per level climbed (a level is 0.5 world units, so a step of 0.1). */
export const STEPS = 5;
/** Half the width of a flight: a little wider than the path it carries (qRoadHalf for paths). */
const STEP_HALF = 0.24;
/** A riser's depth along the climb, how far it stands proud of the ground, and how deep it is set. */
const RISER_DEPTH = 0.07;
const RISER_LIP = 0.04;
const RISER_SET = 0.07;
/** Cuts across a riser, so a cross slope never lifts one end off the ground. */
const RISER_CUTS = 3;

/**
 * Steps where a path with the stairs flag climbs one level to a road neighbor (C4E, rebuilt in
 * C4P, P3C). The ground already climbs from the lower tile's center to the upper one's as an even
 * slope, and the road paint lies on it; the flight is that slope with its risers let in: a row of
 * edges across the path, each standing a little proud of the drawn ground (`groundY`) at every
 * corner and set into it below, so nothing stands off the ground wherever it dips (a building's
 * apron) or falls away to one side. P3C: C4P's tread boxes reached down to the lowest ground under
 * them and ratcheted up over any dip, so beside a building's pad a flight stood as a pale plinth
 * with a sloped kerb slab, which the owner read as a stand-in. Consecutive climbs meet at tile
 * centers, so a path that climbs on and on reads as one flight. Each flight is built once, from the
 * lower tile (or the upper one when only it carries the flag).
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
    flight(ctx.mirror, s, lx, lz, ux - lx, uz - lz, m.road(lx, lz) === Road.path);
  }
}

/**
 * One flight from the center of tile (lx, lz) up to its neighbor in direction (ddx, ddz): STEPS
 * risers across the path, timber on a footpath and stone otherwise. Every corner's height is the
 * drawn ground's there, so a riser follows the slope under it and can never float.
 */
export function flight(
  m: SurfaceReader,
  s: ShapeBuilder,
  lx: number,
  lz: number,
  ddx: number,
  ddz: number,
  footpath: boolean,
): void {
  const rnd = seeded(lx * 7919 + lz * 104729 + (lx + ddx) * 31 + (lz + ddz));
  // Along the climb (a: 0 at the lower center, 1 at the upper) and across it (c).
  const cxp = ddz !== 0 ? 1 : 0;
  const czp = ddx !== 0 ? 1 : 0;
  const at = (a: number, c: number, lift: number): V3 => {
    const px = lx + 0.5 + ddx * a + cxp * c;
    const pz = lz + 0.5 + ddz * a + czp * c;
    return [px, groundY(m, px, pz) + lift, pz];
  };
  const up: V3 = [ddx, 0, ddz];
  const down: V3 = [-ddx, 0, -ddz];
  const side: V3 = [cxp, 0, czp];
  const back: V3 = [-cxp, 0, -czp];
  s.surface(footpath ? SURFACE.woodGrain : SURFACE.stone);
  for (let i = 0; i < STEPS; i++) {
    // Evenly up the climb, a little uneven, as laid by hand.
    const a = (i + 0.5) / STEPS + (rnd() - 0.5) * 0.03;
    const a0 = a - RISER_DEPTH / 2;
    const a1 = a + RISER_DEPTH / 2;
    const wob = (rnd() - 0.5) * 0.04;
    const half = STEP_HALF + (rnd() - 0.5) * 0.03;
    const tone = vary(footpath ? STEP_TIMBER : STEP_STONE, rnd, footpath ? 1.4 : 1.1);
    const top = vary(tone, rnd, 0.6);
    for (let k = 0; k < RISER_CUTS; k++) {
      const c0 = -half + wob + (2 * half * k) / RISER_CUTS;
      const c1 = -half + wob + (2 * half * (k + 1)) / RISER_CUTS;
      // The front (downhill) edge stands a lip proud; the back sits nearly flush with the slope.
      const f0t = at(a0, c0, RISER_LIP);
      const f1t = at(a0, c1, RISER_LIP);
      const b0t = at(a1, c0, RISER_LIP * 0.35);
      const b1t = at(a1, c1, RISER_LIP * 0.35);
      const f0b = at(a0, c0, -RISER_SET);
      const f1b = at(a0, c1, -RISER_SET);
      const b0b = at(a1, c0, -RISER_SET);
      const b1b = at(a1, c1, -RISER_SET);
      s.quad(f0t, f1t, b1t, b0t, top, [0, 1, 0]);
      s.quad(f0b, f1b, f1t, f0t, tone, down);
      s.quad(b0b, b1b, b1t, b0t, tone, up);
      if (k === 0) s.quad(f0b, b0b, b0t, f0t, tone, back);
      if (k === RISER_CUTS - 1) s.quad(f1b, b1b, b1t, f1t, tone, side);
    }
  }
  s.surface(SURFACE.plain);
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
      for (const layer of ['road', 'water', 'flags', 'height', 'occupant'] as const) {
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
