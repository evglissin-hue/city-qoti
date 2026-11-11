import { DataArrayTexture, ShaderLib, type Uint8BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';
import {
  bindResidentMaterial,
  createResidentMaterial,
  kitSurfaceUniforms,
  type KitLampOptions,
} from './materials';
import { PAINT, RigBuilder } from './rig';

type Shader = Parameters<NonNullable<ReturnType<typeof createResidentMaterial>['onBeforeCompile']>>[0];

function fake(): Shader {
  return {
    uniforms: {},
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
  } as unknown as Shader;
}

const lamp: KitLampOptions = {
  glsl: 'uniform sampler2D uLightMap; vec3 qLamp(vec2 xz, float up) { return vec3(0.0); }',
  uniforms: {},
  night: { value: 1 },
};

describe('rig surface', () => {
  it('writes the surface id for vertices added after surface()', () => {
    const rig = new RigBuilder();
    const ch = { hex: 0xffffff, paint: PAINT.fixed };
    rig.tri([0, 0, 0], [1, 0, 0], [0, 1, 0], ch);
    rig.surface(24).tri([0, 0, 1], [1, 0, 1], [0, 1, 1], ch);
    const a = rig.build().getAttribute('surface') as Uint8BufferAttribute;
    expect(Array.from(a.array)).toEqual([0, 0, 0, 24, 24, 24]);
  });
});

describe('createResidentMaterial', () => {
  it('without arguments takes no kit patches', () => {
    const s = fake();
    createResidentMaterial().onBeforeCompile(s, null as never);
    expect(s.fragmentShader).toBe(ShaderLib.lambert.fragmentShader);
    expect(s.uniforms.uPat).toBeUndefined();
  });

  it('with surface and lamp adds the surface table, lamplight and rim', () => {
    const u = kitSurfaceUniforms(new DataArrayTexture());
    const s = fake();
    createResidentMaterial(u, lamp).onBeforeCompile(s, null as never);
    expect(s.fragmentShader).toContain('qKitSurface');
    expect(s.fragmentShader).toContain('qKitLamp');
    expect(s.fragmentShader).toContain('qRim');
    expect(s.uniforms.uPat).toBeDefined();
    expect(s.uniforms.uLampNight).toBeDefined();
    expect(s.uniforms.uTime).toBeDefined();
  });

  it('keeps variants in separate programs and ignores lamp without surface', () => {
    const u = kitSurfaceUniforms(new DataArrayTexture());
    const keys = [createResidentMaterial(), createResidentMaterial(u), createResidentMaterial(u, lamp)].map(
      (m) => m.customProgramCacheKey(),
    );
    expect(new Set(keys).size).toBe(3);
    const s = fake();
    createResidentMaterial(undefined, lamp).onBeforeCompile(s, null as never);
    expect(s.fragmentShader).not.toContain('qRim');
  });

  it('binds late', () => {
    const m = createResidentMaterial();
    bindResidentMaterial(m, kitSurfaceUniforms(new DataArrayTexture()), lamp);
    const s = fake();
    m.onBeforeCompile(s, null as never);
    expect(s.fragmentShader).toContain('qRim');
    expect(m.customProgramCacheKey()).toBe('qoti-resident-surface-lamp');
  });
});
