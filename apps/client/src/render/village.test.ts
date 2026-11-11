// @vitest-environment happy-dom
// C4E: the village in the renderer: stand-in defs for kits content does not know yet, grown
// buildings' params (district style, what a craft makes, the season), upgrade scaffolding keys,
// stairs, the village overlays, carts and animals.
import { MOTION } from '@qoti/art';
import { Flags, MAP_SIZE, AGENT_STRIDE, AgentAnim, type BuildingView } from '@qoti/sim';
import type { Mesh } from 'three';
import { PerspectiveCamera, Scene, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../state/mirror';
import { drawDef } from './defs';
import { buildingKey, buildingParams, buildingVariantGeometry, setDrawSeason } from './kitGeometry';
import { buildingsLayer, businessSignText } from './layers/buildings';
import { animalsLayer } from './layers/animals';
import { cartsLayer } from './layers/carts';
import { overlaysLayer } from './layers/overlays';
import { roadsLayer } from './layers/roads';
import { groundY } from './surface';
import type { LayerContext } from './layers/types';

function view(over: Partial<BuildingView>): BuildingView {
  return {
    id: 7,
    def: 'cottage',
    x: 10,
    z: 10,
    rot: 0,
    builtBy: 0,
    handmade: false,
    stage: 'built',
    foundation: false,
    ...over,
  };
}

const rt = (over: Partial<NonNullable<BuildingView['rt']>> = {}): NonNullable<BuildingView['rt']> => ({
  jobs: 1,
  workers: 1,
  present: 1,
  status: 0,
  condition: 100,
  paused: false,
  progress: 0,
  input: [],
  output: [],
  store: [],
  ...over,
});

function context(mirror: Mirror, scene = new Scene()): LayerContext {
  return {
    scene,
    mirror,
    material: undefined as never,
    invalidate: () => {},
    camera: new PerspectiveCamera(),
  };
}

function triangles(scene: Scene): number {
  let n = 0;
  scene.traverse((o: Object3D) => {
    const g = (o as Mesh).geometry;
    if (!g) return;
    const idx = g.getIndex();
    n += idx ? idx.count / 3 : g.getAttribute('position').count / 3;
  });
  return n;
}

describe('stand-in defs', () => {
  it('come from the kit of the same id until content has the def, and content wins', () => {
    const th = drawDef('townhouse');
    expect(th?.size).toEqual([2, 2]);
    expect(th?.art.kit).toBe('townhouse');
    expect(th?.tags).toContain('home');
    expect(drawDef('cottage')?.name).toBe('Cottage');
    expect(drawDef('no-such-thing')).toBeUndefined();
  });
});

describe('grown building params', () => {
  it("carry the district style, a trade's look and level, the season and an upgrade", () => {
    expect(buildingParams(view({ style: 'brick' })).style).toBe('brick');
    // R1E: a baker's workshop draws the bakery look and makes bread, at its level.
    const baker = buildingParams(view({ def: 'workshop', style: 'brick', trade: 'baker', level: 2 }));
    expect(baker.look).toBe('bakery');
    expect(baker.make).toBe('bread');
    expect(baker.level).toBe(2);
    expect(baker.style).toBe('brick');
    expect(buildingParams(view({ def: 'workshop' })).look).toBeUndefined();
    // An orchard farmstead follows the season; a cottage does not.
    setDrawSeason(3);
    const orchard = buildingParams(view({ def: 'farmstead', trade: 'orchard' }));
    expect(orchard.season).toBe(3);
    expect(orchard.look).toBe('orchard');
    expect(buildingParams(view({ def: 'cottage' })).season).toBeUndefined();
    setDrawSeason(1);
    expect(buildingKey(view({ rt: rt({ upgrading: true }) }))).toContain(':up');
    expect(buildingKey(view({ rt: rt() }))).not.toContain(':up');
  });

  it("draw a baker's look apart from a weaver's, and an orchard's seasons apart", () => {
    const tris = (b: BuildingView): number => {
      const g = buildingVariantGeometry(b);
      const n = g.getAttribute('position').count;
      g.dispose();
      return n;
    };
    const baker = view({ def: 'workshop', style: 'brick', trade: 'baker' });
    const weaver = view({ def: 'workshop', style: 'brick', trade: 'weaver' });
    expect(tris(baker)).not.toBe(tris(weaver));
    expect(tris({ ...baker, level: 3 })).toBeGreaterThan(tris(baker));
    const orchard = view({ def: 'farmstead', trade: 'orchard' });
    setDrawSeason(1);
    const summer = buildingKey(orchard);
    const summerTris = tris(orchard);
    setDrawSeason(3);
    expect(buildingKey(orchard)).not.toBe(summer);
    expect(tris(orchard)).not.toBe(summerTris);
    setDrawSeason(1);
  });

  it("letter the keeper's family name from level 2, and never over the players' own words", () => {
    const b = view({ def: 'workshop', trade: 'baker', level: 2, keeperId: 3 });
    expect(businessSignText(b, 'Fenwick')).toBe("Fenwick's Bakery");
    expect(businessSignText({ ...b, level: 1 }, 'Fenwick')).toBeNull();
    expect(businessSignText({ ...b, level: undefined }, 'Fenwick')).toBeNull();
    expect(businessSignText(b, undefined)).toBeNull();
    expect(businessSignText({ ...b, custom: { sign: 'Crumbs' } }, 'Fenwick')).toBeNull();
    expect(businessSignText({ ...b, stage: 'construction' }, 'Fenwick')).toBeNull();
    expect(businessSignText(view({ def: 'farmstead', trade: 'sheep-run', level: 3 }), 'Ashdown')).toBe(
      "Ashdown's Fold",
    );
  });

  it('draw every business name in one mesh, and drop a name when the level falls', () => {
    const m = new Mirror();
    const scene = new Scene();
    m.buildings.set(1, view({ id: 1, def: 'workshop', trade: 'baker', level: 2, keeperId: 3 }));
    m.buildings.set(2, view({ id: 2, def: 'shop', x: 20, trade: 'shop', level: 3, keeperId: 4 }));
    m.residents.set(3, { id: 3, family: 'Fenwick' } as never);
    m.residents.set(4, { id: 4, family: 'Hollis' } as never);
    const layer = buildingsLayer();
    layer.init(context(m, scene));
    // The sign atlas is the one mesh the layer adds beside its batch.
    const signMeshes = (): Mesh[] =>
      scene.children.filter((o): o is Mesh => (o as Mesh).isMesh && o.userData.noCast === true);
    const quads = (): number =>
      signMeshes().reduce((n, o) => n + (o.visible ? (o.geometry.getIndex()?.count ?? 0) / 6 : 0), 0);
    expect(signMeshes()).toHaveLength(1);
    expect(quads()).toBe(2);
    m.buildings.set(1, { ...m.buildings.get(1)!, level: 1 });
    layer.update({ full: true, buildings: true, rects: new Map() } as never);
    expect(quads()).toBe(1);
    layer.dispose();
  });
});

describe('stairs', () => {
  it('climb from a flagged path to the road a level up, and nowhere else', () => {
    const m = new Mirror();
    const at = (x: number, z: number): number => z * MAP_SIZE + x;
    m.layers.road[at(20, 10)] = 1;
    m.layers.road[at(20, 11)] = 1;
    m.layers.height[at(20, 10)] = 1;
    m.layers.height[at(20, 11)] = 2;
    const plain = new Scene();
    const layer = roadsLayer();
    layer.init(context(m, plain));
    expect(triangles(plain)).toBe(0);
    layer.dispose();
    m.layers.flags[at(20, 10)] = Flags.stairs;
    const scene = new Scene();
    const stairs = roadsLayer();
    stairs.init(context(m, scene));
    expect(triangles(scene)).toBeGreaterThan(60);
    stairs.dispose();
  });

  it('are cut into the drawn slope and reach the ground where the hillside falls away (C4P)', () => {
    const m = new Mirror();
    const at = (x: number, z: number): number => z * MAP_SIZE + x;
    // A path climbing from (20, 10) to (20, 11) across a hillside that drops away to the west.
    for (let z = 8; z <= 13; z++) {
      for (let x = 17; x <= 23; x++) m.layers.height[at(x, z)] = x < 20 ? 0 : z >= 11 ? 2 : 1;
    }
    m.layers.road[at(20, 10)] = 1;
    m.layers.road[at(20, 11)] = 1;
    m.layers.flags[at(20, 10)] = Flags.stairs;
    const scene = new Scene();
    const layer = roadsLayer();
    layer.init(context(m, scene));
    const pts: [number, number, number][] = [];
    scene.traverse((o: Object3D) => {
      const g = (o as Mesh).geometry;
      if (!g) return;
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) pts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
    });
    layer.dispose();
    expect(pts.length).toBeGreaterThan(100);
    // The top step is flush with the path above it.
    const top = Math.max(...pts.filter((p) => Math.abs(p[0] - 20.5) < 0.235).map((p) => p[1]));
    expect(Math.abs(top - groundY(m, 20.5, 11.5))).toBeLessThan(0.09);
    // Along both sides, from the foot to the top, something reaches down to the ground.
    for (const x of [20.5 - 0.3, 20.5 + 0.3]) {
      for (const z of [10.6, 11, 11.4]) {
        const near = pts.filter((p) => Math.abs(p[0] - x) < 0.06 && Math.abs(p[2] - z) < 0.2);
        expect(near.length).toBeGreaterThan(0);
        expect(Math.min(...near.map((p) => p[1]))).toBeLessThan(groundY(m, x, z));
      }
    }
  });
});

