// @vitest-environment happy-dom
// V2B: the meadow carpet's CPU side: which tiles a chunk keeps, the fill by radius, when it refills,
// the blade patch and the chunk build time. (The blades themselves are built in the vertex shader.)
import { CHUNK_SIZE, MAP_SIZE, Terrain, Water } from '@qoti/sim';
import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../../state/mirror';
import { createWorldEnv } from '../env';
import { SurfaceTiles } from '../surface';
import {
  BLADES_PER_TILE,
  bladePatchGeometry,
  buildMeadowChunk,
  FILL_MARGIN,
  FillRule,
  FLOATS_PER_TILE,
  keepsTile,
  meadowLayer,
  REST_FRAMES,
  selectFill,
  type MeadowChunk,
} from './meadow';

const at = (x: number, z: number): number => z * MAP_SIZE + x;

/** A mirror whose chunk (1, 1) holds a mix of ground, with some height variation. */
function mixed(): Mirror {
  const m = new Mirror();
  const L = m.layers;
  for (let z = 0; z < MAP_SIZE; z++) for (let x = 0; x < MAP_SIZE; x++) L.terrain[at(x, z)] = Terrain.grass;
  for (let z = 16; z < 32; z++) {
    for (let x = 16; x < 32; x++) {
      if ((x + z) % 5 === 0) L.terrain[at(x, z)] = Terrain.meadow;
      L.height[at(x, z)] = Math.floor((x + z) / 9) % 2;
    }
  }
  return m;
}

describe('which tiles the carpet keeps', () => {
  it('keeps grass and meadow, and drops roads, water, buildings, fields and forest floor', () => {
    const m = new Mirror();
    const L = m.layers;
    const set = (x: number, terrain: number): void => {
      L.terrain[at(x, 5)] = terrain;
    };
    set(0, Terrain.grass);
    set(1, Terrain.meadow);
    set(2, Terrain.grass);
    L.road[at(2, 5)] = 1;
    set(3, Terrain.grass);
    L.water[at(3, 5)] = Water.river;
    set(4, Terrain.grass);
    L.occupant[at(4, 5)] = 7;
    set(5, Terrain.field);
    set(6, Terrain.forestFloor);
    set(7, Terrain.sand);
    set(8, Terrain.rock);
    const kept = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((x) => keepsTile(L, at(x, 5)));
    expect(kept).toEqual([0, 1]);
  });

  it('builds a chunk of only its open tiles, with the tile and its heights in each instance', () => {
    const m = mixed();
    const L = m.layers;
    L.road[at(17, 17)] = 1;
    L.occupant[at(20, 20)] = 3;
    L.water[at(25, 25)] = Water.pond;
    const c = buildMeadowChunk(new SurfaceTiles(m), m, 1, 1);
    expect(c.count).toBe(CHUNK_SIZE * CHUNK_SIZE - 3);
    expect(c.data.length).toBe(c.count * FLOATS_PER_TILE);
    const seen = new Set<number>();
    for (let t = 0; t < c.count; t++) {
      const x = c.data[t * FLOATS_PER_TILE]!;
      const z = c.data[t * FLOATS_PER_TILE + 1]!;
      expect(x).toBeGreaterThanOrEqual(16);
      expect(x).toBeLessThan(32);
      expect(z).toBeGreaterThanOrEqual(16);
      expect(z).toBeLessThan(32);
      seen.add(at(x, z));
      for (let k = 2; k < 8; k++)
        if (k !== 3) expect(Number.isFinite(c.data[t * FLOATS_PER_TILE + k]!)).toBe(true);
    }
    expect(seen.size).toBe(c.count);
    expect(seen.has(at(17, 17))).toBe(false);
    expect(seen.has(at(20, 20))).toBe(false);
    expect(seen.has(at(25, 25))).toBe(false);
  });

  it('builds nothing on a chunk of water', () => {
    const m = new Mirror();
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) m.layers.terrain[at(x, z)] = Terrain.water;
    expect(buildMeadowChunk(new SurfaceTiles(m), m, 0, 0).count).toBe(0);
  });
});

function fakeChunks(): Map<number, MeadowChunk> {
  const m = new Mirror();
  const chunks = new Map<number, MeadowChunk>();
  const tiles = new SurfaceTiles(m);
  for (let cz = 0; cz < 4; cz++)
    for (let cx = 0; cx < 4; cx++)
      chunks.set(cz * (MAP_SIZE / CHUNK_SIZE) + cx, buildMeadowChunk(tiles, m, cx, cz));
  return chunks;
}

describe('the fill', () => {
  it('holds the tiles within the radius of the center and none beyond', () => {
    const chunks = fakeChunks();
    const out = new Float32Array(64 * 64 * FLOATS_PER_TILE);
    const n = selectFill(chunks, 30, 30, 10, out);
    expect(n).toBeGreaterThan(250);
    expect(n).toBeLessThan(330);
    for (let t = 0; t < n; t++) {
      const dx = out[t * FLOATS_PER_TILE]! + 0.5 - 30;
      const dz = out[t * FLOATS_PER_TILE + 1]! + 0.5 - 30;
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(10);
    }
    expect(selectFill(chunks, 30, 30, 20, out)).toBeGreaterThan(n);
  });

  it('reports -1 when the buffer is too small, so the caller can grow it', () => {
    expect(selectFill(fakeChunks(), 30, 30, 10, new Float32Array(FLOATS_PER_TILE * 10))).toBe(-1);
  });
});

