import { Flags, MAP_SIZE } from '@qoti/sim';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial } from 'three';
import { levelY } from '../coords';
import { WATER_Y } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/** How far over the floodplain's highest ground the flood stands at its height. */
const FLOOD_OVER = 0.1;
/** Share of the event spent rising, and falling. */
const RISE = 0.25;
const FALL = 0.35;

const debugFlood = (): number | null => {
  if (typeof location === 'undefined' || !/[?&]debug\b/.test(location.search)) return null;
  const m = /[?&]flood=([\d.]+)/.exec(location.search);
  return m ? Math.min(1, Math.max(0, Number(m[1]))) : null;
};

/** 0 to 1 through a flood event: rising, standing, then falling away. */
export function floodLevel(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  if (t < RISE) return t / RISE;
  if (t > 1 - FALL) return (1 - t) / FALL;
  return 1;
}

/**
 * C5E: flood water over the floodplain (C5A's flood event, 14-challenge.md's weather): one flat
 * sheet of brown-green water laid over every floodplain tile and the river beside it, raised from
 * the river's line to just over the plain's highest ground as the flood rises and lowered as it falls, so the ground itself draws the shoreline as it creeps up the
 * plain and back. A moving layer (its level changes with the clock); it casts no shadow. With
 * `?debug&flood=0.6` the level is pinned for review.
 */
export function floodLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let mesh: Mesh | null = null;
  let shown = -1;
  /** The flood's height at its peak: just over the plain's highest tile. */
  let top = WATER_Y + 0.34;
  const pinned = debugFlood();
  const material = new MeshStandardMaterial({
    color: 0x7f8f74,
    roughness: 0.35,
    metalness: 0,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });

  function sheet(): BufferGeometry | null {
    const mirror = ctx!.mirror;
    const flags = mirror.layers.flags as Uint8Array;
    const N = MAP_SIZE;
    // The plain, and the river beside it (the river swells too), in runs along x, one quad each,
    // padded a little so the sheet leaves no seam.
    const wet = new Uint8Array(N * N);
    let high = 0;
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        if (!(flags[z * N + x]! & Flags.floodplain)) continue;
        high = Math.max(high, mirror.height(x, z));
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++) {
            const i = (z + dz) * N + x + dx;
            if (x + dx < 0 || z + dz < 0 || x + dx >= N || z + dz >= N) continue;
            if ((dx === 0 && dz === 0) || mirror.water(x + dx, z + dz)) wet[i] = 1;
          }
      }
    top = levelY(high) + FLOOD_OVER;
    const pos: number[] = [];
    for (let z = 0; z < N; z++) {
      let x = 0;
      while (x < N) {
        if (!wet[z * N + x]) {
          x++;
          continue;
        }
        const x0 = x;
        while (x < N && wet[z * N + x]) x++;
        const a = x0 - 0.25;
        const b = x + 0.25;
        const c = z - 0.25;
        const d = z + 1.25;
        pos.push(a, 0, c, a, 0, d, b, 0, d, a, 0, c, b, 0, d, b, 0, c);
      }
    }
    if (!pos.length) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const n = new Float32Array(pos.length);
    for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('normal', new Float32BufferAttribute(n, 3));
    g.computeBoundingSphere();
    return g;
  }

  function level(): number {
    if (pinned !== null) return pinned;
    const m = ctx?.mirror;
    const ev = m?.weather.value?.events.find((e) => e.event === 'flood' && e.active);
    if (!m || !ev || ev.end <= ev.start) return 0;
    return floodLevel((m.tick.value - ev.start) / (ev.end - ev.start));
  }

  function clear(): void {
    if (!mesh) return;
    ctx?.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh = null;
  }

  return {
    id: 'flood',
    motion: 'moving',
    init(c) {
      ctx = c;
    },
    update(change) {
      // The plain is fixed with the map; a new map (a load) rebuilds the sheet.
      if (change.full) clear();
    },
    frame() {
      if (!ctx) return false;
      const k = level();
      if (k <= 0.001) {
        if (mesh) {
          clear();
          shown = -1;
          return true;
        }
        return false;
      }
      if (!mesh) {
        const g = sheet();
        if (!g) return false;
        mesh = new Mesh(g, material);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.renderOrder = 2;
        ctx.scene.add(mesh);
      }
      const y = WATER_Y + 0.01 + k * (top - WATER_Y);
      if (Math.abs(y - shown) < 0.0005) return false;
      shown = y;
      mesh.position.y = y;
      mesh.updateMatrix();
      return true;
    },
    dispose() {
      clear();
      material.dispose();
    },
  };
}