describe('client motions (C4P)', () => {
  it("never collide with the sim's agent animations", () => {
    const sim = Object.values(AgentAnim) as number[];
    for (const m of Object.values(MOTION)) expect(sim).not.toContain(m);
    expect(Math.min(...Object.values(MOTION))).toBeGreaterThan(Math.max(...sim));
  });
});

describe('village overlays', () => {
  it('tint zoned land, outline lots and color roads by traffic', () => {
    const m = new Mirror();
    for (let x = 10; x < 14; x++) for (let z = 10; z < 12; z++) m.layers.zone[z * MAP_SIZE + x] = 1;
    m.lots.set(5, {
      id: 5,
      zone: 'homes-low',
      x: 10,
      z: 10,
      w: 2,
      d: 2,
      rot: 2,
      desirability: 60,
      style: 'timber',
      buildingId: 0,
    });
    for (let x = 10; x < 20; x++) {
      m.layers.road[12 * MAP_SIZE + x] = 2;
      m.layers.traffic[12 * MAP_SIZE + x] = x;
    }
    const scene = new Scene();
    const layer = overlaysLayer();
    layer.init(context(m, scene));
    for (const kind of ['zones', 'traffic', 'land', 'needs']) {
      layer.set(kind);
      expect(layer.kind).toBe(kind);
    }
    layer.set('zones');
    expect(triangles(scene)).toBeGreaterThan(8);
    layer.set('traffic');
    expect(triangles(scene)).toBeGreaterThan(10);
    layer.dispose();
  });
});

describe('animals', () => {
  it('keep sheep in a pasture', () => {
    const m = new Mirror();
    m.buildings.set(9, view({ id: 9, def: 'sheep-pasture', x: 20, z: 20 }));
    const scene = new Scene();
    const layer = animalsLayer();
    layer.init(context(m, scene));
    layer.frame?.(0.1);
    expect(layer.count).toBeGreaterThan(2);
    layer.dispose();
  });
});

describe('carts', () => {
  it('draw the cart rows of the agent frames, and leave residents to the agents layer', () => {
    const m = new Mirror();
    const data = new Float32Array(AGENT_STRIDE * 2);
    data.set([900, 20.5, 20.5, 2, 0, AgentAnim.cart, 1, 0], 0);
    data.set([901, 22.5, 20.5, 2, 0, AgentAnim.walk, 0, 0], AGENT_STRIDE);
    m.applyAgents(1, data, 0);
    const layer = cartsLayer();
    layer.init(context(m));
    layer.frame?.(0.1);
    expect(layer.drawn).toBe(1);
    layer.dispose();
  });
});
