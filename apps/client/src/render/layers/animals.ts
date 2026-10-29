// C4E: sheep, cows and hens on the farms. Buildings say where their animals live through their kit's
// `anchors.animals` pens (the pasture, the dairy's paddock, a farmstead's pen); this layer keeps the
// animals in them, purely for looks: they graze with their heads down, wander a few steps at an
// unhurried pace with their legs in step with the ground covered, look up now and then, and lie
// down for the night. Placement is seeded by building, so both players see the same flock.
import { animalArt, kitById, type AnimalArt, type AnimalKind } from '@qoti/art';
import type { BuildingView } from '@qoti/sim';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { hash2 } from '../coords';
import { drawDef } from '../defs';
import { buildingKitOptions, buildingMatrix, standLevel } from '../kitGeometry';
import { FramePool } from '../pool';
import { groundY } from '../surface';
import type { LayerContext, RenderLayer } from './types';

interface Beast {
  kind: AnimalKind;
  variant: number;
  /** The pen in world units: corners of a rotated rect as origin and two edge vectors. */
  pen: { ox: number; oz: number; ux: number; uz: number; vx: number; vz: number };
  x: number;
  z: number;
  heading: number;
  tx: number;
  tz: number;
  /** 'graze' heads down, 'look' heads up, 'walk' to the target. */
  mode: 'graze' | 'look' | 'walk';
  timer: number;
  gait: number;
  seed: number;
  /** 0 standing, 1 lying down (night), eased. */
  rest: number;
}

/** Kits that keep animals (building their anchors is not free, so only these are asked). */
const PEN_KITS = new Set(['dairy', 'farmstead', 'sheep-pasture']);

function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export interface AnimalsLayer extends RenderLayer {
  readonly count: number;
}

