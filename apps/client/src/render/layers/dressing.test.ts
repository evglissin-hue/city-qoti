// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  anchorsFor,
  artKitId,
  boundsOf,
  clearanceOf,
  doorCorridor,
  footprintOf,
  kitById,
  placementFree,
} from '@qoti/art';
import { content, type DressingRule } from '@qoti/content';
import { MAP_SIZE, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '@qoti/sim';
import type { BuildingView, HouseholdView, LotView, ResidentView } from '@qoti/sim';
import { MeshBasicMaterial, Matrix4, PerspectiveCamera, Scene, type BatchedMesh } from 'three';
import type { Mirror, MirrorChange } from '../../state/mirror';
import { createWorldEnv } from '../env';
import { buildingVariantGeometry } from '../kitGeometry';
import { groundY } from '../surface';
import {
  decorTilesOf,
  DRESSING_BUDGET,
  DRESSING_SEED,
  dressingLayer,
  dressingSubject,
  lotBox,
  roomyLot,
} from './dressing';
import type { LayerContext } from './types';

interface World {
  buildings: BuildingView[];
  households?: Partial<HouseholdView>[];
  residents?: Partial<ResidentView>[];
  lots?: Partial<LotView>[];
  season?: 0 | 1 | 2 | 3;
  /** Today's absolute day (the tick is set to land on it). */
  today?: number;
  /** The ground's level at a tile, for a sloped lot. */
  height?: (x: number, z: number) => number;
}

function mirrorOf(w: World): Mirror {
  const today = w.today ?? 100;
  const tick = today * TICKS_PER_DAY - START_HOUR * TICKS_PER_HOUR + 10;
  return {
    buildings: new Map(w.buildings.map((b) => [b.id, b])),
    households: new Map((w.households ?? []).map((h) => [h.id!, h as HouseholdView])),
    residents: new Map((w.residents ?? []).map((r) => [r.id!, r as ResidentView])),
    lots: new Map([
      ...w.buildings
        .filter((b) => b.lot !== undefined && !(w.lots ?? []).some((l) => l.id === b.lot))
        .map((b) => {
          // A lot a tile wider each side, two tiles behind and a tile in front of the house (turn 0).
          const [sw, sd] = content.buildingById.get(b.def)?.size ?? [1, 1];
          return [b.lot!, { id: b.lot, x: b.x - 1, z: b.z - 2, w: sw + 2, d: sd + 3 } as LotView] as const;
        }),
      ...(w.lots ?? []).map((l) => [l.id!, l as LotView] as const),
    ]),
    clock: { value: { season: w.season ?? 1 } },
    tick: { value: tick },
    height: w.height ?? (() => 0),
    water: () => 0,
    occupant: () => 0,
    road: () => 0,
    tree: () => 0,
  } as unknown as Mirror;
}

function building(id: number, def: string, extra: Partial<BuildingView> = {}): BuildingView {
  return { id, def, x: 10, z: 10, rot: 0, stage: 'built', lot: id, ...extra } as unknown as BuildingView;
}

function change(over: Partial<MirrorChange> = {}): MirrorChange {
  return {
    full: false,
    buildings: false,
    households: false,
    residents: false,
    village: false,
    rects: new Map(),
    ...over,
  } as MirrorChange;
}

const rule: DressingRule = {
  id: 'test-barrels',
  who: { kind: ['home'] },
  anchor: 'yard',
  piece: { kit: 'barrels' },
  count: { base: 0, stat: 'firewood', perUnit: 1, max: 6 },
  seed: 1,
};

function setup(world: World, rules?: readonly DressingRule[], level: 'some' | 'all' = 'all') {
  const mirror = mirrorOf(world);
  const layer = rules ? dressingLayer(rules) : dressingLayer();
  const camera = new PerspectiveCamera(60, 1.6, 0.5, 500);
  camera.position.set(11, 6, 15);
  camera.lookAt(11, 0, 11);
  camera.updateMatrixWorld();
  const env = createWorldEnv(camera);
  env.dressing = level;
  env.focus.set(11, 0, 11);
  env.shown.hour = 12;
  const scene = new Scene();
  layer.init({
    env,
    mirror,
    scene,
    camera,
    material: new MeshBasicMaterial(),
    invalidate: () => {},
  } as unknown as LayerContext);
  return { mirror, layer, env, scene, camera };
}

describe('dressingSubject (V3.0)', () => {
  it('reads a home: tier, members, firewood doubled in winter, cloth from tier', () => {
    const b = building(1, 'cottage');
    const household = { id: 5, homeId: 1, tier: 'merchant', members: [1, 2, 3] } as Partial<HouseholdView>;
    const summer = dressingSubject(mirrorOf({ buildings: [b], households: [household], season: 1 }), b);
    expect(summer).toMatchObject({ kind: 'home', tier: 'merchant', season: 'summer', level: 1 });
    expect(summer.stats).toMatchObject({ members: 3, firewood: 3, cloth: 2 });
    const winter = dressingSubject(mirrorOf({ buildings: [b], households: [household], season: 3 }), b);
    expect(winter.season).toBe('winter');
    expect(winter.stats.firewood).toBe(6);
  });

  it('takes the lowest household id when several live in a home', () => {
    const b = building(1, 'cottage');
    const hs = [
      { id: 9, homeId: 1, tier: 'patron', members: [1] },
      { id: 4, homeId: 1, tier: 'settler', members: [2, 3] },
    ] as Partial<HouseholdView>[];
    const s = dressingSubject(mirrorOf({ buildings: [b], households: hs }), b);
    expect(s.tier).toBe('settler');
    expect(s.stats.members).toBe(2);
    expect(s.stats.cloth).toBe(0);
  });

  it('counts births in the last 28 days only', () => {
    const b = building(1, 'cottage');
    const kids = [
      { id: 1, stage: 'child', bornDay: 100 },
      { id: 2, stage: 'child', bornDay: 73 },
      { id: 3, stage: 'child', bornDay: 72 },
      { id: 4, stage: 'adult', bornDay: 100 },
      { id: 5, stage: 'child' },
    ] as Partial<ResidentView>[];
    const hh = { id: 5, homeId: 1, tier: 'settler', members: [1, 2, 3, 4, 5] } as Partial<HouseholdView>;
    const s = dressingSubject(mirrorOf({ buildings: [b], households: [hh], residents: kids, today: 100 }), b);
    expect(s.stats.births).toBe(2);
  });

  it('reads a business: trade, level, stock and workers', () => {
    const b = building(2, 'workshop', {
      trade: 'baker',
      level: 2,
      rt: {
        workers: 3,
        output: [
          ['bread', 4],
          ['cheese', 2],
        ],
        store: [],
      } as unknown as BuildingView['rt'],
    });
    const s = dressingSubject(mirrorOf({ buildings: [b] }), b);
    expect(s).toMatchObject({ kind: 'business', trade: 'baker', level: 2 });
    expect(s.stats).toMatchObject({ stock: 6, workers: 3, level: 2 });
  });

  it('reads a store: fill as a percent of its storage', () => {
    const b = building(3, 'storehouse', {
      rt: {
        workers: 0,
        output: [],
        store: [
          ['timber', 200],
          ['stone', 200],
        ],
      } as unknown as BuildingView['rt'],
    });
    expect(content.buildingById.get('storehouse')?.storage).toBe(800);
    const s = dressingSubject(mirrorOf({ buildings: [b] }), b);
    expect(s.kind).toBe('specialized');
    expect(s.stats.fill).toBe(50);
  });

  it('gives kind null for a construction site and for a def that is none of the three', () => {
    const site = building(4, 'cottage', { stage: 'construction' });
    expect(dressingSubject(mirrorOf({ buildings: [site] }), site).kind).toBeNull();
    const well = building(5, 'well');
    expect(dressingSubject(mirrorOf({ buildings: [well] }), well).kind).toBeNull();
  });

  it('reads missing data as 0', () => {
    const b = building(1, 'cottage');
    const s = dressingSubject(mirrorOf({ buildings: [b] }), b);
    expect(s.tier).toBeUndefined();
    expect(s.stats).toMatchObject({ births: 0, members: 0, fill: 0, stock: 0, workers: 0, cloth: 0 });
  });
});

describe('dressingLayer (V3.0)', () => {
  it('declares its budget and seed', () => {
    expect(DRESSING_BUDGET).toEqual({ triangles: 300_000, draws: 12 });
    expect(typeof DRESSING_SEED).toBe('number');
  });

  it('with an empty table costs nothing and never drops the still frame', () => {
    const { layer, mirror } = setup({ buildings: [building(1, 'cottage')] }, []);
    expect(layer.frame?.(0.016)).toBe(false);
    layer.update(change({ buildings: true }));
    mirror.buildings.set(2, building(2, 'cottage', { x: 20 }));
    expect(layer.frame?.(0.016)).toBe(false);
    expect(layer.placementCount()).toBe(0);
  });

  const hh = (members: number[]) =>
    [{ id: 5, homeId: 1, tier: 'settler', members }] as Partial<HouseholdView>[];

  it('places pieces on the first frame, then settles', () => {
    const { layer } = setup({ buildings: [building(1, 'cottage')], households: hh([1, 2]) }, [rule]);
    expect(layer.frame?.(0.016)).toBe(true);
    expect(layer.placementCount()).toBe(2);
    expect(layer.placementsOf(1).every((p) => p.kit === 'barrels' && p.rule === 'test-barrels')).toBe(true);
    expect(layer.frame?.(0.016)).toBe(false);
  });

  it('keeps the same placements when nothing about the subject changed', () => {
    const { layer } = setup({ buildings: [building(1, 'cottage')], households: hh([1, 2]) }, [rule]);
    layer.frame?.(0.016);
    const before = layer.placementsOf(1);
    layer.update(change({ households: true, residents: true, village: true }));
    expect(layer.frame?.(0.016)).toBe(false);
    expect(layer.placementsOf(1)).toBe(before);
  });

  it('re-resolves when the household grows', () => {
    const { layer, mirror } = setup({ buildings: [building(1, 'cottage')], households: hh([1, 2]) }, [rule]);
    layer.frame?.(0.016);
    mirror.households.set(5, { id: 5, homeId: 1, tier: 'settler', members: [1, 2, 3, 4] } as HouseholdView);
    layer.update(change({ households: true }));
    expect(layer.frame?.(0.016)).toBe(true);
    expect(layer.placementCount()).toBeGreaterThan(2);
  });

  it('re-resolves when the season turns (firewood doubles) and drops removed buildings', () => {
    const { layer, mirror } = setup(
      { buildings: [building(1, 'cottage')], households: hh([1, 2]), season: 1 },
      [rule],
    );
    layer.frame?.(0.016);
    mirror.clock.value = { season: 2 } as never;
    expect(layer.frame?.(0.016)).toBe(true);
    expect(layer.placementCount()).toBeGreaterThan(2);
    mirror.buildings.delete(1);
    layer.update(change({ buildings: true }));
    expect(layer.frame?.(0.016)).toBe(true);
    expect(layer.placementCount()).toBe(0);
  });

  it('on Low draws only rules marked low', () => {
    const { layer } = setup({ buildings: [building(1, 'cottage')], households: hh([1, 2]) }, [rule], 'some');
    expect(layer.frame?.(0.016)).toBe(false);
    expect(layer.placementCount()).toBe(0);
    const low = setup(
      { buildings: [building(1, 'cottage')], households: hh([1, 2]) },
      [{ ...rule, low: true }],
      'some',
    );
    expect(low.layer.frame?.(0.016)).toBe(true);
    expect(low.layer.placementCount()).toBe(2);
  });
});

describe('lotBox (V3.0)', () => {
  // A cottage is 2 x 2; give it a 3 x 4 lot: a tile of side ground and two of back garden.
  const size = content.buildingById.get('cottage')!.size;
  it.each([0, 1, 2, 3] as const)('maps the lot into kit-local space at rot %i', (rot) => {
    const [w, d] = size;
    const b = { id: 1, def: 'cottage', x: 10, z: 10, rot, stage: 'built' } as unknown as BuildingView;
    const [rw, rd] = rot % 2 === 0 ? [w, d] : [d, w];
    // The footprint itself is [0, 0, w, d].
    expect(lotBox(b, { x: 10, z: 10, w: rw, d: rd } as LotView)).toEqual([0, 0, w, d]);
    // Two more tiles behind the house (the back is kit-local -z), one beside it (kit-local +x).
    // buildingMatrix turns local (x, z) by -rot quarter turns about +y: at rot 1 local -z is world +x.
    const back: [number, number][] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    const right: [number, number][] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    const [bx, bz] = back[rot]!;
    const [sx, sz] = right[rot]!;
    const x0 = Math.min(10, 10 + bx * 2, 10 + sx);
    const z0 = Math.min(10, 10 + bz * 2, 10 + sz);
    const x1 = Math.max(10 + rw, 10 + rw + bx * 2, 10 + rw + sx);
    const z1 = Math.max(10 + rd, 10 + rd + bz * 2, 10 + rd + sz);
    expect(lotBox(b, { x: x0, z: z0, w: x1 - x0, d: z1 - z0 } as LotView)).toEqual([0, -2, w + 1, d]);
  });
});

// --- V3A: the layer draws, clears walls and lights the yards ---------------------------------------

const ANCHORS_ALL: DressingRule['anchor'][] = ['door', 'eaves', 'front', 'garden', 'sills', 'walls', 'yard'];

function barrelsAt(anchor: DressingRule['anchor'], seed: number, base = 3): DressingRule {
  return {
    id: `v3a-${anchor}`,
    who: { kind: ['home'] },
    anchor,
    piece: { kit: 'barrels' },
    count: { base, max: base },
    seed,
  };
}

function batchesIn(scene: Scene): BatchedMesh[] {
  const out: BatchedMesh[] = [];
  scene.traverse((o) => {
    if ((o as BatchedMesh).isBatchedMesh) out.push(o as BatchedMesh);
  });
  return out;
}

describe('dressingLayer draws (V3A)', () => {
  const eaves = barrelsAt('eaves', 21, 2);
  const world = (): World => ({ buildings: [building(1, 'cottage'), building(2, 'cottage', { x: 14 })] });

  it('puts every kept piece in one batch: one object, one instance each, no casting', () => {
    const { layer, scene } = setup(world(), [eaves]);
    expect(layer.frame?.(0.016)).toBe(true);
    expect(layer.placementCount()).toBeGreaterThan(0);
    const batches = batchesIn(scene);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.userData.noCast).toBe(true);
    expect(layer.instanceCount()).toBe(layer.placementCount());
    expect(layer.drawnCount()).toBe(layer.placementCount());
  });

  it('builds no batch and does no work with an empty table', () => {
    const { layer, scene } = setup(world(), []);
    expect(layer.frame?.(0.016)).toBe(false);
    expect(batchesIn(scene)).toHaveLength(0);
  });

  it('leaves an unchanged building alone and redraws one whose subject changed', () => {
    const w: World = { ...world(), households: [{ id: 5, homeId: 1, tier: 'settler', members: [1] }] };
    const { layer, mirror } = setup(
      w,
      [barrelsAt('yard', 22, 0)].map((r) => ({
        ...r,
        count: { base: 0, stat: 'firewood' as const, perUnit: 1, max: 6 },
      })),
    );
    expect(layer.frame?.(0.016)).toBe(true);
    const before = layer.instanceCount();
    layer.update(change({ buildings: true }));
    expect(layer.frame?.(0.016)).toBe(false);
    expect(layer.instanceCount()).toBe(before);
    mirror.households.set(5, { id: 5, homeId: 1, tier: 'settler', members: [1, 2, 3] } as HouseholdView);
    layer.update(change({ households: true }));
    expect(layer.frame?.(0.016)).toBe(true);
    expect(layer.instanceCount()).toBeGreaterThan(before);
  });

  it('gives both seats the same fitted placements', () => {
    const a = setup(
      world(),
      ANCHORS_ALL.map((x, i) => barrelsAt(x, 30 + i)),
    );
    const b = setup(
      world(),
      ANCHORS_ALL.map((x, i) => barrelsAt(x, 30 + i)),
    );
    a.layer.frame?.(0.016);
    b.layer.frame?.(0.016);
    expect(a.layer.placementsOf(1)).toEqual(b.layer.placementsOf(1));
    expect(a.layer.placementsOf(2)).toEqual(b.layer.placementsOf(2));
  });
});

