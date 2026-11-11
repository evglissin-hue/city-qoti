import { drawDef } from '../defs';
import { footprintSize, type BuildingView } from '@qoti/sim';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Mirror } from '../../state/mirror';
import { KeyedBatch } from '../batch';
import {
  buildingKey,
  buildingKitOptions,
  buildingMatrix,
  buildingVariantGeometry,
  isSeasonal,
  setDrawSeason,
  setRowReader,
  setWallReader,
  setWaterReader,
  setSoilReader,
  standLevel,
} from '../kitGeometry';
import { artKitId, isRowKit, kitById, palette, WALL_KITS } from '@qoti/art';
import { levelFor, SwapQueue, type Level } from '../lod';
import type { KitAnchors } from '@qoti/art';
import type { LayerContext, RenderLayer } from './types';

/** Beyond this many tiles from the camera, buildings swap to their low detail version (V1.0: the preset's). */
const LOD_DISTANCE = 75;

/**
 * V1B: what building keys cost to build (the chunk rebuild budget is 4 ms a key): every rebuild
 * that builds keys adds to these, and logs its own total in a dev or ?debug session.
 */
export const buildingBuildStats = { keys: 0, ms: 0, worst: 0, worstKey: '' };
let runKeys = 0;
let runMs = 0;
const logBuilds =
  typeof location !== 'undefined' && (import.meta.env?.DEV === true || location.search.includes('debug'));

function timedBuild(key: string, make: () => BufferGeometry): BufferGeometry {
  const t0 = performance.now();
  const g = make();
  const ms = performance.now() - t0;
  const st = buildingBuildStats;
  st.keys++;
  st.ms += ms;
  runKeys++;
  runMs += ms;
  if (ms > st.worst) {
    st.worst = ms;
    st.worstKey = key;
  }
  return g;
}

const probe = new Vector3();
const toLocal = new Matrix4();
const local = new Matrix4();

/**
 * V1B: a home's place in a row, for joined facades: on each side (the kit's x- and x+, at its
 * front row) the neighbor it joins (a built row kit with the same facing, its front on the same
 * line, standing at the same level) as `joinL` or `joinR` with the neighbor's kit, or `streetL` /
 * `streetR` where a road runs past that side instead (a corner house dresses it).
 */
export function rowNeighbors(mirror: Mirror, b: BuildingView): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const def = drawDef(b.def);
  if (!def || b.stage !== 'built' || !isRowKit(artKitId(def.art))) return out;
  const [w, d] = def.size;
  const level = standLevel(mirror, b.def, b.x, b.z, b.rot);
  buildingMatrix(b.def, b.x, b.z, b.rot, 0, local);
  for (const [side, u] of [
    ['L', -0.5],
    ['R', w + 0.5],
  ] as const) {
    probe.set(u, 0, d - 0.5).applyMatrix4(local);
    const tx = Math.floor(probe.x);
    const tz = Math.floor(probe.z);
    const id = mirror.occupant(tx, tz);
    const nb = id && id !== b.id ? mirror.buildings.get(id) : undefined;
    const ndef = nb ? drawDef(nb.def) : undefined;
    if (nb && ndef && nb.stage === 'built' && nb.rot === b.rot && isRowKit(artKitId(ndef.art))) {
      // The probe must fall in the neighbor's front row, on its facing edge.
      toLocal.copy(buildingMatrix(nb.def, nb.x, nb.z, nb.rot, 0, toLocal)).invert();
      probe.set(tx + 0.5, 0, tz + 0.5).applyMatrix4(toLocal);
      const [nw, nd] = ndef.size;
      const edge = side === 'L' ? probe.x > nw - 1 : probe.x < 1;
      if (edge && probe.z > nd - 1 && standLevel(mirror, nb.def, nb.x, nb.z, nb.rot) === level) {
        out[`join${side}`] = artKitId(ndef.art);
        continue;
      }
    }
    if (mirror.road(tx, tz) > 0) out[`street${side}`] = true;
  }
  return out;
}

/**
 * C5E: the kit-local sides of a wall piece (palisade, stone wall, gate) that a built wall piece
 * stands beside, so runs join up and corners turn. A gate joins along its own run only (its x
 * sides), so a wall meeting it head-on does not poke through its leaves.
 */
