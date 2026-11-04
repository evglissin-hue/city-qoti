import { seeded, ShapeBuilder } from '@qoti/art';
import { MAP_SIZE } from '@qoti/sim';
import {
  BufferGeometry,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { groundY } from '../surface';
import type { LayerContext, RenderLayer } from './types';

const GROUND_CROWS = 9;
const AIR_CROWS = 4;
/** Signs show this far out from the town's middle, toward the raid's side. */
const TRACKS_FROM = 9;
const CROWS_AT = 15;

/** A small crow: body, head, beak and tail, facing +z, standing on y 0. */
function crowGeometry(): BufferGeometry {
  const s = new ShapeBuilder();
  const ink = 0x2b2f38;
  s.blob(0, 0.06, 0, 0.035, 0.032, 0.055, ink, 0);
  s.blob(0, 0.095, 0.045, 0.024, 0.022, 0.024, ink, 0);
  s.cylinder(0, 0.05, 0.008, 0, 0.09, 0.09, 0x4a4438, 4);
  s.box(-0.012, 0.055, -0.1, 0.012, 0.065, -0.04, ink);
  s.box(-0.01, 0, -0.005, -0.004, 0.03, 0.005, 0x4a4438);
  s.box(0.004, 0, -0.005, 0.01, 0.03, 0.005, 0x4a4438);
  // Folded wings, a touch of blue sheen.
  s.blob(-0.03, 0.065, -0.01, 0.01, 0.022, 0.045, 0x353b48, 0);
  s.blob(0.03, 0.065, -0.01, 0.01, 0.022, 0.045, 0x353b48, 0);
  return s.build(false);
}

/**
 * C5E: telegraph signs of a coming raid (docs/spec/14-challenge.md, Raid telegraph), drawn on the
 * side it will come from once the Watch has seen them: lines of tracks walking in from the
 * valley's edge (dark in snow, muddy on grass), and crows gathering in a field, a few circling over.
 * A moving layer (the crows peck and hop); the tracks are one small mesh.
 */
export function telegraphLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let key = '';
  let tracks: Mesh | null = null;
  let crows: InstancedMesh | null = null;
  let flock: Vector3 | null = null;
  let time = 0;
  const crowGeo = crowGeometry();
  const crowMat = new MeshLambertMaterial({ vertexColors: true });
  const trackMat = new MeshBasicMaterial({
    color: 0x4b4f5a,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const one = new Vector3(1, 1, 1);
  /** Crows are drawn a little larger than life, so a gathering reads from the default camera. */
  const CROW = 1.5;

  function middle(): [number, number] {
    const [x0, z0, x1, z1] = ctx!.mirror.meta.startArea;
    return [(x0! + x1! + 1) / 2, (z0! + z1! + 1) / 2];
  }

  function clear(): void {
    for (const o of [tracks, crows]) {
      if (!o) continue;
      ctx?.scene.remove(o);
      if (o instanceof InstancedMesh) o.dispose();
      else o.geometry.dispose();
    }
    tracks = null;
    crows = null;
    flock = null;
  }

  function rebuild(): void {
    if (!ctx) return;
    const t = ctx.mirror.threat.value;
    const debug =
      typeof location !== 'undefined' &&
      /[?&]debug\b/.test(location.search) &&
      /[?&]omens\b/.test(location.search);
    const live = !!t?.band && !!t.side;
    const side = live ? t!.side : debug ? 'n' : null;
    const signs = live ? t!.signs : debug ? ['tracks', 'crows'] : [];
    const k = side ? `${side}:${signs.join(',')}` : '';
    if (k === key) return;
    key = k;
    clear();
    if (!side) return;
    const mirror = ctx.mirror;
    const [mx, mz] = middle();
    const dir = side === 'n' ? [0, -1] : side === 's' ? [0, 1] : side === 'e' ? [1, 0] : [-1, 0];
    const across = [-dir[1]!, dir[0]!];
    const edge = side === 'n' ? mz : side === 's' ? MAP_SIZE - mz : side === 'e' ? MAP_SIZE - mx : mx;
    if (signs.includes('tracks')) {
      // Three trails of paired prints from the edge to within TRACKS_FROM of the middle.
      const pos: number[] = [];
      const rnd = seeded(91);
      for (let trail = 0; trail < 3; trail++) {
        const off = (trail - 1) * 1.6 + rnd() * 0.6;
        for (let d = edge - 2; d > TRACKS_FROM; d -= 0.32) {
          const wob = Math.sin(d * 0.37 + trail * 2) * 0.9 + off;
          for (const lr of [-1, 1]) {
            const step = lr * 0.06;
            const x = mx + dir[0]! * (d + (lr > 0 ? 0.16 : 0)) + across[0]! * (wob + step);
            const z = mz + dir[1]! * (d + (lr > 0 ? 0.16 : 0)) + across[1]! * (wob + step);
            if (x < 1 || z < 1 || x > MAP_SIZE - 1 || z > MAP_SIZE - 1) continue;
            if (mirror.water(Math.floor(x), Math.floor(z))) continue;
            const y = groundY(mirror, x, z) + 0.035;
            const a = 0.045;
            const b = 0.065;
            // A little oval, long along the way they walk.
            const ux = dir[0]! * b;
            const uz = dir[1]! * b;
            const vx = across[0]! * a;
            const vz = across[1]! * a;
            pos.push(x - ux - vx, y, z - uz - vz, x + ux - vx, y, z + uz - vz, x + ux + vx, y, z + uz + vz);
            pos.push(x - ux - vx, y, z - uz - vz, x + ux + vx, y, z + uz + vz, x - ux + vx, y, z - uz + vz);
          }
        }
      }
      if (pos.length) {
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(pos, 3));
        g.computeBoundingSphere();
        tracks = new Mesh(g, trackMat);
        tracks.castShadow = false;
        tracks.renderOrder = 1;
        ctx.scene.add(tracks);
      }
    }
    if (signs.includes('crows')) {
      const d = Math.min(CROWS_AT, Math.max(4, edge - 4));
      flock = new Vector3(mx + dir[0]! * d + across[0]! * 3, 0, mz + dir[1]! * d + across[1]! * 3);
      crows = new InstancedMesh(crowGeo, crowMat, GROUND_CROWS + AIR_CROWS);
      crows.instanceMatrix.setUsage(DynamicDrawUsage);
      crows.frustumCulled = false;
      crows.castShadow = false;
      ctx.scene.add(crows);
    }
    animate(0);
    ctx.invalidate();
  }

  function animate(dt: number): void {
    time += dt;
    if (!crows || !flock || !ctx) return;
    const mirror = ctx.mirror;
    for (let i = 0; i < GROUND_CROWS; i++) {
      // Each crow pecks about its own spot and hops to a new one now and then.
      const a = i * 2.39996;
      const r = 0.3 + (i % 4) * 0.28;
      const hop = Math.floor(time / 3.1 + i * 0.37);
      const hx = Math.sin(hop * 1.7 + i) * 0.25;
      const hz = Math.cos(hop * 2.3 + i) * 0.25;
      const x = flock.x + Math.cos(a) * r + hx;
      const z = flock.z + Math.sin(a) * r + hz;
      const ph = (time / 3.1 + i * 0.37) % 1;
      const lift = ph < 0.08 ? Math.sin((ph / 0.08) * Math.PI) * 0.06 : 0;
      const peck = Math.max(0, Math.sin(time * 4 + i * 1.3)) * 0.5;
      e.set(peck, a + hop, 0);
      q.setFromEuler(e);
      p.set(x, groundY(mirror, x, z) + lift, z);
      m.compose(p, q, one.setScalar(CROW));
      crows.setMatrixAt(i, m);
    }
    for (let i = 0; i < AIR_CROWS; i++) {
      // A few wheel slowly overhead, wings out.
      const a = time * 0.35 + (i / AIR_CROWS) * Math.PI * 2;
      p.set(flock.x + Math.cos(a) * 2.2, 2.6 + Math.sin(time * 0.8 + i) * 0.2, flock.z + Math.sin(a) * 2.2);
      e.set(0, -a, 0.3);
      q.setFromEuler(e);
      m.compose(p, q, one.set(1.6 * CROW, 0.6 * CROW, 1.2 * CROW));
      crows.setMatrixAt(GROUND_CROWS + i, m);
    }
    crows.instanceMatrix.needsUpdate = true;
  }

  let timer = 0;
  return {
    id: 'telegraph',
    motion: 'moving',
    init(c) {
      ctx = c;
      rebuild();
    },
    update(change) {
      if (change.full || change.seasons) rebuild();
    },
    frame(dt) {
      timer -= dt;
      if (timer <= 0) {
        timer = 1;
        rebuild();
      }
      if (!crows) return false;
      animate(dt);
      return true;
    },
    dispose() {
      clear();
      crowGeo.dispose();
      crowMat.dispose();
      trackMat.dispose();
    },
  };
}
