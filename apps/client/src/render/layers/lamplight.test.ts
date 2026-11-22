// @vitest-environment happy-dom
// R3F: the lamps by the lamplighter's reach tick, candle-lit homes and cold fires, as the lights
// and decor layers draw them from `SuppliesView` (docs/spec/19-evenings.md, Supplies; the handshake
// with V4A in docs/build/v4-wave-notes.md).
import { POLE_TIP } from '@qoti/art';
import { content } from '@qoti/content';
import {
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TILE_FP,
  type BuildingView,
  type DecorView,
  type SuppliesView,
} from '@qoti/sim';
import type {
  MeshLambertMaterial} from 'three';
import {
  PerspectiveCamera,
  Scene,
  ShaderLib,
  UniformsUtils,
  Vector3,
  type InstancedMesh,
} from 'three';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../../state/mirror';
import { createWorldEnv } from '../env';
import { candleMask, createWorldMaterial, LAMP_DUSK_FLOOR } from '../material';
import { polePose, poleLit } from './agents';
import { decorKey, decorLayer, decorLook } from './decor';
import {
  candlesBurn,
  clockEdges,
  clockKey,
  clockShift,
  dayOf,
  isTownLamp,
  lightsLayer,
  litLamps,
  nightOf,
  shownTick,
  suppliesClock,
  tickAt,
} from './lights';
import type { LayerContext } from './types';

const S = content.supplies;
const DAY = 4;
const SETTLE = tickAt(DAY, S.settleHour + S.settleMinute / 60);
const OUT = tickAt(DAY + 1, S.outHour);

const decor = (id: number, def: string, x: number, z: number): DecorView => ({
  id,
  def,
  fx: Math.round(x * TILE_FP),
  fz: Math.round(z * TILE_FP),
  rot: 0,
  builtBy: 0,
});

const home = (id: number, x: number, z: number): BuildingView => ({
  id,
  def: 'cottage',
  x,
  z,
  rot: 0,
  builtBy: 0,
  handmade: false,
  stage: 'built',
  foundation: false,
});

/** Tonight's view: lamps 1 to 3 reached in turn (2 and 3 in the same tick), 4 unlisted. */
const view = (over: Partial<SuppliesView> = {}): SuppliesView => ({
  night: DAY,
  lamps: [
    { id: 1, reach: SETTLE + 10, out: OUT },
    { id: 2, reach: SETTLE + 30, out: OUT },
    { id: 3, reach: SETTLE + 30, out: OUT },
  ],
  resting: [{ id: 4, kind: 'unlit' }],
  candles: [20],
  candleUntil: tickAt(DAY, S.candleUntilHour),
  lamplighters: { jobs: 1, held: [99] },
  ...over,
});

function mirrorWith(v: SuppliesView | null): Mirror {
  const m = new Mirror();
  m.decor.set(1, decor(1, 'lantern', 40.5, 40.5));
  m.decor.set(2, decor(2, 'lantern', 42.5, 40.5));
  m.decor.set(3, decor(3, 'lamp-post', 44.5, 40.5));
  m.decor.set(4, decor(4, 'hanging-lantern', 46.5, 40.5));
  m.decor.set(5, decor(5, 'bonfire', 60.5, 60.5));
  m.decor.set(6, decor(6, 'brazier', 62.5, 60.5));
  m.buildings.set(20, home(20, 40, 44));
  m.buildings.set(21, home(21, 44, 44));
  m.supplies.value = v;
  return m;
}

/** The lights layer on a mirror at a tick, the light hour following it (the renderer's quarter). */
function run(mirror: Mirror, tick: number) {
  const env = createWorldEnv(new PerspectiveCamera());
  const scene = new Scene();
  const material = createWorldMaterial(env);
  const ctx: LayerContext = {
    scene,
    mirror,
    material,
    invalidate: () => {},
    camera: new PerspectiveCamera(),
    env,
  };
  const quarter = (t: number) => {
    const h = ((t - tickAt(dayOf(t), 0)) / TICKS_PER_HOUR) % 24;
    return Math.floor(h * 4) / 4;
  };
  const setTick = (t: number) => {
    mirror.tick.value = t;
    env.shown.hour = quarter(t);
  };
  setTick(tick);
  const layer = lightsLayer();
  layer.init(ctx);
  /** Frames the layer and counts the light map's redraw requests on that frame. */
  const step = (t: number) => {
    setTick(t);
    const changed = layer.frame?.(0.016) ?? false;
    const redraw = env.lightWriter.takeDirty();
    return { changed, redraw, lit: layer.lit() };
  };
  const glass = () => scene.children.find((o) => o.name === 'lamp-glass') as InstancedMesh | undefined;
  return { env, layer, step, glass, scene };
}

