// R2F: random street grids for the fuzz tests (the cutter's and the storeys refit's), as steps
// against one state, so a test can paint them in any order.
import type { WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { paintZone } from '../growth/helpers';
import { S } from './helpers';

/** Roads painted in any order end the same: a crossing tile keeps the busier road. */
function roadX(s: WorldState, z: number, x0: number, x1: number, kind: number): void {
  for (let x = x0; x <= x1; x++) s.map.road[z * S + x] = Math.max(s.map.road[z * S + x]!, kind);
  s.networkVersion++;
}
function roadZ(s: WorldState, x: number, z0: number, z1: number, kind: number): void {
  for (let z = z0; z <= z1; z++) s.map.road[z * S + x] = Math.max(s.map.road[z * S + x]!, kind);
  s.networkVersion++;
}

/** A tiny seeded generator, test-side only. */
function lcg(seed: number): () => number {
  let a = seed * 2654435761 + 12345;
  return () => {
    a = (Math.imul(a, 1103515245) + 12345) >>> 0;
    return (a >>> 8) / (1 << 24);
  };
}

export interface Scene {
  roads: (() => void)[];
  zones: (() => void)[];
}

/** A random grid in the free ground east of the river, as steps against one state. */
export function scene(seed: number, s: WorldState): Scene {
  const rnd = lcg(seed);
  const int = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
  const kinds = [Road.street, Road.street, Road.street, Road.avenue, Road.lane];
  const roads: (() => void)[] = [];
  const zones: (() => void)[] = [];
  for (let k = 0; k < int(2, 3); k++) {
    const z = 108 + k * int(8, 14);
    const x0 = int(110, 120);
    const x1 = int(x0 + 14, 150);
    const kind = kinds[int(0, kinds.length - 1)]!;
    roads.push(() => roadX(s, z, x0, x1, kind));
  }
  for (let k = 0; k < int(2, 3); k++) {
    const x = 112 + k * int(8, 14);
    const z0 = int(102, 110);
    const z1 = int(z0 + 14, 150);
    const kind = kinds[int(0, kinds.length - 1)]!;
    roads.push(() => roadZ(s, x, z0, z1, kind));
  }
  const taken: [number, number, number, number][] = [];
  const names = ['homes-medium', 'shops', 'homes-low', 'crafts'];
  for (let k = 0; k < int(3, 6); k++) {
    const x0 = int(108, 150);
    const z0 = int(104, 146);
    const rect: [number, number, number, number] = [
      x0,
      z0,
      Math.min(154, x0 + int(3, 14)),
      Math.min(150, z0 + int(3, 12)),
    ];
    const zone = names[int(0, 1) === 0 ? 0 : int(0, names.length - 1)]!;
    // Zones that overlap are painted over each other, so the last wins: keep the rects apart, so
    // the final zones do not depend on the order of painting.
    if (taken.some((r) => rect[0] <= r[2] && r[0] <= rect[2] && rect[1] <= r[3] && r[1] <= rect[3])) continue;
    taken.push(rect);
    zones.push(() => paintZone(s, zone, rect));
  }
  return { roads, zones };
}
