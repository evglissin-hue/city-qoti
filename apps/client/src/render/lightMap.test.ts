import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createWorldEnv } from './env';
import {
  drawLightMap,
  LIGHT_MAP_GLSL,
  LIGHT_MAP_TEXELS,
  lightMapSize,
  lightMapUniforms,
  LightMapWriter,
  resizeLightMap,
  type LightDisc,
} from './lightMap';

const lamp: LightDisc = { x: 10, z: 12, radius: 1.35, color: 0xffb366, intensity: 0.8 };

describe('the light map (V2.0)', () => {
  it('is sized by preset: 2, 4, 6 and 8 texels a tile on the 192-tile valley', () => {
    expect(LIGHT_MAP_TEXELS).toEqual({ low: 2, medium: 4, high: 6, ultra: 8 });
    expect(lightMapSize('low')).toBe(384);
    expect(lightMapSize('medium')).toBe(768);
    expect(lightMapSize('high')).toBe(1152);
    expect(lightMapSize('ultra')).toBe(1536);
  });

  it('lives on the world env at Medium, and resizes with the preset keeping its texture', () => {
    const env = createWorldEnv(new PerspectiveCamera());
    expect(env.lightMap.width).toBe(768);
    expect(env.lightMapRevision).toBe(0);
    const u = lightMapUniforms(env);
    expect(lightMapUniforms(env)).toBe(u);
    const texture = env.lightMap.texture;
    expect(resizeLightMap(env, 'ultra')).toBe(true);
    expect(env.lightMap.width).toBe(1536);
    expect(env.lightMap.texture).toBe(texture);
    expect(u.uLightMap.value).toBe(texture);
    expect(resizeLightMap(env, 'ultra')).toBe(false);
    // A resized map asks for a redraw.
    expect(drawLightMap(null, env)).toBe(true);
    expect(env.lightMapRevision).toBe(1);
  });

  it('takes discs by source and reports only real changes', () => {
    const w = new LightMapWriter();
    expect(w.dirty).toBe(false);
    expect(w.set('lanterns', [lamp])).toBe(true);
    expect(w.set('lanterns', [{ ...lamp }])).toBe(false);
    expect(w.set('windows', [])).toBe(false);
    expect(w.set('windows', [{ ...lamp, x: 3, intensity: 0.2 }])).toBe(true);
    expect(w.count).toBe(2);
    expect([...w.discs()].map((d) => d.x)).toEqual([10, 3]);
    expect(w.takeDirty()).toBe(true);
    expect(w.takeDirty()).toBe(false);
    expect(w.clear('windows')).toBe(true);
    expect(w.clear('windows')).toBe(false);
    expect(w.count).toBe(1);
    expect(w.dirty).toBe(true);
  });

  it('redraws only when a writer changed something (the stub draws nothing, the map stays black)', () => {
    const env = createWorldEnv(new PerspectiveCamera());
    expect(drawLightMap(null, env)).toBe(false);
    env.lightWriter.set('fires', [lamp]);
    expect(drawLightMap(null, env)).toBe(true);
    expect(drawLightMap(null, env)).toBe(false);
    expect(env.lightMapRevision).toBe(1);
  });

  it('gives readers one GLSL function over two uniforms', () => {
    expect(LIGHT_MAP_GLSL).toContain('uniform sampler2D uLightMap;');
    expect(LIGHT_MAP_GLSL).toContain('vec3 qLightMap(vec2 xz)');
    const u = lightMapUniforms(createWorldEnv(new PerspectiveCamera()));
    expect(u.uLightMapXf.value.x).toBeCloseTo(1 / 192);
  });
});
