import { describe, expect, it } from 'vitest';
import {
  MAX_VOICES,
  emptyPresence,
  hourWindow,
  mixAmbience,
  panOf,
  zoomGain,
  type AmbienceConditions,
  type AmbienceScene,
} from './ambience';
import { hearingRadius, sampleScene } from './scene';
import { Terrain, Water, type BuildingView } from '@qoti/sim';

function scene(over: Partial<AmbienceScene> = {}): AmbienceScene {
  return {
    water: emptyPresence(),
    forest: emptyPresence(),
    grass: emptyPresence(),
    height: 0,
    hammer: emptyPresence(),
    anvil: emptyPresence(),
    saw: emptyPresence(),
    market: emptyPresence(),
    homes: emptyPresence(),
    radius: 30,
    ...over,
  };
}

const NOON: AmbienceConditions = {
  hour: 12,
  season: 1,
  weather: 'clear',
  frozen: false,
  festival: false,
  zoom: 60,
  yaw: 0,
};
const ids = (s: AmbienceScene, c = NOON) => mixAmbience(s, c).map((l) => l.id);

describe('ambience mix', () => {
  it('hears the river by water and stops when it freezes', () => {
    const s = scene({ water: { amount: 0.2, dx: 0, dz: 0 } });
    expect(ids(s)).toContain('river');
    expect(ids(s, { ...NOON, season: 3, frozen: true })).not.toContain('river');
  });

  it('has birds by the woods by day and crickets on the grass at night, not in winter or rain', () => {
    const s = scene({ forest: { amount: 0.4, dx: 0, dz: 0 }, grass: { amount: 0.5, dx: 0, dz: 0 } });
    expect(ids(s)).toContain('birds');
    expect(ids(s)).not.toContain('crickets');
    const night = { ...NOON, hour: 23 };
    expect(ids(s, night)).toContain('crickets');
    expect(ids(s, night)).not.toContain('birds');
    expect(ids(s, { ...night, season: 3 })).not.toContain('crickets');
    expect(ids(s, { ...NOON, weather: 'rain' })).not.toContain('birds');
    expect(ids(s, { ...NOON, weather: 'rain' })).toContain('rain');
  });

  it('works by day: the smithy rings at noon and rests at night', () => {
    const s = scene({ anvil: { amount: 1, dx: 4, dz: 0 } });
    expect(ids(s)).toContain('anvil');
    expect(ids(s, { ...NOON, hour: 22 })).not.toContain('anvil');
  });

  it('fills with a crowd at the festival', () => {
    const lv = mixAmbience(scene(), { ...NOON, hour: 19, festival: true });
    expect(lv.find((l) => l.id === 'murmur')?.gain).toBe(1);
  });

  it('gets quieter with distance and zoom, and windier zoomed out', () => {
    const near = mixAmbience(scene({ water: { amount: 0.2, dx: 2, dz: 0 } }), NOON).find(
      (l) => l.id === 'river',
    )!;
    const far = mixAmbience(scene({ water: { amount: 0.2, dx: 25, dz: 0 } }), NOON).find(
      (l) => l.id === 'river',
    )!;
    expect(far.gain).toBeLessThan(near.gain);
    expect(zoomGain(300)).toBeLessThan(zoomGain(40));
    const windNear = mixAmbience(scene(), NOON).find((l) => l.id === 'wind')!.gain;
    const windFar = mixAmbience(scene(), { ...NOON, zoom: 300 }).find((l) => l.id === 'wind')!.gain;
    expect(windFar).toBeGreaterThan(windNear);
  });

  it('pans by where the sound is on screen, and plays at most eight voices', () => {
    expect(panOf(10, 0, 0, 20)).toBeGreaterThan(0);
    expect(panOf(-10, 0, 0, 20)).toBeLessThan(0);
    // Turned half way round, right becomes left.
    expect(panOf(10, 0, Math.PI, 20)).toBeLessThan(0);
    const p = { amount: 1, dx: 0, dz: 0 };
    const busy = scene({
      water: p,
      forest: p,
      grass: p,
      hammer: p,
      anvil: p,
      saw: p,
      market: p,
      homes: { amount: 9, dx: 0, dz: 0 },
      height: 1,
    });
    const lv = mixAmbience(busy, { ...NOON, weather: 'storm', hour: 10, season: 3, zoom: 30 });
    expect(lv.length).toBeLessThanOrEqual(MAX_VOICES);
    for (let i = 1; i < lv.length; i++) expect(lv[i]!.gain).toBeLessThanOrEqual(lv[i - 1]!.gain);
  });

  it('crackles a hearth close by homes in winter, and not on a summer noon', () => {
    const s = scene({ homes: { amount: 8, dx: 2, dz: 0 } });
    expect(ids(s, { ...NOON, season: 3, zoom: 40 })).toContain('hearth');
    expect(ids(s, { ...NOON, season: 2, hour: 20, zoom: 40 })).toContain('hearth');
    expect(ids(s, { ...NOON, zoom: 40 })).not.toContain('hearth');
    expect(ids(s, { ...NOON, season: 3, zoom: 200 })).not.toContain('hearth');
  });

  it('windows hours across midnight', () => {
    expect(hourWindow(23, 20, 5)).toBe(1);
    expect(hourWindow(12, 20, 5)).toBe(0);
    expect(hourWindow(20.5, 20, 5)).toBeCloseTo(0.5);
  });
});

describe('scene sampling', () => {
  it('finds water, woods and working buildings around the focus', () => {
    const size = 64;
    const n = size * size;
    const layers = {
      terrain: new Uint8Array(n),
      water: new Uint8Array(n),
      tree: new Uint8Array(n),
      height: new Uint8Array(n),
      occupant: new Int32Array(n),
    };
    for (let z = 0; z < size; z++) for (let x = 40; x < 44; x++) layers.water[z * size + x] = Water.river;
    for (let z = 0; z < size; z++)
      for (let x = 0; x < 10; x++) layers.terrain[z * size + x] = Terrain.forestFloor;
    const b = (id: number, def: string, x: number, present: number): BuildingView =>
      ({
        id,
        def,
        x,
        z: 32,
        rot: 0,
        builtBy: 0,
        handmade: false,
        stage: 'built',
        foundation: false,
        rt: { present },
      }) as unknown as BuildingView;
    const s = sampleScene(
      layers,
      [b(1, 'smithy', 36, 1), b(2, 'smithy', 30, 0), b(3, 'market-stall', 28, 0)],
      32,
      32,
      60,
      size,
    );
    expect(s.radius).toBe(hearingRadius(60));
    expect(s.water.amount).toBeGreaterThan(0);
    expect(s.water.dx).toBeGreaterThan(0);
    expect(s.forest.dx).toBeLessThan(0);
    expect(s.anvil.amount).toBe(1);
    expect(s.market.amount).toBe(1);
  });
});