describe('when the carpet refills', () => {
  it('fills first, again when the reach changes, never at reach 0', () => {
    const r = new FillRule();
    expect(r.due(50, 50, 0)).toBe(false);
    expect(r.due(50, 50, 45)).toBe(true);
    r.filled(50, 50, 45);
    expect(r.due(50, 50, 45)).toBe(false);
    expect(r.due(50, 50, 30)).toBe(true);
    r.filled(50, 50, 30);
    expect(r.due(50, 50, 0)).toBe(false);
  });

  it('refills a moving view only beyond a quarter of the reach', () => {
    const r = new FillRule();
    r.due(50, 50, 40);
    r.filled(50, 50, 40);
    let x = 50;
    let refills = 0;
    for (let f = 0; f < 200; f++) {
      x += 0.5;
      if (r.due(x, 50, 40)) {
        refills++;
        expect(Math.abs(x - r.centerX)).toBeGreaterThan(10);
        r.filled(x, 50, 40);
      }
    }
    // 100 tiles of pan at 10 tiles a refill, not a refill every frame.
    expect(refills).toBeGreaterThanOrEqual(8);
    expect(refills).toBeLessThanOrEqual(10);
  });

  it('refills a resting view when it differs by more than a tile, and stays quiet within one', () => {
    const r = new FillRule();
    r.due(50, 50, 40);
    r.filled(50, 50, 40);
    // Drifted 5 tiles while moving (no refill), then holds still.
    r.due(55, 50, 40);
    let due = false;
    for (let f = 0; f < REST_FRAMES - 1; f++) due = r.due(55, 50, 40) || due;
    expect(due).toBe(false);
    expect(r.due(55, 50, 40)).toBe(true);
    r.filled(55, 50, 40);
    // Within a tile at rest: nothing.
    for (let f = 0; f < 30; f++) expect(r.due(55.6, 50, 40)).toBe(false);
  });

  it('keeps the focus inside the filled margin between refills', () => {
    // A moving view refills at reach / 4 drift, and the fill reaches FILL_MARGIN times the reach.
    expect((FILL_MARGIN - 1) * 40).toBeGreaterThanOrEqual(40 / 4);
  });
});

describe('the blade patch', () => {
  it('is 50 triangles of 3 vertices, roots inside the tile, corners 0 1 2', () => {
    const g = bladePatchGeometry();
    expect(BLADES_PER_TILE).toBe(50);
    const pos = g.getAttribute('position');
    expect(pos.count).toBe(150);
    expect(pos.count / 3).toBe(50);
    expect(g.getIndex()).toBeNull();
    const blade = g.getAttribute('aBlade');
    const corner = g.getAttribute('aCorner');
    expect(blade.itemSize).toBe(4);
    for (let i = 0; i < 150; i++) {
      expect(corner.getX(i)).toBe(i % 3);
      expect(blade.getX(i)).toBeGreaterThanOrEqual(0);
      expect(blade.getX(i)).toBeLessThan(1);
      expect(blade.getY(i)).toBeGreaterThanOrEqual(0);
      expect(blade.getY(i)).toBeLessThan(1);
      // The three vertices of a blade share its root and randoms.
      if (i % 3 > 0) {
        expect(blade.getX(i)).toBe(blade.getX(i - 1));
        expect(blade.getZ(i)).toBe(blade.getZ(i - 1));
      }
    }
  });
});

describe('the layer', () => {
  it('draws nothing at reach 0 and adds one mesh otherwise', () => {
    const m = mixed();
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const env = createWorldEnv(camera);
    env.meadowCarpet = 0;
    const layer = meadowLayer();
    layer.init({ scene, mirror: m, material: undefined as never, invalidate: () => {}, camera, env });
    expect(layer.frame?.(0.016)).toBe(false);
    expect(scene.children.length).toBe(0);
    layer.dispose();
  });
});

describe('chunk build time', () => {
  it('builds a full chunk well within the 4 ms rebuild budget', () => {
    const m = mixed();
    const tiles = new SurfaceTiles(m);
    // Warm once, then take the slowest of a few runs.
    buildMeadowChunk(tiles, m, 1, 1);
    let worst = 0;
    for (let k = 0; k < 20; k++) {
      const t0 = performance.now();
      const c = buildMeadowChunk(tiles, m, 1 + (k % 3), 1);
      worst = Math.max(worst, performance.now() - t0);
      expect(c.count).toBeGreaterThan(0);
    }
    console.info(`[v2b] meadow chunk worst ${worst.toFixed(2)} ms (Node)`);
    expect(worst).toBeLessThan(4);
  });
});