describe('dressingLayer clearance, every home and anchor (V3A)', () => {
  const homes = [...content.buildingById.values()].filter((d) => d.category === 'home' && !d.specialized);

  it('keeps every piece clear of walls and props, inside the lot, off the door and off each other', () => {
    expect(homes.length).toBeGreaterThan(0);
    for (const def of homes) {
      const b = building(1, def.id);
      const { layer, mirror } = setup(
        { buildings: [b] },
        ANCHORS_ALL.map((x, i) => barrelsAt(x, 40 + i, 3)),
      );
      layer.frame?.(0.016);
      const placed = layer.placementsOf(1);
      const g = buildingVariantGeometry(b, 'high');
      const [w, d] = def.size;
      // The yard reaches onto free ground beside the lot (here all of it is free).
      const lot = lotBox(b, roomyLot(mirror, decorTilesOf(mirror), mirror.lots.get(b.lot!)!));
      const base = clearanceOf(
        g,
        [w, d],
        [Math.min(0, lot[0]), Math.min(0, lot[1]), Math.max(w, lot[2]), Math.max(d, lot[3])],
      );
      g.dispose();
      const kit = kitById.get(artKitId(def.art))!;
      const door = anchorsFor(kit, {
        size: def.size,
        entrance: def.entrance,
        ...(def.art.params ? { params: def.art.params } : {}),
      }).door;
      const lane = door ? doorCorridor(door, lot) : null;
      for (const p of placed) {
        const info = boundsOf(kitById.get(p.kit)!.build({ seed: p.seed % 4 }));
        expect(placementFree(p, info, base, lot, lane), `${def.id} ${p.rule}`).toBe(true);
      }
      for (let i = 0; i < placed.length; i++)
        for (let j = i + 1; j < placed.length; j++) {
          const bi = boundsOf(kitById.get(placed[i]!.kit)!.build({ seed: placed[i]!.seed % 4 }));
          const bj = boundsOf(kitById.get(placed[j]!.kit)!.build({ seed: placed[j]!.seed % 4 }));
          const f = footprintOf(placed[i]!, bi);
          const h = footprintOf(placed[j]!, bj);
          // Pieces at different heights (a sill barrel over a table) may share a spot on the plan.
          const ya = [placed[i]!.at[1] + 0.02, placed[i]!.at[1] + bi.height * placed[i]!.scale];
          const yb = [placed[j]!.at[1] + 0.02, placed[j]!.at[1] + bj.height * placed[j]!.scale];
          if (ya[1]! <= yb[0]! || yb[1]! <= ya[0]!) continue;
          const over = f[0] < h[2] - 1e-6 && f[2] > h[0] + 1e-6 && f[1] < h[3] - 1e-6 && f[3] > h[1] + 1e-6;
          expect(over, `${def.id} ${placed[i]!.rule} vs ${placed[j]!.rule}`).toBe(false);
        }
    }
  });
});

