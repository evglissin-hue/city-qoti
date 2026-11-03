import { drawDef } from '../defs';
import { footprintSize, type BuildingView } from '@qoti/sim';
import { Matrix4, Vector3, type BufferGeometry } from 'three';
import type { Mirror } from '../../state/mirror';
import { KeyedBatch } from '../batch';
import {
  buildingKey,
  buildingMatrix,
  buildingVariantGeometry,
  isSeasonal,
  setDrawSeason,
  setRowReader,
  setSoilReader,
  standLevel,
} from '../kitGeometry';
import { isRowKit } from '@qoti/art';
import { levelFor, SwapQueue, type Level } from '../lod';
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
  if (!def || b.stage !== 'built' || !isRowKit(def.art.kit)) return out;
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
    if (nb && ndef && nb.stage === 'built' && nb.rot === b.rot && isRowKit(ndef.art.kit)) {
      // The probe must fall in the neighbor's front row, on its facing edge.
      toLocal.copy(buildingMatrix(nb.def, nb.x, nb.z, nb.rot, 0, toLocal)).invert();
      probe.set(tx + 0.5, 0, tz + 0.5).applyMatrix4(toLocal);
      const [nw, nd] = ndef.size;
      const edge = side === 'L' ? probe.x > nw - 1 : probe.x < 1;
      if (edge && probe.z > nd - 1 && standLevel(mirror, nb.def, nb.x, nb.z, nb.rot) === level) {
        out[`join${side}`] = ndef.art.kit;
        continue;
      }
    }
    if (mirror.road(tx, tz) > 0) out[`street${side}`] = true;
  }
  return out;
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

  function place(b: BuildingView): void {
    if (!ctx || !batch) return;
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
    batch.set(b.id, key, () => timedBuild(key, () => buildingVariantGeometry(b, lod)), m);
  }

  function rebuild(): void {
    if (!ctx || !batch) return;
    runKeys = 0;
    runMs = 0;
    const seen = new Set<number>();
    for (const b of ctx.mirror.buildings.values()) {
      seen.add(b.id);
      const def = drawDef(b.def);
      const [w, d] = def ? footprintSize(def, b.rot) : [1, 1];
      centers.set(b.id, new Vector3(b.x + w / 2, 0, b.z + d / 2));
      place(b);
    }
    for (const id of batch.ids()) {
      if (seen.has(id)) continue;
      batch.remove(id);
      lods.delete(id);
      swaps.delete(id);
      centers.delete(id);
    }
    lastCam.set(Infinity, 0, 0);
    ctx.invalidate();
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
      batch = new KeyedBatch(c.scene, c.material);
      rebuild();
    },
    update(change) {
      if (change.full || change.buildings || change.rects.has('height') || change.rects.has('occupant'))
        rebuild();
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
    },
  };
}