export function animalsLayer(): AnimalsLayer {
  let ctx: LayerContext | null = null;
  let beasts: Beast[] = [];
  const pools = new Map<string, { body: FramePool; head: FramePool; leg: FramePool; art: AnimalArt }>();
  let dirty = true;
  let clock = 0;
  const m = new Matrix4();
  const base = new Matrix4();
  const part = new Matrix4();
  const q = new Quaternion();
  const e = new Euler(0, 0, 0, 'YXZ');
  const p = new Vector3();
  const one = new Vector3(1, 1, 1);
  const local = new Vector3();
  const camPos = new Vector3();

  function poolsFor(
    kind: AnimalKind,
    variant: number,
  ): { body: FramePool; head: FramePool; leg: FramePool; art: AnimalArt } | null {
    if (!ctx) return null;
    const key = `${kind}:${variant}`;
    let pl = pools.get(key);
    if (!pl) {
      const art = animalArt(kind, variant);
      pl = {
        art,
        body: new FramePool(ctx.scene, art.body.clone(), ctx.material),
        head: new FramePool(ctx.scene, art.head.clone(), ctx.material),
        leg: new FramePool(ctx.scene, art.leg.clone(), ctx.material),
      };
      pools.set(key, pl);
    }
    return pl;
  }

  /** A point in a pen from two 0..1 coordinates. */
  function inPen(b: Beast, a: number, c: number): [number, number] {
    const pn = b.pen;
    return [pn.ox + pn.ux * a + pn.vx * c, pn.oz + pn.uz * a + pn.vz * c];
  }

  function collect(): void {
    if (!ctx) return;
    const old = new Map<string, Beast>();
    for (const b of beasts) old.set(`${b.seed}`, b);
    const next: Beast[] = [];
    for (const b of ctx.mirror.buildings.values()) {
      if (b.stage !== 'built') continue;
      const def = drawDef(b.def);
      if (!def || !PEN_KITS.has(def.art.kit)) continue;
      const kit = kitById.get(def.art.kit);
      const pens = kit?.anchors?.(buildingKitOptions(b)).animals;
      if (!pens) continue;
      penAnimals(b, pens, old, next);
    }
    beasts = next;
  }

  function penAnimals(
    b: BuildingView,
    pens: { kind: AnimalKind; pen: [number, number, number, number]; count: number }[],
    old: Map<string, Beast>,
    next: Beast[],
  ): void {
    if (!ctx) return;
    const level = standLevel(ctx.mirror, b.def, b.x, b.z, b.rot);
    buildingMatrix(b.def, b.x, b.z, b.rot, level, m);
    pens.forEach((pen, pi) => {
      const [x0, z0, x1, z1] = pen.pen;
      const o = local.set(x0, 0, z0).applyMatrix4(m).clone();
      const u = local.set(x1, 0, z0).applyMatrix4(m).clone().sub(o);
      const v = local.set(x0, 0, z1).applyMatrix4(m).clone().sub(o);
      for (let i = 0; i < pen.count; i++) {
        const seed = b.id * 97 + pi * 13 + i;
        const prev = old.get(`${seed}`);
        const shape = { ox: o.x, oz: o.z, ux: u.x, uz: u.z, vx: v.x, vz: v.z };
        if (prev) {
          prev.pen = shape;
          next.push(prev);
          continue;
        }
        const beast: Beast = {
          kind: pen.kind,
          variant: Math.floor(hash2(seed, 1, 3) * 3),
          pen: shape,
          x: 0,
          z: 0,
          heading: hash2(seed, 2, 5) * Math.PI * 2,
          tx: 0,
          tz: 0,
          mode: 'graze',
          timer: 1 + hash2(seed, 3, 7) * 6,
          gait: 0,
          seed,
          rest: 0,
        };
        [beast.x, beast.z] = inPen(beast, 0.15 + hash2(seed, 4, 9) * 0.7, 0.15 + hash2(seed, 6, 2) * 0.7);
        beast.tx = beast.x;
        beast.tz = beast.z;
        next.push(beast);
      }
    });
  }

  function step(b: Beast, art: AnimalArt, dt: number, night: boolean): number {
    const target = night ? 1 : 0;
    b.rest += (target - b.rest) * Math.min(1, dt * 0.8);
    if (night) {
      b.mode = 'graze';
      return 0;
    }
    b.timer -= dt;
    let moved = 0;
    if (b.mode === 'walk') {
      const dx = b.tx - b.x;
      const dz = b.tz - b.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const want = Math.atan2(dx, dz);
      const turn = angleDelta(b.heading, want);
      b.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, turn));
      // Walk on once roughly facing the way; arrive and graze.
      if (Math.abs(turn) < 0.9) {
        const s = Math.min(d, art.pace * dt * (Math.abs(turn) < 0.3 ? 1 : 0.5));
        b.x += Math.sin(b.heading) * s;
        b.z += Math.cos(b.heading) * s;
        moved = s;
      }
      if (d < 0.04 || b.timer < -6) {
        b.mode = 'graze';
        b.timer = 4 + Math.random() * 7;
      }
    } else if (b.timer <= 0) {
      const r = Math.random();
      if (b.mode === 'graze' && r < 0.35) {
        b.mode = 'look';
        b.timer = 1.5 + Math.random() * 2.5;
      } else {
        // A few steps to somewhere nearby in the pen.
        b.mode = 'walk';
        b.timer = 0;
        const pn = b.pen;
        const lenU = Math.hypot(pn.ux, pn.uz) || 1;
        const lenV = Math.hypot(pn.vx, pn.vz) || 1;
        // Current position in pen coordinates, then a short hop from it.
        const rx = b.x - pn.ox;
        const rz = b.z - pn.oz;
        const a = (rx * pn.ux + rz * pn.uz) / (lenU * lenU);
        const c = (rx * pn.vx + rz * pn.vz) / (lenV * lenV);
        const na = Math.min(0.95, Math.max(0.05, a + (Math.random() - 0.5) * (1.4 / lenU)));
        const nc = Math.min(0.95, Math.max(0.05, c + (Math.random() - 0.5) * (1.4 / lenV)));
        [b.tx, b.tz] = inPen(b, na, nc);
      }
    }
    return moved;
  }

  function draw(dt: number): boolean {
    if (!ctx) return false;
    if (dirty) {
      dirty = false;
      collect();
    }
    clock += dt;
    for (const pl of pools.values()) {
      pl.body.begin();
      pl.head.begin();
      pl.leg.begin();
    }
    const night = (ctx.env?.night.value ?? 0) > 0.7;
    camPos.setFromMatrixPosition(ctx.camera.matrixWorld);
    const far = (ctx.env?.detailDistance ?? 80) * 1.5;
    for (const b of beasts) {
      const pl = poolsFor(b.kind, b.variant);
      if (!pl) continue;
      const art = pl.art;
      const moved = step(b, art, dt, night);
      b.gait += (moved / art.stride) * Math.PI * 2;
      const y = groundY(ctx.mirror, b.x, b.z);
      const walking = moved > 0;
      const bob = walking ? Math.abs(Math.sin(b.gait)) * 0.01 : 0;
      // Lying down: the body sinks by the leg length and the legs fold away.
      const legLen = art.hips[0]![1];
      const sink = b.rest * legLen * 0.85;
      e.set(0, b.heading, 0);
      q.setFromEuler(e);
      p.set(b.x, y + bob - sink, b.z);
      base.compose(p, q, one);
      pl.body.push(base);
      // Head: down to graze (with a little chew), level to look about, lowered asleep.
      const grazing = b.mode === 'graze' && !night;
      const chew = grazing ? Math.sin(clock * 3 + b.seed) * 0.05 : 0;
      const pitch =
        b.rest > 0.5
          ? 0.35
          : grazing
            ? 0.75 + chew
            : b.mode === 'look'
              ? -0.12 + Math.sin(clock * 0.8 + b.seed) * 0.08
              : 0.1;
      const [nx, ny, nz] = art.neck;
      e.set(pitch, b.mode === 'look' ? Math.sin(clock * 0.6 + b.seed) * 0.4 : 0, 0);
      q.setFromEuler(e);
      p.set(nx, ny, nz);
      part.compose(p, q, one);
      m.multiplyMatrices(base, part).multiply(part.makeTranslation(-nx, -ny, -nz));
      pl.head.push(m);
      p.setFromMatrixPosition(base);
      if (b.rest < 0.6 && p.distanceTo(camPos) < far) {
        art.hips.forEach(([hx, hy, hz], i) => {
          const diag = i === 0 || i === 3 ? 0 : Math.PI;
          const swing = walking ? Math.sin(b.gait + diag) * 0.5 : 0;
          e.set(swing, 0, 0);
          q.setFromEuler(e);
          p.set(hx, hy, hz);
          part.compose(p, q, one);
          pl.leg.push(m.multiplyMatrices(base, part));
        });
      }
    }
    for (const pl of pools.values()) {
      pl.body.finish();
      pl.head.finish();
      pl.leg.finish();
    }
    return beasts.length > 0;
  }

  return {
    id: 'animals',
    get count() {
      return beasts.length;
    },
    init(c) {
      ctx = c;
      dirty = true;
    },
    update(change) {
      if (change.full || change.buildings || change.rects.has('height')) dirty = true;
    },
    frame(dt) {
      return draw(dt);
    },
    dispose() {
      for (const pl of pools.values()) {
        pl.body.dispose();
        pl.head.dispose();
        pl.leg.dispose();
      }
      pools.clear();
    },
  };
}
