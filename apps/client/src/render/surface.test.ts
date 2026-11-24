import {
  CHUNKS_PER_SIDE,
  createValley,
  defaultSettings,
  MAP_SIZE,
  Terrain,
  type WorldState,
} from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { levelY } from './coords';
import { buildTerrainChunk } from './layers/terrain';
import {
  RIM_TILES,
  rimLevel,
  pinReach,
  surfaceY,
  SurfaceTiles,
  tileSurfaceY,
  WATER_Y,
  type SurfaceReader,
} from './surface';

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
  it('draws a building across two levels as one flat pad, eased into the slope around it', () => {
    // A 2 x 2 building (id 7) on tiles (2..3, 1..2): its back row at level 2, its front at 1, its
    // pad at its door's level (1). The hill behind is at 2.
    const levels = [
      [2, 2, 2, 2, 2, 2],
      [2, 2, 2, 2, 2, 2],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
    ];
    const pins = [[], [0, 0, 7, 7], [0, 0, 7, 7]];
    const reader: SurfaceReader = {
      ...grid(levels, [], pins),
      padLevel: (x, z) => (pins[z]?.[x] ? 1 : levels[z]![x]!),
    };
    const t = new SurfaceTiles(reader);
    const pad = levelY(1);
    // The whole footprint is flat at the pad, back row included (cut into the hill).
    for (const [x, z] of [
      [2.2, 1.1],
      [3.9, 1.05],
      [2.5, 2.5],
      [3.95, 2.95],
    ] as const)
      expect(surfaceY(t, x, z)).toBeCloseTo(pad, 6);
    // A little flat apron round it (the drawn grid is half a tile, so nearly flat), then the ground
    // eases back to the hill behind.
    expect(tileSurfaceY(t, 3, 0, 3.5, 0.85)).toBeCloseTo(pad, 6);
    expect(surfaceY(t, 3, 0.9) - pad).toBeLessThan(0.08);
    // The ease reaches up to 1.5 tiles (it wobbles), so the hill is whole again past that.
    expect(surfaceY(t, 3, 0.5)).toBeGreaterThan(pad);
    expect(surfaceY(t, 3, 0.9)).toBeLessThan(surfaceY(t, 3, 0.5));
    // Neighbors agree with the pad along its edges: no step to close.
    for (let k = 0; k <= 8; k++) {
      const along = 1 + k / 4;
      expect(tileSurfaceY(t, 1, Math.floor(along - 1e-9), 2, along)).toBeCloseTo(pad, 6);
    }
  });

  it('wobbles how far the ground eases from a pad, deterministically and within bounds', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let z = 0; z < 60; z++) {
      for (let x = 0; x < 60; x++) {
        const r = pinReach(x * 0.5, z * 0.5);
        expect(pinReach(x * 0.5, z * 0.5)).toBe(r);
        lo = Math.min(lo, r);
        hi = Math.max(hi, r);
      }
    }
    expect(lo).toBeGreaterThanOrEqual(0.7);
    expect(hi).toBeLessThanOrEqual(1.3);
    // It varies from place to place (the terrace's foot meanders) ...
    expect(hi - lo).toBeGreaterThan(0.3);
    // ... but smoothly: neighboring grid points never jump.
    for (let x = 0; x < 59; x++)
      expect(Math.abs(pinReach(x * 0.5 + 0.5, 3) - pinReach(x * 0.5, 3))).toBeLessThan(0.3);
  });

  it('eases away from a pad at a different distance along each side of it', () => {
    // A 3 x 3 pad at level 1 cut into a hill of level 2: the foot of the ease is not on one line.
    const levels = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => 2));
    const pins = Array.from({ length: 16 }, (_, z) =>
      Array.from({ length: 16 }, (_, x) => (x >= 6 && x <= 8 && z >= 6 && z <= 8 ? 7 : 0)),
    );
    const reader: SurfaceReader = {
      ...grid(levels, [], pins),
      padLevel: (x, z) => (pins[z]?.[x] ? 1 : levels[z]![x]!),
    };
    const t = new SurfaceTiles(reader);
    const hill = levelY(2);
    // The drawn grid is half a tile, so look at its vertices along the pad's north side: how far
    // each has eased back to the hill differs from place to place, not one line of equal heights.
    const rises = new Set<number>();
    for (let x = 5; x <= 9; x += 0.5) {
      for (const z of [5.5, 5, 4.5]) rises.add(Math.round((hill - surfaceY(t, x, z)) * 1000));
    }
    expect(rises.size).toBeGreaterThan(3);
    const fifth = new Set<number>();
    for (let x = 6.5; x <= 8.5; x += 0.5) fifth.add(Math.round((hill - surfaceY(t, x, 5)) * 1000));
    expect(fifth.size).toBeGreaterThan(1);
  });

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

