import { kitById, type KitAnchors, type KitBuildOptions, type KitPart } from '@qoti/art';
import { drawDef } from '../defs';
import {
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import type { BuildingView } from '@qoti/sim';
import { buildingKey, buildingKitOptions, buildingMatrix, standLevel } from '../kitGeometry';
import type { LayerContext, RenderLayer } from './types';

/** Kit anchors and parts rerun the generator, so cache them per def. */
const anchorCache = new Map<string, KitAnchors>();
const partCache = new Map<string, { geometry: BufferGeometry; part: KitPart }[]>();

function kitOptions(defId: string): { kitId: string; opts: KitBuildOptions } | null {
  const def = drawDef(defId);
  if (!def) return null;
  return {
    kitId: def.art.kit,
    opts: {
      size: def.size,
      entrance: def.entrance,
      ...(def.art.params ? { params: def.art.params } : {}),
    },
  };
}

/** C3D: anchors per building variant (chimneys move with the seeded look and customization). */
function anchorsOf(b: BuildingView): KitAnchors {
  if (b.stage !== 'built') return {};
  const key = buildingKey(b);
  let a = anchorCache.get(key);
  if (!a) {
    const def = drawDef(b.def);
    const kit = def ? kitById.get(def.art.kit) : undefined;
    a = kit?.anchors?.(buildingKitOptions(b)) || {};
    anchorCache.set(key, a);
  }
  return a;
}

function partsOf(defId: string): { geometry: BufferGeometry; part: KitPart }[] {
  let list = partCache.get(defId);
  if (!list) {
    const k = kitOptions(defId);
    const kit = k ? kitById.get(k.kitId) : undefined;
    const parts = (k && kit?.parts?.(k.opts)) || [];
    // Part geometry is in kit-local coordinates: move it so the pivot sits at the origin.
    list = parts.map((part) => ({
      part,
      geometry: part.geometry.clone().translate(-part.pivot[0], -part.pivot[1], -part.pivot[2]),
    }));
    partCache.set(defId, list);
  }
  return list;
}

const PUFFS_PER_CHIMNEY = 4;
const PUFF_LIFE = 4.5;
const MAX_PUFFS = 400;

interface Spinner {
  mesh: Mesh;
  base: Matrix4;
  pivot: Vector3;
  axis: Vector3;
  speed: number;
  phase: number;
}

/**
 * Effects: windmill sails that turn slowly and soft chimney smoke that drifts and fades. Both come
 * from the optional kit contract (`parts`, `anchors().smoke`); kits without them add nothing.
 */
export interface EffectsLayer extends RenderLayer {
  /** Smoke is a Medium and High nicety; Low hides it and stops its redraws. */
  setSmoke(on: boolean): void;
}

export function effectsLayer(): EffectsLayer {
  let ctx: LayerContext | null = null;
  let smokeOn = true;
  let spinners: Spinner[] = [];
  let chimneys: Vector3[] = [];
  let smoke: InstancedMesh | null = null;
  let time = 0;
  const smokeMaterial = new MeshStandardMaterial({
    color: 0xf4efe8,
    roughness: 1,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const puff = new IcosahedronGeometry(0.09, 1);
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();

  function clearSpinners(): void {
    for (const sp of spinners) ctx?.scene.remove(sp.mesh);
    spinners = [];
  }

  function rebuild(): void {
    if (!ctx) return;
    clearSpinners();
    chimneys = [];
    for (const b of ctx.mirror.buildings.values()) {
      const level = standLevel(ctx.mirror, b.def, b.x, b.z, b.rot);
      const place = buildingMatrix(b.def, b.x, b.z, b.rot, level);
      for (const [x, y, z] of anchorsOf(b).smoke ?? [])
        chimneys.push(new Vector3(x, y, z).applyMatrix4(place));
      for (const { geometry, part } of b.stage === 'built' ? partsOf(b.def) : []) {
        const mesh = new Mesh(geometry, ctx.material);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = true;
        const pivot = new Vector3(part.pivot[0], part.pivot[1], part.pivot[2]);
        const axis = new Vector3(...(part.spinAxis ?? [0, 0, 1])).normalize();
        spinners.push({
          mesh,
          base: place.clone(),
          pivot,
          axis,
          speed: part.spinSpeed ?? 0.6,
          phase: b.id * 0.7,
        });
        ctx.scene.add(mesh);
      }
    }
    if (smoke) {
      ctx.scene.remove(smoke);
      smoke.dispose();
      smoke = null;
    }
    const count = Math.min(MAX_PUFFS, chimneys.length * PUFFS_PER_CHIMNEY);
    if (count > 0) {
      smoke = new InstancedMesh(puff, smokeMaterial, count);
      smoke.instanceMatrix.setUsage(DynamicDrawUsage);
      smoke.frustumCulled = false;
      smoke.renderOrder = 3;
      smoke.visible = smokeOn;
      ctx.scene.add(smoke);
    }
    animate(0);
    ctx.invalidate();
  }

  function animate(dt: number): void {
    time += dt;
    const local = new Matrix4();
    for (const sp of spinners) {
      q.setFromAxisAngle(sp.axis, time * sp.speed + sp.phase);
      local.compose(sp.pivot, q, s.set(1, 1, 1));
      sp.mesh.matrix.multiplyMatrices(sp.base, local);
      sp.mesh.matrixWorldNeedsUpdate = true;
    }
    if (!smoke) return;
    let i = 0;
    for (let c = 0; c < chimneys.length && i < smoke.count; c++) {
      const base = chimneys[c]!;
      for (let k = 0; k < PUFFS_PER_CHIMNEY && i < smoke.count; k++, i++) {
        // Each puff rises, drifts with a gentle breeze, swells and shrinks away at the end of its life.
        const life = (time / PUFF_LIFE + k / PUFFS_PER_CHIMNEY + c * 0.37) % 1;
        const size = Math.sin(life * Math.PI) * (0.7 + life * 1.6);
        p.set(
          base.x + life * 0.35 + Math.sin(time + c) * 0.03,
          base.y + 0.05 + life * 0.9,
          base.z + life * 0.15,
        );
        m.compose(p, q.identity(), s.setScalar(Math.max(0.001, size)));
        smoke.setMatrixAt(i, m);
      }
    }
    smoke.instanceMatrix.needsUpdate = true;
  }

  return {
    id: 'effects',
    init(c) {
      ctx = c;
      rebuild();
    },
    update(change) {
      if (change.full || change.buildings || change.rects.has('height')) rebuild();
    },
    frame(dt) {
      if (spinners.length === 0 && !(smoke && smokeOn)) return false;
      animate(dt);
      return true;
    },
    setSmoke(on) {
      smokeOn = on;
      if (smoke) smoke.visible = on;
      ctx?.invalidate();
    },
    dispose() {
      clearSpinners();
      if (smoke) {
        ctx?.scene.remove(smoke);
        smoke.dispose();
      }
      puff.dispose();
      smokeMaterial.dispose();
    },
  };
}
