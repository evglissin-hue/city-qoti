import { drawDef } from '../defs';
import { footprintSize, type BuildingView } from '@qoti/sim';
import { Matrix4, Vector3 } from 'three';
import { KeyedBatch } from '../batch';
import {
  buildingKey,
  buildingMatrix,
  buildingVariantGeometry,
  isSeasonal,
  setDrawSeason,
  setSoilReader,
  standLevel,
} from '../kitGeometry';
import { levelFor, SwapQueue, type Level } from '../lod';
import type { LayerContext, RenderLayer } from './types';

/** Beyond this many tiles from the camera, buildings swap to their low detail version (V1.0: the preset's). */
const LOD_DISTANCE = 75;

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
    batch.set(b.id, buildingKey(b, lod), () => buildingVariantGeometry(b, lod), m);
  }

  function rebuild(): void {
    if (!ctx || !batch) return;
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
