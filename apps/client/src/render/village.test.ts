// @vitest-environment happy-dom
// C4E: the village in the renderer: stand-in defs for kits content does not know yet, grown
// buildings' params (district style, what a craft makes, the season), upgrade scaffolding keys,
// stairs, the village overlays, carts and animals.
import { Flags, MAP_SIZE, AGENT_STRIDE, AgentAnim, type BuildingView } from '@qoti/sim';
import type { Mesh } from 'three';
import { PerspectiveCamera, Scene, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../state/mirror';
import { drawDef } from './defs';
import { buildingKey, buildingParams, setDrawSeason } from './kitGeometry';
import { animalsLayer } from './layers/animals';
import { cartsLayer } from './layers/carts';
import { overlaysLayer } from './layers/overlays';
import { roadsLayer } from './layers/roads';
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
  it('carry the district style, what a craft makes, the season and an upgrade', () => {
    expect(buildingParams(view({ style: 'brick' })).style).toBe('brick');
    const bakery = buildingParams(view({ def: 'bakery', rt: rt({ method: 'bake-bread' }) }));
    expect(bakery.make).toBe('bread');
    setDrawSeason(3);
    expect(buildingParams(view({ def: 'orchard' })).season).toBe(3);
    expect(buildingParams(view({ def: 'cottage' })).season).toBeUndefined();
    setDrawSeason(1);
    expect(buildingKey(view({ rt: rt({ upgrading: true }) }))).toContain(':up');
    expect(buildingKey(view({ rt: rt() }))).not.toContain(':up');
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
