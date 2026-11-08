import { CHUNK_SIZE, CHUNKS_PER_SIDE } from '@qoti/sim';
import {
  Frustum,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Material,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { NOISE_GLSL, type WorldEnv } from './env';

/**
 * C3D-1: instanced scatter with per-chunk culling and level of detail, for trees and small nature
 * props. Each chunk keeps its instances (matrix and tint); when the camera moves enough, visible
 * chunks are copied into one InstancedMesh per kind and detail level. Near instances use the high
 * mesh, far ones the low mesh; props with a cutoff shrink away over a short band instead of
 * popping out.
 */

export interface ScatterKind {
  id: string;
  high: BufferGeometry;
  low?: BufferGeometry;
  /** Camera distance (world units) beyond which the low mesh is used. */
  lodDistance?: number;
  /** Camera distance beyond which instances are hidden; they shrink away over the last 15%. */
  maxDistance?: number;
  /** Casts shadows (trees, bushes, rocks); grass and flowers do not. */
  shadows: boolean;
}

/** Instances of one chunk: per kind, matrices (16 floats each) and tints (3 floats each). */
export interface ScatterChunk {
  matrices: number[][];
  colors: number[][];
  /**
   * V1C: per kind, 1 for an instance that keeps its low level at any distance when the field's
   * `forestLow` is on (forest trees beyond the town, on Low and Medium). Absent means none.
   */
  farOnly?: number[][];
  /** V1C: each instance's level at the last fill (0 none yet, 1 high, 2 low), for hysteresis. */
  levels?: Uint8Array[];
  /** Height range of the chunk's instances, for culling. */
  minY: number;
  maxY: number;
}

export function emptyScatterChunk(kinds: number): ScatterChunk {
  return {
    matrices: Array.from({ length: kinds }, () => []),
    colors: Array.from({ length: kinds }, () => []),
    minY: Infinity,
    maxY: -Infinity,
  };
}

const m4 = new Matrix4();
const q = new Quaternion();
const tiltA = new Quaternion();
const tiltB = new Quaternion();
const v = new Vector3();
const s = new Vector3();

/** Appends an instance to a chunk: position, yaw, uniform scale, lean (radians about x and z), tint. */
export function addInstance(
  chunk: ScatterChunk,
  kind: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
  leanX: number,
  leanZ: number,
  r: number,
  g: number,
  b: number,
  height = 1.6,
  farOnly = false,
): void {
  // Lean is a small tilt: rotate about x then z, then turn about the vertical.
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  q.set(0, sy, 0, cy);
  tiltA.setFromAxisAngle(v.set(1, 0, 0), leanX);
  tiltB.setFromAxisAngle(v.set(0, 0, 1), leanZ);
  tiltA.multiply(tiltB).multiply(q);
  m4.compose(v.set(x, y, z), tiltA, s.set(scale, scale, scale));
  const list = chunk.matrices[kind]!;
  for (let i = 0; i < 16; i++) list.push(m4.elements[i]!);
  chunk.colors[kind]!.push(r, g, b);
  if (farOnly || chunk.farOnly) {
    chunk.farOnly ??= chunk.matrices.map((m) =>
      new Array<number>(m.length / 16 - (m === list ? 1 : 0)).fill(0),
    );
    chunk.farOnly[kind]!.push(farOnly ? 1 : 0);
  }
  chunk.minY = Math.min(chunk.minY, y);
  chunk.maxY = Math.max(chunk.maxY, y + height * scale);
}

interface LevelMesh {
  mesh: InstancedMesh | null;
  count: number;
}

export class ScatterField {
  private readonly chunks: (ScatterChunk | null)[] = new Array<ScatterChunk | null>(
    CHUNKS_PER_SIDE * CHUNKS_PER_SIDE,
  ).fill(null);
  private readonly levels: { high: LevelMesh; low: LevelMesh }[];
  private dirty = true;
  private readonly lastPos = new Vector3(Infinity, 0, 0);
  private readonly lastDir = new Vector3();
  private readonly frustum = new Frustum();
  private readonly sphere = new Sphere();
  private readonly viewProj = new Matrix4();
  private readonly dir = new Vector3();
  private lod = 1;
  /** V1C: instances marked farOnly keep their low level at any distance (Low and Medium). */
  private forest = false;
  /** Chunks drawn at the last fill: a rebuild elsewhere waits for the camera instead of a frame. */
  private readonly shown = new Set<number>();
  /** V1C: share of the swap distance either side of it within which an instance keeps its level. */
  static readonly HYSTERESIS = 0.1;
  /**
   * V1C: farOnly instances (forest beyond the town) swap at this share of the swap distance when
   * `forestLow` is on, so a forest is low from any usual camera but full when you stand in it.
   */
  static readonly FOREST_SHARE = 0.4;
  /** Instances drawn at the last fill, by kind id (for stats and tests). */
  readonly drawn = new Map<string, { high: number; low: number }>();

  constructor(
    private readonly scene: Scene,
    private readonly material: Material,
    readonly kinds: readonly ScatterKind[],
    private readonly env: WorldEnv,
  ) {
    this.levels = kinds.map(() => ({ high: { mesh: null, count: 0 }, low: { mesh: null, count: 0 } }));
  }

  /** Scales level of detail and cutoff distances (quality presets). */
  set lodScale(k: number) {
    if (k === this.lod) return;
    this.lod = k;
    this.dirty = true;
  }

  private readonly kindIds = new Map<string, number>();

  kindIndex(id: string): number {
    if (this.kindIds.size === 0) this.kinds.forEach((k, i) => this.kindIds.set(k.id, i));
    return this.kindIds.get(id) ?? -1;
  }

  set forestLow(on: boolean) {
    if (on === this.forest) return;
    this.forest = on;
    this.dirty = true;
  }

  /**
   * Sets a chunk's instances. Only a chunk in view at the last fill asks for a refill (and so a
   * frame, and a new still for V1D's cache); one off screen shows when the camera next moves.
   */
  setChunk(index: number, chunk: ScatterChunk | null): void {
    const old = this.chunks[index];
    this.chunks[index] = chunk;
    if (this.shown.has(index) || this.shown.size === 0 || (!old && chunk && this.nearView(index)))
      this.dirty = true;
  }

  /** A chunk the last fill did not draw, but whose sphere is in the current frustum. */
  private nearView(index: number): boolean {
    const c = this.chunks[index];
    if (!c || c.maxY < c.minY) return false;
    this.sphere.center.set(
      (index % CHUNKS_PER_SIDE) * CHUNK_SIZE + CHUNK_SIZE / 2,
      (c.minY + c.maxY) / 2,
      Math.floor(index / CHUNKS_PER_SIDE) * CHUNK_SIZE + CHUNK_SIZE / 2,
    );
    this.sphere.radius = Math.hypot(CHUNK_SIZE * 0.71, (c.maxY - c.minY) / 2) + 4;
    return this.frustum.intersectsSphere(this.sphere);
  }

  /** Forces a refill on the next update (quality changed, say). */
  invalidate(): void {
    this.dirty = true;
  }

  /** Refills the instanced meshes when the camera moved enough or chunks changed. True if refilled. */
  update(camera: PerspectiveCamera): boolean {
    camera.getWorldDirection(this.dir);
    const focusDist = camera.position.distanceTo(this.env.focus);
    const moved = camera.position.distanceTo(this.lastPos);
    const turned = this.dir.angleTo(this.lastDir);
    if (!this.dirty && moved < 0.4 + focusDist * 0.02 && turned < 0.02) return false;
    this.dirty = false;
    this.lastPos.copy(camera.position);
    this.lastDir.copy(this.dir);
    this.fill(camera, 3 + focusDist * 0.06);
    return true;
  }

  private ensure(level: LevelMesh, geometry: BufferGeometry, need: number, shadows: boolean): InstancedMesh {
    let mesh = level.mesh;
    if (!mesh || mesh.instanceMatrix.count < need) {
      const capacity = Math.max(64, 1 << Math.ceil(Math.log2(Math.max(1, need))));
      if (mesh) {
        this.scene.remove(mesh);
        mesh.dispose();
      }
      mesh = new InstancedMesh(geometry, this.material, capacity);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.userData.qotiShadows = shadows;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      level.mesh = mesh;
    }
    return mesh;
  }

  private fill(camera: PerspectiveCamera, margin: number): void {
    camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj);
    const cam = camera.position;
    const visible: ScatterChunk[] = [];
    const dists: number[] = [];
    this.shown.clear();
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (!c || c.maxY < c.minY) continue;
      const cx = (i % CHUNKS_PER_SIDE) * CHUNK_SIZE + CHUNK_SIZE / 2;
      const cz = Math.floor(i / CHUNKS_PER_SIDE) * CHUNK_SIZE + CHUNK_SIZE / 2;
      const cy = (c.minY + c.maxY) / 2;
      const halfY = (c.maxY - c.minY) / 2;
      this.sphere.center.set(cx, cy, cz);
      this.sphere.radius = Math.hypot(CHUNK_SIZE * 0.71, halfY) + margin;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      this.shown.add(i);
      visible.push(c);
      dists.push(cam.distanceTo(this.sphere.center) - this.sphere.radius + margin);
    }
    for (let k = 0; k < this.kinds.length; k++) {
      const kind = this.kinds[k]!;
      const max = (kind.maxDistance ?? Infinity) * this.lod;
      const fadeFrom = max * 0.85;
      const lod = kind.low ? (kind.lodDistance ?? Infinity) * this.lod : Infinity;
      // Count first, so meshes are sized once.
      let need = 0;
      for (let c = 0; c < visible.length; c++)
        if (dists[c]! < max) need += visible[c]!.matrices[k]!.length / 16;
      const lv = this.levels[k]!;
      if (need === 0) {
        if (lv.high.mesh) lv.high.mesh.count = 0;
        if (lv.low.mesh) lv.low.mesh.count = 0;
        this.drawn.set(kind.id, { high: 0, low: 0 });
        continue;
      }
      const high = this.ensure(lv.high, kind.high, need, kind.shadows);
      const low = kind.low ? this.ensure(lv.low, kind.low, need, kind.shadows) : null;
      const hm = high.instanceMatrix.array as Float32Array;
      const hc = high.instanceColor!.array as Float32Array;
      const lm = low ? (low.instanceMatrix.array as Float32Array) : null;
      const lc = low ? (low.instanceColor!.array as Float32Array) : null;
      let nh = 0;
      let nl = 0;
      for (let c = 0; c < visible.length; c++) {
        if (dists[c]! >= max) continue;
        const chunk = visible[c]!;
        const mats = chunk.matrices[k]!;
        const cols = chunk.colors[k]!;
        const n = mats.length / 16;
        const far = this.forest ? chunk.farOnly?.[k] : undefined;
        let lv: Uint8Array | undefined;
        if (lm !== null) {
          chunk.levels ??= chunk.matrices.map((m) => new Uint8Array(m.length / 16));
          lv = chunk.levels[k];
        }
        const band = lod * ScatterField.HYSTERESIS;
        for (let i = 0; i < n; i++) {
          const o = i * 16;
          const dx = mats[o + 12]! - cam.x;
          const dy = mats[o + 13]! - cam.y;
          const dz = mats[o + 14]! - cam.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d >= max) continue;
          // Keep the level within the band either side of the swap distance, so trees near it do
          // not flicker between levels as the camera breathes in and out.
          let useLow = false;
          if (lm !== null && lv) {
            const prev = lv[i]!;
            const at = far?.[i] ? lod * ScatterField.FOREST_SHARE : lod;
            const b = far?.[i] ? band * ScatterField.FOREST_SHARE : band;
            useLow = prev === 2 ? d > at - b : prev === 1 ? d > at + b : d > at;
            lv[i] = useLow ? 2 : 1;
          }
          const outM = useLow ? lm! : hm;
          const outC = useLow ? lc! : hc;
          const at = useLow ? nl++ : nh++;
          const shrink = d > fadeFrom ? 1 - (d - fadeFrom) / (max - fadeFrom) : 1;
          const mo = at * 16;
          for (let e = 0; e < 16; e++) outM[mo + e] = mats[o + e]!;
          if (shrink < 1) {
            for (const e of [0, 1, 2, 4, 5, 6, 8, 9, 10]) outM[mo + e]! *= shrink;
          }
          outC[at * 3] = cols[i * 3]!;
          outC[at * 3 + 1] = cols[i * 3 + 1]!;
          outC[at * 3 + 2] = cols[i * 3 + 2]!;
        }
      }
      high.count = nh;
      high.instanceMatrix.needsUpdate = true;
      high.instanceColor!.needsUpdate = true;
      high.visible = nh > 0;
      if (low) {
        low.count = nl;
        low.instanceMatrix.needsUpdate = true;
        low.instanceColor!.needsUpdate = true;
        low.visible = nl > 0;
      }
      this.drawn.set(kind.id, { high: nh, low: nl });
    }
  }

  dispose(): void {
    for (const lv of this.levels) {
      for (const m of [lv.high.mesh, lv.low.mesh]) {
        if (!m) continue;
        this.scene.remove(m);
        m.dispose();
      }
    }
  }
}

