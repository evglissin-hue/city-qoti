import { MeshStandardMaterial, ShaderChunk, ShaderLib, UniformsLib, UniformsUtils } from 'three';
import { describe, expect, it } from 'vitest';
import { HAZE, hazeTermsAt, installHazeChunks, RIVER_HAZE_SIZE, setRiverHaze } from './lighting';

describe('haze with height (V3C)', () => {
  it('patches the fog chunks once, keeping the plain fog factor', () => {
    installHazeChunks();
    installHazeChunks();
    expect(ShaderChunk.fog_vertex).toContain('vQHazeWorld');
    expect(ShaderChunk.fog_fragment).toContain('smoothstep( fogNear, fogFar, vFogDepth )');
    expect(ShaderChunk.fog_pars_fragment.match(/uniform vec4 qHazeTerms/g)?.length).toBe(1);
  });

  it('reaches every built-in fogging material by reference through uniform cloning', () => {
    for (const lib of [ShaderLib.standard, ShaderLib.lambert, ShaderLib.basic, ShaderLib.physical]) {
      const u = UniformsUtils.clone(lib.uniforms);
      expect(u.qHazeTerms!.value).toBe(HAZE.terms.value);
      expect(u.qHazeRiver!.value).toBe(HAZE.river.value);
    }
    const merged = UniformsUtils.merge([UniformsLib.fog, {}]);
    expect(merged.qHazeAdds!.value).toBe(HAZE.adds.value);
    // A material compiled later still holds the same vector, so one set() reaches all of them.
    expect(new MeshStandardMaterial().fog).toBe(true);
  });

  it('is plain fog when nothing is set (a shader material that never asked for the uniforms)', () => {
    // Zero lift, zero adds: the fragment multiplies by 1 and adds nothing.
    expect(ShaderChunk.fog_fragment).toContain('qHazeTerms.x');
    expect(ShaderChunk.fog_fragment).toContain('if ( qHazeAdds.x + qHazeAdds.y > 0.0 )');
  });

  it('mists the river at dawn only', () => {
    expect(hazeTermsAt(6, 0, 0).river).toBeGreaterThan(0.4);
    expect(hazeTermsAt(12, 0, 0).river).toBe(0);
    expect(hazeTermsAt(22, 0, 0).river).toBe(0);
    expect(hazeTermsAt(3, 0, 0).river).toBe(0);
  });

  it('hazes a town of many chimneys on winter evenings only', () => {
    expect(hazeTermsAt(20, 1, 150).chimney).toBeGreaterThan(0.3);
    expect(hazeTermsAt(20, 0, 150).chimney).toBe(0);
    expect(hazeTermsAt(12, 1, 150).chimney).toBe(0);
    expect(hazeTermsAt(20, 1, 5).chimney).toBe(0);
    expect(hazeTermsAt(23.5, 1, 150).chimney).toBeGreaterThan(0);
    expect(hazeTermsAt(2, 1, 150).chimney).toBe(0);
  });

  it('is a pure step function of the hour (quantized, so a still frame never sees it creep)', () => {
    expect(hazeTermsAt(19.25, 1, 80)).toEqual(hazeTermsAt(19.25, 1, 80));
    expect((hazeTermsAt(19.25, 1, 80).chimney * 32) % 1).toBe(0);
  });

  it('writes the river map', () => {
    const data = new Uint8Array(RIVER_HAZE_SIZE * RIVER_HAZE_SIZE).fill(7);
    const v = HAZE.river.value.version;
    setRiverHaze(HAZE, data);
    expect((HAZE.river.value.image.data as Uint8Array)[100]).toBe(7);
    expect(HAZE.river.value.version).toBeGreaterThan(v);
  });
});
