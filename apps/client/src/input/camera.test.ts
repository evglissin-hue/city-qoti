// @vitest-environment happy-dom
import type { MapReader } from '@qoti/sim';
import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraController, ORBIT_PITCH, orbitGoal, smoothDamp } from './camera';
import { ORBIT_SPEED } from './teaBreak';

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
  it('saves a view and puts it back exactly', () => {
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
    rig.dispose();
  });
});

describe('V4C: the tea break orbit', () => {
  const make = () => {
    const camera = new PerspectiveCamera();
    const rig = new CameraController(
      camera,
      { height: () => 0 } as unknown as MapReader,
      document.createElement('div'),
    );
    rig.reducedMotion = false;
    return rig;
  };
  const deg = (r: number) => (r * 180) / Math.PI;

  it('orbitGoal keeps distance, pitch, speed and the center inside bounds', () => {
    expect(orbitGoal({ x: 5, z: 5, distance: 1, speed: 0 }).distance).toBe(12);
    expect(orbitGoal({ x: 5, z: 5, distance: 9999, speed: 0 }).distance).toBe(320);
    const g = orbitGoal({ x: 5, z: 5, distance: 40, speed: 0 });
    expect(deg(g.pitch)).toBeCloseTo(45, 6);
    expect(deg(g.pitch)).toBeGreaterThanOrEqual(30);
    expect(deg(g.pitch)).toBeLessThanOrEqual(65);
    expect(ORBIT_PITCH).toBeCloseTo(g.pitch, 9);
    expect(orbitGoal({ x: 0, z: 0, distance: 40, speed: 5 }).speed).toBeCloseTo((2 * Math.PI) / 60, 9);
    expect(orbitGoal({ x: 0, z: 0, distance: 40, speed: -5 }).speed).toBeCloseTo(-(2 * Math.PI) / 60, 9);
    expect(orbitGoal({ x: 0, z: 0, distance: 40, speed: Number.NaN }).speed).toBe(0);
    const edge = orbitGoal({ x: -50, z: 99999, distance: 40, speed: 0 });
    expect(edge.x).toBe(0);
    expect(edge.z).toBeGreaterThan(0);
    expect(edge.z).toBeLessThan(99999);
  });

  it('turns the yaw steadily, stays inside the play clamp, and keeps moving', () => {
    const rig = make();
    rig.setDrift(true);
    rig.orbit({ x: 60, z: 60, distance: 34, speed: ORBIT_SPEED });
    expect(rig.orbiting).toBe(true);
    for (let i = 0; i < 600; i++) rig.update(1 / 60);
    const y0 = rig.saveView().yaw;
    let moving = true;
    for (let i = 0; i < 600; i++) {
      moving = rig.update(1 / 60) && moving;
      const v = rig.saveView();
      expect(deg(v.pitch)).toBeGreaterThanOrEqual(30);
      expect(deg(v.pitch)).toBeLessThanOrEqual(65);
      expect(v.distance).toBeGreaterThanOrEqual(12);
      expect(v.distance).toBeLessThanOrEqual(320);
    }
    expect(moving).toBe(true);
    expect(rig.saveView().yaw - y0).toBeCloseTo(ORBIT_SPEED * 10, 3);
    rig.dispose();
  });

  it('restoreView after orbiting puts the view back and stops the orbit', () => {
    const rig = make();
    rig.focus(40, 50, 80);
    rig.snap();
    const saved = rig.saveView();
    rig.setDrift(true);
    rig.orbit({ x: 100, z: 100, distance: 34, speed: ORBIT_SPEED });
    for (let i = 0; i < 300; i++) rig.update(1 / 60);
    expect(rig.saveView()).not.toEqual(saved);
    rig.restoreView(saved);
    expect(rig.saveView()).toEqual(saved);
    expect(rig.orbiting).toBe(false);
    expect(rig.update(1 / 60)).toBe(false);
    rig.dispose();
  });

  it('drift makes a focus settle more slowly', () => {
    const settle = (drift: boolean) => {
      const rig = make();
      rig.snap();
      rig.setDrift(drift);
      rig.focus(rig.saveView().x + 60, rig.saveView().z);
      const x0 = rig.saveView().x - 60;
      for (let i = 0; i < 30; i++) rig.update(1 / 60);
      const got = (rig as unknown as { view: { x: number } }).view.x;
      rig.dispose();
      return got - x0;
    };
    expect(settle(true)).toBeLessThan(settle(false));
  });

  it('with calm motion the circle does not turn the yaw', () => {
    const rig = make();
    rig.reducedMotion = true;
    rig.orbit({ x: 60, z: 60, distance: 34, speed: ORBIT_SPEED });
    const y0 = rig.saveView().yaw;
    for (let i = 0; i < 300; i++) rig.update(1 / 60);
    expect(rig.saveView().yaw).toBe(y0);
    rig.dispose();
  });
});
