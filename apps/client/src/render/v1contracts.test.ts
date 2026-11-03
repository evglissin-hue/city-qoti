import { describe, expect, it } from 'vitest';
import type { Object3D } from 'three';
import { Group, Mesh, PerspectiveCamera, Scene } from 'three';
import { createWorldEnv } from './env';
import { GpuTimer } from './gpuTimer';
import { layerFactories } from './layers';
import { layerRoot, MOVING_LAYER, STATIC_LAYER, tagTree } from './layerTags';
import { applyGrade, bloomFor, lookUniforms, tiltFor } from './look';
import {
  BUILDING_DETAIL_FLOOR,
  buildingDetailNow,
  detectQuality,
  isQuality,
  pixelRatios,
  QUALITY_PRESETS,
} from './quality';

const only = (o: Object3D, n: number): boolean => o.layers.mask === 1 << n;

describe('static and moving layers (V1.0)', () => {
  it('put a moving layer’s objects on Three.js layer 2, however deep and however late', () => {
    const root = layerRoot({ id: 'agents', motion: 'moving' });
    const scene = new Scene();
    scene.add(root);
    const mesh = new Mesh();
    root.add(mesh);
    expect(only(mesh, MOVING_LAYER)).toBe(true);
    // A group added with children, and a child added to it afterwards.
    const group = new Group();
    const early = new Mesh();
    group.add(early);
    root.add(group);
    const late = new Mesh();
    group.add(late);
    for (const o of [group, early, late]) expect(only(o, MOVING_LAYER)).toBe(true);
  });

  it('put a static (or unmarked) layer’s objects on Three.js layer 1', () => {
    const root = layerRoot({ id: 'terrain' });
    const mesh = new Mesh();
    root.add(mesh);
    expect(only(mesh, STATIC_LAYER)).toBe(true);
    expect(only(layerRoot({ id: 'decor', motion: 'static' }), STATIC_LAYER)).toBe(true);
  });

  it('retag an object moved from a static tree to a moving one', () => {
    const still = layerRoot({ id: 'decor' });
    const moving = layerRoot({ id: 'carts', motion: 'moving' });
    const group = new Group();
    still.add(group);
    moving.add(group);
    const child = new Mesh();
    group.add(child);
    expect(only(group, MOVING_LAYER)).toBe(true);
    expect(only(child, MOVING_LAYER)).toBe(true);
    tagTree(group, STATIC_LAYER);
    group.add(new Mesh());
    expect(group.children.every((c) => only(c, STATIC_LAYER))).toBe(true);
  });

  it('mark exactly the moving layers the brief lists', () => {
    const moving = layerFactories
      .map((make) => make())
      .filter((l) => l.motion === 'moving')
      .map((l) => l.id)
      .sort();
    expect(moving).toEqual([
      'agents',
      'animals',
      'carts',
      'effects',
      'ghosts',
      'notes',
      'overlays',
      'presence',
      'water',
    ]);
  });
});

describe('quality presets (V1.0)', () => {
  it('add Ultra with the values in 17-presentation.md', () => {
    const p = QUALITY_PRESETS;
    expect(Object.keys(p).sort()).toEqual(['high', 'low', 'medium', 'ultra']);
    expect([p.low.renderScale, p.medium.renderScale, p.high.renderScale, p.ultra.renderScale]).toEqual([
      0.75, 1, 1.5, 2,
    ]);
    expect([p.low.msaa, p.medium.msaa, p.high.msaa, p.ultra.msaa]).toEqual([0, 4, 4, 4]);
    expect([
      p.low.buildingDetail,
      p.medium.buildingDetail,
      p.high.buildingDetail,
      p.ultra.buildingDetail,
    ]).toEqual([40, 60, 75, 110]);
    expect([
      p.low.residentDetail,
      p.medium.residentDetail,
      p.high.residentDetail,
      p.ultra.residentDetail,
    ]).toEqual([30, 60, 100, 140]);
    expect([
      p.low.decorDistance,
      p.medium.decorDistance,
      p.high.decorDistance,
      p.ultra.decorDistance,
    ]).toEqual([40, 80, 140, 200]);
    expect([p.low.stillCache, p.medium.stillCache, p.high.stillCache, p.ultra.stillCache]).toEqual([
      false,
      true,
      true,
      true,
    ]);
    expect([p.low.stillAo, p.medium.stillAo, p.high.stillAo, p.ultra.stillAo]).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect([p.low.bloom, p.medium.bloom, p.high.bloom, p.ultra.bloom]).toEqual([false, true, true, true]);
    expect([p.low.critters, p.medium.critters, p.high.critters, p.ultra.critters]).toEqual([
      'none',
      'some',
      'all',
      'all',
    ]);
  });

  it('V1D: every preset uses its own building distance above the stand-in floor, and Low gets cached shadows', () => {
    for (const q of ['low', 'medium', 'high', 'ultra'] as const)
      expect(buildingDetailNow(q)).toBe(Math.max(QUALITY_PRESETS[q].buildingDetail, BUILDING_DETAIL_FLOOR));
    // V1B: far levels keep their panes lit, so the floor is gone and each preset's distance applies.
    expect(BUILDING_DETAIL_FLOOR).toBe(0);
    expect([buildingDetailNow('low'), buildingDetailNow('medium'), buildingDetailNow('ultra')]).toEqual([
      40, 60, 110,
    ]);
    expect(QUALITY_PRESETS.low.shadowMap).toBe(1024);
    // The classic engine (?engine=classic, until V1X) keeps reading the old cap.
    expect(QUALITY_PRESETS.medium.maxDpr).toBe(2);
  });

  it('V1D: moving frames draw at the preset’s cap, still ones as sharp as the screen allows', () => {
    const { low, medium, high, ultra } = QUALITY_PRESETS;
    // A Retina laptop.
    expect(pixelRatios(low, 2)).toEqual({ moving: 0.75, still: 0.75 });
    expect(pixelRatios(medium, 2)).toEqual({ moving: 1, still: 2 });
    expect(pixelRatios(high, 2)).toEqual({ moving: 1.5, still: 2 });
    expect(pixelRatios(ultra, 2)).toEqual({ moving: 2, still: 2 });
    // A 1080p laptop: every preset but Low at its full ratio.
    expect(pixelRatios(medium, 1)).toEqual({ moving: 1, still: 1 });
    expect(pixelRatios(ultra, 1)).toEqual({ moving: 1, still: 1 });
    // `?debug&dpr=2` overrides the moving cap.
    expect(pixelRatios(medium, 2, 2)).toEqual({ moving: 2, still: 2 });
  });

  it('never auto-detect High or Ultra, and know Ultra by name', () => {
    expect(detectQuality({ hardwareConcurrency: 16, userAgent: 'Macintosh' })).toBe('medium');
    expect(detectQuality({ hardwareConcurrency: 2, userAgent: 'Macintosh' })).toBe('low');
    expect(detectQuality({ hardwareConcurrency: 12, userAgent: 'iPhone' })).toBe('low');
    expect(isQuality('ultra')).toBe(true);
    expect(isQuality('extreme')).toBe(false);
  });
});

