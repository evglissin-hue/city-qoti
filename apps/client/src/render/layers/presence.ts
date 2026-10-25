import type { SeatId } from '@qoti/sim';
import { ConeGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';
import { levelY } from '../coords';
import type { LayerContext, RenderLayer } from './types';

interface Marker {
  group: Group;
  material: MeshBasicMaterial;
  goal: Vector3;
}

interface Ping {
  mesh: Mesh;
  age: number;
}

export interface PresenceLayer extends RenderLayer {
  setPresence(seat: SeatId, p: { x: number; z: number; tool?: string } | null): void;
  ping(seat: SeatId, x: number, z: number): void;
}

const ring = new RingGeometry(0.32, 0.46, 24).rotateX(-Math.PI / 2);
const cone = new ConeGeometry(0.16, 0.4, 4).rotateX(Math.PI);

/** A colored marker at each other seat's cursor, gliding between updates; pings ripple out. */
export function presenceLayer(): PresenceLayer {
  let ctx: LayerContext | null = null;
  const markers = new Map<SeatId, Marker>();
  const pings: Ping[] = [];

  function colorOf(seat: SeatId): number {
    return ctx?.mirror.seats.value.find((s) => s.seat === seat)?.color ?? 0xffffff;
  }

  return {
    id: 'presence',
    init(c) {
      ctx = c;
    },
    update(change) {
      if (!change.seats) return;
      for (const [seat, m] of markers) m.material.color.setHex(colorOf(seat));
    },
    setPresence(seat, p) {
      if (!ctx) return;
      let m = markers.get(seat);
      if (!p) {
        if (m) m.group.visible = false;
        ctx.invalidate();
        return;
      }
      const y = levelY(ctx.mirror.height(p.x, p.z)) + 0.05;
      if (!m) {
        const material = new MeshBasicMaterial({
          color: colorOf(seat),
          transparent: true,
          opacity: 0.9,
          depthTest: false,
        });
        const group = new Group();
        group.add(new Mesh(ring, material));
        const tip = new Mesh(cone, material);
        tip.position.y = 0.9;
        group.add(tip);
        group.renderOrder = 10;
        group.position.set(p.x + 0.5, y, p.z + 0.5);
        ctx.scene.add(group);
        m = { group, material, goal: new Vector3() };
        markers.set(seat, m);
      }
      m.group.visible = true;
      m.goal.set(p.x + 0.5, y, p.z + 0.5);
      ctx.invalidate();
    },
    ping(seat, x, z) {
      if (!ctx) return;
      const material = new MeshBasicMaterial({
        color: colorOf(seat),
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      });
      const mesh = new Mesh(ring, material);
      mesh.position.set(x + 0.5, levelY(ctx.mirror.height(x, z)) + 0.06, z + 0.5);
      ctx.scene.add(mesh);
      pings.push({ mesh, age: 0 });
      ctx.invalidate();
    },
    frame(dt) {
      let moving = false;
      for (const m of markers.values()) {
        if (!m.group.visible) continue;
        const d = m.group.position.distanceTo(m.goal);
        if (d > 0.01) {
          m.group.position.lerp(m.goal, 1 - Math.exp(-dt * 14));
          moving = true;
        }
      }
      for (let i = pings.length - 1; i >= 0; i--) {
        const p = pings[i]!;
        p.age += dt;
        const s = 1 + p.age * 4;
        p.mesh.scale.set(s, 1, s);
        (p.mesh.material as MeshBasicMaterial).opacity = Math.max(0, 0.8 - p.age / 1.5);
        moving = true;
        if (p.age > 1.5) {
          ctx?.scene.remove(p.mesh);
          (p.mesh.material as MeshBasicMaterial).dispose();
          pings.splice(i, 1);
        }
      }
      return moving;
    },
    dispose() {
      for (const m of markers.values()) {
        ctx?.scene.remove(m.group);
        m.material.dispose();
      }
      markers.clear();
    },
  };
}