export function wallNeighbors(mirror: Mirror, b: BuildingView): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const def = drawDef(b.def);
  if (!def || b.stage !== 'built') return out;
  const gate = artKitId(def.art) === 'gate';
  buildingMatrix(b.def, b.x, b.z, b.rot, 0, local);
  for (const [key, u, w] of [
    ['wx-', -0.5, 0.5],
    ['wx+', 1.5, 0.5],
    ['wz-', 0.5, -0.5],
    ['wz+', 0.5, 1.5],
  ] as const) {
    if (gate && key[1] === 'z') continue;
    probe.set(u, 0, w).applyMatrix4(local);
    const id = mirror.occupant(Math.floor(probe.x), Math.floor(probe.z));
    const nb = id && id !== b.id ? mirror.buildings.get(id) : undefined;
    const ndef = nb ? drawDef(nb.def) : undefined;
    if (!nb || !ndef || nb.stage !== 'built' || !WALL_KITS.has(artKitId(ndef.art))) continue;
    // A gate only takes a wall at its run's ends (its run is along world x at rotations 0 and 2).
    if (artKitId(ndef.art) === 'gate' && (nb.rot % 2 === 0 ? nb.z !== b.z : nb.x !== b.x)) continue;
    out[key] = true;
  }
  return out;
}

// --- R1E: the painted signs of businesses ------------------------------------------------------

/** What a business's sign says after the keeper's family name, by trade. */
const SIGN_WORDS: Readonly<Record<string, string>> = {
  baker: 'Bakery',
  carpenter: 'Joinery',
  chandler: 'Candles',
  'cider-maker': 'Cider',
  dairy: 'Dairy',
  'grain-farm': 'Farm',
  hives: 'Honey',
  'market-garden': 'Gardens',
  orchard: 'Orchard',
  'sheep-run': 'Fold',
  shop: 'Stores',
  weaver: 'Looms',
};

/**
 * R1E: the words on a business's painted sign (docs/spec/13-ledger.md, "Levels are drawn"): from
 * level 2, the keeper's family name and the trade ("Fenwick's Bakery"). Null for a level 1
 * business, one with no keeper yet, or one whose players painted their own words (the signs layer
 * letters those on the same board).
 */
export function businessSignText(b: BuildingView, family: string | undefined): string | null {
  if (!b.trade || (b.level ?? 1) < 2 || !family || b.stage !== 'built') return null;
  if (typeof b.custom?.sign === 'string' && b.custom.sign.trim()) return null;
  const word = SIGN_WORDS[b.trade];
  return word ? `${family}'s ${word}` : `${family}'s`;
}

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;
const CELL_W = 256;
const CELL_H = 64;
const ATLAS_COLS = 4;

interface SignCell {
  /** What shapes the board (the building's key and where it stands) and the words on it. */
  key: string;
  text: string;
  slot: number;
  /** The board's corners in world space, lower left first, counterclockwise from the front. */
  corners: [Vector3, Vector3, Vector3, Vector3];
  /** The lettered part of the cell, as a fraction of its width and height. */
  fw: number;
  fh: number;
}

/**
 * Every business's name in one canvas atlas (cells of 256 x 64) on one mesh of quads, so a town of
 * signed businesses costs one draw. A cell is lettered once when its words change.
 */
class SignAtlas {
  readonly mesh: Mesh;
  private readonly material: MeshStandardMaterial;
  private canvas: HTMLCanvasElement | null = null;
  private texture: CanvasTexture | null = null;
  private rows = 16;
  private readonly cells = new Map<number, SignCell>();
  private free: number[] = [];
  private next = 0;
  private dirty = false;

