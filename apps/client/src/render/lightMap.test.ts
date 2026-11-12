import { describe, expect, it } from 'vitest';
import {
  Color,
  PerspectiveCamera,
  type InstancedBufferGeometry,
  type Mesh,
  type Scene,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { createWorldEnv } from './env';
import {
  discFalloff,
  drawLightMap,
  LIGHT_MAP_GLSL,
  LIGHT_MAP_TEXELS,
  lightMapSize,
  lightMapStats,
  lightMapUniforms,
  LightMapWriter,
  resizeLightMap,
  type LightDisc,
} from './lightMap';

const lamp: LightDisc = { x: 10, z: 12, radius: 1.35, color: 0xffb366, intensity: 0.8 };

/** Just enough of a WebGLRenderer to count what the light map draws, and where. */
function fakeRenderer() {
  const r = {
    renders: [] as Scene[],
    targets: [] as (WebGLRenderTarget | null)[],
    target: null as WebGLRenderTarget | null,
    autoClear: true,
    clearColor: new Color(0x2b3a55),
    getRenderTarget: () => r.target,
    setRenderTarget: (t: WebGLRenderTarget | null) => {
      r.target = t;
      r.targets.push(t);
    },
    getClearColor: (c: Color) => c.copy(r.clearColor),
    getClearAlpha: () => 1,
    setClearColor: (c: Color) => void r.clearColor.copy(c),
    clear: () => undefined,
    render: (scene: Scene) => void r.renders.push(scene),
    getContext: () => ({ finish: () => undefined }),
  };
  return r;
}

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

  it('draws every disc in one instanced draw and one blur, only on a change (V2A)', () => {
    const env = createWorldEnv(new PerspectiveCamera());
    const three = fakeRenderer();
    const discs = Array.from({ length: 300 }, (_, i) => ({ ...lamp, x: i % 190, z: i / 2 }));
    env.lightWriter.set('lanterns', discs.slice(0, 200));
    env.lightWriter.set('windows', discs.slice(200));
    expect(drawLightMap(three as unknown as WebGLRenderer, env)).toBe(true);
    // One render of the disc scene (a single instanced mesh of 300) and one of the blur.
    expect(three.renders).toHaveLength(2);
    const [discScene, blurScene] = three.renders;
    const mesh = discScene!.children[0] as Mesh<InstancedBufferGeometry>;
    expect(discScene!.children).toHaveLength(1);
    expect(mesh.geometry.instanceCount).toBe(300);
    expect(blurScene!.children).toHaveLength(1);
    expect(lightMapStats(env)).toMatchObject({ redraws: 1, discs: 300, draws: 2 });
    // The map is the last target drawn, the renderer's own target and clear color are put back.
    expect(three.targets.at(-2)).toBe(env.lightMap);
    expect(three.targets.at(-1)).toBe(null);
    expect(three.autoClear).toBe(true);
    // A frame with no change draws nothing.
    expect(drawLightMap(three as unknown as WebGLRenderer, env)).toBe(false);
    expect(three.renders).toHaveLength(2);
    // Nothing lit: the map is cleared, no draw.
    env.lightWriter.clear('lanterns');
    env.lightWriter.clear('windows');
    expect(drawLightMap(three as unknown as WebGLRenderer, env)).toBe(true);
    expect(three.renders).toHaveLength(2);
    expect(lightMapStats(env)).toMatchObject({ redraws: 2, discs: 0, draws: 0 });
    expect(env.lightMapRevision).toBe(2);
  });

  it('fades a pool from its middle to nothing at its edge, with no ring', () => {
    expect(discFalloff(0)).toBe(1);
    expect(discFalloff(1)).toBe(0);
    let last = 1;
    for (let t = 0.05; t < 1; t += 0.05) {
      const v = discFalloff(t);
      expect(v).toBeLessThan(last);
      last = v;
    }
    // V2X: a pool, not a wash: bright under the lamp, most of the light within half the radius.
    expect(discFalloff(0.25)).toBeGreaterThan(0.4);
    expect(discFalloff(0.5)).toBeGreaterThan(0.1);
    expect(discFalloff(0.5)).toBeLessThan(0.16);
    expect(discFalloff(0.7)).toBeLessThan(0.05);
    expect(discFalloff(0.9)).toBeLessThan(0.01);
  });

  it('gives readers one GLSL function over two uniforms', () => {
    expect(LIGHT_MAP_GLSL).toContain('uniform sampler2D uLightMap;');
    expect(LIGHT_MAP_GLSL).toContain('vec3 qLightMap(vec2 xz)');
    const u = lightMapUniforms(createWorldEnv(new PerspectiveCamera()));
    expect(u.uLightMapXf.value.x).toBeCloseTo(1 / 192);
  });
});
