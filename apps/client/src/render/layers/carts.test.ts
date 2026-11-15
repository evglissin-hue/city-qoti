import { Mesh, PerspectiveCamera, Scene, type InstancedMesh } from 'three';
import { describe, expect, it } from 'vitest';
import type { Mirror } from '../../state/mirror';
import { createWorldEnv } from '../env';
import { createWorldMaterial, kitUniforms } from '../material';
import { cartsLayer } from './carts';
import type { LayerContext } from './types';

describe('carts layer material', () => {
  it('lays patterns from local position and reads the same env uniforms as the shared material', () => {
    const camera = new PerspectiveCamera();
    const env = createWorldEnv(camera);
    const shared = createWorldMaterial(env);
    const ctx: LayerContext = {
      scene: new Scene(),
      mirror: {} as Mirror,
      material: shared,
      invalidate() {},
      camera,
      env,
    };
    const layer = cartsLayer();
    layer.init(ctx);
    const own = layer.material!;
    expect(own).not.toBe(shared);
    expect(own.defines?.Q_PATTERN_LOCAL).toBe('');
    expect(shared.defines?.Q_PATTERN_LOCAL).toBeUndefined();
    const meshes = ctx.scene.children.filter((o): o is InstancedMesh => o instanceof Mesh);
    expect(meshes.length).toBeGreaterThan(6);
    for (const mesh of meshes) expect(mesh.material).toBe(own);
    // Season, snow, sway, sky and patterns are the env's objects, shared by every kit material.
    const u = kitUniforms(env);
    const mine = own.userData.kitUniforms as typeof u;
    const theirs = shared.userData.kitUniforms as typeof u;
    for (const k of ['uPat', 'uSnow', 'uSeasonTint', 'uSway', 'uSwayTime', 'uSky', 'uSunDir'] as const) {
      expect(mine[k]).toBe(u[k]);
      expect(theirs[k]).toBe(u[k]);
    }
    layer.dispose();
    expect(layer.material).toBeNull();
  });
});
