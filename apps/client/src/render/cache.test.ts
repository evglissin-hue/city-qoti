import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { REST_MS, StillCache } from './cache';
import { MOVING_LAYER } from './layerTags';
import { deviceSize, fullScreenTriangle } from './post';

describe('the still-frame cache (V1D)', () => {
  it('rests only once the camera has been still for REST_MS, and only when the preset keeps one', () => {
    const c = new StillCache(new Scene(), new PerspectiveCamera());
    c.noteMove(1000);
    expect(c.resting(1000 + REST_MS)).toBe(false);
    c.enabled = true;
    expect(c.resting(1000 + REST_MS - 1)).toBe(false);
    expect(c.resting(1000 + REST_MS)).toBe(true);
    c.noteMove(1300);
    expect(c.resting(1400)).toBe(false);
  });

  it('holds nothing until a still frame is kept', () => {
    const c = new StillCache(new Scene(), new PerspectiveCamera());
    expect(c.valid('')).toBe(false);
    expect(c.valid('1|medium|3|4|5|6')).toBe(false);
  });

  it('restores from a full-screen mesh on the moving layer, drawn first and hidden by default', () => {
    const scene = new Scene();
    const c = new StillCache(scene, new PerspectiveCamera());
    expect(scene.children).toContain(c.restore);
    expect(c.restore.visible).toBe(false);
    expect(c.restore.layers.mask).toBe(1 << MOVING_LAYER);
    expect(c.restore.renderOrder).toBeLessThan(-1000);
    expect(c.restore.frustumCulled).toBe(false);
    c.dispose();
    expect(scene.children).not.toContain(c.restore);
  });
});

describe('the lean frame graph (V1D)', () => {
  it('covers the screen with one triangle whose uv runs 0 to 1 across it', () => {
    const g = fullScreenTriangle();
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    expect(p.count).toBe(3);
    // Clip space -1..1 maps to uv 0..1 along both axes (uv = (pos + 1) / 2).
    for (let i = 0; i < 3; i++) {
      expect(uv.getX(i)).toBeCloseTo((p.getX(i) + 1) / 2);
      expect(uv.getY(i)).toBeCloseTo((p.getY(i) + 1) / 2);
    }
  });

  it('sizes targets in device pixels, never below 2', () => {
    expect(deviceSize(1440, 900, 1)).toEqual([1440, 900]);
    expect(deviceSize(1440, 900, 0.72)).toEqual([1037, 648]);
    expect(deviceSize(1, 1, 0.5)).toEqual([2, 2]);
  });
});
