import { palette, seeded, ShapeBuilder, vary } from '@qoti/art';
import { CHUNK_SIZE, MAP_SIZE, Road } from '@qoti/sim';
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
float qRoadHalf(float k) { return k < 1.5 ? 0.21 : 0.33; }
float qSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
void qRoadSeg(vec2 p, vec2 a, vec2 b, float ka, float kb, inout float edge, inout float center, inout float kind, inout float best) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float d = length(pa - ba * h);
  float e = d - mix(qRoadHalf(ka), qRoadHalf(kb), h);
  edge = qSmin(edge, e, 0.14);
  center = min(center, d);
  if (e < best) { best = e; kind = h < 0.5 ? ka : kb; }
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
  vec2 o = vec2(t) - 0.5;
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 2; i++) {
      float ka = k[j * 3 + i];
      float kb = k[j * 3 + i + 1];
      if (ka < 0.5 || kb < 0.5) continue;
      vec2 a = o + vec2(float(i), float(j));
      qRoadSeg(wp, a, a + vec2(1.0, 0.0), ka, kb, edge, center, kind, best);
    }
  }
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 3; i++) {
      float ka = k[j * 3 + i];
      float kb = k[(j + 1) * 3 + i];
      if (ka < 0.5 || kb < 0.5) continue;
      vec2 a = o + vec2(float(i), float(j));
      qRoadSeg(wp, a, a + vec2(0.0, 1.0), ka, kb, edge, center, kind, best);
    }
  }
  if (k[4] > 0.5 && k[1] + k[3] + k[5] + k[7] < 0.5) {
    vec2 c = o + vec2(1.0);
    qRoadSeg(wp, c, c + vec2(0.001, 0.0), k[4], k[4], edge, center, kind, best);
  }
  if (kind < 0.5) return col;

  float e = edge + (qNoise(wp * 6.5) - 0.5) * 0.08 + (qNoise(wp * 17.0 + 9.0) - 0.5) * 0.035;
  // Trampled grass just outside the edge.
  col *= 1.0 - 0.08 * (1.0 - smoothstep(0.0, 0.09, e));
  float inside = 1.0 - smoothstep(-0.015, 0.02, e);
  if (inside <= 0.0) return col;
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
`;

const DECK_Y = WATER_Y + 0.2;

/** Plank bridges over water road tiles, one mesh per chunk. */
function bridgeGeometry(ctx: LayerContext, cx: number, cz: number) {
  const m = ctx.mirror;
  const s = new ShapeBuilder();
  const isRoad = (x: number, z: number) => x >= 0 && z >= 0 && x < MAP_SIZE && z < MAP_SIZE && !!m.road(x, z);
  for (let z = cz * CHUNK_SIZE; z < (cz + 1) * CHUNK_SIZE; z++) {
    for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
      const kind = m.road(x, z);
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
      for (const layer of ['road', 'water'] as const) {
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
