// V3B: street furniture by district. Streets that have grown (a lane, street or avenue with a lot or
// a building fronting it) get lamps, benches, planters and bollards at a density by district style.
// Client-side decoration only: it derives from the shared Mirror (roads, lots, buildings, decor), so
// both players see the same, and it touches no sim state. `streetFurniture` is the pure placement;
// `streetLayer` draws the pieces in one batched draw and lights the lamps through the light map.
import { artKitId, kitById } from '@qoti/art';
import { content } from '@qoti/content';
import { entranceTiles, facing, Flags, footprintSize, MAP_SIZE, Road, TILE_FP, type Rot4 } from '@qoti/sim';
import { Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { KeyedBatch } from '../batch';
import { drawDef } from '../defs';
import { type LightDisc } from '../lightMap';
import { lampColor } from '../lighting';
import { levelFor, type Level } from '../lod';
import type { Mirror } from '../../state/mirror';
import { groundY } from '../surface';
import { SHOP_KITS } from './lights';
import type { LayerContext, RenderLayer } from './types';

/** One piece of street furniture: world tiles, `rot` 0 to 63 as decor (see `decorMatrix`). */
export interface StreetPiece {
  /** A key of `STREET_KITS`. */
  kit: string;
  x: number;
  z: number;
  rot: number;
  seed: number;
  /** True for a lit lamp (it writes a light disc). */
  lamp: boolean;
}

/** The art kit and params behind each piece key. */
export const STREET_KITS: Readonly<Record<string, { kit: string; params?: Record<string, boolean> }>> = {
  bench: { kit: 'bench' },
  bollard: { kit: 'bollard' },
  'bollard-stone': { kit: 'bollard', params: { stone: true } },
  lantern: { kit: 'lantern' },
  planter: { kit: 'planter' },
  'street-lamp': { kit: 'street-lamp' },
};

/** How far a lamp throws, and how bright (a little more than a decor lantern: it is on a tall post). */
export const STREET_LAMP_SHAPE: readonly [radius: number, intensity: number] = [2.0, 1.15];
/** The light map source the lamps write under. */
export const STREET_LIGHT_SOURCE = 'street';

/** Where on the road tile a piece stands: this far inside the tile from the fronting edge. */
export const CURB = 0.12;
/** A lamp or a lantern in the decor stays this far (tiles) from a street lamp; other decor, this far. */
export const LAMP_CLEARANCE = 1.2;
export const DECOR_CLEARANCE = 0.5;

/** Direction from a road tile to the tile fronting it, by side; also the facing of a front entrance. */
const DIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];
/** The decor rotation (0 to 63) that turns a piece's local +z (its back) to each side. */
const SIDE_ROT: readonly number[] = [0, 16, 32, 48];

interface Style {
  /** Lamp kit, and a lamp every this many tiles along a street (a lane takes twice as many). */
  lamp: string;
  every: number;
  /** Whether a lone village street (no style) gets lamps on lanes too: no, see `STREETS_ONLY`. */
  /** Cumulative chances per fronted tile side (fillers), in order. */
  fillers: readonly (readonly [kit: string, chance: number])[];
  /** Bollards in pairs flanking a shop door's front tile. */
  doorBollards: boolean;
  /** Lamps only on streets and avenues. */
  streetsOnly: boolean;
}

/** Density by district style (tuned by eye on the grown village). */
export const STYLES: Readonly<Record<string, Style>> = {
  brick: {
    lamp: 'street-lamp',
    every: 4,
    fillers: [
      ['planter', 0.09],
      ['bench', 0.035],
    ],
    doorBollards: true,
    streetsOnly: false,
  },
  plaster: {
    lamp: 'street-lamp',
    every: 6,
    fillers: [
      ['planter', 0.14],
      ['bench', 0.09],
    ],
    doorBollards: false,
    streetsOnly: false,
  },
  stone: {
    lamp: 'street-lamp',
    every: 6,
    fillers: [
      ['bollard-stone', 0.1],
      ['planter', 0.03],
    ],
    doorBollards: false,
    streetsOnly: false,
  },
  timber: {
    lamp: 'lantern',
    every: 5,
    fillers: [['bench', 0.09]],
    doorBollards: false,
    streetsOnly: false,
  },
  village: {
    lamp: 'street-lamp',
    every: 7,
    fillers: [],
    doorBollards: false,
    streetsOnly: true,
  },
};

/** Extra benches on an avenue, which stand in facing pairs. */
const AVENUE_BENCH = 0.07;

interface Face {
  style: string;
  /** The road tile is the one in front of this building's entrance. */
  door: boolean;
  /** ...and the building is a shop. */
  shop: boolean;
}

