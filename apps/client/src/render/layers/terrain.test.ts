import { CHUNK_SIZE, MAP_SIZE, Terrain } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../../state/mirror';
import { PIN_SPAN, SurfaceTiles } from '../surface';
import { buildTerrainChunk } from './terrain';

const at = (x: number, z: number): number => z * MAP_SIZE + x;

/** A hillside at level 5 with a field of chunks around (32, 32). */
function hill(): Mirror {
  const m = new Mirror();
  for (let z = 0; z < MAP_SIZE; z++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      m.layers.terrain[at(x, z)] = Terrain.grass;
      m.layers.height[at(x, z)] = 5;
    }
  }
  return m;
}

/** Puts a 3 x 3 building at (x, z) with its pad one level down, or takes it away again. */
function place(m: Mirror, x: number, z: number, on: boolean): void {
  for (let dz = 0; dz < 3; dz++) {
    for (let dx = 0; dx < 3; dx++) {
      m.layers.occupant[at(x + dx, z + dz)] = on ? 9 : 0;
      m.layers.height[at(x + dx, z + dz)] = on ? 4 : 5;
    }
  }
}

function chunkKey(m: Mirror, cx: number, cz: number): string {
  const g = buildTerrainChunk(new SurfaceTiles(m), cx, cz);
  if (!g) return '';
  const p = g.attributes.position!.array as Float32Array;
  const n = g.attributes.normal!.array as Float32Array;
  let h = 0;
  for (let i = 0; i < p.length; i++)
    h = (Math.imul(h, 31) + Math.round(p[i]! * 4096) + Math.round(n[i]! * 4096)) | 0;
  return `${p.length}:${h}`;
}

describe('the terrain around a placed or removed building', () => {
  it('only changes chunks the layer marks dirty (a pad eases up to two tiles out), both ways', () => {
    // Pads at every offset of a chunk's corner, so footprints touch, and nearly touch, each border.
    for (const [bx, bz] of [
      [29, 29],
      [30, 33],
      [27, 30],
      [32, 32],
      [34, 27],
    ] as const) {
      const m = hill();
      const cs = [1, 2, 3];
      const keys = (): string[] => cs.flatMap((cz) => cs.map((cx) => chunkKey(m, cx, cz)));
      const empty = keys();
      place(m, bx, bz, true);
      const built = keys();
      place(m, bx, bz, false);
      expect(keys()).toEqual(empty); // removing it puts the ground back exactly
      // The chunks the terrain layer marks for the occupant change (update(): markRect(rect, PIN_SPAN + 1)).
      const rect = [bx, bz, bx + 2, bz + 2] as const;
      const pad = PIN_SPAN + 1;
      const marked = new Set<number>();
      for (
        let cz = Math.floor((rect[1] - pad) / CHUNK_SIZE);
        cz <= Math.floor((rect[3] + pad) / CHUNK_SIZE);
        cz++
      )
        for (
          let cx = Math.floor((rect[0] - pad) / CHUNK_SIZE);
          cx <= Math.floor((rect[2] + pad) / CHUNK_SIZE);
          cx++
        )
          marked.add(cz * 100 + cx);
      let changed = 0;
      cs.forEach((cz, j) =>
        cs.forEach((cx, i) => {
          if (built[j * cs.length + i] === empty[j * cs.length + i]) return;
          changed++;
          expect(marked.has(cz * 100 + cx), `chunk ${cx},${cz} changed for a building at ${bx},${bz}`).toBe(
            true,
          );
        }),
      );
      expect(changed).toBeGreaterThan(0);
    }
  });
});
