import { PerspectiveCamera, ShaderLib } from 'three';
import { describe, expect, it } from 'vitest';
import { createWorldEnv } from './env';
import { groundAoFor } from './groundAo';
import { createWorldMaterial } from './material';
import { patchWallAo } from './wallAo';

const FRAGMENT =
  'void main() {\n#include <lights_fragment_end>\n#include <aomap_fragment>\n#include <emissivemap_fragment>\n}';

const VERTEX = 'void main() {\n#include <project_vertex>\n#include <fog_vertex>\n}';

function fake(fragment = FRAGMENT, vertex = VERTEX) {
  return {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: vertex,
    fragmentShader: fragment,
  };
}

describe('wall occlusion (V2C)', () => {
  it('binds the shared ground AO uniform and adds its block once, after the chunk', () => {
    const env = createWorldEnv(new PerspectiveCamera());
    const shader = fake();
    patchWallAo(shader as never, env);
    expect(shader.uniforms.uGroundAo).toBe(groundAoFor(env));
    const frag = shader.fragmentShader;
    expect(frag).toContain('#include <aomap_fragment>');
    expect(frag.split('V2C wall occlusion').length - 1).toBe(1);
    expect(frag.indexOf('V2C wall occlusion')).toBeGreaterThan(frag.indexOf('#include <aomap_fragment>'));
    expect(frag.indexOf('V2C wall occlusion')).toBeLessThan(frag.indexOf('#include <emissivemap_fragment>'));
    expect(frag.split('uniform sampler2D uGroundAo').length - 1).toBe(1);
  });

  it('throws, naming the chunk, when the anchor is missing', () => {
    const env = createWorldEnv(new PerspectiveCamera());
    expect(() => patchWallAo(fake('void main() {}') as never, env)).toThrow(/aomap_fragment/);
    expect(() => patchWallAo(fake(FRAGMENT, 'void main() {}') as never, env)).toThrow(/fog_vertex/);
  });

  it('passes the foot of each piece from the vertex shader and fades the darkening above it', () => {
    const env = createWorldEnv(new PerspectiveCamera());
    const shader = fake();
    patchWallAo(shader as never, env);
    expect(shader.vertexShader).toContain('varying float vQFootY;');
    expect(shader.vertexShader.indexOf('vQFootY =')).toBeLessThan(
      shader.vertexShader.indexOf('#include <fog_vertex>'),
    );
    expect(shader.fragmentShader).toContain('varying float vQFootY;');
    expect(shader.fragmentShader).toContain('vQWPos.y - vQFootY');
  });

  it('patches the real kit material: every anchor is there after the kit and glow patches', () => {
    const env = createWorldEnv(new PerspectiveCamera());
    const material = createWorldMaterial(env);
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: ShaderLib.lambert.vertexShader,
      fragmentShader: ShaderLib.lambert.fragmentShader,
    };
    material.onBeforeCompile(shader as never, null as never);
    expect(shader.uniforms.uGroundAo).toBe(groundAoFor(env));
    expect(shader.fragmentShader).toContain('V2C wall occlusion');
    expect(shader.vertexShader).toContain('vQFootY =');
    // The block reads the kit shader's world varyings, declared before main.
    expect(shader.fragmentShader.indexOf('varying vec3 vQWPos')).toBeLessThan(
      shader.fragmentShader.indexOf('void main()'),
    );
  });
});
