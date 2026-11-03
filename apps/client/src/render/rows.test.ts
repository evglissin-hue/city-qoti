// V1B: joined facades read from the occupant layer.
import { describe, expect, it } from 'vitest';
import type { BuildingView } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { rowNeighbors } from './layers/buildings';

const N = 64;

/** A fake Mirror with buildings stamped into an occupant layer and a road layer. */
function mirrorOf(
  buildings: BuildingView[],
  roads: [number, number][] = [],
  level: (id: number) => number = () => 2,
): Mirror {
  const occ = new Int32Array(N * N);
  const road = new Uint8Array(N * N);
  const sizes: Record<string, [number, number]> = { cottage: [2, 2], townhouse: [2, 2], bakery: [2, 2] };
  for (const b of buildings) {
    const [w, d] = sizes[b.def]!;
    for (let z = b.z; z < b.z + d; z++) for (let x = b.x; x < b.x + w; x++) occ[z * N + x] = b.id;
  }
  for (const [x, z] of roads) road[z * N + x] = 1;
  return {
    buildings: new Map(buildings.map((b) => [b.id, b])),
    occupant: (x: number, z: number) => (x < 0 || z < 0 || x >= N || z >= N ? 0 : occ[z * N + x]!),
    road: (x: number, z: number) => (x < 0 || z < 0 || x >= N || z >= N ? 0 : road[z * N + x]!),
    height: () => 2,
    water: () => 0,
    padLevel: (x: number, z: number) => level(occ[z * N + x]!),
  } as unknown as Mirror;
}

function home(id: number, def: string, x: number, z: number, rot: 0 | 1 | 2 | 3 = 0): BuildingView {
  return { id, def, x, z, rot, stage: 'built' } as unknown as BuildingView;
}

describe('rowNeighbors (V1B)', () => {
  it('joins homes side by side on one frontage, both ways', () => {
    const a = home(1, 'cottage', 10, 10);
    const b = home(2, 'townhouse', 12, 10);
    const m = mirrorOf([a, b]);
    expect(rowNeighbors(m, a)).toEqual({ joinR: 'townhouse' });
    expect(rowNeighbors(m, b)).toEqual({ joinL: 'cottage' });
  });

  it('turns with the buildings: facing the other way, left and right swap', () => {
    const a = home(1, 'cottage', 10, 10, 2);
    const b = home(2, 'cottage', 12, 10, 2);
    const m = mirrorOf([a, b]);
    expect(rowNeighbors(m, a)).toEqual({ joinL: 'cottage' });
    expect(rowNeighbors(m, b)).toEqual({ joinR: 'cottage' });
  });

  it('does not join across a gap, a step back, a different facing, a level or a kit that does not row', () => {
    const gap = mirrorOf([home(1, 'cottage', 10, 10), home(2, 'cottage', 13, 10)]);
    expect(rowNeighbors(gap, gap.buildings.get(1)!)).toEqual({});
    const back = mirrorOf([home(1, 'cottage', 10, 10), home(2, 'cottage', 12, 9)]);
    expect(rowNeighbors(back, back.buildings.get(1)!)).toEqual({});
    const facing = mirrorOf([home(1, 'cottage', 10, 10), home(2, 'cottage', 12, 10, 2)]);
    expect(rowNeighbors(facing, facing.buildings.get(1)!)).toEqual({});
    const step = mirrorOf([home(1, 'cottage', 10, 10), home(2, 'cottage', 12, 10)], [], (id) => id + 1);
    expect(rowNeighbors(step, step.buildings.get(1)!)).toEqual({});
    const bakery = mirrorOf([home(1, 'cottage', 10, 10), home(2, 'bakery', 12, 10)]);
    expect(rowNeighbors(bakery, bakery.buildings.get(1)!)).toEqual({});
  });

  it('marks a side that faces a road, for a corner house', () => {
    const a = home(1, 'cottage', 10, 10);
    const m = mirrorOf([a], [[12, 11]]);
    expect(rowNeighbors(m, a)).toEqual({ streetR: true });
  });
});