describe('the river and the rim (V3X)', () => {
  // A 3-wide river stepping one tile across every 3 rows (as the grown valley's does), banks at 1.
  const water = (x: number, z: number) => {
    const c = 40 + Math.floor(z / 3);
    return x >= c && x < c + 3 ? (x === c + 1 ? 2 : 1) : 0;
  };
  const river: SurfaceReader = { height: (x, z) => (water(x, z) ? 0 : 1), water, occupant: () => 0 };

  it("keeps a stepping river's shoreline smooth: no jump of more than a quarter tile a quarter-tile row", () => {
    const t = new SurfaceTiles(river);
    let last: [number, number] | null = null;
    for (let z = 60; z < 80; z += 0.25) {
      let left = -1;
      let right = -1;
      for (let x = 50; x < 72; x += 0.25) {
        if (surfaceY(t, x, z) >= WATER_Y) continue;
        if (left < 0) left = x;
        right = x;
      }
      expect(left).toBeGreaterThan(0);
      if (last) {
        expect(Math.abs(left - last[0]), `left bank at z ${z}`).toBeLessThanOrEqual(0.25);
        expect(Math.abs(right - last[1]), `right bank at z ${z}`).toBeLessThanOrEqual(0.25);
      }
      last = [left, right];
    }
  });

  it('draws the rim rising a level a tile from the valley, never above the sim, and a gorge at the river', () => {
    const flat: SurfaceReader = {
      height: (x, z) => (Math.min(x, z, MAP_SIZE - 1 - x, MAP_SIZE - 1 - z) < RIM_TILES ? 14 : 4),
      water: (x) => (x === 96 ? 1 : 0),
      occupant: () => 0,
    };
    // Straight inward from the edge: 5, 6, ... from the valley's 4, capped by the sim's 14.
    for (let e = 0; e < RIM_TILES; e++) expect(rimLevel(flat, 50, e)).toBe(Math.min(14, 4 + RIM_TILES - e));
    // Beside the river where it crosses the rim, a level a tile up from the water.
    expect(rimLevel(flat, 97, 0)).toBe(1);
    expect(rimLevel(flat, 99, 0)).toBe(3);
    // Inside the valley, untouched.
    expect(rimLevel(flat, 50, RIM_TILES)).toBe(4);
  });

  it("matches the sim's rim: the outer RIM_TILES tiles of a generated valley are mountain, the next are not", () => {
    const world = createValley('storybook-1', { ...defaultSettings(), mode: 'standard' });
    const m = world.map;
    let rim = 0;
    let inner = 0;
    for (let i = 0; i < MAP_SIZE; i++) {
      for (const [x, z] of [
        [i, RIM_TILES - 1],
        [RIM_TILES - 1, i],
      ] as const) {
        if (m.water[z * MAP_SIZE + x]) continue;
        if (Math.min(x, z, MAP_SIZE - 1 - x, MAP_SIZE - 1 - z) !== RIM_TILES - 1) continue;
        if (m.terrain[z * MAP_SIZE + x] === Terrain.mountain) rim++;
      }
      const x = Math.max(RIM_TILES, Math.min(MAP_SIZE - 1 - RIM_TILES, i));
      if (!m.water[RIM_TILES * MAP_SIZE + x] && m.terrain[RIM_TILES * MAP_SIZE + x] === Terrain.mountain)
        inner++;
    }
    expect(rim).toBeGreaterThan(MAP_SIZE);
    expect(inner).toBe(0);
  });
});
