import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { Mirror } from '../../state/mirror';
import { createWorldEnv } from '../env';
import { BLOB_DISTANCE_SHARE, blobChannel, blobsLayer, blobSinkFor } from './blobs';
import type { LayerContext } from './types';

function context(): LayerContext {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 20, 0);
  camera.updateMatrixWorld();
  const env = createWorldEnv(camera);
  return { scene: new Scene(), mirror: {} as Mirror, material: null!, invalidate() {}, camera, env };
}

describe('blob shadows', () => {
  it('draw one soft disc per figure a producer pushes, whichever layer runs first', () => {
    const ctx = context();
    // The producer asks for its channel before the blob layer exists, as animals and carts do.
    const carts = blobChannel(ctx, 'carts');
    const layer = blobsLayer();
    layer.init(ctx);
    carts.begin();
    carts.push(1, 0, 1, 0.26, 0.6, Math.PI / 2);
    carts.push(3, 0, 1, 0.26, 0.6, 0);
    carts.end();
    expect(carts.mesh?.count).toBe(2);
    expect(carts.mesh?.castShadow).toBe(false);
    // Turned a quarter: the long axis lies along x.
    const e = carts.mesh!.instanceMatrix.array;
    expect(Math.abs(e[0]!)).toBeLessThan(1e-6);
    expect(Math.abs(e[2]!)).toBeCloseTo(0.52, 5);
    expect(Math.abs(e[8]!)).toBeCloseTo(1.2, 5);
    expect(blobSinkFor(ctx.mirror).drawn.get('carts')).toBe(2);
    layer.dispose();
  });

  it('shrink away at about the resident detail distance', () => {
    const ctx = context();
    const layer = blobsLayer();
    layer.init(ctx);
    const animals = blobChannel(ctx, 'animals');
    const max = ctx.env!.detailDistance * BLOB_DISTANCE_SHARE;
    animals.begin();
    animals.push(0, 0, 0, 0.1);
    animals.push(Math.sqrt((max * 0.95) ** 2 - 400), 0, 0, 0.1);
    animals.push(max * 1.2, 0, 0, 0.1);
    animals.end();
    expect(animals.mesh?.count).toBe(2);
    const e = animals.mesh!.instanceMatrix.array;
    expect(e[16]!).toBeLessThan(e[0]!);
    layer.dispose();
  });
});
