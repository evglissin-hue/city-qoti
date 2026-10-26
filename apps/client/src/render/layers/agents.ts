// Residents on screen (docs/spec/17-presentation.md, "Residents on screen"): woodland folk walking,
// carrying, hopping and working, interpolated between the worker's agent frames. Instanced by
// species and level of detail (full figures near the camera, simple shapes further out, then
// dots), with clothes and carried bundles as their own instanced meshes and soft blob shadows.
// Walk bob, squash, lean and hops live in the instance matrices; arm swings, ears and tails in the
// resident shader. Mood and wish bubbles float above heads when turned on.
import {
  bundleGeometry,
  createResidentMaterial,
  EXTRA_KINDS,
  extraGeometry,
  residentGeometry,
  residentLook,
  SPECIES_IDS,
  type ExtraKind,
  type ResidentDetail,
} from '@qoti/art';
import { content } from '@qoti/content';
import { AGENT_STRIDE, AgentAnim, AgentFlags } from '@qoti/sim';
import {
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Euler,
  Frustum,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Material,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { hash2, levelY } from '../coords';
import { BUBBLE_ICONS, iconAtlas, IconSprites } from '../icons';
import type { LayerContext, RenderLayer } from './types';

/** Walk cycle length in tiles: one full cycle is two steps. */
const STRIDE = 0.42;
/** How far apart residents walk side by side on a path, in tiles (each keeps a lane). */
const LANE_SPREAD = 0.34;
/** Figures are drawn a touch larger than the kit's 0.3 tiles so they read from the default camera. */
const FIGURE_SCALE = 1.15;

export interface AgentsLayer extends RenderLayer {
  /** Full detail distance in tiles (quality preset); simple shapes out to 2.5x, dots beyond. */
  setDetail(distance: number): void;
  setBubbles(on: boolean): void;
  /** The resident nearest a ray, if any is close to it. */
  pick(origin: Vector3, dir: Vector3): number | null;
  /** Where a resident is drawn right now (world units), or null when not outdoors. */
  positionOf(id: number): Vector3 | null;
  /** Residents drawn last frame per level of detail (debug overlay and tests). */
  readonly drawn: { full: number; simple: number; dot: number };
}

interface Look {
  species: string;
  fur: Color;
  furLight: Color;
  cloth: Color;
  scale: [number, number, number];
  extras: { kind: ExtraKind; color: Color }[];
  seed: number;
  lane: number;
  /** Pools resolved once, so the per-frame loop builds no keys. */
  full: Pool;
  simple: Pool;
  extraPools: Pool[];
}

interface Track {
  x: number;
  z: number;
  heading: number;
  phase: number;
  seen: number;
  wx: number;
  wy: number;
  wz: number;
}

/** A growable InstancedMesh with the resident instance attributes. */
class Pool {
  mesh: InstancedMesh;
  n = 0;
  private fur!: InstancedBufferAttribute;
  private fur2!: InstancedBufferAttribute;
  private motion!: InstancedBufferAttribute;

  constructor(
    private readonly scene: Scene,
    private readonly base: BufferGeometry,
    private readonly material: Material,
    capacity = 32,
  ) {
    this.mesh = this.make(capacity);
  }

  private make(capacity: number): InstancedMesh {
    const g = this.base.clone();
    const attr = (size: number): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.fur = attr(3);
    this.fur2 = attr(3);
    this.motion = attr(4);
    g.setAttribute('iFur', this.fur);
    g.setAttribute('iFur2', this.fur2);
    g.setAttribute('iMotion', this.motion);
    const mesh = new InstancedMesh(g, this.material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceColor = attr(3);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.noCast = true;
    mesh.count = 0;
    this.scene.add(mesh);
    return mesh;
  }

  push(m: Matrix4, cloth: Color, fur: Color, fur2: Color, anim: number, phase: number, seed: number): void {
    if (this.n >= this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      const keep = { m: old.instanceMatrix.array, c: old.instanceColor!.array };
      const f = this.fur.array;
      const f2 = this.fur2.array;
      const mo = this.motion.array;
      this.mesh = this.make(old.instanceMatrix.count * 2);
      (this.mesh.instanceMatrix.array as Float32Array).set(keep.m);
      (this.mesh.instanceColor!.array as Float32Array).set(keep.c);
      (this.fur.array as Float32Array).set(f);
      (this.fur2.array as Float32Array).set(f2);
      (this.motion.array as Float32Array).set(mo);
      this.scene.remove(old);
      old.geometry.dispose();
      old.dispose();
    }
    const i = this.n++;
    m.toArray(this.mesh.instanceMatrix.array as Float32Array, i * 16);
    cloth.toArray(this.mesh.instanceColor!.array as Float32Array, i * 3);
    fur.toArray(this.fur.array as Float32Array, i * 3);
    fur2.toArray(this.fur2.array as Float32Array, i * 3);
    const mo = this.motion.array as Float32Array;
    mo[i * 4] = anim;
    mo[i * 4 + 1] = phase;
    mo[i * 4 + 2] = seed;
    mo[i * 4 + 3] = 0;
  }

  finish(): void {
    this.mesh.count = this.n;
    if (this.n === 0) return;
    const mark = (a: InstancedBufferAttribute): void => {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    };
    mark(this.mesh.instanceMatrix as InstancedBufferAttribute);
    mark(this.mesh.instanceColor!);
    mark(this.fur);
    mark(this.fur2);
    mark(this.motion);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

function shadowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#9a9a9a');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}

/** Shortest signed angle from a to b. */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const WHITE = new Color(1, 1, 1);

export function agentsLayer(): AgentsLayer {
  let ctx: LayerContext | null = null;
  const material = createResidentMaterial();
  const time = material.userData.time as { value: number };
  const pools = new Map<string, Pool>();
  let dots: Pool | null = null;
  const bundles = new Map<number, Pool>();
  let shadows: InstancedMesh | null = null;
  const shadowTex = shadowTexture();
  const shadowMaterial = new MeshBasicMaterial({
    color: 0x1e2a1a,
    transparent: true,
    opacity: 0.28,
    alphaMap: shadowTex,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const shadowGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  let shadowCount = 0;
  let bubbles: IconSprites | null = null;
  let bubblesOn = false;
  let detail = 60;
  const looks = new Map<number, Look>();
  let lookRevision = -1;
  const tracks = new Map<number, Track>();
  const prevIndex = new Map<number, number>();
  let lastLatest: Float32Array | null = null;
  let serial = 0;
  let clock = 0;
  const drawn = { full: 0, simple: 0, dot: 0 };
  /** Visible residents last frame for picking: id, x, y, z, scale. */
  let visible = new Float32Array(5 * 256);
  let visibleCount = 0;

  const m = new Matrix4();
  const local = new Matrix4();
  const q = new Quaternion();
  const e = new Euler(0, 0, 0, 'YXZ');
  const p = new Vector3();
  const s = new Vector3();
  const frustum = new Frustum();
  const sphere = new Sphere(new Vector3(), 0.45);
  const projView = new Matrix4();
  const camPos = new Vector3();
  const zero = new Color(0, 0, 0);

  function pool(key: string, make: () => BufferGeometry): Pool {
    let pl = pools.get(key);
    if (!pl && ctx) {
      pl = new Pool(ctx.scene, make(), material);
      pools.set(key, pl);
    }
    return pl!;
  }

  function bundlePool(good: number): Pool {
    let pl = bundles.get(good);
    if (!pl && ctx) {
      const id = content.goods[good]?.id ?? '';
      pl = new Pool(ctx.scene, bundleGeometry(id), material);
      bundles.set(good, pl);
    }
    return pl!;
  }

  function lookOf(id: number, flags: number): Look {
    let l = looks.get(id);
    if (l) return l;
    const r = ctx?.mirror.residents.get(id);
    const job = r?.jobId ? ctx?.mirror.buildings.get(r.jobId)?.def : undefined;
    const look = residentLook({
      species: r?.species ?? SPECIES_IDS[id % SPECIES_IDS.length]!,
      look: r?.look ?? id * 7 + 3,
      stage: r?.stage ?? (flags & AgentFlags.child ? 'child' : 'adult'),
      ...(r?.tier && { tier: r.tier }),
      ...(job && { job }),
    });
    l = {
      species: look.species,
      fur: new Color(look.fur),
      furLight: new Color(look.furLight),
      cloth: new Color(look.cloth),
      scale: look.scale,
      extras: look.extras.map((x) => ({ kind: x.kind, color: new Color(x.color) })),
      seed: hash2(id, 3, 17) * 40,
      lane: (hash2(id, 7, 29) - 0.5) * LANE_SPREAD,
      full: pool(`${look.species}:full`, () => residentGeometry(look.species, 'full')),
      simple: pool(`${look.species}:simple`, () => residentGeometry(look.species, 'simple')),
      extraPools: look.extras.map((x) => pool(`extra:${x.kind}`, () => extraGeometry(x.kind))),
    };
    looks.set(id, l);
    return l;
  }

  function ensureShadows(n: number): InstancedMesh {
    if (!ctx) throw new Error('agents layer not initialized');
    if (!shadows || shadows.instanceMatrix.count < n) {
      if (shadows) {
        ctx.scene.remove(shadows);
        shadows.dispose();
      }
      const cap = Math.max(64, 1 << Math.ceil(Math.log2(n)));
      shadows = new InstancedMesh(shadowGeometry, shadowMaterial, cap);
      shadows.instanceMatrix.setUsage(DynamicDrawUsage);
      shadows.frustumCulled = false;
      shadows.renderOrder = 1;
      shadows.userData.noCast = true;
      shadows.castShadow = false;
      shadows.receiveShadow = false;
      ctx.scene.add(shadows);
    }
    return shadows;
  }

  function pushShadow(x: number, y: number, z: number, r: number): void {
    const sh = ensureShadows(shadowCount + 1);
    m.makeScale(r, 1, r).setPosition(x, y + 0.012, z);
    m.toArray(sh.instanceMatrix.array as Float32Array, shadowCount * 16);
    shadowCount++;
  }

  function pushVisible(id: number, x: number, y: number, z: number, k: number): void {
    if ((visibleCount + 1) * 5 > visible.length) {
      const v = new Float32Array(visible.length * 2);
      v.set(visible);
      visible = v;
    }
    const o = visibleCount * 5;
    visible[o] = id;
    visible[o + 1] = x;
    visible[o + 2] = y;
    visible[o + 3] = z;
    visible[o + 4] = k;
    visibleCount++;
  }

  function draw(dt: number): boolean {
    if (!ctx) return false;
    const mirror = ctx.mirror;
    const camera = ctx.camera as PerspectiveCamera;
    clock += dt;
    time.value = clock;
    if (mirror.hamletRevision.value !== lookRevision) {
      lookRevision = mirror.hamletRevision.value;
      looks.clear();
    }
    const ag = mirror.agents;
    const L = ag.latest;
    const P = ag.prev;
    if (L !== lastLatest) {
      lastLatest = L;
      prevIndex.clear();
      for (let o = 0; o + AGENT_STRIDE <= P.length; o += AGENT_STRIDE) prevIndex.set(P[o]!, o);
    }
    serial++;
    const now = performance.now();
    const span = Math.min(1000, Math.max(30, ag.latestAt - ag.prevAt));
    const alpha = Math.min(1, Math.max(0, (now - ag.latestAt) / span));

    for (const pl of pools.values()) pl.n = 0;
    for (const pl of bundles.values()) pl.n = 0;
    shadowCount = 0;
    visibleCount = 0;
    drawn.full = drawn.simple = drawn.dot = 0;
    bubbles?.begin(clock);

    camera.updateMatrixWorld();
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    camPos.setFromMatrixPosition(camera.matrixWorld);
    const fullD2 = detail * detail;
    const simpleD2 = fullD2 * 6.25;
    const dotD2 = fullD2 * 64;
    const smooth = 1 - Math.exp(-dt * 10);

    for (let o = 0; o + AGENT_STRIDE <= L.length; o += AGENT_STRIDE) {
      const id = L[o]!;
      let x = L[o + 1]!;
      let z = L[o + 2]!;
      let y = L[o + 3]!;
      let heading = L[o + 4]!;
      const anim = L[o + 5]!;
      const carry = L[o + 6]!;
      const flags = L[o + 7]!;
      const po = prevIndex.get(id);
      let moving = false;
      if (po !== undefined) {
        const px = P[po + 1]!;
        const pz = P[po + 2]!;
        moving = Math.abs(px - x) + Math.abs(pz - z) > 0.0005;
        x = px + (x - px) * alpha;
        z = pz + (z - pz) * alpha;
        y = P[po + 3]! + (y - P[po + 3]!) * alpha;
        heading = P[po + 4]! + angleDelta(P[po + 4]!, heading) * alpha;
      }
      let t = tracks.get(id);
      if (!t) {
        t = { x, z, heading, phase: 0, seen: serial, wx: x, wy: 0, wz: z };
        tracks.set(id, t);
      }
      const fresh = t.seen < serial - 1;
      const step = fresh ? 0 : Math.sqrt((x - t.x) * (x - t.x) + (z - t.z) * (z - t.z));
      t.x = x;
      t.z = z;
      t.seen = serial;
      if (step < 0.5) t.phase += (step / STRIDE) * Math.PI * 2;
      t.heading = fresh ? heading : t.heading + angleDelta(t.heading, heading) * smooth;

      const look = lookOf(id, flags);
      const walkLike = anim === AgentAnim.walk || anim === AgentAnim.carry;
      const shown =
        walkLike && !moving ? (anim === AgentAnim.carry ? AgentAnim.carry : AgentAnim.idle) : anim;
      const h = t.heading;
      const wx = x + Math.cos(h) * look.lane;
      const wz = z - Math.sin(h) * look.lane;
      const wy = levelY(y);
      t.wx = wx;
      t.wy = wy;
      t.wz = wz;

      p.set(wx, wy + 0.15, wz);
      const d2 = p.distanceToSquared(camPos);
      if (d2 > dotD2) continue;
      sphere.center.copy(p);
      if (!frustum.intersectsSphere(sphere)) continue;
      const level: ResidentDetail = d2 < fullD2 ? 'full' : d2 < simpleD2 ? 'simple' : 'dot';

      // Body motion: bob and squash, lean, roll, hops, breathing.
      const seed = look.seed;
      let bob = 0;
      let sy: number;
      let sxz = 1;
      let lean = 0;
      let roll = 0;
      let yaw = h;
      const unhappy = (flags & (AgentFlags.unhappy | AgentFlags.slow)) !== 0;
      if (shown === AgentAnim.walk || (shown === AgentAnim.carry && moving)) {
        const k = Math.abs(Math.sin(t.phase));
        bob = k * (unhappy ? 0.01 : 0.018);
        sy = 0.97 + 0.04 * k;
        sxz = 1.015 - 0.02 * k;
        roll = Math.sin(t.phase) * 0.05;
        lean = shown === AgentAnim.carry ? -0.03 : unhappy ? 0.16 : 0.07;
      } else if (shown === AgentAnim.hop) {
        const k = Math.abs(Math.sin(clock * 5.5 + seed));
        bob = k * 0.1;
        sy = 0.9 + 0.18 * k;
        sxz = 1.05 - 0.07 * k;
      } else if (shown === AgentAnim.work) {
        const k = Math.sin(clock * 9 + seed);
        lean = 0.12 + k * 0.07;
        sy = 1 - Math.max(0, -k) * 0.03;
      } else {
        const sleepy = (flags & AgentFlags.sleepy) !== 0;
        sy = 1 + Math.sin(clock * (sleepy ? 1.2 : 2) + seed) * 0.012;
        lean = sleepy ? 0.14 : unhappy ? 0.1 : 0;
        if (shown === AgentAnim.idle) yaw += Math.sin(clock * 0.35 + seed) * 0.3;
      }
      const kx = look.scale[0] * FIGURE_SCALE;
      const ky = look.scale[1] * FIGURE_SCALE;
      const kz = look.scale[2] * FIGURE_SCALE;
      e.set(lean, yaw, roll);
      q.setFromEuler(e);
      p.set(wx, wy + bob, wz);
      s.set(kx * sxz, ky * sy, kz * sxz);
      m.compose(p, q, s);

      if (level === 'dot') {
        const grow = Math.min(2.5, Math.max(1, Math.sqrt(d2) / (detail * 2.5)));
        s.multiplyScalar(grow);
        m.compose(p, q, s);
        dots ??= pool('dot', () => residentGeometry('rabbit', 'dot'));
        dots.push(m, look.cloth, look.fur, look.furLight, 0, 0, 0);
        drawn.dot++;
        continue;
      }
      (level === 'full' ? look.full : look.simple).push(
        m,
        look.cloth,
        look.fur,
        look.furLight,
        shown,
        t.phase,
        seed,
      );
      if (level === 'full') {
        drawn.full++;
        for (let k = 0; k < look.extras.length; k++) {
          look.extraPools[k]!.push(m, look.extras[k]!.color, WHITE, WHITE, 0, 0, 0);
        }
      } else drawn.simple++;
      if (carry > 0) {
        local.makeTranslation(0, 0.1, 0.085);
        local.premultiply(m);
        bundlePool(carry - 1).push(local, zero, WHITE, WHITE, 0, 0, 0);
      }
      pushShadow(wx, wy, wz, 0.2 * kx);
      pushVisible(id, wx, wy + 0.15 * ky, wz, kx);
      if (bubbles && bubblesOn) {
        const icon =
          flags & AgentFlags.wish
            ? 0
            : flags & AgentFlags.unhappy
              ? 1
              : flags & AgentFlags.sleepy
                ? 2
                : flags & AgentFlags.happy
                  ? 3
                  : -1;
        if (icon >= 0) bubbles.push(wx, wy + 0.36 * ky + bob, wz, icon, seed);
      }
    }

    for (const pl of pools.values()) pl.finish();
    for (const pl of bundles.values()) pl.finish();
    if (shadows) {
      shadows.count = shadowCount;
      shadows.instanceMatrix.clearUpdateRanges();
      shadows.instanceMatrix.addUpdateRange(0, shadowCount * 16);
      shadows.instanceMatrix.needsUpdate = true;
    }
    bubbles?.end();
    // Forget residents that went indoors a while ago.
    if (serial % 120 === 0) for (const [id, t] of tracks) if (t.seen < serial - 600) tracks.delete(id);
    return L.length > 0 || visibleCount > 0;
  }

  return {
    id: 'agents',
    drawn,
    init(c) {
      ctx = c;
      bubbles = new IconSprites(c.scene, iconAtlas(BUBBLE_ICONS), BUBBLE_ICONS.length, 0.32);
      // Warm the pools so the first resident does not stall a frame on shader compiles.
      for (const sp of SPECIES_IDS) pool(`${sp}:full`, () => residentGeometry(sp, 'full'));
      for (const kind of EXTRA_KINDS) pool(`extra:${kind}`, () => extraGeometry(kind));
    },
    update(change) {
      if (change.residents || change.buildings) lookRevision = -1;
    },
    frame(dt) {
      return draw(dt);
    },
    setDetail(distance) {
      detail = distance;
      ctx?.invalidate();
    },
    setBubbles(on) {
      bubblesOn = on;
      ctx?.invalidate();
    },
    pick(origin, dir) {
      let best: number | null = null;
      let bestT = Infinity;
      for (let i = 0; i < visibleCount; i++) {
        const o = i * 5;
        const vx = visible[o + 1]! - origin.x;
        const vy = visible[o + 2]! - origin.y;
        const vz = visible[o + 3]! - origin.z;
        const tt = vx * dir.x + vy * dir.y + vz * dir.z;
        if (tt <= 0) continue;
        const dx = vx - dir.x * tt;
        const dy = vy - dir.y * tt;
        const dz = vz - dir.z * tt;
        const r = 0.2 * visible[o + 4]!;
        if (dx * dx + dy * dy + dz * dz < r * r && tt < bestT) {
          bestT = tt;
          best = visible[o]!;
        }
      }
      return best;
    },
    positionOf(id) {
      const t = tracks.get(id);
      return t && t.seen >= serial - 1 ? new Vector3(t.wx, t.wy, t.wz) : null;
    },
    dispose() {
      for (const pl of pools.values()) pl.dispose();
      for (const pl of bundles.values()) pl.dispose();
      pools.clear();
      bundles.clear();
      if (shadows) {
        ctx?.scene.remove(shadows);
        shadows.dispose();
      }
      bubbles?.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
      shadowTex.dispose();
      material.dispose();
    },
  };
}
