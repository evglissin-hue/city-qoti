// Residents on screen (docs/spec/17-presentation.md, "Residents on screen"): woodland folk walking,
// carrying, hopping and working, interpolated between the worker's agent frames. Instanced by
// species and level of detail (full figures near the camera, simple shapes further out, then
// dots), with clothes and carried bundles as their own instanced meshes and soft blob shadows.
// Walk bob, squash, lean and hops live in the instance matrices; arm swings, ears and tails in the
// resident shader. Mood and wish bubbles float above heads when turned on. C4P: between walks, folk
// sit on benches near where they stand, turn to a neighbor for a chat, and wave to the ones they
// know as they pass; all of it derived here from the frames, so the sim never hears of it.
import {
  bindResidentMaterial,
  bundleGeometry,
  createResidentMaterial,
  EXTRA_KINDS,
  extraGeometry,
  MOTION,
  residentGeometry,
  residentLook,
  SPECIES_IDS,
  type ExtraKind,
  type ResidentDetail,
  wolfGeometry,
} from '@qoti/art';
import { content } from '@qoti/content';
import {
  AGENT_STRIDE,
  AgentAnim,
  AgentFlags,
  DECOR_ROTATIONS,
  ResidentFlags,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from '@qoti/sim';
import {
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Euler,
  Frustum,
  InstancedBufferAttribute,
  IcosahedronGeometry,
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
import { fpToWorld, hash2, levelY } from '../coords';
import { kitLamp } from '../lightMap';
import { kitUniforms } from '../material';
import { groundY } from '../surface';
import { BUBBLE_ICONS, iconAtlas, IconSprites } from '../icons';
import { AgentPlayback } from '../agentPlayback';
import { pushEase, SeparationField } from '../separation';
import type { CartsLayer } from './carts';
import type { LayerContext, RenderLayer } from './types';

/**
 * Walk cycle length in tiles: one full cycle is two steps. Short, quick steps suit small woodland
 * folk and keep the cadence in step with how far the body travels, so nobody glides.
 */
const STRIDE = 0.36;
/**
 * Walkers who share a path take one of three lanes around the sim's keep-left line, by id (tiles),
 * so a household leaving together does not stack up.
 */
const LANES = [-0.18, 0, 0.18];
/** Walkers also hang back by up to this many tiles by id, easing in over the first tile they walk. */
const STAGGER_MAX = 0.3;
/** Seconds for the stagger to ease out once a walker stops. */
const STAGGER_OUT = 0.35;
/** Figures are drawn larger than the kit's 0.3 tiles so they read from the default camera (C3X: 1.4). */
const FIGURE_SCALE = 1.4;
/** C4E: children younger than this many days are babies: carried in a sling when a parent is near. */
const BABY_DAYS = 24;
/** C4E: partners closer than this walk side by side, hand in hand. */
const COUPLE_NEAR = 0.9;
const COUPLE_GAP = 0.105;
const SLING_COLORS = [0xf3ead8, 0x8fa37a, 0xd48a86, 0x7fa7c4].map((h) => new Color(h));
/** C4P: idle folk this close (tiles) turn to each other and chat. */
const CHAT_NEAR = 0.75;
/** C4P: folk who know each other wave when they pass this close, at most once a while. */
const WAVE_NEAR = 1.4;
const WAVE_SECONDS = 1.3;
const WAVE_AGAIN = 45;
/** C4P: an idle resident this close to a free bench seat (tiles) sits on it. */
const SEAT_NEAR = 1.1;
/** C4P: the bench kit's seat height, and its two places along the seat (bench space, back to +z). */
const SEAT_TOP = 0.12;
const SEAT_PLACES: readonly [number, number][] = [
  [-0.085, -0.012],
  [0.085, -0.012],
];
/** C4P: how far below the figure's origin its seat is when sitting (figure units). */
const SIT_DROP = 0.03;

interface Seat {
  x: number;
  z: number;
  /** Seat top (world units). */
  y: number;
  heading: number;
}

function ease(u: number): number {
  return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
}

export interface AgentsLayer extends RenderLayer {
  /** Full detail distance in tiles (quality preset); simple shapes out to 2.5x, dots beyond. */
  setDetail(distance: number): void;
  setBubbles(on: boolean): void;
  /** The resident nearest a ray, if any is close to it. */
  pick(origin: Vector3, dir: Vector3): number | null;
  /** Lets walkers step aside for carts: the carts layer whose tracks they keep out of. */
  setCarts(carts: CartsLayer | null): void;
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
  /** C4P: their household, so family wave to each other. */
  household: number;
  lane: number;
  /** How far this walker hangs back along the path (tiles). */
  stagger: number;
  /** C4E: their partner (couples walk together), whether they are a baby, and a sling color. */
  partner: number;
  baby: boolean;
  sling: Color;
  /** Pools resolved once, so the per-frame loop builds no keys. */
  full: Pool;
  simple: Pool;
  extraPools: Pool[];
  /** C5E: the outfit variant this look was dressed for (`dressKey`). */
  dress: number;
}

/** C5E: raiders' cloaks: muted plum, moss, slate and russet, storybook rather than sinister. */
const RAIDER_CLOAKS = [0x6b4a63, 0x56633f, 0x4d5866, 0x7a4a3a];
/** C5E: knitted winter wool, warm and cheerful. */
const WINTER_WOOL = [0xc0523e, 0xd9a441, 0x3f6e8c, 0x7a9a5a, 0xd88a8a, 0xf2ead8];

interface Track {
  x: number;
  z: number;
  heading: number;
  phase: number;
  seen: number;
  wx: number;
  wy: number;
  wz: number;
  /** C4P: idle last frame (for chats), waving until this clock, facing for chats, sitting blend and seat. */
  idle: boolean;
  wave: number;
  face: number;
  sit: number;
  seat: number;
  /** Where this figure stood before pushes (or where it is fixed), and whether it is a fixed obstacle. */
  bx: number;
  bz: number;
  fixed: boolean;
  /** False for a baby in a sling, which neither pushes nor is pushed. */
  solid: boolean;
  /** The smoothed separation push (tiles) and how far into its stagger a walker is (0 to 1). */
  sx: number;
  sz: number;
  stag: number;
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

  push(
    m: Matrix4,
    cloth: Color,
    fur: Color,
    fur2: Color,
    anim: number,
    phase: number,
    seed: number,
    hold = 0,
  ): void {
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
    mo[i * 4 + 3] = hold;
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
  /** C5E: snow lies (folk wrap up), set each frame from the world env. */
  let winter = false;
  const material = createResidentMaterial();
  const time = material.userData.time as { value: number };
  const pools = new Map<string, Pool>();
  let dots: Pool | null = null;
  const bundles = new Map<number, Pool>();
  let shadows: InstancedMesh | null = null;
  let shadowTex: CanvasTexture | null = null;
  const shadowMaterial = new MeshBasicMaterial({
    color: 0x1e2a1a,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const shadowGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  let shadowCount = 0;
  // C5E part 2: breath in the cold, a little puff in front of each near face now and then.
  const BREATH_MAX = 256;
  const breathGeometry = new IcosahedronGeometry(0.03, 1);
  const breathMaterial = new MeshBasicMaterial({
    color: 0xf4f6f8,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  let breath: InstancedMesh | null = null;
  let breathCount = 0;
  const breathLocal = new Matrix4();
  const breathAt = new Vector3();
  const breathQ = new Quaternion();
  const breathS = new Vector3();
  let bubbles: IconSprites | null = null;
  let bubblesOn = false;
  let detail = 60;
  const looks = new Map<number, Look>();
  let lookRevision = -1;
  /** C4E: babies and the grown-ups of their household who might carry them, by look revision. */
  let babies: { id: number; adults: number[] }[] = [];
  let babyDay = -1;
  const slingers = new Set<number>();
  const hiddenBabies = new Set<number>();
  const tracks = new Map<number, Track>();
  const sep = new SeparationField();
  let carts: CartsLayer | null = null;
  /** C4P: bench seats (rebuilt when decor changes), who sits where, the last frame's neighbors. */
  let seats: Seat[] = [];
  let seatsDirty = true;
  const seatOwner = new Map<number, number>();
  const grid = new Map<number, number[]>();
  const waved = new Map<string, number>();
  const playback = new AgentPlayback();
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

  /** C5E: the outfit's variant (the Watch on duty, winter wraps), so a change dresses them again. */
  function dressKey(flags: number): number {
    return (flags & (AgentFlags.watch | AgentFlags.raider | AgentFlags.cold)) | (winter ? 1 << 20 : 0);
  }

  /**
   * C5E: dress for the season and the night's work. Raiders (any species) wear storybook cloaks and
   * hoods in muted plum, moss or slate, a loot sack over the shoulder; the Watch carries a lantern
   * and a staff; in winter (or when their home is cold) folk wrap up in a knitted hat and a scarf.
   */
  function dress(id: number, flags: number, extras: { kind: ExtraKind; color: number }[]): void {
    if (flags & AgentFlags.raider) {
      const cloakColor = RAIDER_CLOAKS[Math.floor(hash2(id, 19, 3) * RAIDER_CLOAKS.length)]!;
      extras.length = 0;
      extras.push(
        { kind: 'cloak', color: cloakColor },
        { kind: 'hood', color: cloakColor },
        { kind: 'sack', color: 0xb89c6c },
      );
      return;
    }
    if (flags & AgentFlags.watch) {
      extras.push({ kind: 'lantern', color: 0x3b3229 }, { kind: 'staff', color: 0x8a5a3a });
      if (!extras.some((e) => e.kind.startsWith('hat:'))) extras.push({ kind: 'hat:felt', color: 0x4f6a3e });
    }
    if (winter || flags & AgentFlags.cold) {
      const warm = WINTER_WOOL[Math.floor(hash2(id, 23, 9) * WINTER_WOOL.length)]!;
      if (!extras.some((e) => e.kind.startsWith('hat:'))) extras.push({ kind: 'hat:knit', color: warm });
      if (!extras.some((e) => e.kind === 'scarf' || e.kind === 'longscarf' || e.kind === 'kerchief'))
        extras.push({ kind: 'scarf', color: warm });
    }
  }

  function lookOf(id: number, flags: number): Look {
    let l = looks.get(id);
    if (l && l.dress === dressKey(flags)) return l;
    const r = ctx?.mirror.residents.get(id);
    const job = r?.jobId ? ctx?.mirror.buildings.get(r.jobId)?.def : undefined;
    const look = residentLook({
      species: r?.species ?? SPECIES_IDS[id % SPECIES_IDS.length]!,
      look: r?.look ?? id * 7 + 3,
      stage: r?.stage ?? (flags & AgentFlags.child ? 'child' : 'adult'),
      ...(r?.tier && { tier: r.tier }),
      ...(job && { job }),
      ...((r?.flags ?? 0) & ResidentFlags.story ? { story: true } : {}),
    });
    dress(id, flags, look.extras);
    // Raiders read by their cloaks from afar too (the simple figure and the dot take the vest color).
    if (flags & AgentFlags.raider) look.cloth = look.extras[0]!.color;
    l = {
      species: look.species,
      fur: new Color(look.fur),
      furLight: new Color(look.furLight),
      cloth: new Color(look.cloth),
      scale: look.scale,
      extras: look.extras.map((x) => ({ kind: x.kind, color: new Color(x.color) })),
      seed: hash2(id, 3, 17) * 40,
      household: r?.householdId ?? 0,
      lane: LANES[Math.min(LANES.length - 1, Math.floor(hash2(id, 7, 29) * LANES.length))]!,
      stagger: hash2(id, 11, 3) * STAGGER_MAX,
      partner: r?.partner ?? 0,
      baby: babies.some((b) => b.id === id),
      sling: SLING_COLORS[Math.floor(hash2(id, 13, 5) * SLING_COLORS.length)]!,
      full: pool(`${look.species}:full`, () => residentGeometry(look.species, 'full')),
      simple: pool(`${look.species}:simple`, () => residentGeometry(look.species, 'simple')),
      extraPools: [],
      dress: dressKey(flags),
    };
    l.extraPools = l.extras.map((x) => pool(`extra:${x.kind}`, () => extraGeometry(x.kind)));
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

  /** C5E: one breath puff for a figure (its matrix `fm`), on its own slow beat. */
  function pushBreath(fm: Matrix4, seed: number, ky: number): void {
    if (!ctx || breathCount >= BREATH_MAX) return;
    const life = (clock / 2.8 + seed * 0.37) % 1;
    if (life > 0.5) return;
    const u = life / 0.5;
    if (!breath) {
      breath = new InstancedMesh(breathGeometry, breathMaterial, BREATH_MAX);
      breath.instanceMatrix.setUsage(DynamicDrawUsage);
      breath.frustumCulled = false;
      breath.castShadow = false;
      breath.userData.noCast = true;
      breath.renderOrder = 3;
      ctx.scene.add(breath);
    }
    // In figure space: from the mouth, drifting forward and up, swelling, then gone.
    breathLocal.makeTranslation(0, 0.25 + u * 0.05, 0.08 + u * 0.08);
    breathLocal.premultiply(fm);
    breathAt.setFromMatrixPosition(breathLocal);
    const k = Math.sin(u * Math.PI) * (0.7 + u * 0.9) * ky;
    breathLocal.compose(breathAt, breathQ.identity(), breathS.setScalar(Math.max(0.001, k)));
    breathLocal.toArray(breath.instanceMatrix.array as Float32Array, breathCount * 16);
    breathCount++;
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

  /** Babies (children younger than BABY_DAYS) and the grown-ups of their household. */
  function findBabies(today: number): void {
    babies = [];
    if (!ctx) return;
    const m = ctx.mirror;
    for (const r of m.residents.values()) {
      if (r.stage !== 'child' || r.bornDay === undefined || today - r.bornDay >= BABY_DAYS) continue;
      const h = m.households.get(r.householdId);
      const adults = (h?.members ?? [])
        .filter((id) => {
          const a = m.residents.get(id);
          return !!a && (a.stage === 'adult' || a.stage === 'young');
        })
        .sort((a, b) => a - b);
      babies.push({ id: r.id, adults });
    }
  }

  /**
   * Who carries a baby this frame: a grown-up of its household near it when the baby is out, or the
   * first one out when it is not (it is with them, snug in the sling).
   */
  function carryBabies(): void {
    slingers.clear();
    hiddenBabies.clear();
    for (const b of babies) {
      const bt = tracks.get(b.id);
      const out = !!bt && bt.seen >= serial - 1;
      let best = 0;
      let bd = Infinity;
      for (const a of b.adults) {
        const at = tracks.get(a);
        if (!at || at.seen < serial - 1) continue;
        if (!out) {
          best = a;
          break;
        }
        const d = (at.x - bt.x) ** 2 + (at.z - bt.z) ** 2;
        if (d < 0.64 && d < bd) {
          bd = d;
          best = a;
        }
      }
      if (best) {
        slingers.add(best);
        if (out) hiddenBabies.add(b.id);
      }
    }
  }

  /** C4P: two seats on every bench, facing out from its back. */
  function buildSeats(): void {
    seats = [];
    seatOwner.clear();
    seatsDirty = false;
    for (const t of tracks.values()) {
      t.seat = -1;
      t.sit = 0;
    }
    if (!ctx) return;
    for (const d of ctx.mirror.decor.values()) {
      if (d.def !== 'bench') continue;
      const x = fpToWorld(d.fx);
      const z = fpToWorld(d.fz);
      const a = (-d.rot * 2 * Math.PI) / DECOR_ROTATIONS;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const y = groundY(ctx.mirror, x, z) + SEAT_TOP;
      for (const [lx, lz] of SEAT_PLACES) {
        seats.push({ x: x + lx * c + lz * sn, z: z - lx * sn + lz * c, y, heading: Math.atan2(-sn, -c) });
      }
    }
  }

  /** The nearest free seat within reach of (x, z), claimed for `id`, or -1. */
  function claimSeat(x: number, z: number, id: number): number {
    let best = -1;
    let bd = SEAT_NEAR * SEAT_NEAR;
    for (let i = 0; i < seats.length; i++) {
      if (seatOwner.has(i)) continue;
      const st = seats[i]!;
      const d = (st.x - x) * (st.x - x) + (st.z - z) * (st.z - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) seatOwner.set(best, id);
    return best;
  }

  /** Last frame's residents by tile, for chats and waves. */
  function buildGrid(): void {
    for (const list of grid.values()) list.length = 0;
    sep.begin();
    if (carts) {
      const cs = carts.serial;
      for (const c of carts.tracks.values()) if (c.seen >= cs - 1) sep.addCart(c.x, c.z, c.heading);
    }
    for (const [id, t] of tracks) {
      if (t.seen < serial - 1) continue;
      if (t.solid) sep.add(id, t.bx, t.bz, t.fixed);
      const key = Math.floor(t.x) * 4096 + Math.floor(t.z);
      let list = grid.get(key);
      if (!list) grid.set(key, (list = []));
      list.push(id);
    }
    sep.build();
  }

  /** Calls `visit` with each resident seen last frame within `r` tiles of (x, z), in no order; true stops. */
  function eachNear(
    x: number,
    z: number,
    r: number,
    visit: (id: number, t: Track, d2: number) => boolean,
  ): void {
    const r2 = r * r;
    for (let gx = Math.floor(x - r); gx <= Math.floor(x + r); gx++) {
      for (let gz = Math.floor(z - r); gz <= Math.floor(z + r); gz++) {
        for (const id of grid.get(gx * 4096 + gz) ?? []) {
          const t = tracks.get(id)!;
          const d2 = (t.x - x) * (t.x - x) + (t.z - z) * (t.z - z);
          if (d2 < r2 && visit(id, t, d2)) return;
        }
      }
    }
  }

  /** Family, partners and (by a stable hash) about a third of the neighbors know each other. */
  function knows(a: number, b: number, household: number): boolean {
    const other = looks.get(b)?.household ?? ctx?.mirror.residents.get(b)?.householdId ?? -1;
    if (household && other === household) return true;
    if (looks.get(a)?.partner === b) return true;
    return hash2(Math.min(a, b), Math.max(a, b), 41) < 0.33;
  }

  function draw(dt: number): boolean {
    winter = (ctx?.env?.snow.value ?? 0) > 0.4;
    if (!ctx) return false;
    const mirror = ctx.mirror;
    const camera = ctx.camera as PerspectiveCamera;
    clock += dt;
    time.value = clock;
    const today = Math.floor((mirror.tick.value + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
    if (mirror.hamletRevision.value !== lookRevision || today !== babyDay) {
      lookRevision = mirror.hamletRevision.value;
      babyDay = today;
      looks.clear();
      findBabies(today);
    }
    const ag = mirror.agents;
    if (ag.latest !== lastLatest) {
      lastLatest = ag.latest;
      playback.push(ag.t, ag.latest);
    }
    playback.advance(dt);
    serial++;
    if (seatsDirty) buildSeats();
    buildGrid();
    const sample = playback.sample();
    // Residents are drawn from the newer frame around the playback time, moved back toward the older.
    const L = sample?.b.data ?? ag.latest;
    const P = sample?.a.data ?? ag.latest;
    const prevIndex = sample?.a.index;
    const alpha = sample?.alpha ?? 0;

    for (const pl of pools.values()) pl.n = 0;
    for (const pl of bundles.values()) pl.n = 0;
    shadowCount = 0;
    breathCount = 0;
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
    const pushK = pushEase(dt);

    carryBabies();

    for (let o = 0; o + AGENT_STRIDE <= L.length; o += AGENT_STRIDE) {
      // C4E: carts ride in the same frames; the carts layer draws them.
      if (L[o + 5] === AgentAnim.cart) continue;
      const id = L[o]!;
      let x = L[o + 1]!;
      let z = L[o + 2]!;
      let y = L[o + 3]!;
      let heading = L[o + 4]!;
      // C5E: raiders and the Watch run (a quicker walk), the festival dances (a hop and a turn).
      const rawAnim = L[o + 5]!;
      const anim =
        rawAnim === AgentAnim.run ? AgentAnim.walk : rawAnim === AgentAnim.dance ? AgentAnim.hop : rawAnim;
      const running = rawAnim === AgentAnim.run;
      const dancing = rawAnim === AgentAnim.dance;
      const carry = L[o + 6]!;
      const flags = L[o + 7]!;
      const po = prevIndex?.get(id);
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
        t = {
          x,
          z,
          heading,
          phase: 0,
          seen: serial,
          wx: x,
          wy: 0,
          wz: z,
          idle: false,
          wave: 0,
          face: heading,
          sit: 0,
          seat: -1,
          bx: x,
          bz: z,
          fixed: false,
          solid: true,
          sx: 0,
          sz: 0,
          stag: 0,
        };
        tracks.set(id, t);
      }
      const fresh = t.seen < serial - 1;
      const step = fresh ? 0 : Math.sqrt((x - t.x) * (x - t.x) + (z - t.z) * (z - t.z));
      t.x = x;
      t.z = z;
      t.seen = serial;
      if (step < 0.5) t.phase += (step / STRIDE) * Math.PI * 2;
      if (moving) t.stag = Math.min(1, t.stag + (fresh ? 0 : step));
      else t.stag = Math.max(0, t.stag - dt / STAGGER_OUT);
      t.bx = x;
      t.bz = z;
      t.solid = true;
      t.heading = fresh ? heading : t.heading + angleDelta(t.heading, heading) * smooth;

      // C5E: wolves at the forest's edge are wolves, never a resident species.
      if (flags & AgentFlags.wolf) {
        const wy = ctx ? groundY(ctx.mirror, x, z) : levelY(y);
        p.set(x, wy + 0.15, z);
        const d2 = p.distanceToSquared(camPos);
        if (d2 > simpleD2) continue;
        sphere.center.copy(p);
        if (!frustum.intersectsSphere(sphere)) continue;
        const trot = moving ? Math.abs(Math.sin(t.phase * 1.6)) : 0;
        e.set(moving ? -0.04 + trot * 0.05 : 0, t.heading, 0);
        q.setFromEuler(e);
        p.set(x, wy + trot * 0.025, z);
        s.set(1.1, 1.1, 1.1);
        m.compose(p, q, s);
        pool(`wolf:${id % 3}`, () => wolfGeometry(id % 3)).push(m, zero, WHITE, WHITE, 0, 0, 0);
        pushShadow(x, wy, z, 0.3);
        continue;
      }
      // A baby in a parent's sling is drawn there, not on its own.
      if (hiddenBabies.has(id)) {
        t.solid = false;
        continue;
      }
      const look = lookOf(id, flags);
      const walkLike = anim === AgentAnim.walk || anim === AgentAnim.carry;
      const shown =
        walkLike && !moving ? (anim === AgentAnim.carry ? AgentAnim.carry : AgentAnim.idle) : anim;
      let h = t.heading;
      // A lane by id and a little hang back, eased in over the first tile walked, then pushed
      // clear of whoever is close (separation.ts); couples, sitters and chats are placed below.
      const back = look.stagger * ease(t.stag);
      const baseX = x + Math.cos(h) * look.lane - Math.sin(h) * back;
      const baseZ = z - Math.sin(h) * look.lane - Math.cos(h) * back;
      sep.pushFor(id, baseX, baseZ, h, moving, t.fixed);
      t.bx = baseX;
      t.bz = baseZ;
      t.sx += (sep.px - t.sx) * pushK;
      t.sz += (sep.pz - t.sz) * pushK;
      let wx = baseX + t.sx;
      let wz = baseZ + t.sz;
      // C4E: partners near each other walk side by side, facing the same way, hand in hand.
      let hold = 0;
      const partner = look.partner;
      const pt = partner ? tracks.get(partner) : undefined;
      if (partner && pt && pt.seen >= serial - 1) {
        const dx = pt.x - x;
        const dz = pt.z - z;
        if (dx * dx + dz * dz < COUPLE_NEAR * COUPLE_NEAR && Math.abs(angleDelta(h, pt.heading)) < 1.2) {
          const side = id < partner ? 1 : -1;
          h = h + angleDelta(h, pt.heading) * 0.5;
          const mx = (x + pt.x) / 2;
          const mz = (z + pt.z) / 2;
          wx = mx + Math.cos(h) * side * COUPLE_GAP;
          wz = mz - Math.sin(h) * side * COUPLE_GAP;
          // The hand toward the partner: the figure's -x arm when the partner is on that side.
          if (walkLike || shown === AgentAnim.idle) hold = side > 0 ? 2 : 1;
        }
      }
      // C4P: benches, chats and waves.
      const sleepy = (flags & AgentFlags.sleepy) !== 0;
      const idle = shown === AgentAnim.idle;
      let motion: number = shown;
      let face: number | null = null;
      let nod = false;
      if (t.seat >= 0 && seatOwner.get(t.seat) !== id) {
        t.seat = -1;
        t.sit = 0;
      }
      if (idle && !look.baby && !sleepy && hold === 0) {
        if (t.seat < 0 && (serial + id) % 6 === 0) t.seat = claimSeat(x, z, id);
      }
      const sitting = t.seat >= 0 && idle;
      t.sit = Math.min(1, Math.max(0, t.sit + (sitting ? dt * 2.5 : -dt * 6)));
      if (t.seat >= 0 && t.sit <= 0 && !sitting) {
        seatOwner.delete(t.seat);
        t.seat = -1;
      }
      const seat = t.seat >= 0 ? seats[t.seat] : undefined;
      const sb = seat ? ease(t.sit) : 0;
      if (seat && sb > 0) {
        wx += (seat.x - wx) * sb;
        wz += (seat.z - wz) * sb;
        h += angleDelta(h, seat.heading) * sb;
        if (sb > 0.5) motion = MOTION.sit;
      } else if (idle && hold === 0 && !sleepy) {
        // A chat with the nearest idle neighbor: they face each other and take turns.
        let other = 0;
        let ot: Track | null = null;
        let od = Infinity;
        eachNear(x, z, CHAT_NEAR, (oid, o, d2) => {
          if (oid !== id && o.idle && o.sit <= 0 && d2 < od) {
            od = d2;
            other = oid;
            ot = o;
          }
          return false;
        });
        if (ot) {
          const o = ot as Track;
          face = Math.atan2(o.x - x, o.z - z);
          const pair = hash2(Math.min(id, other), Math.max(id, other), 23);
          const slot = Math.floor((clock + pair * 9) / 2.4);
          if (slot % 5 !== 4) {
            if ((slot % 2 === 0) === id < other) motion = MOTION.talk;
            else nod = true;
          }
        }
      }
      // A wave to someone they know, once in a while, walking or standing.
      const canWave = (shown === AgentAnim.walk || idle) && hold === 0 && motion !== MOTION.sit;
      if (canWave && t.wave <= clock && (serial + id) % 8 === 0) {
        eachNear(x, z, WAVE_NEAR, (oid, o, d2) => {
          if (oid === id || d2 < 0.36 || !knows(id, oid, look.household)) return false;
          const key = id < oid ? `${id}:${oid}` : `${oid}:${id}`;
          if ((waved.get(key) ?? 0) > clock) return false;
          waved.set(key, clock + WAVE_AGAIN);
          t.wave = clock + WAVE_SECONDS;
          o.wave = clock + WAVE_SECONDS + 0.2;
          return true;
        });
      }
      if (canWave && t.wave > clock) motion = moving && !idle ? MOTION.wave : MOTION.waveStill;
      t.idle = idle && t.sit <= 0;
      if (face !== null) {
        t.face += angleDelta(t.face, face) * smooth * 0.5;
        h = t.face;
      } else t.face = h;

      // Stand on the drawn ground (smooth slopes, C3D-1), not the tile's level.
      const wy = ctx ? groundY(ctx.mirror, wx, wz) : levelY(y);
      t.wx = wx;
      t.wy = wy;
      t.wz = wz;
      // Couples and sitters are fixed obstacles for next frame's pushes, where they are drawn.
      t.fixed = hold > 0 || sb > 0;
      if (t.fixed) {
        t.bx = wx;
        t.bz = wz;
      }

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
      const skating = (flags & AgentFlags.skating) !== 0;
      if (skating) {
        // C5E: skaters glide: no steps, a lean into each long stroke, swaying side to side.
        const stroke = Math.sin(clock * 1.7 + seed);
        sy = 1;
        lean = 0.16;
        roll = stroke * 0.16;
        yaw += stroke * 0.22;
        motion = AgentAnim.idle;
      } else if (shown === AgentAnim.walk || (shown === AgentAnim.carry && moving)) {
        // Up as the feet pass under the body, down with a little squash as a foot lands (feet are
        // furthest apart at sin(phase) = +-1, see the rig in @qoti/art materials).
        const k = Math.abs(Math.cos(t.phase));
        bob = k * k * (unhappy ? 0.022 : shown === AgentAnim.carry ? 0.03 : 0.045);
        sy = 0.95 + 0.07 * k;
        sxz = 1.03 - 0.035 * k;
        roll = Math.sin(t.phase) * 0.06;
        lean = shown === AgentAnim.carry ? -0.03 : unhappy ? 0.16 : 0.1;
        if (running) {
          bob *= 1.3;
          lean = 0.22;
        }
      } else if (shown === AgentAnim.hop) {
        const k = Math.abs(Math.sin(clock * 5.5 + seed));
        bob = k * (dancing ? 0.06 : 0.1);
        sy = 0.9 + 0.18 * k;
        sxz = 1.05 - 0.07 * k;
        // C5E: the dance turns about as it bounces, partners in step by their seed.
        if (dancing) yaw += clock * 1.8 + seed;
      } else if (shown === AgentAnim.work) {
        const k = Math.sin(clock * 9 + seed);
        lean = 0.12 + k * 0.07;
        sy = 1 - Math.max(0, -k) * 0.03;
      } else {
        sy = 1 + Math.sin(clock * (sleepy ? 1.2 : 2) + seed) * 0.012;
        lean = sleepy ? 0.14 : unhappy ? 0.1 : 0;
        if (motion === MOTION.talk) lean += Math.sin(clock * 2.2 + seed) * 0.03;
        else if (nod) lean += Math.max(0, Math.sin(clock * 3.3 + seed)) * 0.07;
        // A look around and a shift of weight now and then, unless facing someone or sitting.
        if (idle && face === null && sb === 0) {
          yaw += Math.sin(clock * 0.35 + seed) * 0.3;
          roll = Math.sin(clock * 0.55 + seed * 1.7) * 0.025;
        }
        if (sb > 0) lean += (-0.06 - lean) * sb;
      }
      const tiny = look.baby ? 0.62 : 1;
      const kx = look.scale[0] * FIGURE_SCALE * tiny;
      const ky = look.scale[1] * FIGURE_SCALE * tiny;
      const kz = look.scale[2] * FIGURE_SCALE * tiny;
      e.set(lean, yaw, roll);
      q.setFromEuler(e);
      // C4P: seated, the body rests on the bench instead of standing on the ground.
      const seatLift = seat && sb > 0 ? (seat.y - SIT_DROP * ky - wy) * sb : 0;
      p.set(wx, wy + bob + seatLift, wz);
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
        motion,
        t.phase,
        seed,
        hold,
      );
      if (level === 'full') {
        drawn.full++;
        for (let k = 0; k < look.extras.length; k++) {
          look.extraPools[k]!.push(m, look.extras[k]!.color, WHITE, WHITE, 0, 0, 0);
        }
        if (slingers.has(id))
          pool('extra:sling', () => extraGeometry('sling')).push(m, look.sling, WHITE, WHITE, 0, 0, 0);
      } else drawn.simple++;
      if (carry > 0) {
        local.makeTranslation(0, 0.1, 0.085);
        local.premultiply(m);
        bundlePool(carry - 1).push(local, zero, WHITE, WHITE, 0, 0, 0);
      }
      pushShadow(wx, wy, wz, 0.2 * kx);
      if (level === 'full' && (winter || flags & AgentFlags.cold) && !look.baby) pushBreath(m, seed, ky);
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
    if (breath) {
      breath.count = breathCount;
      breath.instanceMatrix.needsUpdate = true;
    }
    if (shadows) {
      shadows.count = shadowCount;
      shadows.instanceMatrix.clearUpdateRanges();
      shadows.instanceMatrix.addUpdateRange(0, shadowCount * 16);
      shadows.instanceMatrix.needsUpdate = true;
    }
    bubbles?.end();
    // Forget residents that went indoors a while ago.
    if (serial % 120 === 0) {
      for (const [id, t] of tracks) {
        if (t.seen >= serial - 600) continue;
        if (t.seat >= 0 && seatOwner.get(t.seat) === id) seatOwner.delete(t.seat);
        tracks.delete(id);
      }
      // A seat whose sitter went indoors is free again.
      for (const [i, owner] of seatOwner)
        if ((tracks.get(owner)?.seen ?? 0) < serial - 30) seatOwner.delete(i);
      for (const [key, until] of waved) if (until < clock) waved.delete(key);
    }
    return L.length > 0 || visibleCount > 0;
  }

  return {
    id: 'agents',
    motion: 'moving',
    drawn,
    init(c) {
      ctx = c;
      if (c.env) bindResidentMaterial(material, kitUniforms(c.env), kitLamp(c.env));
      // Canvas textures need the DOM, so they are made here rather than in the factory.
      shadowTex = shadowTexture();
      shadowMaterial.alphaMap = shadowTex;
      bubbles = new IconSprites(c.scene, iconAtlas(BUBBLE_ICONS), BUBBLE_ICONS.length, 0.32);
      // Warm the pools so the first resident does not stall a frame on shader compiles.
      for (const sp of SPECIES_IDS) pool(`${sp}:full`, () => residentGeometry(sp, 'full'));
      for (const kind of EXTRA_KINDS) pool(`extra:${kind}`, () => extraGeometry(kind));
    },
    update(change) {
      if (change.residents || change.buildings) lookRevision = -1;
      if (change.decor || change.full) seatsDirty = true;
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
        // Only residents open an inspector (circus visitors are passing through).
        if (!ctx?.mirror.residents.has(visible[o]!)) continue;
        if (dx * dx + dy * dy + dz * dz < r * r && tt < bestT) {
          bestT = tt;
          best = visible[o]!;
        }
      }
      return best;
    },
    setCarts(c) {
      carts = c;
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
      if (breath) {
        ctx?.scene.remove(breath);
        breath.dispose();
      }
      breathGeometry.dispose();
      breathMaterial.dispose();
      shadowTex?.dispose();
      material.dispose();
    },
  };
}