/**
 * The foliage material: the kit's matte vertex-colored look with a gentle wind sway that grows
 * with height, so canopies, grass and reeds breathe a little. Instance tints come in through the
 * standard instance color.
 *
 * C5E: the seasons on trees and plants, from the world env. Leaf faces (`surface` 13) take the
 * season's tint; deciduous crowns (`tkind` 0, set by the trees layer; pines are 1) turn gold, rust
 * and red through autumn, thin to lacy bare twigs in winter (a slimmer crown in twig colors, with
 * gaps you can see the boughs through) and carry blossom in early spring. Snow lies on every
 * upward face, deepest on the pines' tiers. The storm bends crowns a little further. All of it is
 * static between steps (the sway runs on `env.staticTime`), so the still-frame cache holds.
 *
 * P1: grass faces (`surface` 10: tufts, reeds, ferns, flower stems) sway by their own height along
 * the blade (a weight growing towards the tip, whatever the tuft's height in the world), in gusts
 * that travel across the field from the world position, stronger in a storm. They take the season's
 * tint, go to straw and gold in autumn, dull in winter, and carry snow on their upper blades.
 */
export function createFoliageMaterial(env: WorldEnv): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: env.staticTime,
      uSnow: env.snow,
      uSeasonTint: env.seasonTint,
      uAutumn: env.autumn,
      uBare: env.bare,
      uBlossom: env.blossom,
      uStorm: env.storm,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform float uTime;',
          'uniform float uBare;',
          'uniform float uStorm;',
          'attribute float surface;',
          'attribute float tkind;',
          'varying float vQLeaf;',
          'varying float vQPine;',
          'varying vec3 vQWorld;',
          'varying vec3 vQUp;',
          'varying float vQSeed;',
          'varying float vQGrass;',
          'varying float vQBlade;',
        ].join('\n'),
      )
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '#ifdef USE_INSTANCING',
          'vec3 qBase = instanceMatrix[3].xyz;',
          'mat4 qModel = modelMatrix * instanceMatrix;',
          '#else',
          'vec3 qBase = vec3(0.0);',
          'mat4 qModel = modelMatrix;',
          '#endif',
          'vQLeaf = step(abs(surface - 13.0), 0.5);',
          // P1: grass (surface 10) sways by its own height along the blade, not the world's.
          'float qGrass = step(abs(surface - 10.0), 0.5);',
          'float qBlade = clamp(transformed.y / 0.34, 0.0, 1.0);',
          'vQGrass = qGrass;',
          'vQBlade = qBlade * qGrass;',
          'vQPine = tkind;',
          'vQSeed = fract(sin(dot(qBase.xz, vec2(12.9898, 78.233))) * 43758.5453);',
          // Bare branches: a deciduous crown draws in toward its trunk.
          'float qThin = vQLeaf * (1.0 - tkind) * uBare;',
          'transformed.xz *= 1.0 - 0.18 * qThin;',
          'float qPhase = qBase.x * 0.37 + qBase.z * 0.61;',
          'float qSway = max(transformed.y - 0.25, 0.0) * (1.0 - qGrass);',
          'float qWind = 1.0 + uStorm * 1.6;',
          'transformed.x += sin(uTime * (1.3 + uStorm) + qPhase) * qSway * qSway * 0.035 * qWind;',
          'transformed.z += cos(uTime * (1.05 + uStorm) + qPhase * 1.3) * qSway * qSway * 0.025 * qWind;',
          // Gusts travel across the field (the phase comes from the world position), patchy and
          // stronger in a storm, with a small steady rustle under them.
          'if (qGrass > 0.5) {',
          '  float qw = qBlade * qBlade;',
          '  float qGust = 0.5 + 0.5 * sin(dot(qBase.xz, vec2(0.17, 0.13)) - uTime * 1.6);',
          '  float qPatch = 0.5 + 0.5 * sin(dot(qBase.xz, vec2(-0.045, 0.06)) + uTime * 0.31);',
          '  float qA = (0.22 * sin(uTime * 1.7 + qPhase) + 0.78 * qGust * (0.35 + 0.65 * qPatch)) * qw * 0.075 * qWind;',
          '  float qB = 0.02 * cos(uTime * 2.3 + qPhase * 1.7) * qw * qWind;',
          '  vec3 qD = (vec4(0.8 * qA - 0.6 * qB, 0.0, 0.6 * qA + 0.8 * qB, 0.0) * qModel).xyz;',
          '  transformed += qD / max(dot(qModel[0].xyz, qModel[0].xyz), 0.0001);',
          '}',
          'vQWorld = (qModel * vec4(transformed, 1.0)).xyz;',
          'vQUp = normalize(mat3(qModel) * objectNormal);',
        ].join('\n'),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform float uSnow;',
          'uniform vec3 uSeasonTint;',
          'uniform float uAutumn;',
          'uniform float uBare;',
          'uniform float uBlossom;',
          'varying float vQLeaf;',
          'varying float vQPine;',
          'varying vec3 vQWorld;',
          'varying vec3 vQUp;',
          'varying float vQSeed;',
          'varying float vQGrass;',
          'varying float vQBlade;',
          NOISE_GLSL,
        ].join('\n'),
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          '{',
          '  vec3 c = diffuseColor.rgb;',
          '  float decid = vQLeaf * (1.0 - vQPine);',
          '  float far = clamp(length(fwidth(vQWorld.xz)) * 4.0, 0.0, 1.0);',
          '  if (vQLeaf > 0.5) {',
          '    c *= uSeasonTint;',
          '    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));',
          '    if (decid > 0.5 && uAutumn > 0.001) {',
          // Each tree its own autumn: gold, amber, rust or red, with a little green left low down.
          '      vec3 gold = vec3(0.78, 0.5, 0.08);',
          '      vec3 amber = vec3(0.8, 0.33, 0.06);',
          '      vec3 rust = vec3(0.6, 0.18, 0.05);',
          '      vec3 red = vec3(0.62, 0.11, 0.07);',
          '      float s = vQSeed;',
          '      vec3 au = s < 0.35 ? gold : s < 0.65 ? amber : s < 0.85 ? rust : red;',
          '      au = mix(au, gold, qNoise(vQWorld.xz * 2.5 + s * 10.0) * 0.4);',
          '      float k = uAutumn * (0.75 + 0.25 * qNoise(vQWorld.xz * 1.7));',
          '      c = mix(c, au * (0.55 + lum * 2.4), k);',
          '    }',
          '    if (decid > 0.5 && uBlossom > 0.001) {',
          // Blossom: soft pink and white speckles over the fresh green, in clusters.
          '      vec2 bp = vQWorld.xz * 7.0 + vQWorld.y * 3.0;',
          '      float cl = qNoise(bp) * 0.7 + qNoise(bp * 2.3) * 0.3;',
          '      vec3 petal = vQSeed < 0.5 ? vec3(0.98, 0.72, 0.78) : vec3(0.97, 0.93, 0.92);',
          '      float on = smoothstep(0.62 - uBlossom * 0.25, 0.7 - uBlossom * 0.2, cl);',
          '      c = mix(c, petal * 0.85, mix(on, uBlossom * 0.35, far) * uBlossom);',
          '    }',
          '    if (decid > 0.5 && uBare > 0.001) {',
          // Bare: warm grey-brown twigs, mottled, with holes through to the boughs.
          '      float tw = qNoise(vQWorld.xz * 6.0 + vQWorld.y * 4.0);',
          '      vec3 twig = mix(vec3(0.13, 0.08, 0.05), vec3(0.3, 0.2, 0.13), tw);',
          '      c = mix(c, twig, uBare);',
          '      float hole = qNoise(vQWorld.xz * 3.6 + vQWorld.y * 5.0 + vQSeed * 7.0);',
          '      if (hole < (uBare - 0.3) * 0.85 * (1.0 - far)) discard;',
          '    }',
          '  }',
          // P1: grass takes the season's tint, goes to straw and gold in autumn (the tips first) and
          // dull and flat in winter.
          '  if (vQGrass > 0.5) {',
          '    c *= uSeasonTint;',
          '    float glum = dot(c, vec3(0.2126, 0.7152, 0.0722));',
          '    float gn = qNoise(vQWorld.xz * 1.3 + 4.0);',
          '    vec3 straw = mix(vec3(0.74, 0.58, 0.24), vec3(0.64, 0.4, 0.13), gn);',
          '    float ak = uAutumn * (0.55 + 0.45 * vQBlade) * (0.75 + 0.25 * gn);',
          '    c = mix(c, straw * (0.5 + glum * 1.5), clamp(ak, 0.0, 0.9));',
          '    float dull = clamp(uSnow * 0.55 + uBare * 0.3, 0.0, 0.7);',
          '    c = mix(c, vec3(0.52, 0.47, 0.34) * (0.75 + glum * 1.6), dull);',
          '  }',
          // Snow on upward faces: the pines hold it in thick tiers, bare twigs a dusting. Blades
          // take it by their own height, on the upper part, since they stand nearly upright.
          '  if (uSnow > 0.001) {',
          '    float up = mix(smoothstep(0.3, 0.85, vQUp.y), mix(0.45, 1.0, smoothstep(0.1, 0.6, vQBlade)), vQGrass);',
          '    float hold = mix(0.85, 0.8, vQPine) * (1.0 - decid * uBare * 0.7);',
          '    float n = qNoise(vQWorld.xz * 5.0 + vQWorld.y * 2.0);',
          '    float cover = up * hold * smoothstep(0.2, 0.6, uSnow * 1.2 + n * 0.4 - 0.2);',
          '    c = mix(c, vec3(0.86, 0.89, 0.94), clamp(cover, 0.0, 0.95));',
          '  }',
          '  diffuseColor.rgb = c;',
          '}',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => 'qoti-foliage-p1';
  return m;
}