describe('the supplies clock (R3F)', () => {
  it('counts nights from 07:00, and days from midnight', () => {
    expect(dayOf(tickAt(DAY, 0))).toBe(DAY);
    expect(dayOf(tickAt(DAY, 23.9))).toBe(DAY);
    expect(nightOf(tickAt(DAY, 6.9))).toBe(DAY - 1);
    expect(nightOf(tickAt(DAY, 7))).toBe(DAY);
    expect(nightOf(tickAt(DAY + 1, 2))).toBe(DAY);
  });

  it('follows the Mirror while the light shows its quarter, and a pinned hour when it does not', () => {
    const t = tickAt(DAY, 17.6);
    expect(shownTick(t, 17.5)).toBe(t);
    // The renderer may still show the last tick's quarter for a frame: that is not a pin.
    expect(shownTick(t, 17.5, tickAt(DAY, 17.45))).toBe(t);
    expect(shownTick(t, 21)).toBe(tickAt(DAY, 21));
  });

  it('lights every supplied lamp from litHour to outHour without a view, as before R3', () => {
    const c = suppliesClock(null, [1, 2], DAY);
    expect(litLamps(c, tickAt(DAY, 17.9))).toEqual([]);
    expect(litLamps(c, tickAt(DAY, S.litHour))).toEqual([1, 2]);
    expect(litLamps(c, OUT - 1)).toEqual([1, 2]);
    expect(litLamps(c, OUT)).toEqual([]);
    expect(candlesBurn(c, tickAt(DAY, 20))).toBe(false);
  });

  it('lights each lamp at its reach and puts it out at out; an unlisted lamp never', () => {
    const c = suppliesClock(view(), [], DAY);
    expect(litLamps(c, SETTLE + 9)).toEqual([]);
    expect(litLamps(c, SETTLE + 10)).toEqual([1]);
    expect(litLamps(c, SETTLE + 30)).toEqual([1, 2, 3]);
    expect(litLamps(c, OUT - 1)).toEqual([1, 2, 3]);
    expect(litLamps(c, OUT)).toEqual([]);
    expect(litLamps(c, OUT - 1)).not.toContain(4);
  });

  it('burns candles from the settling until candleUntil', () => {
    const c = suppliesClock(view(), [], DAY);
    expect(candlesBurn(c, SETTLE - 1)).toBe(false);
    expect(candlesBurn(c, SETTLE)).toBe(true);
    expect(candlesBurn(c, tickAt(DAY, S.candleUntilHour) - 1)).toBe(true);
    expect(candlesBurn(c, tickAt(DAY, S.candleUntilHour))).toBe(false);
  });

  it('lets a view from a night before stand for tonight until the next one comes', () => {
    const c = suppliesClock(view(), [], DAY);
    const tomorrow = SETTLE + TICKS_PER_DAY;
    expect(clockShift(c, tomorrow)).toBe(TICKS_PER_DAY);
    expect(litLamps(c, tomorrow + 10)).toEqual([1]);
    expect(candlesBurn(c, tomorrow + 5)).toBe(true);
  });

  it('keeps one key between two edges, and a new one at each reach', () => {
    const c = suppliesClock(view(), [], DAY);
    const edges = clockEdges(c);
    expect(clockKey(c, edges, SETTLE + 11)).toBe(clockKey(c, edges, SETTLE + 29));
    expect(clockKey(c, edges, SETTLE + 29)).not.toBe(clockKey(c, edges, SETTLE + 30));
  });

  it('knows the town lamps by their nightly candle', () => {
    expect(['lantern', 'hanging-lantern', 'lamp-post'].every(isTownLamp)).toBe(true);
    expect(isTownLamp('bonfire')).toBe(false);
    expect(isTownLamp('bench')).toBe(false);
  });
});

