// @vitest-environment happy-dom
// V2X: the decor layer's orchard trees thin with the season, swapping geometry once a step.
import type { DecorView } from '@qoti/sim';
import { PerspectiveCamera, Scene, type InstancedMesh, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../../state/mirror';
import { TILE_FP } from '@qoti/sim';
import { createWorldEnv } from '../env';
import { decorLayer, fruitStep } from './decor';
import type { LayerContext } from './types';

const piece = (id: number, def: string, fx: number, fz: number): DecorView => ({
  id,
  def,
  fx,
  fz,
  rot: 0,
  builtBy: 0,
});

function setup() {
  const mirror = new Mirror();
  mirror.decor.set(1, piece(1, 'cherry-tree', 96.5 * TILE_FP, 96.5 * TILE_FP));
  mirror.decor.set(2, piece(2, 'hedge', 98.5 * TILE_FP, 96.5 * TILE_FP));
  const env = createWorldEnv(new PerspectiveCamera(60, 1.6, 0.5, 500));
  env.camera.position.set(96, 8, 110);
  env.camera.lookAt(96, 0, 96);
  env.camera.updateMatrixWorld();
  env.focus.set(96, 0, 96);
  env.shown.season = 1;
  env.shown.day = 2;
  const scene = new Scene();
  const ctx: LayerContext = {
    scene,
    mirror,
    material: undefined as never,
    invalidate: () => {},
    camera: env.camera,
    env,
  };
  const layer = decorLayer();
  layer.init(ctx);
  const geo = (name: string): BufferGeometry => {
    let g: BufferGeometry | undefined;
    scene.traverse((o) => {
      const m = o as InstancedMesh;
      if (m.isInstancedMesh && m.name === name) g = m.geometry;
    });
    return g!;
  };
  return { layer, env, geo };
}

describe('orchard thinning in the decor layer', () => {
  it('holds a quarter at least, and is full in summer', () => {
    expect(fruitStep(1, 5)).toBe(1);
    expect(fruitStep(3, 3)).toBe(0.25);
    expect(fruitStep(2, 7)).toBe(0.25);
  });

  it('swaps fruit geometry only when the step changes, and never a hedge', () => {
    const { layer, env, geo } = setup();
    expect(layer.frame?.(0.016)).toBe(true);
    const full = geo('cherry-tree:high');
    const hedge = geo('hedge:high');
    expect(full).toBeDefined();
    expect(layer.frame?.(0.016)).toBe(false);
    // Another day in the same step: nothing built or swapped.
    env.shown.day = 6;
    expect(layer.frame?.(0.016)).toBe(false);
    expect(geo('cherry-tree:high')).toBe(full);
    // Autumn day 5 thins.
    env.shown.season = 2;
    env.shown.day = 5;
    expect(layer.frame?.(0.016)).toBe(true);
    const thin = geo('cherry-tree:high');
    expect(thin).not.toBe(full);
    expect(thin.getAttribute('position').count).toBeLessThan(full.getAttribute('position').count);
    expect(layer.frame?.(0.016)).toBe(false);
    expect(geo('cherry-tree:high')).toBe(thin);
    // Winter, then back to a step already built: the same geometry returns.
    env.shown.season = 3;
    env.shown.day = 1;
    expect(layer.frame?.(0.016)).toBe(true);
    const winter = geo('cherry-tree:high');
    env.shown.season = 2;
    env.shown.day = 5;
    expect(layer.frame?.(0.016)).toBe(true);
    expect(geo('cherry-tree:high')).toBe(thin);
    env.shown.season = 3;
    expect(layer.frame?.(0.016)).toBe(true);
    expect(geo('cherry-tree:high')).toBe(winter);
    expect(geo('hedge:high')).toBe(hedge);
  });
});
