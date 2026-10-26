import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../src/constants';
import type { MapLayers } from '../src/contracts';
import { Flags, LAYER_NAMES, Road, Terrain } from '../src/map/layers';
import { generateValley } from '../src/map/worldgen';
import { defaultSettings } from '../src/state/create';
import { fnv64Hex } from '../src/state/hash';

const S = MAP_SIZE;
const SEEDS = ['alpha', 'beta', 'gamma', 'delta', 'orchard', 'millpond'];

function layersHash(map: MapLayers): string {
  const parts = LAYER_NAMES.map((n) => {
    const layer = map[n];
    return fnv64Hex(new Uint8Array(layer.buffer, layer.byteOffset, layer.byteLength));
  });
  return parts.join(':');
}

/** Water tiles connected (4-neighbor) to the first edge must reach the opposite edge. */
function riverSpans(map: MapLayers, flow: 'ns' | 'we'): boolean {
  const seen = new Uint8Array(S * S);
  const queue: number[] = [];
  for (let k = 0; k < S; k++) {
    const i = flow === 'ns' ? k : k * S;
    if (map.water[i]) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % S;
    const z = Math.floor(i / S);
    if ((flow === 'ns' && z === S - 1) || (flow === 'we' && x === S - 1)) return true;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
      const n = nz * S + nx;
      if (!seen[n] && map.water[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return false;
}

/** Road tiles connected to the gate must include the start area. */
function laneReachesStart(map: MapLayers, gate: [number, number]): boolean {
  const seen = new Uint8Array(S * S);
  const queue = [gate[1] * S + gate[0]];
  seen[queue[0]!] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    if (map.flags[i]! & Flags.startArea) return true;
    const x = i % S;
    const z = Math.floor(i / S);
    for (const n of [i + 1, i - 1, i + S, i - S]) {
      if (n < 0 || n >= S * S || seen[n] || !map.road[n]) continue;
      if (Math.abs((n % S) - x) + Math.abs(Math.floor(n / S) - z) !== 1) continue;
      if (Math.abs(map.height[n]! - map.height[i]!) > 1) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return false;
}

describe('worldgen v0', () => {
  it('is deterministic: same seed, same valley', () => {
    const a = generateValley('alpha', defaultSettings());
    const b = generateValley('alpha', defaultSettings());
    expect(layersHash(a.map)).toBe(layersHash(b.map));
    expect(a.meta).toEqual(b.meta);
    expect(a.worldgenRng).toEqual(b.worldgenRng);
    expect(layersHash(generateValley('beta', defaultSettings()).map)).not.toBe(layersHash(a.map));
  });

  for (const seed of SEEDS) {
    it(`builds a sound valley for "${seed}"`, () => {
      const { map, meta } = generateValley(seed, defaultSettings());
      expect(riverSpans(map, meta.flow)).toBe(true);

      for (let i = 0; i < S * S; i++) {
        expect(map.height[i]).toBeLessThanOrEqual(15);
        if (map.water[i]) {
          expect(map.terrain[i]).toBe(Terrain.water);
          expect(map.height[i]).toBe(0);
        }
        expect(map.fertility[i]).toBeLessThanOrEqual(100);
      }
      // Border ring of mountains, except where the river cuts through.
      for (let k = 0; k < S; k++) {
        const i = k;
        if (!map.water[i]) expect(map.terrain[i]).toBe(Terrain.mountain);
      }

      // Start area: 24 x 24, flagged, height spread at most 2, no rock, treeless center.
      const [x0, z0, x1, z1] = meta.startArea;
      expect(x1 - x0 + 1).toBe(24);
      expect(z1 - z0 + 1).toBe(24);
      let hMin = 99;
      let hMax = -1;
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const i = z * S + x;
          expect(map.flags[i]! & Flags.startArea).toBeTruthy();
          expect(map.water[i]).toBe(0);
          expect(map.terrain[i]).not.toBe(Terrain.rock);
          hMin = Math.min(hMin, map.height[i]!);
          hMax = Math.max(hMax, map.height[i]!);
          if (x >= x0 + 4 && x < x0 + 20 && z >= z0 + 4 && z < z0 + 20) expect(map.tree[i]).toBe(0);
        }
      }
      expect(hMax - hMin).toBeLessThanOrEqual(2);

      // Valley gate on the map edge, with a walkable lane to the start area.
      const [gx, gz] = meta.valleyGate;
      expect(gx === 0 || gz === 0 || gx === S - 1 || gz === S - 1).toBe(true);
      const gate = gz * S + gx;
      expect(map.flags[gate]! & Flags.valleyGate).toBeTruthy();
      expect(map.road[gate]).toBe(Road.lane);
      expect(laneReachesStart(map, meta.valleyGate)).toBe(true);

      // Some forest.
      let trees = 0;
      for (let i = 0; i < S * S; i++) if (map.tree[i]) trees++;
      expect(trees).toBeGreaterThan(500);
    });
  }
});