  constructor() {
    this.material = new MeshStandardMaterial({
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.mesh = new Mesh(new BufferGeometry(), this.material);
    this.mesh.userData.noCast = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  has(id: number): SignCell | undefined {
    return this.cells.get(id);
  }

  ids(): IterableIterator<number> {
    return this.cells.keys();
  }

  set(id: number, cell: Omit<SignCell, 'slot' | 'fw' | 'fh'>, aspect: number): void {
    const old = this.cells.get(id);
    const slot = old?.slot ?? this.free.pop() ?? this.next++;
    if (slot >= ATLAS_COLS * this.rows) this.grow();
    const fw = Math.min(1, (CELL_H * aspect) / CELL_W);
    const fh = Math.min(1, CELL_W / aspect / CELL_H);
    const full = { ...cell, slot, fw, fh };
    this.cells.set(id, full);
    if (!old || old.text !== cell.text || old.fw !== fw) this.letter(full);
    this.dirty = true;
  }

  drop(id: number): boolean {
    const c = this.cells.get(id);
    if (!c) return false;
    this.cells.delete(id);
    this.free.push(c.slot);
    this.dirty = true;
    return true;
  }

  private ensureCanvas(): CanvasRenderingContext2D | null {
    if (typeof document === 'undefined') return null;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = CELL_W * ATLAS_COLS;
      this.canvas.height = CELL_H * this.rows;
      this.texture = new CanvasTexture(this.canvas);
      this.texture.colorSpace = SRGBColorSpace;
      this.texture.anisotropy = 4;
      this.material.map = this.texture;
      this.material.needsUpdate = true;
    }
    return this.canvas.getContext('2d');
  }

  /** Doubles the atlas (up to 64 rows) and letters every cell again. */
  private grow(): void {
    this.rows = Math.min(64, this.rows * 2);
    if (this.canvas) {
      this.canvas.height = CELL_H * this.rows;
      this.texture?.dispose();
      this.texture = new CanvasTexture(this.canvas);
      this.texture.colorSpace = SRGBColorSpace;
      this.texture.anisotropy = 4;
      this.material.map = this.texture;
      this.material.needsUpdate = true;
    }
    for (const c of this.cells.values()) this.letter(c);
  }

  /** Ink on the board's cream, the words fitted to the lettered part of the cell. */
  private letter(c: SignCell): void {
    const g = this.ensureCanvas();
    if (!g) return;
    const x0 = (c.slot % ATLAS_COLS) * CELL_W;
    const y0 = Math.floor(c.slot / ATLAS_COLS) * CELL_H;
    const w = CELL_W * c.fw;
    const h = CELL_H * c.fh;
    const x = x0 + (CELL_W - w) / 2;
    const y = y0 + (CELL_H - h) / 2;
    g.fillStyle = css(palette.paper);
    g.fillRect(x0, y0, CELL_W, CELL_H);
    g.fillStyle = css(palette.ink);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = Math.floor(h * 0.62);
    do {
      g.font = `bold ${size}px "Alegreya", Georgia, serif`;
      size -= 2;
    } while (size > 10 && g.measureText(c.text).width > w - 12);
    g.fillText(c.text, x + w / 2, y + h / 2 + 2, w - 8);
    if (this.texture) this.texture.needsUpdate = true;
  }

  /** Rebuilds the quads after cells came, went or moved; true when it did. */
  flush(): boolean {
    if (!this.dirty) return false;
    this.dirty = false;
    const n = this.cells.size;
    const pos = new Float32Array(n * 12);
    const uv = new Float32Array(n * 8);
    const nor = new Float32Array(n * 12);
    const idx: number[] = [];
    const e1 = new Vector3();
    const e2 = new Vector3();
    let i = 0;
    for (const c of this.cells.values()) {
      const u0 = ((c.slot % ATLAS_COLS) + (1 - c.fw) / 2) / ATLAS_COLS;
      const u1 = u0 + c.fw / ATLAS_COLS;
      // Canvas rows run down, texture v runs up.
      const row = Math.floor(c.slot / ATLAS_COLS);
      const v1 = 1 - (row + (1 - c.fh) / 2) / this.rows;
      const v0 = v1 - c.fh / this.rows;
      const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
      e1.subVectors(c.corners[1], c.corners[0]);
      e2.subVectors(c.corners[3], c.corners[0]);
      const nn = e1.clone().cross(e2).normalize();
      for (let k = 0; k < 4; k++) {
        c.corners[k]!.toArray(pos, (i * 4 + k) * 3);
        nn.toArray(nor, (i * 4 + k) * 3);
        uv[(i * 4 + k) * 2] = uvs[k * 2]!;
        uv[(i * 4 + k) * 2 + 1] = uvs[k * 2 + 1]!;
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      i++;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('normal', new BufferAttribute(nor, 3));
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.mesh.visible = n > 0;
    return true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.texture?.dispose();
    this.material.dispose();
  }
}

const signPlace = new Matrix4();
const signLook = new Matrix4();
const signUp = new Vector3(0, 1, 0);
const signOrigin = new Vector3();

/** The world corners of a kit's sign board for a building standing at `level`. */
function boardCorners(
  b: BuildingView,
  level: number,
  sign: { center: [number, number, number]; normal: [number, number, number]; width: number; height: number },
): [Vector3, Vector3, Vector3, Vector3] {
  buildingMatrix(b.def, b.x, b.z, b.rot, level, signPlace);
  const center = new Vector3(...sign.center).applyMatrix4(signPlace);
  const normal = new Vector3(...sign.normal).transformDirection(signPlace);
  center.addScaledVector(normal, 0.004);
  // The board's right and up, seen from the front.
  signLook.lookAt(signOrigin, normal.clone().negate(), signUp);
  const right = new Vector3().setFromMatrixColumn(signLook, 0).multiplyScalar(sign.width / 2);
  const up = new Vector3().setFromMatrixColumn(signLook, 1).multiplyScalar(sign.height / 2);
  return [
    center.clone().sub(right).sub(up),
    center.clone().add(right).sub(up),
    center.clone().add(right).add(up),
    center.clone().sub(right).add(up),
  ];
}

/**
 * Buildings (C3D): every building as it stands (its seeded variant, the player's customization,
 * stock piles and crops from its runtime, or its construction stage) in one BatchedMesh, so the
 * whole hamlet is a single draw call. Distant buildings swap to a cheaper version. Each stands on
 * its pad, the flat terrace the ground is drawn to under its footprint (see `padLevel`), so no
 * foundation hangs over a slope.
 */
export function buildingsLayer(): RenderLayer {
  let batch: KeyedBatch | null = null;
  let ctx: LayerContext | null = null;
  const lods = new Map<number, Level>();
  // V1D: swaps wait in a queue, nearest first, a few a frame (lod.ts).
  const swaps = new SwapQueue();
  const centers = new Map<number, Vector3>();
  const camPos = new Vector3();
  const lastCam = new Vector3(Infinity, 0, 0);
  const m = new Matrix4();
  let lodTimer = 0;
  // R1E: the names on businesses' painted signs, and each signed building's board by its key.
  const signs = new SignAtlas();
  const boards = new Map<number, { key: string; sign: NonNullable<KitAnchors['sign']> | null }>();

  /** Puts each business's name on its board; true when a sign came, went or changed. */
  function updateSigns(): boolean {
    if (!ctx) return false;
    const seen = new Set<number>();
    for (const b of ctx.mirror.buildings.values()) {
      const family = b.keeperId ? ctx.mirror.residents.get(b.keeperId)?.family : undefined;
      const text = businessSignText(b, family);
      if (!text) continue;
      const level = standLevel(ctx.mirror, b.def, b.x, b.z, b.rot);
      const key = `${buildingKey(b)}|${b.x},${b.z},${b.rot},${level}`;
      let board = boards.get(b.id);
      if (!board || board.key !== key) {
        const def = drawDef(b.def);
        const kit = def ? kitById.get(artKitId(def.art)) : undefined;
        board = { key, sign: kit?.anchors?.(buildingKitOptions(b)).sign ?? null };
        boards.set(b.id, board);
      }
      if (!board.sign) continue;
      seen.add(b.id);
      const cell = signs.has(b.id);
      if (cell && cell.key === key && cell.text === text) continue;
      signs.set(
        b.id,
        { key, text, corners: boardCorners(b, level, board.sign) },
        board.sign.width / board.sign.height,
      );
    }
    for (const id of [...signs.ids()]) if (!seen.has(id)) signs.drop(id);
    for (const id of [...boards.keys()]) if (!ctx.mirror.buildings.has(id)) boards.delete(id);
    return signs.flush();
  }

  function place(b: BuildingView): boolean {
    if (!ctx || !batch) return false;
    buildingMatrix(b.def, b.x, b.z, b.rot, standLevel(ctx.mirror, b.def, b.x, b.z, b.rot), m);
    let lod = lods.get(b.id);
    if (!lod) {
      // V1D: a new building starts at the level its distance asks for, so far ones never build
      // their full detail just to swap it away.
      const c = centers.get(b.id);
      camPos.setFromMatrixPosition(ctx.camera.matrixWorld);
      lod = c ? levelFor(undefined, c.distanceTo(camPos), ctx.env?.buildingDetail ?? LOD_DISTANCE) : 'high';
      lods.set(b.id, lod);
    }
    const key = buildingKey(b, lod);
    return batch.set(b.id, key, () => timedBuild(key, () => buildingVariantGeometry(b, lod)), m);
  }

  function rebuild(): void {
    if (!ctx || !batch) return;
    runKeys = 0;
    runMs = 0;
    const seen = new Set<number>();
    // V1X: the sim reports building changes that leave the picture as it was (a resident moving
    // in, a counter ticking over); only a real change drops the still-frame cache.
    let changed = false;
    for (const b of ctx.mirror.buildings.values()) {
      seen.add(b.id);
      const def = drawDef(b.def);
      const [w, d] = def ? footprintSize(def, b.rot) : [1, 1];
      centers.set(b.id, new Vector3(b.x + w / 2, 0, b.z + d / 2));
      if (place(b)) changed = true;
    }
    for (const id of batch.ids()) {
      if (seen.has(id)) continue;
      changed = true;
      batch.remove(id);
      lods.delete(id);
      swaps.delete(id);
      centers.delete(id);
    }
    lastCam.set(Infinity, 0, 0);
    if (updateSigns()) changed = true;
    if (changed) ctx.invalidate();
    if (logBuilds && runKeys > 0) {
      const st = buildingBuildStats;
      console.info(
        `[buildings] built ${runKeys} keys in ${runMs.toFixed(1)} ms (worst so far ${st.worst.toFixed(2)} ms: ${st.worstKey})`,
      );
    }
  }

  /**
   * Swaps buildings between full and low detail by distance (V1D: with hysteresis, and a few swaps a
   * frame, nearest first; lod.ts), re-judging a couple of times a second or when the camera moves.
   */
  function updateLods(dt: number): boolean {
    if (!ctx) return false;
    lodTimer -= dt;
    camPos.setFromMatrixPosition(ctx.camera.matrixWorld);
    // The first look (after a load or a big change) swaps everything at once.
    const first = !Number.isFinite(lastCam.x);
    if (lodTimer <= 0 || camPos.distanceToSquared(lastCam) >= 4) {
      lodTimer = 0.4;
      lastCam.copy(camPos);
      const detail = ctx.env?.buildingDetail ?? LOD_DISTANCE;
      for (const b of ctx.mirror.buildings.values()) {
        const c = centers.get(b.id);
        if (!c) continue;
        const d = c.distanceTo(camPos);
        const now = lods.get(b.id) ?? 'high';
        const want = levelFor(now, d, detail);
        if (want === now) swaps.delete(b.id);
        else swaps.set(b.id, want, d);
      }
    }
    const buildings = ctx.mirror.buildings;
    return (
      swaps.drain((id, level) => {
        const b = buildings.get(id);
        if (!b) return;
        lods.set(id, level);
        place(b);
      }, first) > 0
    );
  }

  return {
    id: 'buildings',
    init(c) {
      ctx = c;
      setDrawSeason(c.mirror.clock.value.season);
      setSoilReader((x, z) => c.mirror.fertility(x, z));
      setRowReader((b) => rowNeighbors(c.mirror, b));
      setWallReader((b) => wallNeighbors(c.mirror, b));
      setWaterReader((x, z) => !!c.mirror.water(x, z));
      batch = new KeyedBatch(c.scene, c.material);
      c.scene.add(signs.mesh);
      rebuild();
    },
    update(change) {
      if (change.full || change.buildings || change.rects.has('height') || change.rects.has('occupant'))
        rebuild();
      // A keeper's family can change without a building changing (a newcomer takes over).
      else if (change.residents && updateSigns()) ctx?.invalidate();
    },
    frame(dt) {
      // C4E: orchards and farm trees follow the season.
      let seasonal = false;
      if (ctx && setDrawSeason(ctx.mirror.clock.value.season)) {
        for (const b of ctx.mirror.buildings.values()) if (isSeasonal(b.def)) place(b);
        seasonal = true;
      }
      return updateLods(dt) || seasonal;
    },
    dispose() {
      batch?.dispose();
      signs.dispose();
    },
  };
}
