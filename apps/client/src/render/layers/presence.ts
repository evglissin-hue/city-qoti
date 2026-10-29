import type { SeatId } from '@qoti/sim';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { CursorTrack } from '../cursorTrack';
import { levelY } from '../coords';
import { groundY } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * The partner's cursor in the world: a soft spot of their color on the ground under it, draped
 * over the slopes, gliding along the path their pointer really took (see CursorTrack) and fading
 * in and out rather than popping. The pointer and name tag on top are drawn by the interface
 * (PresenceLabels) at `presenceAt`, so the two always move together. Pings ripple out.
 */

interface Marker {
  track: CursorTrack;
  mesh: Mesh;
  geometry: BufferGeometry;
  material: MeshBasicMaterial;
  /** 0 hidden to 1 shown, and where it is heading. */
  alpha: number;
  shown: boolean;
  /** The drawn position (tiles) and the ground under it (world units). */
  x: number;
  z: number;
  y: number;
}

interface Ping {
  mesh: Mesh;
  age: number;
}

export interface PresenceLayer extends RenderLayer {
  setPresence(seat: SeatId, p: { x: number; z: number; tool?: string } | null): void;
  ping(seat: SeatId, x: number, z: number): void;
  /** Where a seat's cursor is drawn this frame (y on the ground), and how faded in it is. */
  presenceAt(seat: SeatId): { x: number; y: number; z: number; alpha: number } | null;
}

const pingRing = new RingGeometry(0.32, 0.46, 24).rotateX(-Math.PI / 2);

/** The ground spot: a faint fill, a brighter rim and a feathered edge, as rings of vertices. */
const SEGMENTS = 28;
const RADII = [0, 0.24, 0.3, 0.36, 0.44] as const;
const ALPHAS = [0.16, 0.2, 0.75, 0.75, 0] as const;
const LIFT = 0.035;
/** Fade in and out over about this long (s). */
const FADE = 0.25;

function spotGeometry(): BufferGeometry {
  const rings = RADII.length;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(rings * SEGMENTS * 3), 3));
  const colors = new Float32Array(rings * SEGMENTS * 4);
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < SEGMENTS; s++) {
      const o = (r * SEGMENTS + s) * 4;
      colors[o] = colors[o + 1] = colors[o + 2] = 1;
      colors[o + 3] = ALPHAS[r]!;
    }
  g.setAttribute('color', new BufferAttribute(colors, 4));
  const index: number[] = [];
  for (let r = 0; r + 1 < rings; r++)
    for (let s = 0; s < SEGMENTS; s++) {
      const a = r * SEGMENTS + s;
      const b = r * SEGMENTS + ((s + 1) % SEGMENTS);
      const c = a + SEGMENTS;
      const d = b + SEGMENTS;
      index.push(a, b, c, b, d, c);
    }
  g.setIndex(index);
  return g;
}

/** Lays the spot over the ground around (x, z). */
function drape(ctx: LayerContext, g: BufferGeometry, x: number, z: number): void {
  const pos = g.getAttribute('position') as BufferAttribute;
  const a = pos.array as Float32Array;
  for (let r = 0; r < RADII.length; r++) {
    const rad = RADII[r]!;
    for (let s = 0; s < SEGMENTS; s++) {
      const th = (s / SEGMENTS) * Math.PI * 2;
      const px = x + Math.cos(th) * rad;
      const pz = z + Math.sin(th) * rad;
      const o = (r * SEGMENTS + s) * 3;
      a[o] = px;
      a[o + 1] = groundY(ctx.mirror, px, pz) + LIFT;
      a[o + 2] = pz;
    }
  }
  pos.needsUpdate = true;
  g.computeBoundingSphere();
}

export function presenceLayer(): PresenceLayer {
  let ctx: LayerContext | null = null;
  const markers = new Map<SeatId, Marker>();
  const pings: Ping[] = [];
  const at = { x: 0, z: 0 };

  function colorOf(seat: SeatId): number {
    return ctx?.mirror.seats.value.find((s) => s.seat === seat)?.color ?? 0xffffff;
  }

  function markerOf(seat: SeatId): Marker | null {
    if (!ctx) return null;
    let m = markers.get(seat);
    if (!m) {
      const geometry = spotGeometry();
      const material = new MeshBasicMaterial({
        color: colorOf(seat),
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new Mesh(geometry, material);
      mesh.renderOrder = 10;
      mesh.frustumCulled = false;
      mesh.visible = false;
      ctx.scene.add(mesh);
      m = { track: new CursorTrack(), mesh, geometry, material, alpha: 0, shown: false, x: 0, z: 0, y: 0 };
      markers.set(seat, m);
    }
    return m;
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
      const m = markerOf(seat);
      if (!m || !ctx) return;
      if (p) {
        m.track.push(p.x, p.z, performance.now());
        m.shown = true;
      } else {
        m.shown = false;
      }
      ctx.invalidate();
    },
    presenceAt(seat) {
      const m = markers.get(seat);
      return m && m.alpha > 0 ? { x: m.x, y: m.y, z: m.z, alpha: m.alpha } : null;
    },
    ping(seat, x, z) {
      if (!ctx) return;
      const material = new MeshBasicMaterial({
        color: colorOf(seat),
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      });
      const mesh = new Mesh(pingRing, material);
      mesh.position.set(x + 0.5, levelY(ctx.mirror.height(x, z)) + 0.06, z + 0.5);
      ctx.scene.add(mesh);
      pings.push({ mesh, age: 0 });
      ctx.invalidate();
    },
    frame(dt) {
      if (!ctx) return false;
      let moving = false;
      const now = performance.now();
      for (const m of markers.values()) {
        const goal = m.shown ? 1 : 0;
        if (m.alpha !== goal) {
          m.alpha = goal > m.alpha ? Math.min(1, m.alpha + dt / FADE) : Math.max(0, m.alpha - dt / FADE);
          moving = true;
          if (m.alpha === 0) m.track.clear();
        }
        m.mesh.visible = m.alpha > 0;
        if (!m.mesh.visible || !m.track.at(now, at)) continue;
        if (m.track.moving(now)) moving = true;
        const dx = at.x - m.x;
        const dz = at.z - m.z;
        if (dx * dx + dz * dz > 1e-8 || m.y === 0) {
          m.x = at.x;
          m.z = at.z;
          m.y = groundY(ctx.mirror, at.x, at.z);
          drape(ctx, m.geometry, at.x, at.z);
          moving = true;
        }
        m.material.opacity = m.alpha;
      }
      for (let i = pings.length - 1; i >= 0; i--) {
        const p = pings[i]!;
        p.age += dt;
        const s = 1 + p.age * 4;
        p.mesh.scale.set(s, 1, s);
        (p.mesh.material as MeshBasicMaterial).opacity = Math.max(0, 0.8 - p.age / 1.5);
        moving = true;
        if (p.age > 1.5) {
          ctx.scene.remove(p.mesh);
          (p.mesh.material as MeshBasicMaterial).dispose();
          pings.splice(i, 1);
        }
      }
      return moving;
    },
    dispose() {
      for (const m of markers.values()) {
        ctx?.scene.remove(m.mesh);
        m.geometry.dispose();
        m.material.dispose();
      }
      markers.clear();
    },
  };
}
