// The world's shared kit material (V1.0 split from renderer.ts; V1A's file from here on). V1A
// turns it into the lean Lambert material that reads the surface ids and the pattern array.
import { createKitMaterial } from '@qoti/art';
import type { Material, MeshStandardMaterial } from 'three';
import type { WorldEnv } from './env';
import { WINDOW_HASH_GLSL } from './lighting';

/**
 * Adds the night glow to a kit material: vertices with the optional `glow` attribute (window panes,
 * flames) shine warm at night, on a seeded share of windows that changes with the hour (C3D-1: the
 * share and the hash come from lighting.ts, so ground spill matches lit panes). A missing
 * attribute reads as 0.
 */
export function addNightGlow(material: Material, night: { value: number }, share: { value: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = night;
    shader.uniforms.uWindowShare = share;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute float glow;\nvarying float vGlow;\nuniform float uNight;\nuniform float uWindowShare;\n${WINDOW_HASH_GLSL}`,
      )
      .replace(
        '#include <project_vertex>',
        [
          '#include <project_vertex>',
          'vec4 qWorld = vec4(transformed, 1.0);',
          '#ifdef USE_INSTANCING',
          'qWorld = instanceMatrix * qWorld;',
          '#endif',
          // C3D: buildings are batched; glow 2 marks lights that are always on (lanterns, shops).
          '#ifdef USE_BATCHING',
          'qWorld = batchingMatrix * qWorld;',
          '#endif',
          'qWorld = modelMatrix * qWorld;',
          `vGlow = glow > 1.5 ? 1.0 : glow * qWindowLit(qWorld.xyz, uWindowShare);`,
        ].join('\n'),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform float uNight;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.7, 0.36) * vGlow * uNight * 2.4;',
      );
  };
  material.customProgramCacheKey = () => 'qoti-night-glow';
  material.needsUpdate = true;
}

/**
 * The material every kit layer shares (`LayerContext.material`): the kit material from the art
 * package with the night glow, reading the night and the share of lit windows from the world's
 * look state.
 */
export function createWorldMaterial(env: WorldEnv): MeshStandardMaterial {
  const material = createKitMaterial();
  addNightGlow(material, env.night, env.windowShare);
  return material;
}