describe('dressingLayer ground, distance and light (V3A)', () => {
  const yard = barrelsAt('yard', 51, 2);

  function matrices(scene: Scene, n: number) {
    const mesh = batchesIn(scene)[0]!;
    const out: Matrix4[] = [];
    for (let i = 0; i < n; i++) out.push(mesh.getMatrixAt(i, new Matrix4()));
    return { mesh, out };
  }

  it('sits a piece on the ground under it, on a slope too', () => {
    const w: World = { buildings: [building(1, 'cottage')], height: (x) => Math.floor(x) - 8 };
    const { layer, scene, mirror } = setup(w, [yard]);
    layer.frame?.(0.016);
    const n = layer.instanceCount();
    expect(n).toBeGreaterThan(0);
    const { out } = matrices(scene, n);
    for (const m of out) {
      const e = m.elements;
      expect(e[13]).toBeCloseTo(groundY(mirror, e[12]!, e[14]!), 5);
    }
    expect(Math.max(...out.map((m) => m.elements[13]!))).toBeGreaterThan(0);
  });

  it('hides everything beyond the decor distance and swaps near and far at 45%', () => {
    const { layer, scene, env, camera } = setup({ buildings: [building(1, 'cottage')] }, [yard]);
    env.detailDistance = 80;
    layer.frame?.(0.016);
    const mesh = batchesIn(scene)[0]!;
    const look = (z: number) => {
      camera.position.set(11, 3, z);
      camera.lookAt(11, 0, 11);
      camera.updateMatrixWorld();
      env.focus.set(11, 0, 11);
      expect(layer.frame?.(0.016)).toBe(false);
    };
    look(31);
    expect(layer.drawnCount()).toBe(layer.instanceCount());
    const nearId = mesh.getGeometryIdAt(0);
    look(61);
    expect(layer.drawnCount()).toBe(layer.instanceCount());
    expect(mesh.getGeometryIdAt(0)).not.toBe(nearId);
    look(130);
    expect(layer.drawnCount()).toBe(0);
    expect(mesh.getVisibleAt(0)).toBe(false);
    look(31);
    expect(mesh.getVisibleAt(0)).toBe(true);
    expect(mesh.getGeometryIdAt(0)).toBe(nearId);
  });

  it('lights yard lamps from 17:00 to 23:00 under the yards source, and clears on dispose', () => {
    const lamp: DressingRule = {
      ...yard,
      id: 'v3a-lamp',
      piece: { kit: 'lantern' },
      count: { base: 1, max: 1 },
      seed: 52,
    };
    const { layer, env } = setup({ buildings: [building(1, 'cottage')] }, [lamp]);
    env.shown.hour = 12;
    layer.frame?.(0.016);
    expect(layer.placementCount()).toBe(1);
    expect(env.lightWriter.count).toBe(0);
    env.shown.hour = 18;
    expect(layer.frame?.(0.016)).toBe(true);
    const discs = [...env.lightWriter.discs()];
    expect(discs).toHaveLength(1);
    expect(discs[0]).toMatchObject({ radius: 1.2, intensity: 0.85 });
    expect(layer.frame?.(0.016)).toBe(false);
    env.shown.hour = 23.5;
    expect(layer.frame?.(0.016)).toBe(true);
    expect(env.lightWriter.count).toBe(0);
    env.shown.hour = 20;
    layer.frame?.(0.016);
    expect(env.lightWriter.count).toBe(1);
    layer.dispose();
    expect(env.lightWriter.count).toBe(0);
  });

  it('draws only low rules on Low', () => {
    const { layer } = setup(
      { buildings: [building(1, 'cottage')] },
      [yard, { ...barrelsAt('eaves', 53, 2), low: true }],
      'some',
    );
    layer.frame?.(0.016);
    expect(layer.placementsOf(1).every((p) => p.rule === 'v3a-eaves')).toBe(true);
  });
});

describe('roomyLot (V3A)', () => {
  const lot = { id: 1, x: 10, z: 10, w: 2, d: 2 } as LotView;
  const world = (busy: (x: number, z: number) => boolean) =>
    ({
      occupant: (x: number, z: number) => (busy(x, z) ? 1 : 0),
      road: () => 0,
      water: () => 0,
      tree: () => 0,
    }) as unknown as Mirror;

  it('reaches half a tile onto every side whose neighbouring strip is free', () => {
    const r = roomyLot(world(() => false), new Set(), lot);
    expect([r.x, r.z, r.w, r.d]).toEqual([9.5, 9.5, 3, 3]);
  });

  it('keeps to the lot on a side where a building, road or decor stands', () => {
    // A neighbour along the west side, decor on one tile of the south strip.
    const r = roomyLot(world((x) => x === 9), new Set([12 * MAP_SIZE + 11]), lot);
    expect([r.x, r.z, r.w, r.d]).toEqual([10, 9.5, 2.5, 2.5]);
  });
});