describe('the lamplighter lights the lamps one by one (R3F)', () => {
  it('lights each lamp as its reach tick passes, and redraws the map at most once a frame', () => {
    const r = run(mirrorWith(view()), SETTLE);
    r.step(SETTLE);
    expect(r.layer.lit().lamps).toEqual([]);
    const first = r.step(SETTLE + 10);
    expect(first.lit.lamps).toEqual([1]);
    expect(first.changed).toBe(true);
    expect(first.redraw).toBe(true);
    // Nothing between two reaches: no change, no redraw.
    for (let t = SETTLE + 11; t < SETTLE + 30; t++) {
      const s = r.step(t);
      expect(s.changed).toBe(false);
      expect(s.redraw).toBe(false);
    }
    // Two lamps reached in the same tick: one change, one redraw.
    const both = r.step(SETTLE + 30);
    expect(both.lit.lamps).toEqual([1, 2, 3]);
    expect(both.redraw).toBe(true);
    expect(r.step(SETTLE + 31).redraw).toBe(false);
  });

  it('batches lamps reached in several ticks between two frames into one redraw', () => {
    const r = run(mirrorWith(view()), SETTLE);
    r.step(SETTLE);
    const jump = r.step(SETTLE + 40);
    expect(jump.lit.lamps).toEqual([1, 2, 3]);
    expect(jump.redraw).toBe(true);
  });

  it('draws one lit glass per flame of each lit lamp, in one instanced mesh', () => {
    const r = run(mirrorWith(view()), SETTLE);
    r.step(SETTLE + 10);
    expect(r.glass()?.count).toBe(1);
    r.step(SETTLE + 30);
    // Two lanterns and a lamp post's two arms.
    expect(r.glass()?.count).toBe(4);
    expect(r.glass()?.castShadow).toBe(false);
    r.step(OUT);
    expect(r.layer.lit().lamps).toEqual([]);
    expect(r.glass()?.visible).toBe(false);
  });

  it('feeds pools only for lamps lit, and none for the lamp with no candle', () => {
    const r = run(mirrorWith(view()), SETTLE + 30);
    r.step(SETTLE + 30);
    const pools = [...r.env.lightWriter.discs()].filter(
      (d) => d.radius === 1.4 || d.radius === 2.4 || d.radius === 1.6,
    );
    // Lanterns 1 and 2 (1.4) and the lamp post's two arms (2.4); the hanging lantern (1.6) unlit.
    expect(pools.filter((d) => d.radius === 1.4)).toHaveLength(2);
    expect(pools.filter((d) => d.radius === 2.4)).toHaveLength(2);
    expect(pools.filter((d) => d.radius === 1.6)).toHaveLength(0);
  });

  it('follows a pinned hour (a debug shot, a photo) rather than the Mirror', () => {
    const r = run(mirrorWith(view()), SETTLE - 300);
    r.step(SETTLE - 300);
    expect(r.layer.lit().lamps).toEqual([]);
    r.env.shown.hour = 21;
    r.layer.frame?.(0.016);
    expect(r.layer.lit().lamps).toEqual([1, 2, 3]);
  });

  it('takes a new view at once (a seat joining, the settling)', () => {
    const m = mirrorWith(view());
    const r = run(m, SETTLE + 15);
    r.step(SETTLE + 15);
    expect(r.layer.lit().lamps).toEqual([1]);
    m.supplies.value = view({ lamps: [{ id: 4, reach: SETTLE, out: OUT }] });
    r.step(SETTLE + 15);
    expect(r.layer.lit().lamps).toEqual([4]);
  });
});

describe('fires and candle-lit homes (R3F)', () => {
  it('throws no light from a fire resting cold', () => {
    const warm = run(mirrorWith(view({ resting: [] })), SETTLE + 40);
    warm.step(SETTLE + 40);
    const fires = (env: ReturnType<typeof run>['env']) =>
      [...env.lightWriter.discs()].filter((d) => d.color === 0xff9548);
    expect(fires(warm.env)).toHaveLength(2);
    const cold = run(mirrorWith(view({ resting: [{ id: 5, kind: 'cold' }] })), SETTLE + 40);
    cold.step(SETTLE + 40);
    expect(fires(cold.env)).toHaveLength(1);
  });

  it('marks a candle home in the mask while its candle burns, and clears it at bedtime', () => {
    const r = run(mirrorWith(view()), SETTLE + 40);
    r.step(SETTLE + 40);
    const data = candleMask(r.env).uCandles.value.image.data as Uint8Array;
    const at = (x: number, z: number) => data[z * 192 + x];
    expect(at(40, 44)).toBe(255);
    expect(at(41, 45)).toBe(255);
    // The other home has no candle.
    expect(at(44, 44)).toBe(0);
    expect(r.layer.lit().candles).toBe(true);
    const late = r.step(tickAt(DAY, S.candleUntilHour));
    expect(late.changed).toBe(true);
    expect(at(40, 44)).toBe(0);
  });

  it('lights every window of a candle home in the spill, whatever the share', () => {
    const m = mirrorWith(view());
    const r = run(m, SETTLE + 40);
    r.env.windowShare.value = 0;
    r.step(SETTLE + 40);
    const spill = [...r.env.lightWriter.discs()].filter((d) => d.radius === 0.95);
    // Only the candle home's windows (all of them) spill with the share at 0.
    expect(spill.length).toBeGreaterThan(0);
    expect(spill.every((d) => d.z < 47)).toBe(true);
  });

  it('reads the candle mask in the kit material, with a dusk floor for lamps the lamplighter lit', () => {
    const env = createWorldEnv(new PerspectiveCamera());
    const m = createWorldMaterial(env) as MeshLambertMaterial;
    const shader = {
      uniforms: UniformsUtils.clone(ShaderLib.lambert.uniforms),
      vertexShader: ShaderLib.lambert.vertexShader,
      fragmentShader: ShaderLib.lambert.fragmentShader,
    } as unknown as Parameters<NonNullable<MeshLambertMaterial['onBeforeCompile']>>[0];
    m.onBeforeCompile(shader, undefined as never);
    expect((shader.uniforms as Record<string, unknown>).uCandles).toBe(candleMask(env).uCandles);
    // A pane is lit by the share or by its home's candle; a lamp the lamplighter lit (glow 3) is
    // marked and burns from dusk at the floor.
    expect(shader.vertexShader).toContain('qCandle(qWorld.xyz, qWN)');
    expect(shader.vertexShader).toContain('glow > 2.5 ? -1.0 : 1.0');
    expect(shader.fragmentShader).toContain(`${LAMP_DUSK_FLOOR.toFixed(3)} * smoothstep(0.0, 0.025, uNight)`);
  });
});

