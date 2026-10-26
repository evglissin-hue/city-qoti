// C4E: carts on the lanes (docs/spec/13-ledger.md, Streets and traffic). Carts ride in the agent
// frames as rows with anim AgentAnim.cart and their first load good. Each is drawn as a body in one
// of a few paints, two wheels that turn with the distance covered, the load on the bed, a carter
// standing at the front board and a pony between the shafts whose legs walk in step with the ground
// it covers. The sim moves carts a tile at a time; here they glide on a damped follow and turn at a
// pony's pace, tilting with the slope, so they feel calm and heavy rather than skating.
import {
  animalArt,
  cartBodyGeometry,
  cartLoadGeometry,
  cartWheelGeometry,
  CARTER_SEAT,
  kitById,
  PONY_OFFSET,
  WHEEL_RADIUS,
  WHEEL_X,
  type AnimalArt,
} from '@qoti/art';
import { content } from '@qoti/content';
import { AGENT_STRIDE, AgentAnim } from '@qoti/sim';
import { Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { AgentPlayback } from '../agentPlayback';
import { hash2 } from '../coords';
import { FramePool } from '../pool';
import { groundY } from '../surface';
import type { LayerContext, RenderLayer } from './types';

const VARIANTS = 3;
/** How quickly a cart's drawn position follows the frames (per second), and its fastest turn. */
const FOLLOW = 5;
const TURN_RATE = 2.4;
const CARTERS = ['badger', 'otter', 'rabbit'];

interface CartTrack {
  x: number;
  z: number;
  heading: number;
  wheel: number;
  gait: number;
  speed: number;
  seen: number;
  variant: number;
}

function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export interface CartsLayer extends RenderLayer {
  /** Carts drawn last frame. */
  readonly drawn: number;
}

export function cartsLayer(): CartsLayer {
  let ctx: LayerContext | null = null;
  const playback = new AgentPlayback();
  let lastLatest: Float32Array | null = null;
  const tracks = new Map<number, CartTrack>();
  const bodies: FramePool[] = [];
  const ponyParts: { body: FramePool; head: FramePool; leg: FramePool; art: AnimalArt }[] = [];
  const carters: FramePool[] = [];
  let wheels: FramePool | null = null;
  const loads = new Map<number, FramePool>();
  let serial = 0;
  let drawn = 0;
  let clock = 0;

  const m = new Matrix4();
  const base = new Matrix4();
  const part = new Matrix4();
  const q = new Quaternion();
  const e = new Euler(0, 0, 0, 'YXZ');
  const p = new Vector3();
  const one = new Vector3(1, 1, 1);

  function loadPool(good: number): FramePool | null {
    if (!ctx) return null;
    let pl = loads.get(good);
    if (!pl) {
      const id = content.goods[good]?.id ?? '';
      pl = new FramePool(ctx.scene, cartLoadGeometry(id), ctx.material);
      loads.set(good, pl);
    }
    return pl;
  }

  /** Composes base * translate(v) * rotateX(angle) into m. */
  function at(b: Matrix4, x: number, y: number, z: number, rx: number, out: Matrix4): Matrix4 {
    e.set(rx, 0, 0);
    q.setFromEuler(e);
    p.set(x, y, z);
    part.compose(p, q, one);
    return out.multiplyMatrices(b, part);
  }

  function draw(dt: number): boolean {
    if (!ctx || !wheels) return false;
    clock += dt;
    const mirror = ctx.mirror;
    const ag = mirror.agents;
    if (ag.latest !== lastLatest) {
      lastLatest = ag.latest;
      playback.push(ag.t, ag.latest);
    }
    playback.advance(dt);
    serial++;
    const sample = playback.sample();
    const L = sample?.b.data ?? ag.latest;
    const P = sample?.a.data ?? ag.latest;
    const prevIndex = sample?.a.index;
    const alpha = sample?.alpha ?? 0;
    for (const pl of bodies) pl.begin();
    for (const pp of ponyParts) {
      pp.body.begin();
      pp.head.begin();
      pp.leg.begin();
    }
    for (const c of carters) c.begin();
    for (const pl of loads.values()) pl.begin();
    wheels.begin();
    drawn = 0;
    const follow = 1 - Math.exp(-dt * FOLLOW);

    for (let o = 0; o + AGENT_STRIDE <= L.length; o += AGENT_STRIDE) {
      if (L[o + 5] !== AgentAnim.cart) continue;
      const id = L[o]!;
      let x = L[o + 1]!;
      let z = L[o + 2]!;
      let heading = L[o + 4]!;
      const carry = L[o + 6]!;
      const po = prevIndex?.get(id);
      if (po !== undefined) {
        const px = P[po + 1]!;
        const pz = P[po + 2]!;
        x = px + (x - px) * alpha;
        z = pz + (z - pz) * alpha;
        heading = P[po + 4]! + angleDelta(P[po + 4]!, heading) * alpha;
      }
      let t = tracks.get(id);
      if (!t || t.seen < serial - 30) {
        t = {
          x,
          z,
          heading,
          wheel: 0,
          gait: 0,
          speed: 0,
          seen: serial,
          variant: Math.floor(hash2(id, 5, 11) * VARIANTS),
        };
        tracks.set(id, t);
      }
      const nx = t.x + (x - t.x) * follow;
      const nz = t.z + (z - t.z) * follow;
      const dx = nx - t.x;
      const dz = nz - t.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      t.x = nx;
      t.z = nz;
      t.seen = serial;
      t.speed += ((dt > 0 ? dist / dt : 0) - t.speed) * Math.min(1, dt * 4);
      // Face the way it is rolling when it rolls, else the frame's heading; turn at a pony's pace.
      const want = dist > 0.0005 ? Math.atan2(dx, dz) : heading;
      const turn = angleDelta(t.heading, want);
      t.heading += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, turn));
      t.wheel += dist / WHEEL_RADIUS;

      const h = t.heading;
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      const cy = groundY(mirror, t.x, t.z);
      const ponyX = t.x + fx * PONY_OFFSET[2];
      const ponyZ = t.z + fz * PONY_OFFSET[2];
      const py = groundY(mirror, ponyX, ponyZ);
      const pitch = -Math.atan2(py - cy, PONY_OFFSET[2]);

      const v = t.variant;
      const pony = ponyParts[v]!;
      const art = pony.art;
      t.gait += (dist / art.stride) * Math.PI * 2;
      const walking = t.speed > 0.05;
      const bob = walking ? Math.abs(Math.sin(t.gait)) * 0.018 : Math.sin(clock * 1.3 + id) * 0.003;

      // The cart: body, wheels, load and the carter on the board.
      e.set(pitch, h, 0);
      q.setFromEuler(e);
      p.set(t.x, cy + bob * 0.3, t.z);
      base.compose(p, q, one);
      bodies[v]!.push(base);
      for (const wx of [-WHEEL_X, WHEEL_X]) wheels.push(at(base, wx, WHEEL_RADIUS, 0, t.wheel, m));
      if (carry > 0) loadPool(carry - 1)?.push(base);
      carters[Math.floor(hash2(id, 9, 3) * carters.length)]!.push(
        at(base, CARTER_SEAT[0], CARTER_SEAT[1] - 0.06 + bob * 0.5, CARTER_SEAT[2], 0, m),
      );

      // The pony: legs in diagonal pairs, the head nodding with the step.
      e.set(0, h, 0);
      q.setFromEuler(e);
      p.set(ponyX, py, ponyZ);
      base.compose(p, q, one);
      pony.body.push(at(base, 0, bob, 0, 0, m));
      const nod = walking ? Math.sin(t.gait * 2) * 0.06 : Math.sin(clock * 0.7 + id) * 0.05;
      const [nx0, ny0, nz0] = art.neck;
      at(base, nx0, ny0 + bob, nz0, nod, m);
      pony.head.push(m.multiply(part.makeTranslation(-nx0, -ny0, -nz0)));
      art.hips.forEach(([hx, hy, hz], i) => {
        const diag = i === 0 || i === 3 ? 0 : Math.PI;
        const swing = walking ? Math.sin(t.gait + diag) * 0.45 : 0;
        pony.leg.push(at(base, hx, hy + bob, hz, swing, m));
      });
      drawn++;
    }

    for (const pl of bodies) pl.finish();
    for (const pp of ponyParts) {
      pp.body.finish();
      pp.head.finish();
      pp.leg.finish();
    }
    for (const c of carters) c.finish();
    for (const pl of loads.values()) pl.finish();
    wheels.finish();
    if (serial % 120 === 0) for (const [id, t] of tracks) if (t.seen < serial - 600) tracks.delete(id);
    return drawn > 0;
  }

  return {
    id: 'carts',
    get drawn() {
      return drawn;
    },
    init(c) {
      ctx = c;
      for (let v = 0; v < VARIANTS; v++) {
        bodies.push(new FramePool(c.scene, cartBodyGeometry(v), c.material));
        const art = animalArt('pony', v);
        ponyParts.push({
          art,
          body: new FramePool(c.scene, art.body.clone(), c.material),
          head: new FramePool(c.scene, art.head.clone(), c.material),
          leg: new FramePool(c.scene, art.leg.clone(), c.material),
        });
      }
      wheels = new FramePool(c.scene, cartWheelGeometry(), c.material);
      const resident = kitById.get('resident');
      CARTERS.forEach((species, i) => {
        const g: BufferGeometry | undefined = resident?.build({ params: { species, look: 41 + i * 13 } });
        if (g) carters.push(new FramePool(c.scene, g.scale(1.3, 1.3, 1.3), c.material));
      });
    },
    update() {},
    frame(dt) {
      return draw(dt);
    },
    dispose() {
      for (const pl of bodies) pl.dispose();
      for (const pp of ponyParts) {
        pp.body.dispose();
        pp.head.dispose();
        pp.leg.dispose();
      }
      for (const c of carters) c.dispose();
      for (const pl of loads.values()) pl.dispose();
      wheels?.dispose();
    },
  };
}
