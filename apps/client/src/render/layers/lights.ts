import { artKitId, kitById, type KitAnchors } from '@qoti/art';
import { content } from '@qoti/content';
import { drawDef } from '../defs';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { createWorldEnv, MAX_GROUND_LIGHTS, type WorldEnv } from '../env';
import type { LightDisc } from '../lightMap';
import { buildingMatrix, decorMatrix, standLevel } from '../kitGeometry';
import { windowLit } from '../lighting';
import { groundY } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * C3D-1 night lights: warm pools of light on the ground under lanterns and below lit windows. The
 * ground shader draws them from a short list of the lights nearest the view (no real lights), and
 * window pools follow the same seeded choice of lit windows as the panes themselves.
 *
 * V2.0: the layer also feeds every pool to the light map's writer (render/lightMap.ts): lanterns
 * under the source `lanterns` and lit windows' spill under `windows`, so V2A can draw them all
 * there. Until then the map stays black and the 32 nearest pools still light the ground.
 */

/** V2.0: the pools' color and reach as the ground shader draws them (ground.ts, about 1.34 tiles). */
const POOL_COLOR = 0xffb366;
const POOL_RADIUS = 1.35;

const disc = (l: GroundLight): LightDisc => ({
  x: l.x,
  z: l.z,
  radius: POOL_RADIUS,
  color: POOL_COLOR,
  intensity: l.strength,
});

interface GroundLight {
  x: number;
  y: number;
  z: number;
  strength: number;
  /** Window pane position for the lit test; null for lanterns (always considered). */
  pane: Vector3 | null;
}

const decorAnchors = new Map<string, KitAnchors>();
const buildingAnchors = new Map<string, KitAnchors>();

function anchorsForDecor(defId: string): KitAnchors {
  let a = decorAnchors.get(defId);
  if (!a) {
    const def = content.decorById.get(defId);
    const kit = def ? kitById.get(artKitId(def.art)) : undefined;
    a = kit?.anchors?.(def?.art.params ? { params: def.art.params } : {}) ?? {};
    decorAnchors.set(defId, a);
  }
  return a;
}

function anchorsForBuilding(defId: string): KitAnchors {
  let a = buildingAnchors.get(defId);
  if (!a) {
    const def = drawDef(defId);
    const kit = def ? kitById.get(artKitId(def.art)) : undefined;
    a =
      (def &&
        kit?.anchors?.({
          size: def.size,
          entrance: def.entrance,
          ...(def.art.params ? { params: def.art.params } : {}),
        })) ||
      {};
    buildingAnchors.set(defId, a);
  }
  return a;
}

export function lightsLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let env: WorldEnv | null = null;
  let all: GroundLight[] = [];
  let dirty = true;
  let lastShare = -1;
  /** V2.0: the light map's discs changed since the last frame (a static-layer event). */
  let fed = false;
  const lastFocus = new Vector3(Infinity, 0, 0);
  const m = new Matrix4();
  const p = new Vector3();

  function collect(): void {
    if (!ctx) return;
    const mirror = ctx.mirror;
    all = [];
    for (const d of mirror.decor.values()) {
      const lights = anchorsForDecor(d.def).lights;
      if (!lights?.length) continue;
      decorMatrix(mirror, d.fx, d.fz, d.rot, m);
      for (const l of lights) {
        p.set(l[0], l[1], l[2]).applyMatrix4(m);
        all.push({ x: p.x, y: groundY(mirror, p.x, p.z) + 0.05, z: p.z, strength: 0.8, pane: null });
      }
    }
    for (const b of mirror.buildings.values()) {
      const lights = anchorsForBuilding(b.def).lights;
      if (!lights?.length) continue;
      const level = standLevel(mirror, b.def, b.x, b.z, b.rot);
      buildingMatrix(b.def, b.x, b.z, b.rot, level, m);
      const def = drawDef(b.def);
      const [w, d] = def?.size ?? [1, 1];
      const center = new Vector3(w / 2, 0, d / 2).applyMatrix4(m);
      for (const l of lights) {
        p.set(l[0], l[1], l[2]).applyMatrix4(m);
        // Outward along the facade's normal (the dominant axis away from the middle).
        const dx = p.x - center.x;
        const dz = p.z - center.z;
        const ox = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0;
        const oz = ox === 0 ? Math.sign(dz) : 0;
        const pane = new Vector3(p.x - ox * 0.026, p.y, p.z - oz * 0.026);
        const gx = p.x + ox * 0.3;
        const gz = p.z + oz * 0.3;
        all.push({ x: gx, y: groundY(mirror, gx, gz) + 0.05, z: gz, strength: 0.2, pane });
      }
    }
    dirty = false;
    lastShare = -1;
    if (env?.lightWriter.set('lanterns', all.filter((l) => !l.pane).map(disc))) fed = true;
  }

  function choose(): void {
    if (!env) return;
    const share = env.windowShare.value;
    const f = env.focus;
    const lit = all.filter((l) => !l.pane || windowLit(l.pane.x, l.pane.y, l.pane.z, share));
    if (env.lightWriter.set('windows', lit.filter((l) => l.pane).map(disc))) fed = true;
    lit.sort((a, b) => (a.x - f.x) ** 2 + (a.z - f.z) ** 2 - ((b.x - f.x) ** 2 + (b.z - f.z) ** 2));
    const n = Math.min(MAX_GROUND_LIGHTS, lit.length);
    for (let i = 0; i < n; i++) {
      const l = lit[i]!;
      env.lights.value[i]!.set(l.x, l.y, l.z, l.strength);
    }
    env.lightCount.value = n;
    lastShare = share;
    lastFocus.copy(f);
  }

  return {
    id: 'lights',
    init(c) {
      ctx = c;
      env = c.env ?? createWorldEnv(new PerspectiveCamera());
      collect();
    },
    update(change) {
      if (change.full || change.buildings || change.decor || change.rects.has('height')) dirty = true;
    },
    frame() {
      if (!env) return false;
      if (dirty) collect();
      let changed = false;
      if (env.night.value > 0.01) {
        if (lastShare !== env.windowShare.value || lastFocus.distanceToSquared(env.focus) > 16) {
          choose();
          changed = true;
        }
      }
      // V2.0: discs fed to the light map are a static change too (none on screen until V2A).
      if (fed) {
        fed = false;
        changed = true;
      }
      return changed;
    },
    dispose() {
      if (env) {
        env.lightCount.value = 0;
        env.lightWriter.clear('lanterns');
        env.lightWriter.clear('windows');
      }
    },
  };
}