describe('resting pieces in the decor layer (R3F)', () => {
  it('draws a town lamp with its glass unlit, and each piece in its own rest only', () => {
    expect(decorLook('lantern', undefined)).toBe('off');
    expect(decorLook('lantern', 'unlit')).toBe('unlit');
    expect(decorLook('lantern', 'faded')).toBe('off');
    expect(decorLook('bonfire', 'cold')).toBe('cold');
    expect(decorLook('bonfire', undefined)).toBeNull();
    expect(decorLook('cafe-table', 'bare')).toBe('bare');
    expect(decorLook('bunting', 'faded')).toBe('faded');
    expect(decorLook('fountain', 'dry')).toBe('dry');
    expect(decorLook('bench', 'dry')).toBeNull();
    expect(decorKey('fountain', 'dry')).toBe('fountain#dry');
    expect(decorKey('bench', null)).toBe('bench');
  });

  it('rebuilds once when the rests change, and not for a new view with the same rests', () => {
    const m = mirrorWith(view());
    const env = createWorldEnv(new PerspectiveCamera(60, 1.6, 0.5, 500));
    env.camera.position.set(44, 8, 52);
    env.camera.lookAt(44, 0, 40);
    env.camera.updateMatrixWorld();
    env.focus.set(44, 0, 40);
    let invalidated = 0;
    const scene = new Scene();
    const layer = decorLayer();
    layer.init({
      scene,
      mirror: m,
      material: undefined as never,
      invalidate: () => invalidated++,
      camera: env.camera,
      env,
    });
    layer.frame?.(0.016);
    const before = invalidated;
    m.supplies.value = view();
    layer.frame?.(0.016);
    expect(invalidated).toBe(before);
    m.supplies.value = view({ resting: [{ id: 5, kind: 'cold' }] });
    layer.frame?.(0.016);
    expect(invalidated).toBe(before + 1);
    const names = new Set<string>();
    scene.traverse((o) => {
      if ((o as InstancedMesh).isInstancedMesh && (o as InstancedMesh).count > 0) names.add(o.name);
    });
    expect(names.size).toBeGreaterThan(0);
    layer.dispose();
  });
});

describe("the lamplighter's pole (R3F)", () => {
  it('raises the light from carried to the lamp, higher and nearer upright', () => {
    const tip = (reach: number) => new Vector3(...POLE_TIP).applyMatrix4(polePose(reach));
    const carried = tip(0);
    const raised = tip(1);
    expect(raised.y).toBeGreaterThan(carried.y + 0.03);
    // Carried, the light leads ahead of him; raised, it stands over the lamp beside him.
    expect(carried.z).toBeGreaterThan(raised.z);
    expect(tip(0.5).y).toBeGreaterThan(carried.y);
  });

  it('carries its light from his round at dusk through the night', () => {
    expect(poleLit(12)).toBe(false);
    expect(poleLit(17)).toBe(true);
    expect(poleLit(23)).toBe(true);
    expect(poleLit(3)).toBe(true);
    expect(poleLit(8)).toBe(false);
  });
});
