import { palette, ShapeBuilder } from '@qoti/art';
import { content } from '@qoti/content';
import { footprintSize, type BuildingView } from '@qoti/sim';
import { Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { KeyedBatch } from '../batch';
import { levelY } from '../coords';
import { InstanceSets } from '../instances';
import { buildingKey, buildingMatrix, buildingVariantGeometry, footprintHeights } from '../kitGeometry';
import type { LayerContext, RenderLayer } from './types';

const PLINTH = '__plinth';
/** Beyond this many tiles from the camera, buildings swap to their low detail version. */
const LOD_DISTANCE = 75;

/**
 * Buildings (C3D): every building as it stands (its seeded variant, the player's customization,
 * stock piles and crops from its runtime, or its construction stage) in one BatchedMesh, so the
 * whole hamlet is a single draw call. Distant buildings swap to a cheaper version. A stone plinth
 * goes under footprints on a slope.
 */
export function buildingsLayer(): RenderLayer {
  let batch: KeyedBatch | null = null;
  let ctx: LayerContext | null = null;
  const plinthGeometry = new ShapeBuilder().box(0, 0, 0, 1, 1, 1, palette.plinth).build();
  const plinthMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  let plinths: InstanceSets | null = null;
  const lods = new Map<number, 'high' | 'low'>();
  const centers = new Map<number, Vector3>();
  const camPos = new Vector3();
  const lastCam = new Vector3(Infinity, 0, 0);
  const m = new Matrix4();
  let lodTimer = 0;

  function place(b: BuildingView): void {
    if (!ctx || !batch) return;
    const [, hi] = footprintHeights(ctx.mirror, b.def, b.x, b.z, b.rot);
    buildingMatrix(b.def, b.x, b.z, b.rot, hi, m);
    const lod = lods.get(b.id) ?? 'high';
    batch.set(b.id, buildingKey(b, lod), () => buildingVariantGeometry(b, lod), m);
  }

  function rebuild(): void {
    if (!ctx || !batch || !plinths) return;
    const plinthMatrices: Matrix4[] = [];
    const seen = new Set<number>();
    for (const b of ctx.mirror.buildings.values()) {
      seen.add(b.id);
      const def = content.buildingById.get(b.def);
      const [w, d] = def ? footprintSize(def, b.rot) : [1, 1];
      centers.set(b.id, new Vector3(b.x + w / 2, 0, b.z + d / 2));
      place(b);
      const [lo, hi] = footprintHeights(ctx.mirror, b.def, b.x, b.z, b.rot);
      if (hi > lo) {
        plinthMatrices.push(
          new Matrix4().compose(
            new Vector3(b.x, levelY(lo), b.z),
            new Quaternion(),
            new Vector3(w, levelY(hi) - levelY(lo), d),
          ),
        );
      }
    }
    for (const id of batch.ids()) {
      if (seen.has(id)) continue;
      batch.remove(id);
      lods.delete(id);
      centers.delete(id);
    }
    plinths.set(new Map([[PLINTH, plinthMatrices]]));
    lastCam.set(Infinity, 0, 0);
    ctx.invalidate();
  }

  /** Swaps buildings between full and low detail by distance, a couple of times a second. */
  function updateLods(dt: number): boolean {
    if (!ctx) return false;
    lodTimer -= dt;
    camPos.setFromMatrixPosition(ctx.camera.matrixWorld);
    if (lodTimer > 0 && camPos.distanceToSquared(lastCam) < 4) return false;
    lodTimer = 0.4;
    lastCam.copy(camPos);
    let changed = false;
    for (const b of ctx.mirror.buildings.values()) {
      const c = centers.get(b.id);
      if (!c) continue;
      const want = c.distanceTo(camPos) > LOD_DISTANCE ? 'low' : 'high';
      if ((lods.get(b.id) ?? 'high') === want) continue;
      lods.set(b.id, want);
      place(b);
      changed = true;
    }
    return changed;
  }

  return {
    id: 'buildings',
    init(c) {
      ctx = c;
      batch = new KeyedBatch(c.scene, c.material);
      plinths = new InstanceSets(c.scene, plinthMaterial, () => plinthGeometry);
      rebuild();
    },
    update(change) {
      if (change.full || change.buildings || change.rects.has('height')) rebuild();
    },
    frame(dt) {
      return updateLods(dt);
    },
    dispose() {
      batch?.dispose();
      plinths?.dispose();
      plinthGeometry.dispose();
      plinthMaterial.dispose();
    },
  };
}
