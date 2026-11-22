// @vitest-environment happy-dom
import type { MapReader } from '@qoti/sim';
import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraController, smoothDamp } from './camera';

describe('camera smoothing', () => {
  it('glides to the target without overshoot, at any frame rate', () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
      const vel = { v: 0 };
      let x = 0;
      let max = 0;
      for (let t = 0; t < 2; t += dt) {
        x = smoothDamp(x, 10, vel, 0.16, dt);
        max = Math.max(max, x);
      }
      expect(max).toBeLessThanOrEqual(10.0001);
      expect(x).toBeCloseTo(10, 3);
    }
  });
});

describe('V4.0: the tea break camera hooks', () => {
  it('saves a view and puts it back exactly, and the orbit and drift stubs move nothing', () => {
    const el = document.createElement('div');
    const camera = new PerspectiveCamera();
    const rig = new CameraController(camera, { height: () => 0 } as unknown as MapReader, el);
    rig.focus(40, 50, 80);
    rig.snap();
    const saved = rig.saveView();
    const pose = camera.position.clone();
    rig.panByPixels(200, 100);
    rig.rotateBy(0.7, 0.1);
    for (let i = 0; i < 60; i++) rig.update(1 / 60);
    expect(camera.position.distanceTo(pose)).toBeGreaterThan(1);
    rig.restoreView(saved);
    expect(rig.saveView()).toEqual(saved);
    expect(camera.position.distanceTo(pose)).toBeLessThan(1e-9);
    // Restored means settled: no glide left over.
    expect(rig.update(1 / 60)).toBe(false);
    rig.orbit({ x: 40, z: 50, distance: 60, speed: 0.1 });
    rig.setDrift(true);
    expect(rig.update(1 / 60)).toBe(false);
    expect(camera.position.distanceTo(pose)).toBeLessThan(1e-9);
    rig.dispose();
  });
});
