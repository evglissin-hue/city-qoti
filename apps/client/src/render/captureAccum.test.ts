import { describe, expect, it } from 'vitest';
import { DirectionalLight, Vector3 } from 'three';
import { captureJitterIndices, captureSampleCount, PRINT_SAMPLES } from './captureAccum';
import { PHOTO_SAMPLES, refineJitter, SKY_EVERY } from './refine';
import { SampleSun, ShadowCache } from './shadows';

describe('capture samples (V4X)', () => {
  it("n = 0, absent, negative or not a number draws nothing extra: today's one pass", () => {
    for (const s of [undefined, 0, -3, Number.NaN]) {
      expect(captureSampleCount(s, 480, 360)).toBe(0);
      expect(captureSampleCount(s, 1600, 1200)).toBe(0);
    }
  });

  it('caps a slot at PHOTO_SAMPLES and a print at PRINT_SAMPLES, whole numbers only', () => {
    expect(captureSampleCount(16, 480, 360)).toBe(16);
    expect(captureSampleCount(9.7, 480, 360)).toBe(9);
    expect(captureSampleCount(500, 480, 360)).toBe(PHOTO_SAMPLES);
    expect(captureSampleCount(8, 1600, 1200)).toBe(8);
    expect(captureSampleCount(PHOTO_SAMPLES, 1600, 1200)).toBe(PRINT_SAMPLES);
    expect(PRINT_SAMPLES).toBeLessThan(PHOTO_SAMPLES);
  });

  it('draws sample 0 (the plain one) then refineJitter(1..n), sky indices included as sun-disc samples', () => {
    const idx = captureJitterIndices(8);
    expect(idx).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(refineJitter(idx[0]!).pixel).toEqual([0, 0]);
    expect(refineJitter(idx[0]!).sun).toEqual([0, 0]);
    // Every index has a sun position, sky ones too (the sky is the still frame cache's).
    for (const i of idx) {
      expect(refineJitter(i).sun).toHaveLength(2);
      if (i > 0 && i % SKY_EVERY === 0) expect(refineJitter(i).sky).not.toBeNull();
    }
    expect(captureJitterIndices(0)).toEqual([0]);
  });
});

describe('a sample sun fitted to a capture (V4X)', () => {
  it("follows the capture's aim even before the main view has a cached frustum", () => {
    const light = new DirectionalLight(0xffffff, 1);
    const sun = new SampleSun();
    const cache = new ShadowCache();
    const dir = new Vector3(0.3, 1, 0.2).normalize();
    // No frustum to follow: a plain sample cannot be placed, a fitted one can.
    expect(sun.begin(light, cache, dir, undefined, 1024)).toBe(false);
    const fit = { center: new Vector3(80, 0, 40), half: 30 };
    expect(sun.begin(light, cache, dir, undefined, 1024, fit)).toBe(true);
    expect(light.shadow.camera.right).toBe(30);
    expect(light.target.position.distanceTo(fit.center)).toBeLessThan(2);
    sun.end(light);
    sun.dispose();
  });
});
