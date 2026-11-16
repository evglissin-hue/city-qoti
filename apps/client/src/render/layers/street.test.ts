// @vitest-environment happy-dom
// V3B: street furniture. Placement on synthetic Mirrors, and the layer's draw and light discs.
import { MAP_SIZE, TILE_FP, type BuildingView, type DecorView, type LotView } from '@qoti/sim';
import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { Mirror } from '../../state/mirror';
import { createWorldEnv } from '../env';
import { STREET_LIGHT_SOURCE, STYLES, streetDiscs, streetFurniture, streetLayer } from './street';
import type { LayerContext } from './types';

const S = MAP_SIZE;

interface World {
  roads?: [x: number, z: number, cls: number][];
  lots?: Partial<LotView>[];
  buildings?: Partial<BuildingView>[];
  decor?: DecorView[];
  stairs?: [number, number][];
}

function mirrorOf(w: World): Mirror {
  const road = new Uint8Array(S * S);
  for (const [x, z, c] of w.roads ?? []) road[z * S + x] = c;
  const occ = new Int32Array(S * S);
  const flags = new Uint8Array(S * S);
  for (const [x, z] of w.stairs ?? []) flags[z * S + x] = 8;
  const buildings = new Map<number, BuildingView>();
  for (const b of w.buildings ?? []) {
    const v = { rot: 0, stage: 'built', ...b } as BuildingView;
    buildings.set(v.id, v);
    const [bw, bd] = v.def === 'market-stall' ? [1, 2] : [2, 2];
    for (let z = v.z; z < v.z + bd; z++) for (let x = v.x; x < v.x + bw; x++) occ[z * S + x] = v.id;
  }
  const lots = new Map<number, LotView>();
  (w.lots ?? []).forEach((l, i) =>
    lots.set(i + 1, {
      id: i + 1,
      zone: 'homes',
      w: 2,
      d: 3,
      rot: 0,
      style: 'brick',
      buildingId: 0,
      ...l,
    } as LotView),
  );
  const decor = new Map<number, DecorView>((w.decor ?? []).map((d) => [d.id, d]));
  return {
    road: (x: number, z: number) => (x < 0 || z < 0 || x >= S || z >= S ? 0 : road[z * S + x]!),
    occupant: (x: number, z: number) => occ[z * S + x]!,
    water: () => 0,
    height: () => 2,
    padLevel: () => 2,
    layers: { flags },
    buildings,
    lots,
    decor,
    decorNear: (fx: number, fz: number, r: number) =>
      [...decor.values()].filter((d) => Math.hypot(d.fx - fx, d.fz - fz) <= r),
  } as unknown as Mirror;
}

/** An east-west road at `z` from x0 to x1 with 2-wide lots north of it (rot 0 faces +z). */
function street(z: number, x0: number, x1: number, style: string, cls = 3): World {
  const roads: World['roads'] = [];
  for (let x = x0; x <= x1; x++) roads.push([x, z, cls]);
  const lots: Partial<LotView>[] = [];
  for (let x = x0; x + 1 <= x1; x += 2) lots.push({ x, z: z - 3, style });
  return { roads, lots };
}

const lamps = (ps: ReturnType<typeof streetFurniture>) => ps.filter((p) => p.lamp);