/** A small integer hash of a tile and a side, 0 to 1. */
function hash01(x: number, z: number, side: number, salt = 0): number {
  let h =
    Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(z + 7, 0x165667b1) ^ Math.imul(side + 3 + salt * 5, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The pieces of street furniture for the town as the Mirror shows it. Pure, sorted by z, x, kit. */
export function streetFurniture(mirror: Mirror): StreetPiece[] {
  const S = MAP_SIZE;
  const road = (x: number, z: number): number => (x < 0 || z < 0 || x >= S || z >= S ? 0 : mirror.road(x, z));
  const flags = (mirror.layers as { flags?: ArrayLike<number> } | undefined)?.flags;

  // 1. Which road tiles are fronted, on which side, by what (a lot, or a building's front row).
  const faces = new Map<number, Face>();
  const addFace = (
    rx: number,
    rz: number,
    side: number,
    style: string,
    door: boolean,
    shop: boolean,
  ): void => {
    if (road(rx, rz) < Road.lane) return;
    const key = (rz * S + rx) * 4 + side;
    const cur = faces.get(key);
    if (cur) {
      if (!cur.style) cur.style = style;
      cur.door ||= door;
      cur.shop ||= shop;
    } else faces.set(key, { style, door, shop });
  };
  for (const lot of mirror.lots.values()) {
    const [fx, fz] = facing(lot.rot as Rot4);
    const side = (lot.rot + 2) % 4;
    const inLot = (x: number, z: number): boolean =>
      x >= lot.x && x < lot.x + lot.w && z >= lot.z && z < lot.z + lot.d;
    for (let z = lot.z; z < lot.z + lot.d; z++)
      for (let x = lot.x; x < lot.x + lot.w; x++)
        if (!inLot(x + fx, z + fz)) addFace(x + fx, z + fz, side, lot.style ?? '', false, false);
  }
  for (const b of mirror.buildings.values()) {
    if (b.stage !== 'built') continue;
    const def = drawDef(b.def);
    if (!def) continue;
    const rot = b.rot as Rot4;
    const [fx, fz] = facing(rot);
    const side = (rot + 2) % 4;
    const [w, d] = footprintSize(def, rot);
    const trade = b.trade ? content.tradeById.get(b.trade) : undefined;
    const kit = trade ? artKitId(trade.look) : artKitId(def.art);
    const shop = SHOP_KITS.includes(kit);
    const front = entranceTiles(def, b.x, b.z, rot).front;
    for (let z = b.z; z < b.z + d; z++)
      for (let x = b.x; x < b.x + w; x++) {
        if (mirror.occupant(x + fx, z + fz) === b.id) continue;
        const door = front[0] === x + fx && front[1] === z + fz;
        addFace(x + fx, z + fz, side, b.style ?? '', door, door && shop);
      }
  }

  // 2. Candidate road tiles in a stable order, with straight-run positions.
  const tiles = new Set<number>();
  for (const key of faces.keys()) tiles.add(key >> 2);
  const order = [...tiles].sort((a, b) => a - b);
  const straight = (x: number, z: number): 0 | 1 | 2 => {
    // 1: runs along x; 2: runs along z; 0: a junction, a corner, a lone tile or no road.
    if (road(x, z) < Road.path) return 0;
    const h = road(x - 1, z) > 0 || road(x + 1, z) > 0;
    const v = road(x, z - 1) > 0 || road(x, z + 1) > 0;
    return h === v ? 0 : h ? 1 : 2;
  };
  const dist = (mx: number, mz: number, x: number, z: number): number => Math.hypot(mx - x, mz - z);

  /** Decor (lights count more) too near a spot. */
  const blocked = (x: number, z: number): boolean => {
    for (const d of mirror.decorNear(x * TILE_FP, z * TILE_FP, LAMP_CLEARANCE * TILE_FP)) {
      const dd = dist(d.fx / TILE_FP, d.fz / TILE_FP, x, z);
      const tags = content.decorById.get(d.def)?.tags;
      if (dd < DECOR_CLEARANCE) return true;
      if (dd < LAMP_CLEARANCE && (tags?.includes('light') || tags?.includes('lantern'))) return true;
    }
    return false;
  };

  /** Tiles from the first straight tile of the run (memoized: a run is walked once). */
  const pos = new Map<number, number>();
  const runPos = (x: number, z: number, ax: number, az: number, axis: number): number => {
    const chain: number[] = [];
    let cx = x;
    let cz = z;
    let base = -1;
    for (;;) {
      const key = cz * S + cx;
      const known = pos.get(key);
      if (known !== undefined) {
        base = known;
        break;
      }
      chain.push(key);
      cx -= ax;
      cz -= az;
      if (straight(cx, cz) !== axis) break;
    }
    for (let i = chain.length - 1; i >= 0; i--) pos.set(chain[i]!, ++base);
    return pos.get(z * S + x)!;
  };

  const out: StreetPiece[] = [];
  const placed = new Set<number>();
  const lampLike = (kit: string): boolean => kit === 'street-lamp' || kit === 'lantern';
  const put = (kit: string, x: number, z: number, side: number, seed: number): boolean => {
    if (blocked(x, z)) return false;
    out.push({ kit, x, z, rot: SIDE_ROT[side]!, seed, lamp: lampLike(kit) });
    return true;
  };

  for (const idx of order) {
    const tx = idx % S;
    const tz = (idx - tx) / S;
    const axis = straight(tx, tz);
    const cls = road(tx, tz);
    if (!axis || cls < Road.lane) continue;
    if (flags && (flags[idx]! & Flags.stairs) !== 0) continue;
    if (mirror.water(tx, tz) > 0) continue;
    // Position along the run (from the first straight tile).
    const ax = axis === 1 ? 1 : 0;
    const az = axis === 1 ? 0 : 1;
    const k = runPos(tx, tz, ax, az, axis);
    const sides = axis === 1 ? [0, 2] : [1, 3];
    const fronted = sides.filter((s) => faces.has(idx * 4 + s));
    if (!fronted.length) continue;
    const laneScale = cls === Road.lane ? 2 : 1;

    // Lamps: a stable count along the run, alternating sides.
    let lampSide = -1;
    for (const s of fronted) {
      const f = faces.get(idx * 4 + s)!;
      const st = STYLES[f.style] ?? STYLES.village!;
      if (f.door || (st.streetsOnly && cls < Road.street)) continue;
      const every = st.every * laneScale;
      const off = every >> 1;
      if (k < off || (k - off) % every !== 0) continue;
      const j = (k - off) / every;
      const want = sides[j % 2]!;
      if (s !== want && fronted.includes(want)) continue;
      lampSide = s;
      const x = tx + 0.5 + DIRS[s]![0] * (0.5 - CURB);
      const z = tz + 0.5 + DIRS[s]![1] * (0.5 - CURB);
      put(st.lamp, x, z, s, Math.floor(hash01(tx, tz, s) * 65535));
      placed.add(idx * 4 + s);
      break;
    }

    // Fillers and door bollards, per fronted side.
    for (const s of fronted) {
      const f = faces.get(idx * 4 + s)!;
      const st = STYLES[f.style] ?? STYLES.village!;
      const key = idx * 4 + s;
      const cx = tx + 0.5 + DIRS[s]![0] * (0.5 - CURB);
      const cz = tz + 0.5 + DIRS[s]![1] * (0.5 - CURB);
      if (f.door) {
        if (f.shop && st.doorBollards)
          for (const e of [-0.3, 0.3]) put('bollard', cx + e * ax, cz + e * az, s, 0);
        continue;
      }
      if (placed.has(key) || lampSide === s) continue;
      // No two fillers on neighboring tiles of one side, and none right beside a lamp.
      if (placed.has(((tz - az) * S + (tx - ax)) * 4 + s)) continue;
      let u = hash01(tx, tz, s, 1);
      let chance = 0;
      let kit = '';
      for (const [fk, c] of st.fillers) {
        chance += c / laneScale;
        if (u < chance) {
          kit = fk;
          break;
        }
      }
      if (!kit && cls === Road.avenue) {
        u = hash01(tx, tz, s, 2);
        if (u < AVENUE_BENCH) kit = 'bench';
      }
      if (!kit) continue;
      const jitter = (hash01(tx, tz, s, 3) - 0.5) * 0.2;
      const seed = Math.floor(hash01(tx, tz, s, 4) * 65535);
      if (put(kit, cx + jitter * ax, cz + jitter * az, s, seed)) placed.add(key);
      // Avenue benches stand in facing pairs.
      if (kit === 'bench' && cls === Road.avenue) {
        const o = (s + 2) % 4;
        const okey = idx * 4 + o;
        if (fronted.includes(o) && !placed.has(okey) && lampSide !== o) {
          const px = tx + 0.5 + DIRS[o]![0] * (0.5 - CURB) + jitter * ax;
          const pz = tz + 0.5 + DIRS[o]![1] * (0.5 - CURB) + jitter * az;
          if (put('bench', px, pz, o, seed ^ 1)) placed.add(okey);
        }
      }
    }
  }
  return out.sort((a, b) => a.z - b.z || a.x - b.x || (a.kit < b.kit ? -1 : a.kit > b.kit ? 1 : 0));
}

/** The light discs of the lamps, in piece order. */
export function streetDiscs(pieces: readonly StreetPiece[]): LightDisc[] {
  const color = lampColor();
  const [radius, intensity] = STREET_LAMP_SHAPE;
  const out: LightDisc[] = [];
  for (const p of pieces) if (p.lamp) out.push({ x: p.x, z: p.z, radius, color, intensity });
  return out;
}

const up = new Vector3(0, 1, 0);
const q = new Quaternion();
const pos = new Vector3();
const scl = new Vector3(1, 1, 1);

/** Street furniture: one batched draw for every piece, near or far level by distance, lamps lit. */
/** How often, at most, placements are recomputed after the town changed (seconds). */
const RECHECK = 0.5;

export function streetLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let batch: KeyedBatch | null = null;
  let pieces: StreetPiece[] = [];
  const levels: Level[] = [];
  const matrices: Matrix4[] = [];
  let dirty = true;
  let levelsDirty = true;
  let wrote = false;
  let lastDetail = -1;
  const lastCam = new Vector3(Infinity, 0, 0);
  // Buildings change many times a second in a growing town (a resident moves in, a counter ticks):
  // placements are recomputed at most every `RECHECK` seconds, in frame(), when something changed.
  let pending = false;
  let since = RECHECK;

  const geometry = (key: string, level: Level): BufferGeometry => {
    const def = STREET_KITS[key]!;
    const kit = kitById.get(def.kit);
    if (!kit) throw new Error(`no kit ${def.kit} for ${key} ${kitById.size}`);
    return kit.build({
      ...(def.params ? { params: def.params } : {}),
      ...(level === 'low' ? { lod: 'low' } : {}),
    });
  };

  function rebuild(): boolean {
    if (!ctx || !batch) return false;
    const next = streetFurniture(ctx.mirror);
    const same =
      next.length === pieces.length &&
      next.every((p, i) => {
        const o = pieces[i]!;
        return o.kit === p.kit && o.x === p.x && o.z === p.z && o.rot === p.rot;
      });
    if (same && !dirty) return false;
    for (const id of batch.ids()) batch.remove(id);
    pieces = next;
    levels.length = 0;
    matrices.length = 0;
    for (const p of pieces) {
      pos.set(p.x, groundY(ctx.mirror, p.x, p.z), p.z);
      q.setFromAxisAngle(up, (-p.rot * 2 * Math.PI) / 64);
      matrices.push(new Matrix4().compose(pos, q, scl));
      levels.push('high');
    }
    levelsDirty = true;
    dirty = false;
    if (ctx.env) {
      const discs = streetDiscs(pieces);
      if (ctx.env.lightWriter.set(STREET_LIGHT_SOURCE, discs)) wrote = true;
    }
    return true;
  }

  /** Puts every piece in the batch at its level (nearest level by the camera when there is one). */
  function place(): boolean {
    if (!ctx || !batch) return false;
    const env = ctx.env;
    const detail = env?.detailDistance ?? Infinity;
    let changed = false;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      let level: Level = 'high';
      if (env) {
        const d = Math.hypot(env.camera.position.x - p.x, env.camera.position.y, env.camera.position.z - p.z);
        level = levelFor(batch.has(i) ? levels[i] : undefined, d, detail);
      }
      levels[i] = level;
      const key = `${p.kit}:${level}`;
      if (batch.set(i, key, () => geometry(p.kit, level), matrices[i]!)) changed = true;
    }
    return changed;
  }

  return {
    id: 'street',
    init(c) {
      ctx = c;
      batch = new KeyedBatch(c.scene, c.material, 64, 40_000);
      batch.mesh.name = 'street';
      dirty = true;
      rebuild();
      place();
      c.invalidate();
    },
    update(change) {
      if (!ctx) return;
      if (change.full) {
        dirty = true;
        pending = false;
        if (rebuild()) {
          place();
          ctx.invalidate();
        }
      } else if (change.village || change.buildings || change.decor || change.rects.has('road'))
        pending = true;
    },
    frame(dt) {
      if (!ctx || !batch) return false;
      since += dt;
      let drew = false;
      if (pending && since >= RECHECK) {
        pending = false;
        since = 0;
        if (rebuild()) {
          levelsDirty = true;
          drew = true;
        }
      }
      if (!ctx.env) return drew;
      drew = drew || wrote;
      wrote = false;
      const env = ctx.env;
      const moved = env.camera.position.distanceTo(lastCam) > 1.5;
      if (levelsDirty || moved || env.detailDistance !== lastDetail) {
        lastCam.copy(env.camera.position);
        lastDetail = env.detailDistance;
        levelsDirty = false;
        if (place()) drew = true;
      }
      return drew;
    },
    dispose() {
      ctx?.env?.lightWriter.clear(STREET_LIGHT_SOURCE);
      batch?.dispose();
      batch = null;
      pieces = [];
    },
  };
}
