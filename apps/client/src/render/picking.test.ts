import { MAP_SIZE, TILE_FP, type MapReader } from '@qoti/sim';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { levelY } from './coords';
import { pickTileFromRay } from './picking';

// A terrace: level 0 west of x = 100, a gentle step to level 1 at x = 100, a cliff to level 4 at x = 103.
function terrace(x: number): number {
  if (x >= 103) return 4;
  if (x >= 100) return 1;
  return 0;
}
const reader = { height: (x: number) => terrace(x) } as unknown as MapReader;

/** A ray from high above that passes through the given world point, travelling along dir. */
function rayThrough(px: number, py: number, pz: number, dir: Vector3): [Vector3, Vector3] {
  const d = dir.clone().normalize();
  return [new Vector3(px, py, pz).addScaledVector(d, -60), d];
}

describe('heightfield picking', () => {
  it('hits the tile under a straight-down ray on flat ground', () => {
    const [o, d] = rayThrough(50.5, 0, 60.5, new Vector3(0, -1, 0));
    const hit = pickTileFromRay(reader, o, d)!;
    expect([hit.x, hit.z, hit.h]).toEqual([50, 60, 0]);
    expect(hit.fx).toBe(Math.floor(50.5 * TILE_FP));
  });

  it('hits the upper tile of a one-level slope, not the low tile behind the ray', () => {
    // Looking east and down at the top of the first level 1 tile.
    const [o, d] = rayThrough(100.5, levelY(1), 40.5, new Vector3(1, -1, 0.2));
    const hit = pickTileFromRay(reader, o, d)!;
    expect([hit.x, hit.z, hit.h]).toEqual([100, 40, 1]);
  });

  it('hits the cliff top when the ray grazes a three-level cliff face', () => {
    // A shallow ray from the west hits the cliff wall at x = 103 below the top: the tile is the cliff tile.
    const [o, d] = rayThrough(103.001, levelY(3), 40.5, new Vector3(1, -0.3, 0));
    const hit = pickTileFromRay(reader, o, d)!;
    expect(hit.x).toBe(103);
    expect(hit.h).toBe(4);
  });

  it('does not stop on the low ground in front of a cliff when the ray lands on top', () => {
    const [o, d] = rayThrough(104.5, levelY(4), 40.5, new Vector3(0.6, -1, 0));
    const hit = pickTileFromRay(reader, o, d)!;
    expect([hit.x, hit.h]).toEqual([104, 4]);
  });

  it('returns null for rays that miss the valley', () => {
    const o = new Vector3(MAP_SIZE + 50, 30, MAP_SIZE + 50);
    expect(pickTileFromRay(reader, o, new Vector3(0, 1, 0))).toBeNull();
  });
});
