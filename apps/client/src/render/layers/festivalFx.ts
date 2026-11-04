import { BONFIRE_FLAME, seeded } from '@qoti/art';
import {
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { decorMatrix } from '../kitGeometry';
import type { LayerContext, RenderLayer } from './types';

const FLAMES_PER_FIRE = 3;
const EMBERS_PER_FIRE = 6;
const MAX_FIRES = 24;
/** A show is this many rockets, one every SHOW_GAP seconds. */
const ROCKETS = 16;
const SHOW_GAP = 2.4;
const SPARKS = 36;
const RISE = 2.6;
const BURST = 3.2;
/** Soft, warm firework colors: gold, rose, sky, mint, lilac. Never white-hot. */
const SPARK_COLORS = [0xffd27a, 0xf4a0b0, 0x9cc8f0, 0xb8e0a8, 0xc8b0f0];

interface Rocket {
  at: Vector3;
  start: number;
  color: Color;
  height: number;
}

/**
 * C5E: festival effects that move on their own (a moving layer, never cached, no sun shadows): the
 * bonfire's flames licking and leaning and embers drifting up and fading, and fireworks for a
 * rank-up or a sealed Charter (the `fireworks` together moment). Fireworks are gentle on purpose
 * (accessibility, 17-presentation.md): each burst blooms over a second and fades over three, in
 * soft colors, and nothing lights the sky or the town: no flashing.
 */
export interface FestivalFxLayer extends RenderLayer {
  /** Starts a fireworks show over a point (world x, z), or over the town's middle. */
  fireworks(x?: number, z?: number): void;
}

export function festivalFxLayer(): FestivalFxLayer {
  let ctx: LayerContext | null = null;
  let fires: Vector3[] = [];
  let flames: InstancedMesh | null = null;
  let embers: InstancedMesh | null = null;
  let sparks: InstancedMesh | null = null;
  let rockets: Rocket[] = [];
  let time = 0;
  const flameGeo = new ConeGeometry(0.11, 0.46, 7, 1, false).translate(0, 0.23, 0);
  const emberGeo = new IcosahedronGeometry(0.012, 0);
  const sparkGeo = new IcosahedronGeometry(0.05, 0);
  const flameMat = new MeshBasicMaterial({
    color: 0xffa040,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const emberMat = new MeshBasicMaterial({ color: 0xffc070 });
  const sparkMat = new MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
  const m = new Matrix4();
  const q = new Quaternion();
  const sc = new Vector3();
  const p = new Vector3();
  const up = new Vector3(0, 1, 0);
  const tilt = new Vector3();
  const flameColors = [new Color(0xffb347), new Color(0xff8a3a), new Color(0xffd27a)];

  function clearFires(): void {
    for (const im of [flames, embers]) {
      if (!im) continue;
      ctx?.scene.remove(im);
      im.dispose();
    }
    flames = null;
    embers = null;
  }

  function rebuild(): void {
    if (!ctx) return;
    clearFires();
    const mirror = ctx.mirror;
    fires = [];
    for (const d of mirror.decor.values()) {
      if (d.def !== 'bonfire' || fires.length >= MAX_FIRES) continue;
      decorMatrix(mirror, d.fx, d.fz, d.rot, m);
      fires.push(new Vector3(...BONFIRE_FLAME).applyMatrix4(m));
    }
    if (fires.length) {
      flames = new InstancedMesh(flameGeo, flameMat, fires.length * FLAMES_PER_FIRE);
      embers = new InstancedMesh(emberGeo, emberMat, fires.length * EMBERS_PER_FIRE);
      for (let i = 0; i < flames.count; i++) flames.setColorAt(i, flameColors[i % 3]!);
      for (const im of [flames, embers]) {
        im.instanceMatrix.setUsage(DynamicDrawUsage);
        im.frustumCulled = false;
        im.castShadow = false;
        im.renderOrder = 3;
        ctx.scene.add(im);
      }
    }
    animate(0);
    ctx.invalidate();
  }

  function startShow(x: number, z: number): void {
    if (!ctx) return;
    const rnd = seeded(Math.floor(time * 1000) + 1);
    const y = 0;
    rockets = [];
    for (let i = 0; i < ROCKETS; i++) {
      rockets.push({
        at: new Vector3(x + (rnd() - 0.5) * 8, y, z + (rnd() - 0.5) * 8),
        start: time + 0.5 + i * SHOW_GAP + rnd() * 0.8,
        color: new Color(SPARK_COLORS[Math.floor(rnd() * SPARK_COLORS.length)]!),
        height: 7 + rnd() * 4,
      });
    }
    if (!sparks) {
      sparks = new InstancedMesh(sparkGeo, sparkMat, ROCKETS * (SPARKS + 1));
      sparks.instanceMatrix.setUsage(DynamicDrawUsage);
      sparks.frustumCulled = false;
      sparks.castShadow = false;
      sparks.renderOrder = 4;
      for (let i = 0; i < sparks.count; i++) sparks.setColorAt(i, new Color(1, 1, 1));
      ctx.scene.add(sparks);
    }
    let i = 0;
    for (const r of rockets) {
      sparks.setColorAt(i++, new Color(0xffe0a0));
      for (let k = 0; k < SPARKS; k++) sparks.setColorAt(i++, r.color);
    }
    if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    ctx.invalidate();
  }

  function townMiddle(): [number, number] {
    const mirror = ctx!.mirror;
    const green = mirror.patterns.get('village-green')?.sites[0];
    if (green) return [green.x + 0.5, green.z + 0.5];
    const [x0, z0, x1, z1] = mirror.meta.startArea;
    return [(x0! + x1! + 1) / 2, (z0! + z1! + 1) / 2];
  }

  function animate(dt: number): void {
    time += dt;
    if (flames && embers) {
      let fi = 0;
      let ei = 0;
      for (let f = 0; f < fires.length; f++) {
        const base = fires[f]!;
        for (let k = 0; k < FLAMES_PER_FIRE; k++, fi++) {
          // Three tongues, each swelling and leaning on its own slow beat.
          const ph = time * (2.1 + k * 0.6) + f * 1.7 + k * 2.1;
          const h = 0.8 + 0.22 * Math.sin(ph) + 0.1 * Math.sin(ph * 2.3 + 1);
          const w = 1 - k * 0.22 + 0.06 * Math.sin(ph * 1.7);
          tilt.set(Math.sin(ph * 0.7) * 0.18 + 0.05, 1, Math.cos(ph * 0.9) * 0.15).normalize();
          q.setFromUnitVectors(up, tilt);
          const a = (k / FLAMES_PER_FIRE) * Math.PI * 2 + f;
          p.set(base.x + Math.cos(a) * 0.04 * k, base.y, base.z + Math.sin(a) * 0.04 * k);
          m.compose(p, q, sc.set(w, h * (1 - k * 0.15), w));
          flames.setMatrixAt(fi, m);
        }
        for (let k = 0; k < EMBERS_PER_FIRE; k++, ei++) {
          // Embers rise, wander and shrink away; no blinking.
          const life = (time / 2.6 + k / EMBERS_PER_FIRE + f * 0.31) % 1;
          const a = k * 2.4 + f;
          p.set(
            base.x + Math.sin(a + life * 3) * 0.12 * life,
            base.y + 0.2 + life * 1.1,
            base.z + Math.cos(a + life * 2) * 0.12 * life,
          );
          m.compose(p, q.identity(), sc.setScalar(Math.max(0.001, 1 - life)));
          embers.setMatrixAt(ei, m);
        }
      }
      flames.instanceMatrix.needsUpdate = true;
      embers.instanceMatrix.needsUpdate = true;
    }
    if (sparks) {
      let i = 0;
      let live = false;
      for (let r = 0; r < rockets.length; r++) {
        const rk = rockets[r]!;
        const t = time - rk.start;
        // The rocket: a small spark climbing, slowing as it goes.
        if (t > 0 && t < RISE) {
          const k = t / RISE;
          p.set(rk.at.x, rk.at.y + rk.height * (1 - (1 - k) * (1 - k)), rk.at.z);
          m.compose(p, q.identity(), sc.setScalar(0.5));
          live = true;
        } else m.compose(p.set(0, -50, 0), q.identity(), sc.setScalar(0.001));
        sparks.setMatrixAt(i++, m);
        // The burst: a sphere of sparks blooming out, drooping and shrinking away.
        const b = t - RISE;
        for (let k = 0; k < SPARKS; k++, i++) {
          if (b <= 0 || b >= BURST) {
            m.compose(p.set(0, -50, 0), q.identity(), sc.setScalar(0.001));
            sparks.setMatrixAt(i, m);
            continue;
          }
          live = true;
          const u = b / BURST;
          // Fibonacci sphere directions, so the burst is round without randomness.
          const yk = 1 - (2 * (k + 0.5)) / SPARKS;
          const rk2 = Math.sqrt(1 - yk * yk);
          const th = k * 2.39996;
          const reach = 2.2 * (1 - (1 - Math.min(1, u * 1.6)) ** 2);
          p.set(
            rk.at.x + Math.cos(th) * rk2 * reach,
            rk.at.y + rk.height + yk * reach - u * u * 1.4,
            rk.at.z + Math.sin(th) * rk2 * reach,
          );
          const size = Math.min(1, u * 4) * (1 - u) * 1.3;
          m.compose(p, q.identity(), sc.setScalar(Math.max(0.001, size)));
          sparks.setMatrixAt(i, m);
        }
      }
      sparks.instanceMatrix.needsUpdate = true;
      if (!live && rockets.length && time > rockets[rockets.length - 1]!.start + RISE + BURST) {
        rockets = [];
        ctx?.scene.remove(sparks);
        sparks.dispose();
        sparks = null;
      }
    }
  }

  return {
    id: 'festival-fx',
    motion: 'moving',
    init(c) {
      ctx = c;
      rebuild();
      if (typeof location !== 'undefined' && /[?&]fireworks\b/.test(location.search)) {
        const [x, z] = townMiddle();
        startShow(x, z);
      }
    },
    update(change) {
      if (change.full || change.decor || change.rects.has('height')) rebuild();
      if (change.together.includes('fireworks')) {
        const [x, z] = townMiddle();
        startShow(x, z);
      }
    },
    frame(dt) {
      if (!flames && !sparks) return false;
      animate(dt);
      return true;
    },
    fireworks(x, z) {
      if (!ctx) return;
      const [mx, mz] = townMiddle();
      startShow(x ?? mx, z ?? mz);
    },
    dispose() {
      clearFires();
      if (sparks) {
        ctx?.scene.remove(sparks);
        sparks.dispose();
      }
      for (const g of [flameGeo, emberGeo, sparkGeo]) g.dispose();
      for (const mt of [flameMat, emberMat, sparkMat]) mt.dispose();
    },
  };
}
