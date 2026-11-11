import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { createWorldEnv } from './env';
import { groundAoFor } from './groundAo';
import { patchWallAo } from './wallAo';

const FRAGMENT =
  'void main() {\n#include <lights_fragment_end>\n#include <aomap_fragment>\n#include <emissivemap_fragment>\n}';

function fake(fragment = FRAGMENT) {
  return { uniforms: {} as Record<string, { value: unknown }>, vertexShader: '', fragmentShader: fragment };
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
  });
});
