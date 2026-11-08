// Playtest round six regression: a Kitchen Garden built the way a player builds one, with real
// commands in a real valley: two plots beside a starting cottage (one to the side, with a path's
// width between), built by the builders, then a fence drawn along them with the Fence tool's
// tile-center run. The page must be found, and before the fence the cottage says what it lacks.
import { content } from '@qoti/content';
import { canPlaceBuilding, createStateReader, inspect, TICKS_PER_HOUR, TILE_FP, type Rot4 } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { worldIndex } from '../../../packages/sim/src/state/worldIndex';
import { command, runTicks, startingTown } from './hamlet';

describe('a Kitchen Garden as a player builds it', { timeout: 60_000 }, () => {
  it('two plots off to one side of a cottage, a fence drawn along them', () => {
    const h = startingTown('kat-1', { standIn: false });
    const w = h.world;
    w.time.connected = [0, 1];
    runTicks(h, 2 * TICKS_PER_HOUR);
    const home = w.buildings.find((b) => b.def === 'cottage')!;
    const plot = content.buildingById.get('vegetable-plot')!;
    const reader = createStateReader(w, worldIndex(w).decorGrid);
    const spots: [number, number][] = [];
    for (let dz = -4; dz <= 4 && spots.length < 2; dz++) {
      for (let dx = -6; dx <= -2 && spots.length < 2; dx++) {
        const x = home.x + dx;
        const z = home.z + dz;
        if (spots.some(([a, b]) => Math.abs(a - x) < 3 && Math.abs(b - z) < 3)) continue;
        if (canPlaceBuilding(reader, plot, x, z, 0 as Rot4).ok) spots.push([x, z]);
      }
    }
    expect(spots).toHaveLength(2);
    for (const [x, z] of spots)
      expect(command(h, [{ t: 'build.place', def: 'vegetable-plot', x, z, rot: 0 }])).toEqual([true]);
    for (let i = 0; i < 48 && w.buildings.some((b) => b.stage === 'construction'); i++)
      runTicks(h, TICKS_PER_HOUR);
    const status = () => (inspect(w, 'building', home.id) as { status: string[] }).status.join(' ');
    expect(status()).toContain('a bit of fence or hedge along them would make a Kitchen Garden');
    const zs = spots.map(([, z]) => z);
    const xs = spots.map(([x]) => x);
    const row = Math.max(...zs) + 2;
    const c = (t: number) => t * TILE_FP + TILE_FP / 2;
    const run = {
      t: 'decor.placeRun' as const,
      def: 'fence',
      from: [c(Math.min(...xs) - 1), c(row)] as [number, number],
      to: [c(Math.max(...xs) + 2), c(row)] as [number, number],
    };
    expect(command(h, [run])).toEqual([true]);
    runTicks(h, 2 * TICKS_PER_HOUR);
    expect(w.hearth.discovered.map((d) => d.pattern)).toContain('kitchen-garden');
  });
});
