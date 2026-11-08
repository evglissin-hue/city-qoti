import { CHUNK_SIZE, CHUNKS_PER_SIDE, MAP_SIZE } from '@qoti/sim';
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
} from 'three';
import { hash2 } from '../coords';
import type { WorldEnv } from '../env';
import { surfaceY, SurfaceTiles, WATER_Y } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * C5E ambient critters: cosmetic, client-side wildlife near the habitats that would draw it
 * (`habitats.updated` scores per chunk; the sim's sightings still decide the Field Guide). Seven
 * kinds: butterflies and bees by pollinator patches and gardens, fireflies over summer meadows at
 * night, songbirds (robins in winter) about hedgerows and woods, dragonflies over wetland, and
 * ducks and the odd swan paddling on open water. None is a resident species. The CPU picks where
 * they live when the view moves on or the hour turns; the vertex shaders fly, flutter and paddle
 * them, so a frame costs two instanced draws. Counts follow `QualityPreset.critters` (none on Low,
 * some on Medium, all on High and Ultra). Moving layer; too small for blob shadows.
 */

export const CRITTER_KINDS = [
  'butterfly',
  'bee',
  'firefly',
  'songbird',
  'dragonfly',
  'duck',
  'swan',
] as const;
export type CritterKind = (typeof CRITTER_KINDS)[number];

/** Most flyers and swimmers per preset level. */
export const CRITTER_CAP = { none: [0, 0], some: [48, 10], all: [140, 24] } as const;

/** Which habitat (HABITAT_IDS index) draws each kind, and how many per chunk at a full score. */
const HOME: Record<CritterKind, { habitat: number[]; perChunk: number }> = {
  butterfly: { habitat: [0, 5, 4], perChunk: 6 },
  bee: { habitat: [0, 5], perChunk: 5 },
  firefly: { habitat: [4, 1], perChunk: 10 },
  songbird: { habitat: [2, 3], perChunk: 3 },
  dragonfly: { habitat: [1], perChunk: 3 },
  duck: { habitat: [1], perChunk: 3 },
  swan: { habitat: [1], perChunk: 1 },
};

/** Who is about, by season (0 spring to 3 winter), hour and weather. */
export function crittersAbout(season: number, hour: number, wet: number, frozen: boolean): Set<CritterKind> {
  const on = new Set<CritterKind>();
  const day = hour >= 7.5 && hour < 19;
  const dusk = hour >= 19 && hour < 21.5;
  const night = hour >= 21.5 || hour < 4;
  const warm = season === 0 || season === 1;
  const dry = wet < 0.3;
  if (day && warm && dry) on.add('butterfly').add('bee');
  if (day && season === 2 && dry) on.add('butterfly');
  if (night && season === 1 && dry) on.add('firefly');
  if ((day || dusk) && dry) on.add('songbird');
  if (day && season === 1 && dry) on.add('dragonfly');
  if ((day || dusk) && !frozen) on.add('duck').add('swan');
  return on;
}

const FLYER_VERT = /* glsl */ `
attribute vec3 anchor;
attribute vec4 cseed;
uniform float uTime;
uniform float uNight;
varying vec2 vUv;
varying float vKind;
varying float vSeed;
varying float vGlow;
void main() {
  float kind = cseed.x;
  float s = cseed.y;
  vKind = kind;
  vSeed = s;
  vUv = uv;
  float t = uTime * (0.8 + 0.4 * fract(s * 7.0)) + s * 50.0;
  // Paths: a wandering loop about the anchor, its own size and height per kind.
  float r = kind < 0.5 ? 1.4 : kind < 1.5 ? 0.7 : kind < 2.5 ? 1.8 : kind < 3.5 ? 2.6 : 1.6;
  float h = kind < 0.5 ? 0.35 : kind < 1.5 ? 0.22 : kind < 2.5 ? 0.45 : kind < 3.5 ? 0.6 : 0.3;
  float sp = kind < 1.5 ? 0.45 : kind < 2.5 ? 0.18 : kind < 3.5 ? 0.6 : 0.9;
  vec3 p = anchor;
  float a = t * sp;
  p.x += sin(a) * r + sin(a * 2.3 + 1.0) * r * 0.35;
  p.z += cos(a * 0.8) * r + cos(a * 1.9 + 2.0) * r * 0.3;
  p.y += h + sin(t * (kind < 0.5 ? 3.0 : 1.3)) * 0.06 + (kind > 2.5 && kind < 3.5 ? abs(sin(a * 3.0)) * 0.5 : 0.0);
  // Heading along the path.
  vec2 vel = vec2(cos(a) * r + cos(a * 2.3 + 1.0) * r * 0.8, -sin(a * 0.8) * r * 0.8 - sin(a * 1.9 + 2.0) * r * 0.57);
  float yaw = atan(vel.x, vel.y);
  // Wings: the two halves fold about the body line (x = 0) at each kind's beat.
  vec3 v = position;
  float beat = kind < 0.5 ? 9.0 : kind < 1.5 ? 40.0 : kind < 2.5 ? 0.0 : kind < 3.5 ? 16.0 : 30.0;
  float fold = sin(t * beat) * (kind < 0.5 ? 1.0 : 0.55);
  if (abs(v.x) > 0.001) {
    float side = sign(v.x);
    float ang = fold * 0.9;
    v = vec3(v.x * cos(ang), abs(v.x) * sin(ang) + v.y, v.z);
  }
  float size = kind < 0.5 ? 0.13 : kind < 1.5 ? 0.05 : kind < 2.5 ? 0.06 : kind < 3.5 ? 0.12 : 0.11;
  v *= size;
  float cy = cos(yaw);
  float sy = sin(yaw);
  v = vec3(v.x * cy + v.z * sy, v.y, -v.x * sy + v.z * cy);
  // Fireflies glow in slow, unsynchronized pulses (each a couple of seconds; never a flash).
  vGlow = kind > 1.5 && kind < 2.5 ? 0.35 + 0.65 * smoothstep(0.2, 1.0, sin(uTime * 0.9 + s * 31.0)) : 0.0;
  if (kind > 1.5 && kind < 2.5) {
    // Face the camera: a soft round point.
    vec4 mv = viewMatrix * vec4(p, 1.0);
    mv.xy += (uv - 0.5) * 0.14;
    gl_Position = projectionMatrix * mv;
    return;
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(p + v, 1.0);
}
`;

const FLYER_FRAG = /* glsl */ `
uniform float uNight;
uniform vec3 uSunColor;
varying vec2 vUv;
varying float vKind;
varying float vSeed;
varying float vGlow;
void main() {
  vec2 c = vUv - 0.5;
  vec3 col;
  float k = vKind;
  if (k > 1.5 && k < 2.5) {
    float d = length(c);
    float a = (1.0 - smoothstep(0.0, 0.5, d)) * vGlow;
    if (a < 0.02) discard;
    // Bright enough for the night's bloom to halo them.
    gl_FragColor = vec4(vec3(1.0, 0.92, 0.45) * (1.2 + 2.6 * (1.0 - smoothstep(0.0, 0.18, d))), a);
    return;
  }
  // Wing shapes in the quad: rounded for butterflies, narrow for dragonflies, birds' wings taper.
  float shape = k < 0.5 ? 1.0 - smoothstep(0.36, 0.5, length(c * vec2(1.0, 1.25)))
    : k < 3.5 && k > 2.5 ? 1.0 - smoothstep(0.3, 0.5, length(c * vec2(1.0, 1.9)))
    : 1.0 - smoothstep(0.25, 0.5, length(c * vec2(1.0, 2.4)));
  if (shape < 0.5) discard;
  if (k < 0.5) {
    float p = fract(vSeed * 13.1);
    col = p < 0.3 ? vec3(0.95, 0.78, 0.2) : p < 0.55 ? vec3(0.96, 0.95, 0.9) : p < 0.8 ? vec3(0.62, 0.72, 0.95) : vec3(0.92, 0.45, 0.2);
    col = mix(col, vec3(0.15), smoothstep(0.38, 0.46, length(c)) * 0.6);
  } else if (k < 1.5) {
    col = mix(vec3(0.95, 0.75, 0.15), vec3(0.18, 0.13, 0.08), step(0.5, fract(vUv.y * 3.0)));
  } else if (k < 3.5) {
    // Songbirds: warm brown, robins in winter show a red breast from below.
    col = mix(vec3(0.42, 0.3, 0.2), vec3(0.78, 0.36, 0.2), step(0.75, fract(vSeed * 5.3)) * step(vUv.y, 0.5));
  } else {
    col = mix(vec3(0.25, 0.55, 0.62), vec3(0.85, 0.92, 0.95), smoothstep(0.1, 0.5, length(c)));
  }
  col *= mix(uSunColor, vec3(0.5, 0.55, 0.7), uNight) * 0.9;
  gl_FragColor = vec4(col, 1.0);
}
`;

const SWIM_VERT = /* glsl */ `
attribute vec3 anchor;
attribute vec4 cseed;
attribute vec3 color;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSky;
uniform float uNight;
varying vec3 vCol;
void main() {
  float s = cseed.y;
  float swan = step(5.5, cseed.x);
  float t = uTime * 0.07 + s * 40.0;
  float r = 0.6 + fract(s * 3.7) * 0.9;
  vec3 p = anchor + vec3(sin(t) * r, 0.0, cos(t * 0.8) * r * 0.7);
  vec2 vel = vec2(cos(t) * r, -sin(t * 0.8) * r * 0.56);
  float yaw = atan(vel.x, vel.y);
  vec3 v = position * mix(1.0, 1.7, swan);
  vec3 n = normal;
  float cy = cos(yaw);
  float sy = sin(yaw);
  v = vec3(v.x * cy + v.z * sy, v.y, -v.x * sy + v.z * cy);
  n = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
  p.y += sin(uTime * 1.3 + s * 9.0) * 0.006;
  vec3 base = mix(color, vec3(0.97, 0.96, 0.93), swan * step(color.r - color.b, 0.5));
  float lit = max(dot(normalize(n), normalize(uSunDir)), 0.0);
  vCol = base * (uSunColor * lit * 0.85 + uSky * 0.55) * mix(1.0, 0.45, uNight);
  gl_Position = projectionMatrix * viewMatrix * vec4(p + v, 1.0);
}
`;

const SWIM_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  gl_FragColor = vec4(vCol, 1.0);
  #include <colorspace_fragment>
}
`;

/** Two wing quads hinged at the body line (x = 0), and a little body between them. */
function flyerGeometry(): BufferGeometry {
  const p: number[] = [];
  const uv: number[] = [];
  const quad = (x0: number, x1: number, u0: number, u1: number) => {
    p.push(x0, 0, -0.5, x1, 0, -0.5, x1, 0, 0.5, x0, 0, -0.5, x1, 0, 0.5, x0, 0, 0.5);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
  };
  quad(-1, 0, 0, 0.5);
  quad(0, 1, 0.5, 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

/** A duck in a few faces: a boat of a body, a head forward and a beak (white for swans). */
function swimmerGeometry(): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const tri = (a: number[], b: number[], c: number[], rgb: number[]) => {
    const ux = b[0]! - a[0]!;
    const uy = b[1]! - a[1]!;
    const uz = b[2]! - a[2]!;
    const vx = c[0]! - a[0]!;
    const vy = c[1]! - a[1]!;
    const vz = c[2]! - a[2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const v of [a, b, c]) {
      pos.push(...v);
      nor.push(nx, ny, nz);
      col.push(...rgb);
    }
  };
  // Body: a low pyramid-ish hull, brown back, paler sides.
  const back = [0.45, 0.36, 0.26];
  const side = [0.62, 0.55, 0.45];
  const L = 0.09;
  const W = 0.045;
  const H = 0.035;
  const top = [0, H, -0.01];
  const nose = [0, 0.012, L];
  const tail = [0, 0.03, -L];
  const l = [-W, 0.008, 0];
  const r = [W, 0.008, 0];
  tri(nose, r, top, back);
  tri(nose, top, l, back);
  tri(top, r, tail, back);
  tri(top, tail, l, back);
  tri(nose, l, [0, 0, 0], side);
  tri(nose, [0, 0, 0], r, side);
  tri(tail, [0, 0, 0], l, side);
  tri(tail, r, [0, 0, 0], side);
  // Head: a green (mallard) cap on a short neck, and an orange beak.
  const head = [0.2, 0.42, 0.28];
  const hc = [0, 0.065, 0.065];
  const hs = 0.022;
  const hp = [
    [hc[0]! - hs, hc[1]!, hc[2]!],
    [hc[0]! + hs, hc[1]!, hc[2]!],
    [hc[0]!, hc[1]! + hs, hc[2]!],
    [hc[0]!, hc[1]! - hs * 1.6, hc[2]! - 0.01],
    [hc[0]!, hc[1]!, hc[2]! + hs],
    [hc[0]!, hc[1]!, hc[2]! - hs],
  ];
  tri(hp[2]!, hp[1]!, hp[4]!, head);
  tri(hp[2]!, hp[4]!, hp[0]!, head);
  tri(hp[2]!, hp[5]!, hp[1]!, head);
  tri(hp[2]!, hp[0]!, hp[5]!, head);
  tri(hp[3]!, hp[4]!, hp[1]!, head);
  tri(hp[3]!, hp[0]!, hp[4]!, head);
  tri(hp[3]!, hp[1]!, hp[5]!, head);
  tri(hp[3]!, hp[5]!, hp[0]!, head);
  const beak = [0.95, 0.6, 0.15];
  tri([-0.008, 0.062, 0.085], [0.008, 0.062, 0.085], [0, 0.058, 0.108], beak);
  tri([0.008, 0.062, 0.085], [-0.008, 0.062, 0.085], [0, 0.068, 0.084], beak);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

interface Herd {
  mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  anchors: Float32Array;
  seeds: Float32Array;
  cap: number;
}

function herd(base: BufferGeometry, material: ShaderMaterial, cap: number): Herd {
  const g = new InstancedBufferGeometry();
  for (const [k, a] of Object.entries(base.attributes)) g.setAttribute(k, a);
  const anchors = new Float32Array(Math.max(1, cap) * 3);
  const seeds = new Float32Array(Math.max(1, cap) * 4);
  g.setAttribute('anchor', new InstancedBufferAttribute(anchors, 3));
  g.setAttribute('cseed', new InstancedBufferAttribute(seeds, 4));
  g.instanceCount = 0;
  const mesh = new Mesh(g, material);
  mesh.frustumCulled = false;
  mesh.userData.noCast = true;
  mesh.visible = false;
  return { mesh, anchors, seeds, cap };
}

export function crittersLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let env: WorldEnv | undefined;
  let tiles: SurfaceTiles | null = null;
  let flyers: Herd | null = null;
  let swimmers: Herd | null = null;
  let key = '';
  let lastPick = -Infinity;
  let habitatsRev = 0;

  const flyerMat = (e: WorldEnv) =>
    new ShaderMaterial({
      vertexShader: FLYER_VERT,
      fragmentShader: FLYER_FRAG,
      side: DoubleSide,
      transparent: true,
      depthWrite: true,
      uniforms: { uTime: e.time, uNight: e.night, uSunColor: e.sunColor },
    });
  const swimMat = (e: WorldEnv) =>
    new ShaderMaterial({
      vertexShader: SWIM_VERT,
      fragmentShader: SWIM_FRAG,
      uniforms: {
        uTime: e.time,
        uNight: e.night,
        uSunDir: e.sunDir,
        uSunColor: e.sunColor,
        uSky: e.sky,
      },
    });

  function setCaps(): void {
    if (!ctx || !env) return;
    const [fc, sc] = CRITTER_CAP[env.critters];
    if (flyers && flyers.cap === fc && swimmers && swimmers.cap === sc) return;
    for (const h of [flyers, swimmers]) {
      if (!h) continue;
      ctx.scene.remove(h.mesh);
      h.mesh.geometry.dispose();
    }
    flyers = herd(flyerGeometry(), flyers?.mesh.material ?? flyerMat(env), fc);
    swimmers = herd(swimmerGeometry(), swimmers?.mesh.material ?? swimMat(env), sc);
    ctx.scene.add(flyers.mesh, swimmers.mesh);
    key = '';
  }

  /** Places the critters about the view: by chunk, from the habitat scores (or the land). */
  function pick(): void {
    if (!ctx || !env || !tiles || !flyers || !swimmers) return;
    const m = ctx.mirror;
    const { season, hour } = env.shown;
    const about = crittersAbout(season, hour, env.wet.value, env.frozen.value > 0.5 || env.snow.value > 0.5);
    const f = env.focus;
    const reach = Math.min(48, Math.max(24, env.detailDistance * 0.45));
    const c0x = Math.max(0, Math.floor((f.x - reach) / CHUNK_SIZE));
    const c1x = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((f.x + reach) / CHUNK_SIZE));
    const c0z = Math.max(0, Math.floor((f.z - reach) / CHUNK_SIZE));
    const c1z = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((f.z + reach) / CHUNK_SIZE));
    let nf = 0;
    let ns = 0;
    const chunks: [number, number, number][] = [];
    for (let cz = c0z; cz <= c1z; cz++)
      for (let cx = c0x; cx <= c1x; cx++) {
        const dx = (cx + 0.5) * CHUNK_SIZE - f.x;
        const dz = (cz + 0.5) * CHUNK_SIZE - f.z;
        chunks.push([cx, cz, dx * dx + dz * dz]);
      }
    // Nearest chunks first, so the cap keeps the ones in view.
    chunks.sort((a, b) => a[2] - b[2]);
    tiles.cache(
      c0x * CHUNK_SIZE - 1,
      c0z * CHUNK_SIZE - 1,
      Math.min(MAP_SIZE - 1, (c1x + 1) * CHUNK_SIZE),
      Math.min(MAP_SIZE - 1, (c1z + 1) * CHUNK_SIZE),
    );
    for (const [cx, cz] of chunks) {
      const scores = m.habitats.get(cz * CHUNKS_PER_SIDE + cx);
      for (let k = 0; k < CRITTER_KINDS.length; k++) {
        const kind = CRITTER_KINDS[k]!;
        if (!about.has(kind)) continue;
        const home = HOME[kind];
        // Before the first habitats pass (or in a fixture), a light share everywhere it suits.
        const score = scores ? Math.max(...home.habitat.map((h) => scores[h] ?? 0)) / 255 : 0.3;
        // Butterflies and songbirds pass through any green chunk now and then; the rest keep to
        // their habitat.
        const floor = kind === 'butterfly' ? 0.5 : kind === 'songbird' || kind === 'firefly' ? 0.35 : 0;
        const n = Math.round(home.perChunk * Math.min(1, floor + score * 1.6));
        const swim = kind === 'duck' || kind === 'swan';
        for (let i = 0; i < n; i++) {
          const herdOf = swim ? swimmers : flyers;
          const at = swim ? ns : nf;
          if (at >= herdOf.cap) break;
          // A seeded tile in the chunk that suits it: open water for swimmers, dry land for flyers.
          let placed = false;
          for (let tries = 0; tries < 6 && !placed; tries++) {
            const x = cx * CHUNK_SIZE + Math.floor(hash2(cx * 31 + i, cz * 17 + tries, 101 + k) * CHUNK_SIZE);
            const z = cz * CHUNK_SIZE + Math.floor(hash2(cz * 29 + tries, cx * 13 + i, 211 + k) * CHUNK_SIZE);
            const wet = m.water(x, z) > 0;
            if (swim !== wet || m.occupant(x, z)) continue;
            const y = swim ? WATER_Y : surfaceY(tiles, x + 0.5, z + 0.5);
            herdOf.anchors.set([x + 0.5, y, z + 0.5], at * 3);
            herdOf.seeds.set([k, hash2(x, z, 7 + i), 0, 0], at * 4);
            placed = true;
          }
          if (!placed) continue;
          if (swim) ns++;
          else nf++;
        }
      }
    }
    tiles.uncache();
    for (const [h, n] of [
      [flyers, nf],
      [swimmers, ns],
    ] as const) {
      h.mesh.geometry.instanceCount = n;
      h.mesh.visible = n > 0;
      (h.mesh.geometry.getAttribute('anchor') as InstancedBufferAttribute).needsUpdate = true;
      (h.mesh.geometry.getAttribute('cseed') as InstancedBufferAttribute).needsUpdate = true;
    }
  }

  return {
    id: 'critters',
    motion: 'moving',
    init(c: LayerContext) {
      ctx = c;
      env = c.env;
      if (!env) return;
      tiles = new SurfaceTiles(c.mirror);
      setCaps();
    },
    update(change) {
      if (change.seasons) habitatsRev++;
    },
    frame() {
      if (!ctx || !env) return false;
      setCaps();
      if (!flyers || !swimmers || flyers.cap + swimmers.cap === 0 || !env.motion) {
        const was = !!flyers?.mesh.visible || !!swimmers?.mesh.visible;
        if (flyers) flyers.mesh.visible = false;
        if (swimmers) swimmers.mesh.visible = false;
        return was;
      }
      // Pick again when the view moves on a few tiles, the hour or the weather turns, or the
      // habitats change; at most twice a second.
      const { hour, season } = env.shown;
      const f = env.focus;
      const k = [
        Math.round(f.x / 6),
        Math.round(f.z / 6),
        Math.floor(hour * 2),
        season,
        env.critters,
        Math.round(env.wet.value * 4),
        env.frozen.value > 0.5,
        habitatsRev,
      ].join('|');
      const now = performance.now();
      if (k !== key && now - lastPick > 500) {
        key = k;
        lastPick = now;
        pick();
      }
      return flyers.mesh.visible || swimmers.mesh.visible;
    },
    dispose() {
      for (const h of [flyers, swimmers]) {
        h?.mesh.geometry.dispose();
        h?.mesh.material.dispose();
      }
    },
  };
}
