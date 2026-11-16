// @vitest-environment happy-dom
// V3A: the ground between buildings: worn paths, cobble aprons and the puddles' rain memory.
import { MAP_SIZE, Terrain, TICKS_PER_DAY, type BuildingView, type WeatherView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../state/mirror';
import { buildWalk, dayOf, puddleResidual, RainMemory, wantsApron, wantsPath } from './groundPaths';

const N = MAP_SIZE;
const at = (x: number, z: number): number => z * N + x;

function town(): Mirror {
  const m = new Mirror();
  m.layers.terrain.fill(Terrain.grass);
  return m;
}

function put(
  m: Mirror,
  b: Partial<BuildingView> & { id: number; def: string; x: number; z: number },
): BuildingView {
  const view = {
    rot: 0,
    builtBy: 0,
    handmade: false,
    stage: 'built',
    foundation: false,
    ...b,
  } as BuildingView;
  m.buildings.set(view.id, view);
  const size = view.def === 'corner-shop' ? [2, 3] : [2, 2];
  for (let dz = 0; dz < size[1]!; dz++)
    for (let dx = 0; dx < size[0]!; dx++) m.layers.occupant[at(view.x + dx, view.z + dz)] = view.id;
  return view;
}

const walk = (m: Mirror): Uint8Array => {
  const out = new Uint8Array(N * N * 4);
  buildWalk(m, out);
  return out;
};
const pathTiles = (w: Uint8Array): number[] => {
  const out: number[] = [];
  for (let i = 0; i < N * N; i++) if (w[i * 4 + 3]) out.push(i);
  return out;
};

// A cottage at (50, 50): its door is (51, 51), its front tile (51, 52), facing +z.
describe('worn paths', () => {
  it('a door fronting a road gets no path', () => {
    const m = town();
    put(m, { id: 1, def: 'cottage', x: 50, z: 50 });
    m.layers.road[at(51, 52)] = 1;
    expect(pathTiles(walk(m))).toEqual([]);
  });

  it('a door two tiles from a road gets the tiles between', () => {
    const m = town();
    put(m, { id: 1, def: 'cottage', x: 50, z: 50 });
    m.layers.road[at(51, 54)] = 1;
    const w = walk(m);
    expect(pathTiles(w)).toEqual([at(51, 52), at(51, 53)]);
    // The first tile knows its door (to the north), the last runs into the road (to the south).
    expect(w[at(51, 52) * 4 + 1]).toBe(1 + 3);
    expect(w[at(51, 53) * 4]! >> 4).toBe(2);
  });

  it('never crosses buildings, water or trees, and gives up beyond its reach', () => {
    const m = town();
    put(m, { id: 1, def: 'cottage', x: 50, z: 50 });
    m.layers.road[at(51, 54)] = 1;
    // A wall of water across the way, with a gap far to the side.
    for (let x = 40; x <= 60; x++) m.layers.water[at(x, 53)] = 1;
    for (let x = 40; x <= 60; x++) m.layers.road[at(x, 56)] = 1;
    const w = walk(m);
    for (const i of pathTiles(w)) {
      expect(m.layers.water[i]).toBe(0);
      expect(m.layers.occupant[i]).toBe(0);
    }
    const far = town();
    put(far, { id: 1, def: 'cottage', x: 50, z: 50 });
    far.layers.road[at(51, 70)] = 1;
    expect(pathTiles(walk(far))).toEqual([]);
  });

  it('gives the same bytes for the same town', () => {
    const a = town();
    const b = town();
    for (const m of [a, b]) {
      put(m, { id: 1, def: 'cottage', x: 50, z: 50 });
      put(m, { id: 2, def: 'cottage', x: 56, z: 50 });
      m.layers.road[at(53, 56)] = 2;
      m.layers.road[at(54, 56)] = 2;
    }
    expect(Array.from(walk(a))).toEqual(Array.from(walk(b)));
    expect(pathTiles(walk(a)).length).toBeGreaterThan(0);
  });

  it('wears no path for a construction site, a well or a palisade', () => {
    const m = town();
    m.layers.road[at(51, 55)] = 1;
    const site = put(m, { id: 1, def: 'cottage', x: 50, z: 50, stage: 'construction' });
    expect(wantsPath(site)).toBe(false);
    expect(wantsPath(put(m, { id: 2, def: 'well', x: 60, z: 50 }))).toBe(false);
  });
});

describe('cobble aprons', () => {
  it('flags the front tile of a level 2 business and not of a home', () => {
    const m = town();
    const shop = put(m, { id: 1, def: 'corner-shop', x: 50, z: 50, trade: 'grain-farm', level: 2 });
    const home = put(m, { id: 2, def: 'cottage', x: 60, z: 50 });
    expect(wantsApron(shop)).toBe(true);
    expect(wantsApron(home)).toBe(false);
    const w = walk(m);
    // The shop's entrance is (51, 52), so its front tile is (51, 53).
    expect(w[at(51, 53) * 4 + 2]).toBe(1);
    expect(w[at(61, 52) * 4 + 2]).toBe(0);
  });

  it('flags a level 1 business that is a shop front, not one that is a barn', () => {
    const m = town();
    expect(wantsApron(put(m, { id: 1, def: 'corner-shop', x: 50, z: 50, trade: 'shop', level: 1 }))).toBe(
      true,
    );
    expect(wantsApron(put(m, { id: 2, def: 'cottage', x: 60, z: 50, trade: 'dairy', level: 1 }))).toBe(false);
  });
});

describe('puddles after rain', () => {
  it('are wet the morning after, dry out over that day and are gone after', () => {
    const rainDay = 4;
    const dayStart = (d: number): number => d * TICKS_PER_DAY - 6 * 200;
    expect(puddleResidual(rainDay, dayStart(rainDay))).toBe(0);
    expect(puddleResidual(rainDay, dayStart(rainDay + 1) + 100)).toBeGreaterThan(0.95);
    const noon = puddleResidual(rainDay, dayStart(rainDay + 1) + TICKS_PER_DAY / 2);
    expect(noon).toBeGreaterThan(0);
    expect(noon).toBeLessThan(0.95);
    expect(puddleResidual(rainDay, dayStart(rainDay + 2))).toBe(0);
    expect(puddleResidual(null, dayStart(5))).toBe(0);
  });

  it('follows the shared weather and clock', () => {
    const m = new Mirror();
    const levels: number[] = [];
    const mem = new RainMemory(m, (v) => levels.push(v));
    const rainy = (today: WeatherView['today']): WeatherView => ({
      today,
      forecast: [],
      events: [],
      frozen: false,
    });
    const clock = (tick: number) => ({ ...m.clock.value, tick });
    m.clock.value = clock(10 * TICKS_PER_DAY);
    m.weather.value = rainy('rain');
    expect(mem.rainDay).toBe(dayOf(10 * TICKS_PER_DAY));
    m.weather.value = rainy('clear');
    m.clock.value = clock(11 * TICKS_PER_DAY);
    const last = () => levels[levels.length - 1]!;
    expect(last()).toBeGreaterThan(0.9);
    m.clock.value = clock(12 * TICKS_PER_DAY);
    expect(last()).toBe(0);
    mem.dispose();
  });
});
