import { MAP_SIZE, type DecorView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import type { Mirror } from '../state/mirror';
import { AO_FLOOR, AO_SIZE, GroundAo } from './groundAo';

const N = MAP_SIZE;

function fakeMirror(): {
  mirror: Mirror;
  occupant: Uint16Array;
  tree: Uint8Array;
  decor: Map<number, DecorView>;
} {
  const occupant = new Uint16Array(N * N);
  const tree = new Uint8Array(N * N);
  const decor = new Map<number, DecorView>();
  const mirror = { layers: { occupant, tree }, decor } as unknown as Mirror;
  return { mirror, occupant, tree, decor };
}

function place(occupant: Uint16Array, id: number, x0: number, z0: number, w: number, d: number): void {
  for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) occupant[z * N + x] = id;
}

describe('ground AO texture', () => {
  it('is 2.5 texels a tile and open ground is unshaded', () => {
    expect(AO_SIZE).toBe(480);
    const { mirror } = fakeMirror();
    const ao = new GroundAo(mirror);
    expect(ao.sample(50, 50)).toBe(1);
  });

  it('darkens softly beside a building, more in a courtyard, never below the floor', () => {
    const { mirror, occupant } = fakeMirror();
    place(occupant, 1, 40, 40, 3, 3);
    // A courtyard: four buildings around a 2 x 2 yard.
    place(occupant, 2, 80, 80, 6, 2);
    place(occupant, 3, 80, 84, 6, 2);
    place(occupant, 4, 80, 82, 2, 2);
    place(occupant, 5, 84, 82, 2, 2);
    const ao = new GroundAo(mirror);
    const beside = ao.sample(43.2, 41.5);
    const far = ao.sample(48, 41.5);
    expect(beside).toBeLessThan(0.85);
    expect(far).toBeGreaterThan(beside);
    expect(ao.sample(52, 41.5)).toBeGreaterThan(0.97);
    const yard = ao.sample(83, 83);
    expect(yard).toBeLessThan(beside);
    expect(yard).toBeGreaterThanOrEqual(AO_FLOOR - 0.01);
  });

  it('rebuilds a placed building within one update and the 4 ms budget, matching a full build', () => {
    const { mirror, occupant } = fakeMirror();
    place(occupant, 1, 40, 40, 3, 3);
    const ao = new GroundAo(mirror);
    expect(ao.pending).toBe(false);
    place(occupant, 9, 100, 100, 3, 3);
    // The occupant patch arrives as its chunk's rect.
    ao.markRect([96, 96, 111, 111]);
    const times: number[] = [];
    for (let k = 0; k < 7; k++) {
      ao.markRect([96, 96, 111, 111]);
      expect(ao.update()).toBe(true);
      times.push(ao.lastMs);
    }
    expect(ao.pending).toBe(false);
    // The median, since the test runner shares the machine with other workers.
    const median = times.sort((a, b) => a - b)[3]!;
    console.log(`ground AO: one chunk rebuilt in ${median.toFixed(2)} ms (${ao.lastTexels} texels)`);
    expect(median).toBeLessThan(4);
    const fresh = new GroundAo(mirror);
    for (const [x, z] of [
      [103.2, 101],
      [99, 99],
      [104.5, 104.5],
      [41, 44],
    ] as const)
      expect(ao.sample(x, z)).toBeCloseTo(fresh.sample(x, z), 2);
    expect(ao.sample(103.2, 101)).toBeLessThan(0.85);
  });

  it('shades under walls and decor trees, and forgets decor that went', () => {
    const { mirror, decor } = fakeMirror();
    const ao = new GroundAo(mirror);
    decor.set(1, { id: 1, def: 'low-wall', fx: 60 * 256 + 128, fz: 60 * 256 + 128, rot: 0, builtBy: 0 });
    decor.set(2, { id: 2, def: 'apple-tree', fx: 70 * 256 + 128, fz: 60 * 256 + 128, rot: 0, builtBy: 0 });
    ao.syncDecor();
    ao.update();
    expect(ao.sample(60.5, 60.75)).toBeLessThan(0.93);
    expect(ao.sample(70.5, 60.5)).toBeLessThan(0.9);
    decor.delete(1);
    ao.syncDecor();
    ao.update();
    expect(ao.sample(60.5, 60.75)).toBeGreaterThan(0.97);
  });
});
