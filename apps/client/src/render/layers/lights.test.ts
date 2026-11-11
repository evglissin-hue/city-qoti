// @vitest-environment happy-dom
// V2A: the light sources the lights layer feeds the light map, and the era lamp colors.
import { LAMP_COLORS, palette } from '@qoti/art';
import type { BuildingView, DecorView } from '@qoti/sim';
import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../../state/mirror';
import { createWorldEnv } from '../env';
import type { LightDisc } from '../lightMap';
import { lampColor, lampEra } from '../lighting';
import { festivalLayer } from './festival';
import { lightsLayer, ovenLit, OVEN_KITS, SHOP_KITS, shopLit } from './lights';
import type { LayerContext } from './types';

const building = (id: number, def: string, x: number, z: number): BuildingView => ({
  id,
  def,
  x,
  z,
  rot: 0,
  builtBy: 0,
  handmade: false,
  stage: 'built',
  foundation: false,
});

const decor = (id: number, def: string, fx: number, fz: number): DecorView => ({
  id,
  def,
  fx,
  fz,
  rot: 0,
  builtBy: 0,
});

/** Runs the layer against a mirror and records the discs each source last got. */
function run(mirror: Mirror, hour: number, share = 1) {
  const env = createWorldEnv(new PerspectiveCamera());
  env.shown.hour = hour;
  env.windowShare.value = share;
  const sources = new Map<string, readonly LightDisc[]>();
  const set = env.lightWriter.set.bind(env.lightWriter);
  env.lightWriter.set = (source, discs) => {
    sources.set(source, discs);
    return set(source, discs);
  };
  const ctx: LayerContext = {
    scene: new Scene(),
    mirror,
    material: undefined as never,
    invalidate: () => {},
    camera: new PerspectiveCamera(),
    env,
  };
  const layer = lightsLayer();
  layer.init(ctx);
  const changed = layer.frame?.(0.016);
  return { env, layer, sources, changed };
}

describe('hour windows', () => {
  it('lights ovens from 4 to 23 and shops from 17 to 22:30 (the tavern to midnight)', () => {
    expect(ovenLit(3.9)).toBe(false);
    expect(ovenLit(4)).toBe(true);
    expect(ovenLit(22.9)).toBe(true);
    expect(ovenLit(23)).toBe(false);
    expect(shopLit('shop', 16.9)).toBe(false);
    expect(shopLit('shop', 17)).toBe(true);
    expect(shopLit('shop', 22.4)).toBe(true);
    expect(shopLit('shop', 22.5)).toBe(false);
    expect(shopLit('tavern', 23.9)).toBe(true);
    expect(shopLit('tavern', 16)).toBe(false);
  });

  it('keeps its kit lists sorted', () => {
    expect([...OVEN_KITS]).toEqual([...OVEN_KITS].sort());
    expect([...SHOP_KITS]).toEqual([...SHOP_KITS].sort());
  });
});

describe('era lamps', () => {
  it('uses the Old Age unless a def lists exactly one era', () => {
    expect(lampEra()).toBe('old');
    expect(lampEra(['old', 'steam'])).toBe('old');
    expect(lampEra(['steam'])).toBe('steam');
    expect(lampEra(['bright'])).toBe('bright');
    expect(lampColor(['steam'])).toBe(LAMP_COLORS.steam);
  });

  it('colors them candle, gas and electric', () => {
    expect(LAMP_COLORS).toEqual({ old: 0xffc977, steam: 0xe8de80, bright: 0xffecce });
    expect(LAMP_COLORS.old).toBe(palette.lantern);
  });
});

describe('the lights layer sources', () => {
  const m = new Mirror();
  m.decor.set(1, decor(1, 'lamp-post', 5, 5));
  m.decor.set(2, decor(2, 'bonfire', 20, 20));
  m.buildings.set(10, building(10, 'bakery', 30, 30));
  m.buildings.set(11, building(11, 'cottage', 40, 40));

  it('puts the lamp post in lanterns and the bonfire in fires, not both', () => {
    const { sources } = run(m, 19);
    const lanterns = sources.get('lanterns') ?? [];
    const fires = sources.get('fires') ?? [];
    expect(lanterns.length).toBeGreaterThan(0);
    expect(lanterns[0]).toMatchObject({ radius: 2.8, intensity: 1, color: LAMP_COLORS.old });
    expect(lanterns.some((d) => d.radius === 3.6)).toBe(false);
    expect(fires.length).toBeGreaterThan(0);
    expect(fires[0]).toMatchObject({ radius: 3.6, intensity: 1.7, color: 0xff7a3a });
  });

  it('lights the bakery oven by day and evening, not in the small hours', () => {
    const on = run(m, 12).sources.get('ovens') ?? [];
    expect(on).toHaveLength(1);
    expect(on[0]).toMatchObject({ radius: 1.9, intensity: 0.95, color: 0xff8f45 });
    expect(run(m, 2).sources.get('ovens') ?? []).toHaveLength(0);
  });

  it('spills light under lit windows, thinner above the ground floor', () => {
    const lit = run(m, 21, 1).sources.get('windows') ?? [];
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.every((d) => d.radius === 1.15 && (d.intensity === 0.3 || d.intensity === 0.2))).toBe(true);
    expect(run(m, 21, 0).sources.get('windows') ?? []).toHaveLength(0);
  });

  it('lights a shop door lamp of an evening only', () => {
    const shop = new Mirror();
    shop.buildings.set(1, building(1, 'market-stall', 10, 10));
    const evening = run(shop, 19).sources.get('shops') ?? [];
    expect(evening).toHaveLength(1);
    expect(evening[0]).toMatchObject({ radius: 3, intensity: 0.6 });
    expect(run(shop, 12).sources.get('shops') ?? []).toHaveLength(0);
  });

  it('reports a static change when discs change, and again when the hour crosses a window', () => {
    const r = run(m, 12);
    expect(r.changed).toBe(true);
    expect(r.layer.frame?.(0.016)).toBe(false);
    r.env.shown.hour = 2;
    expect(r.layer.frame?.(0.016)).toBe(true);
  });

  it('does not run the 32-light loop unless the debug switch asks for it', () => {
    expect(run(m, 22).env.lightCount.value).toBe(0);
  });

  it('clears every source on dispose', () => {
    const r = run(m, 19);
    r.layer.dispose?.();
    expect([...r.env.lightWriter.discs()]).toHaveLength(0);
  });
});

describe('the festival source', () => {
  it('is empty with no festival today', () => {
    const env = createWorldEnv(new PerspectiveCamera());
    const layer = festivalLayer();
    layer.init({
      scene: new Scene(),
      mirror: new Mirror(),
      material: undefined as never,
      invalidate: () => {},
      camera: new PerspectiveCamera(),
      env,
    });
    expect([...env.lightWriter.discs()]).toHaveLength(0);
    layer.dispose?.();
  });
});
