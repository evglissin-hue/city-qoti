import { CHUNKS_PER_SIDE, createValley, defaultSettings, MAP_SIZE, type WorldState } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { levelY } from './coords';
import { buildTerrainChunk } from './layers/terrain';
import { surfaceY, SurfaceTiles, tileSurfaceY, type SurfaceReader } from './surface';

function grid(levels: number[][], water: number[][] = [], pins: number[][] = []): SurfaceReader {
  const at = (rows: number[][], x: number, z: number) => rows[z]?.[x] ?? 0;
  const clamp = (v: number, n: number) => Math.max(0, Math.min(n - 1, v));
  return {
    height: (x, z) => at(levels, clamp(x, levels[0]!.length), clamp(z, levels.length)),
    water: (x, z) => at(water, x, z),
    occupant: (x, z) => at(pins, x, z),
  };
}

function worldReader(w: WorldState): SurfaceReader {
  const m = w.map;
  const i = (x: number, z: number) => z * MAP_SIZE + x;
  return {
    height: (x, z) => m.height[i(x, z)]!,
    water: (x, z) => m.water[i(x, z)]!,
    occupant: (x, z) => m.occupant[i(x, z)]!,
  };
}

describe('ground surface', () => {
  it('puts every land tile center at its level', () => {
    const t = new SurfaceTiles(
      grid([
        [1, 1, 2, 2],
        [1, 2, 3, 5],
        [1, 1, 2, 5],
      ]),
    );
    for (const [x, z, h] of [
      [1, 1, 2],
      [2, 1, 3],
      [3, 1, 5],
      [0, 2, 1],
    ] as const) {
      expect(surfaceY(t, x + 0.5, z + 0.5)).toBeCloseTo(levelY(h), 6);
    }
  });

  it('eases one-level steps into slopes that both neighbors agree on', () => {
    const t = new SurfaceTiles(
      grid([
        [1, 1, 2, 2],
        [1, 2, 2, 3],
        [2, 2, 3, 3],
      ]),
    );
    for (let z = 0; z < 3; z++) {
      for (let x = 0; x < 3; x++) {
        for (let k = 0; k <= 8; k++) {
          const along = z + k / 8;
          // East edge of (x, z), seen from both sides.
          expect(tileSurfaceY(t, x, z, x + 1, along)).toBeCloseTo(tileSurfaceY(t, x + 1, z, x + 1, along), 6);
        }
      }
    }
    // Halfway between a level 1 and a level 2 center the ground is halfway up.
    expect(surfaceY(t, 2, 0.5)).toBeCloseTo((levelY(1) + levelY(2)) / 2, 6);
  });

  it('keeps cliffs sharp: each side holds its own level up to the edge', () => {
    const t = new SurfaceTiles(grid([[1, 1, 4, 4]]));
    expect(tileSurfaceY(t, 1, 0, 2, 0.5)).toBeCloseTo(levelY(1), 6);
    expect(tileSurfaceY(t, 2, 0, 2, 0.5)).toBeCloseTo(levelY(4), 6);
  });

  it('flattens built-on tiles and lets the slopes around them give way', () => {
    const t = new SurfaceTiles(
      grid(
        [
          [1, 1, 1],
          [1, 2, 2],
          [1, 2, 2],
        ],
        [],
        [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 7],
        ],
      ),
    );
    for (let k = 0; k <= 4; k++) {
      for (let j = 0; j <= 4; j++)
        expect(tileSurfaceY(t, 2, 2, 2 + k / 4, 2 + j / 4)).toBeCloseTo(levelY(2), 6);
    }
    // The neighbor meets the pad's level at the shared edge.
    expect(tileSurfaceY(t, 1, 2, 2, 2.5)).toBeCloseTo(levelY(2), 6);
  });

  it('drops river beds below the water line', () => {
    const t = new SurfaceTiles(grid([[1, 0, 1]], [[0, 1, 0]]));
    expect(surfaceY(t, 1.5, 0.5)).toBeLessThan(-0.2);
    expect(surfaceY(t, 0.5, 0.5)).toBeCloseTo(levelY(1), 6);
  });

  it('builds terrain chunks within the rebuild budget', () => {
    const world = createValley('storybook-1', { ...defaultSettings(), mode: 'standard' });
    const tiles = new SurfaceTiles(worldReader(world));
    // Warm up the JIT, as a running client would be after its first frames.
    for (let i = 0; i < 12; i++) buildTerrainChunk(tiles, i % CHUNKS_PER_SIDE, 6);
    let tris = 0;
    const times: number[] = [];
    for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++) {
      for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
        // CPU time, not wall time: a busy test machine must not fail a budget it meets.
        const t0 = process.cpuUsage();
        const g = buildTerrainChunk(tiles, cx, cz);
        const used = process.cpuUsage(t0);
        times.push((used.user + used.system) / 1000);
        tris += g ? g.getAttribute('position').count / 3 : 0;
      }
    }
    times.sort((a, b) => a - b);
    const median = times[times.length >> 1]!;
    const p90 = times[Math.floor(times.length * 0.9)]!;
    console.info(
      `terrain: ${tris} triangles, chunk build median ${median.toFixed(2)} ms, p90 ${p90.toFixed(2)} ms`,
    );
    // 22-quality.md: chunk rebuild 4 ms each. The median keeps a busy test machine's hiccups out.
    expect(median).toBeLessThan(4);
    expect(tris).toBeLessThan(300_000);
  });
});