describe('the look (V1.0 split)', () => {
  it('keeps the values post.ts used before the split', () => {
    expect(bloomFor(0)).toEqual({ strength: 0.25, threshold: 0.92 });
    expect(bloomFor(1).strength).toBeCloseTo(0.7);
    expect(bloomFor(1).threshold).toBeCloseTo(0.72);
    expect(tiltFor(40)).toBe(0);
    expect(tiltFor(115)).toBeCloseTo(1.1);
    expect(tiltFor(400)).toBeCloseTo(2.2);
    const u = lookUniforms();
    applyGrade(u, 'spring', 0);
    expect(u.uLookLift.value.toArray()).toEqual([0, 0.012, 0.03]);
    expect(u.uLookSaturation.value).toBeCloseTo(1.06);
    applyGrade(u, 'spring', 1);
    expect(u.uLookLift.value.x).toBeCloseTo(0.018);
    expect(u.uLookGain.value.y).toBeCloseTo(0.955);
    expect(u.uLookVignette.value).toBe(0.8);
    expect(u.uLookTiltCenter.value).toBe(0.5);
  });
});

/** Just enough of a WebGL2 context for the timer; results are queued by hand. */
function fakeGl(withExt: boolean) {
  const ext = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
  const results = new Map<object, number>();
  let disjoint = false;
  let created = 0;
  const gl = {
    QUERY_RESULT_AVAILABLE: 0x8867,
    QUERY_RESULT: 0x8866,
    getExtension: (name: string) => (withExt && name === 'EXT_disjoint_timer_query_webgl2' ? ext : null),
    createQuery: () => ({ n: created++ }),
    deleteQuery: () => {},
    beginQuery: () => {},
    endQuery: () => {},
    getParameter: (p: number) => (p === ext.GPU_DISJOINT_EXT ? disjoint : null),
    getQueryParameter: (q: object, p: number) => (p === 0x8867 ? results.has(q) : (results.get(q) ?? 0)),
  };
  return {
    gl: gl as unknown as WebGL2RenderingContext,
    finish: (q: object, ms: number) => results.set(q, ms * 1e6),
    setDisjoint: (d: boolean) => (disjoint = d),
  };
}

describe('GPU timer (V1.0)', () => {
  it('reads null without the extension', () => {
    const t = new GpuTimer(fakeGl(false).gl);
    t.begin();
    t.end();
    t.poll();
    expect(t.available).toBe(false);
    expect(t.ms).toBeNull();
  });

  it('times frames with a ring of three and averages what arrives', () => {
    const f = fakeGl(true);
    const t = new GpuTimer(f.gl);
    const pending = (t as unknown as { pending: object[] }).pending;
    for (let i = 0; i < 4; i++) {
      t.begin();
      t.end();
    }
    // The fourth frame found three queries in flight and went untimed.
    expect(pending.length).toBe(3);
    f.finish(pending[0]!, 4);
    f.finish(pending[1]!, 6);
    t.poll();
    expect(t.ms).toBe(5);
    expect(t.total).toBe(2);
    expect(t.history).toEqual([4, 6]);
  });

  it('drops every result in flight after a disjoint', () => {
    const f = fakeGl(true);
    const t = new GpuTimer(f.gl);
    t.begin();
    t.end();
    const pending = (t as unknown as { pending: object[] }).pending;
    f.finish(pending[0]!, 9);
    f.setDisjoint(true);
    t.poll();
    expect(t.ms).toBeNull();
    expect(pending.length).toBe(0);
  });
});

describe('world env (V1.0)', () => {
  it('runs static animation on the shared clock until V1D, and holds one flat pattern array', () => {
    const env = createWorldEnv(new PerspectiveCamera());
    expect(env.staticTime).toBe(env.time);
    expect(env.buildingDetail).toBe(75);
    expect(env.patterns.value.image.depth).toBe(20);
    expect((env.patterns.value.image.data as Uint8Array)[0]).toBe(128);
  });
});