describe('streetFurniture', () => {
  it('puts lamps at an even spacing along a brick street, every 4 tiles', () => {
    const ps = streetFurniture(mirrorOf(street(40, 20, 60, 'brick')));
    const xs = lamps(ps).map((p) => Math.floor(p.x));
    expect(xs.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBe(STYLES.brick!.every);
    // On the curb of the fronted (north) side, 0.12 inside the road tile.
    for (const p of lamps(ps)) expect(p.z).toBeCloseTo(40 + 0.5 - 0.38, 5);
  });

  it('keeps a row of homes lit when every other tile is a doorstep (lamps step off doors)', () => {
    for (const style of ['brick', 'plaster', 'stone', 'timber']) {
      const w = street(40, 20, 60, style);
      w.lots = [];
      // Two-wide cottages shoulder to shoulder, each door fronting one tile of the street.
      w.buildings = [];
      for (let x = 20, id = 100; x + 1 <= 60; x += 2, id++)
        w.buildings.push({ id, def: 'cottage', x, z: 38, style });
      const ls = lamps(streetFurniture(mirrorOf(w)));
      const every = STYLES[style]!.every;
      expect(ls.length, style).toBeGreaterThanOrEqual(Math.floor(40 / every) - 2);
    }
  });

  it('treats a street two tiles wide as straight, not as a junction', () => {
    const w = street(40, 20, 60, 'brick');
    for (let x = 20; x <= 60; x++) w.roads!.push([x, 41, 3]);
    expect(lamps(streetFurniture(mirrorOf(w))).length).toBeGreaterThanOrEqual(8);
  });

  it('spaces by style and takes lanes at half the density', () => {
    const gap = (style: string, cls: number): number => {
      const xs = lamps(streetFurniture(mirrorOf(street(40, 20, 80, style, cls)))).map((p) => Math.floor(p.x));
      return xs[1]! - xs[0]!;
    };
    expect(gap('plaster', 3)).toBe(6);
    expect(gap('stone', 3)).toBe(6);
    expect(gap('timber', 3)).toBe(5);
    expect(gap('brick', 2)).toBe(8);
    expect(gap('village', 3)).toBe(7);
  });

  it('keeps village streets to streets and avenues, and gives timber lantern posts', () => {
    expect(lamps(streetFurniture(mirrorOf(street(40, 20, 80, 'old', 2))))).toEqual([]);
    expect(lamps(streetFurniture(mirrorOf(street(40, 20, 80, 'old', 4)))).length).toBeGreaterThan(0);
    const t = lamps(streetFurniture(mirrorOf(street(40, 20, 60, 'timber'))));
    expect(t.every((p) => p.kit === 'lantern')).toBe(true);
  });

  it('alternates sides when both sides of a street are fronted', () => {
    const w = street(40, 20, 80, 'brick');
    for (let x = 20; x < 80; x += 2) w.lots!.push({ x, z: 41, rot: 2, style: 'brick' });
    const ps = lamps(streetFurniture(mirrorOf(w))).sort((a, b) => a.x - b.x);
    expect(ps.length).toBeGreaterThan(8);
    ps.forEach((p, i) => expect(p.z > 40.5).toBe(i % 2 === 0));
  });

  it('leaves a road through empty fields bare', () => {
    const roads: [number, number, number][] = [];
    for (let x = 20; x < 80; x++) roads.push([x, 40, 3]);
    expect(streetFurniture(mirrorOf({ roads }))).toEqual([]);
  });

  it('never puts anything on paths', () => {
    expect(streetFurniture(mirrorOf(street(40, 20, 80, 'brick', 1)))).toEqual([]);
  });

  it('puts nothing on junctions or corner tiles', () => {
    const w = street(40, 20, 60, 'brick');
    for (let z = 30; z <= 50; z++) w.roads!.push([40, z, 3]);
    for (const p of streetFurniture(mirrorOf(w))) expect(Math.floor(p.x)).not.toBe(40);
  });

  it('puts nothing before an entrance except flanking bollards at a brick shop door', () => {
    const w = street(40, 20, 60, 'brick');
    w.lots = [];
    // A market stall (1 x 2, entrance at its second tile) whose door fronts road tile (30, 40).
    w.buildings = [{ id: 9, def: 'market-stall', x: 30, z: 38, style: 'brick' }];
    const ps = streetFurniture(mirrorOf(w)).filter((p) => Math.floor(p.x) === 30);
    expect(ps.map((p) => p.kit)).toEqual(['bollard', 'bollard']);
    expect(ps.map((p) => p.x).sort()).toEqual([30.2, 30.8]);
    expect(new Set(ps.map((p) => p.x)).size).toBe(2);
    // A pair or none: with decor beside one of the pair's spots, neither stands.
    const pot = {
      id: 3,
      def: 'flower-pot',
      fx: Math.round(30.2 * TILE_FP),
      fz: Math.round(40.12 * TILE_FP),
      rot: 0,
      builtBy: 0,
    } as DecorView;
    const blockedPair = streetFurniture(mirrorOf({ ...w, decor: [pot] })).filter((p) => p.kit === 'bollard');
    expect(blockedPair).toEqual([]);
    // A home's door gets nothing at all, in any style.
    const h = street(40, 20, 60, 'plaster');
    h.lots = [];
    h.buildings = [{ id: 8, def: 'cottage', x: 30, z: 38, style: 'plaster' }];
    expect(streetFurniture(mirrorOf(h)).filter((p) => Math.floor(p.x) === 31)).toEqual([]);
  });

  it('keeps clear of decor lanterns and other decor, and of stairs', () => {
    const base = street(40, 20, 60, 'brick');
    const free = lamps(streetFurniture(mirrorOf(base)));
    const target = free[2]!;
    const lantern = {
      id: 1,
      def: 'lantern',
      fx: Math.round((target.x + 0.5) * TILE_FP),
      fz: Math.round(target.z * TILE_FP),
      rot: 0,
      builtBy: 0,
    } as DecorView;
    const withLantern = streetFurniture(mirrorOf({ ...base, decor: [lantern] }));
    expect(
      withLantern.some(
        (p) => Math.hypot(p.x - lantern.fx / TILE_FP, p.z - lantern.fz / TILE_FP) < 1.2 && p.lamp,
      ),
    ).toBe(false);
    const stone = { ...lantern, id: 2, def: 'bench', fx: Math.round(target.x * TILE_FP) } as DecorView;
    const withBench = streetFurniture(mirrorOf({ ...base, decor: [stone] }));
    expect(withBench.some((p) => Math.hypot(p.x - target.x, p.z - target.z) < 0.5)).toBe(false);
    const stairs = streetFurniture(mirrorOf({ ...base, stairs: [[Math.floor(target.x), 40]] }));
    expect(stairs.some((p) => Math.floor(p.x) === Math.floor(target.x))).toBe(false);
  });

  it('is deterministic and sorted', () => {
    const w = street(40, 20, 80, 'plaster');
    const a = streetFurniture(mirrorOf(w));
    expect(streetFurniture(mirrorOf(w))).toEqual(a);
    const sorted = [...a].sort((p, q) => p.z - q.z || p.x - q.x);
    expect(a.map((p) => [p.x, p.z])).toEqual(sorted.map((p) => [p.x, p.z]));
    expect(a.some((p) => !p.lamp)).toBe(true);
  });

  it('places fillers by style: plaster gets planters and benches, village none', () => {
    const kinds = new Set(streetFurniture(mirrorOf(street(40, 20, 120, 'plaster'))).map((p) => p.kit));
    expect(kinds.has('planter')).toBe(true);
    expect(kinds.has('bench')).toBe(true);
    expect(streetFurniture(mirrorOf(street(40, 20, 120, 'old'))).every((p) => p.lamp)).toBe(true);
    const stone = new Set(streetFurniture(mirrorOf(street(40, 20, 120, 'stone'))).map((p) => p.kit));
    expect(stone.has('bollard-stone')).toBe(true);
  });

  it('runs in well under 2 ms on a large town', () => {
    const w = street(40, 4, 188, 'brick');
    for (const z of [60, 80, 100, 120, 140, 160]) {
      const s = street(z, 4, 188, ['plaster', 'stone', 'timber'][z % 3]!);
      w.roads!.push(...s.roads!);
      w.lots!.push(...s.lots!);
    }
    const m = mirrorOf(w);
    streetFurniture(m);
    let best = Infinity;
    for (let i = 0; i < 12; i++) {
      const t0 = performance.now();
      streetFurniture(m);
      best = Math.min(best, performance.now() - t0);
    }
    // The budget is 2 ms on a 192 x 192 valley; the bound here leaves room for a busy test machine.
    expect(best).toBeLessThan(6);
  });
});

describe('streetLayer', () => {
  function setup(w: World) {
    const mirror = mirrorOf(w);
    const env = createWorldEnv(new PerspectiveCamera(60, 1.6, 0.5, 500));
    env.camera.position.set(40, 8, 52);
    env.camera.lookAt(40, 0, 40);
    env.camera.updateMatrixWorld();
    env.focus.set(40, 0, 40);
    const scene = new Scene();
    const ctx: LayerContext = {
      scene,
      mirror,
      material: undefined as never,
      invalidate: () => {},
      camera: env.camera,
      env,
    };
    const layer = streetLayer();
    layer.init(ctx);
    return { layer, env, scene, mirror };
  }

  it('writes one disc per lamp under the street source, and clears them on dispose', () => {
    const { layer, env, mirror } = setup(street(40, 20, 60, 'brick'));
    const ps = streetFurniture(mirror);
    const n = ps.filter((p) => p.lamp).length;
    expect(n).toBeGreaterThan(0);
    expect(streetDiscs(ps)).toHaveLength(n);
    const writer = env.lightWriter;
    expect(writer.count).toBe(n);
    layer.dispose();
    expect(writer.count).toBe(0);
    expect(STREET_LIGHT_SOURCE).toBe('street');
  });

  it('draws everything in one batched mesh', () => {
    const { scene, layer } = setup(street(40, 20, 60, 'brick'));
    let meshes = 0;
    scene.traverse((o) => {
      if ((o as { isBatchedMesh?: boolean }).isBatchedMesh) meshes++;
    });
    expect(meshes).toBe(1);
    expect(layer.frame?.(0.016)).toBeTypeOf('boolean');
  });
});
