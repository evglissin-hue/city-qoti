// The valley road: every road tile 4-connected to the road that comes in at the valley gate
// (docs/spec/13-ledger.md, Land and specialized buildings). Cached per reader on its roadVersion.
import { MAP_SIZE } from '../constants';
import type { MapReader } from '../contracts';

interface Entry {
  version: number;
  gateX: number;
  gateZ: number;
  tiles: Uint8Array;
}

const cache = new WeakMap<MapReader, Entry>();

/** How far from the gate tile a road tile may start the flood (Chebyshev). */
const GATE_SLACK = 2;

/** 1 on every valley-road tile (MAP_SIZE * MAP_SIZE); all zeros when there is no gate or no road at it. */
export function valleyRoadTiles(reader: MapReader): Uint8Array {
  const gate = reader.valleyGate;
  const version = reader.roadVersion;
  const hit = cache.get(reader);
  if (
    hit &&
    version !== undefined &&
    hit.version === version &&
    gate &&
    hit.gateX === gate[0] &&
    hit.gateZ === gate[1]
  ) {
    return hit.tiles;
  }
  const S = MAP_SIZE;
  const tiles = new Uint8Array(S * S);
  if (gate) {
    const queue: number[] = [];
    for (let z = gate[1] - GATE_SLACK; z <= gate[1] + GATE_SLACK; z++) {
      for (let x = gate[0] - GATE_SLACK; x <= gate[0] + GATE_SLACK; x++) {
        if (x < 0 || z < 0 || x >= S || z >= S || reader.road(x, z) <= 0) continue;
        tiles[z * S + x] = 1;
        queue.push(z * S + x);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      const x = i % S;
      const z = (i - x) / S;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const nz = z + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
        const n = nz * S + nx;
        if (tiles[n] || reader.road(nx, nz) <= 0) continue;
        tiles[n] = 1;
        queue.push(n);
      }
    }
  }
  if (version !== undefined && gate) {
    cache.set(reader, { version, gateX: gate[0], gateZ: gate[1], tiles });
  } else {
    cache.delete(reader);
  }
  return tiles;
}
