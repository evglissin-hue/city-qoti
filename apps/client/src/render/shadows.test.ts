import { DirectionalLight, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  halfFor,
  MAX_HALF,
  MIN_HALF,
  ShadowCache,
  snapToTexels,
  SUN_EPSILON,
  type ShadowView,
} from './shadows';

const SUN = new Vector3(0.4, 0.8, 0.45).normalize();

function view(x: number, z: number, distance = 60, sunDir = SUN, size = 2048): ShadowView {
  return { target: new Vector3(x, 0, z), distance, sunDir, size };
}

/** Renders whenever the cache says so, as the renderer does; returns the reasons, in order. */
function step(cache: ShadowCache, light: DirectionalLight, v: ShadowView, content = false): string | null {
  const reason = cache.due(v, content);
  if (reason) cache.apply(light, v, reason);
  return reason;
}

describe('cached sun shadows (V1D)', () => {
  it('fits the frustum to the view distance within its bounds', () => {
    expect(halfFor(5)).toBe(MIN_HALF);
    expect(halfFor(60)).toBeCloseTo(57);
    expect(halfFor(1000)).toBe(MAX_HALF);
  });

  it('snaps the center to whole shadow texels in the light’s view plane', () => {
    const size = 2048;
    const half = 60;
    const texel = (2 * half) / size;
    const a = snapToTexels(new Vector3(96.3, 2, 101.7), SUN, half, size);
    const b = snapToTexels(new Vector3(96.3 + texel * 0.3, 2, 101.7), SUN, half, size);
    // Moving the view a fraction of a texel either lands on the same texel or a whole one away.
    const x = new Vector3().crossVectors(new Vector3(0, 1, 0), SUN).normalize();
    const y = new Vector3().crossVectors(SUN, x).normalize();
    for (const p of [a, b]) {
      expect(Math.abs(p.dot(x) / texel - Math.round(p.dot(x) / texel))).toBeLessThan(1e-6);
      expect(Math.abs(p.dot(y) / texel - Math.round(p.dot(y) / texel))).toBeLessThan(1e-6);
    }
    // Depth along the light is kept.
    expect(a.dot(SUN)).toBeCloseTo(new Vector3(96.3, 2, 101.7).dot(SUN));
  });

  it('renders once, then holds while nothing changes', () => {
    const cache = new ShadowCache();
    const light = new DirectionalLight();
    expect(step(cache, light, view(96, 96))).toBe('forced');
    for (let i = 0; i < 50; i++) expect(step(cache, light, view(96, 96))).toBeNull();
    expect(cache.renders).toBe(1);
  });

  it('follows the view with hysteresis: a small pan holds, leaving the inner half refits', () => {
    const cache = new ShadowCache();
    const light = new DirectionalLight();
    step(cache, light, view(96, 96));
    const half = cache.halfWidth;
    expect(step(cache, light, view(96 + half * 0.3, 96))).toBeNull();
    expect(step(cache, light, view(96 + half * 0.7, 96))).toBe('view');
    expect(cache.renders).toBe(2);
    // Panning along the light's direction moves nothing it can see.
    const along = SUN.clone().multiplyScalar(half * 3);
    expect(
      step(cache, light, { ...view(0, 0), target: new Vector3(96 + half * 0.7, 0, 96).add(along) }),
    ).toBeNull();
  });

  it('refits when the view no longer fits, or the frustum is far too big', () => {
    const cache = new ShadowCache();
    const light = new DirectionalLight();
    step(cache, light, view(96, 96, 60));
    expect(step(cache, light, view(96, 96, 66))).toBeNull();
    expect(step(cache, light, view(96, 96, 120))).toBe('view');
    expect(step(cache, light, view(96, 96, 30))).toBe('view');
    expect(light.shadow.camera.right).toBeGreaterThanOrEqual(halfFor(30));
  });

  it('renders again when the sun moves more than about half a degree', () => {
    const cache = new ShadowCache();
    const light = new DirectionalLight();
    step(cache, light, view(96, 96));
    const tilt = (a: number) => SUN.clone().applyAxisAngle(new Vector3(0, 1, 0), a);
    expect(step(cache, light, view(96, 96, 60, tilt(SUN_EPSILON * 0.5)))).toBeNull();
    expect(step(cache, light, view(96, 96, 60, tilt(SUN_EPSILON * 3)))).toBe('sun');
  });

  it('renders for a content change, a new map size and a forced render', () => {
    const cache = new ShadowCache();
    const light = new DirectionalLight();
    step(cache, light, view(96, 96));
    expect(step(cache, light, view(96, 96), true)).toBe('content');
    expect(step(cache, light, view(96, 96, 60, SUN, 4096))).toBe('size');
    cache.force();
    expect(step(cache, light, view(96, 96))).toBe('forced');
    expect(cache.renders).toBe(4);
  });

  it('places the light along the sun from the snapped center', () => {
    const cache = new ShadowCache();
    const light = new DirectionalLight();
    step(cache, light, view(100, 80));
    const dir = light.position.clone().sub(light.target.position).normalize();
    expect(dir.distanceTo(SUN)).toBeLessThan(1e-6);
    expect(light.target.position.distanceTo(new Vector3(100, 0, 80))).toBeLessThan(0.2);
  });
});
