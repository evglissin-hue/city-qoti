import { MAP_SIZE } from '@qoti/sim';
import { Color, Vector3, type Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import type { Mirror } from '../../state/mirror';
import type { WorldEnv } from '../env';
import {
  buildHorizon,
  findRiverExits,
  horizonLayer,
  horizonSeed,
  outlineOf,
  type HorizonInput,
} from './horizon';
import type { LayerContext } from './types';

const N = MAP_SIZE;

function input(): HorizonInput {
  return {
    size: N,
    seed: 1234,
    edgeY: (x, z) => 3 + Math.sin(x * 0.1) * 0.5 + Math.cos(z * 0.13) * 0.4,
    exits: findRiverExits(N, (x, z) => (z === 0 || z === N - 1) && x >= 90 && x <= 95),
  };
}

function positions(inp: HorizonInput): number[] {
  return Array.from(buildHorizon(inp).geometry.getAttribute('position').array);
}

describe('the horizon build (V3C)', () => {
  it('is the same for the same input', () => {
    expect(positions(input())).toEqual(positions(input()));
    expect(positions({ ...input(), seed: 99 })).not.toEqual(positions(input()));
  });

  it('stays under 2,000 triangles', () => {
    const b = buildHorizon(input());
    expect(b.triangles).toBeLessThan(2000);
    expect(b.triangles).toBeGreaterThan(1000);
  });

  it('puts the inner edge on the valley boundary, a hair under the terrain', () => {
    const inp = input();
    const b = buildHorizon(inp);
    const pos = b.geometry.getAttribute('position');
    const outline = outlineOf(N, inp.exits);
    expect(b.outlineCount).toBe(outline.length);
    for (let i = 0; i < outline.length; i++) {
      const o = outline[i]!;
      expect(pos.getX(i)).toBeCloseTo(o.bx, 3);
      expect(pos.getZ(i)).toBeCloseTo(o.bz, 3);
      const onBoundary = pos.getX(i) === 0 || pos.getX(i) === N || pos.getZ(i) === 0 || pos.getZ(i) === N;
      expect(onBoundary).toBe(true);
      // Never above the terrain at the vertex's own spot (an exit's edges sample the rim beside them).
      if (o.exact === undefined) expect(pos.getY(i)).toBeLessThanOrEqual(inp.edgeY(o.bx, o.bz) - 0.03 + 1e-3);
    }
  });

  it('carries the river out as a channel', () => {
    expect(input().exits).toHaveLength(2);
    const noRiver = buildHorizon({ ...input(), exits: [] });
    expect(buildHorizon(input()).triangles).toBeGreaterThan(noRiver.triangles);
  });

  it('has hill triangles that face up', () => {
    const b = buildHorizon(input());
    const n = b.geometry.getAttribute('normal');
    for (let i = 0; i < b.outlineCount * b.rows; i++) expect(n.getY(i)).toBeGreaterThan(0);
  });

  it('seeds from the valley meta', () => {
    const a = { startArea: [1, 2, 3, 4], valleyGate: [5, 6], flow: 'ns' };
    expect(horizonSeed(a)).toBe(horizonSeed({ ...a }));
    expect(horizonSeed(a)).not.toBe(horizonSeed({ ...a, flow: 'we' }));
  });
});

describe('the horizon layer (V3C)', () => {
  function setup() {
    const env = {
      sky: { value: new Color() },
      skyTop: { value: new Color() },
      sunColor: { value: new Color() },
      sunDir: { value: new Vector3(0, 1, 0) },
      night: { value: 0 },
      seasonTint: { value: new Color(1, 1, 1) },
      snow: { value: 0 },
      autumn: { value: 0 },
      skipScene: false,
    } as unknown as WorldEnv;
    const mirror = {
      size: N,
      meta: { startArea: [1, 2, 3, 4], valleyGate: [5, 6], flow: 'ns' },
      height: () => 4,
      water: (x: number, z: number) => (z === 0 && x > 90 && x < 95 ? 1 : 0),
      occupant: () => 0,
    } as unknown as Mirror;
    const added: unknown[] = [];
    const scene = { add: (o: unknown) => added.push(o), remove: () => undefined };
    const layer = horizonLayer();
    layer.init({ env, mirror, scene } as unknown as LayerContext);
    return { env, layer, mesh: added[0] as Mesh };
  }

  it('draws once, never rebuilds, and rests', () => {
    const { layer, mesh } = setup();
    expect(layer.motion).toBeUndefined();
    expect(mesh.castShadow).toBe(false);
    expect(mesh.userData.qotiShadows).toBe(false);
    expect(layer.frame!(0.016)).toBe(false);
    expect(layer.frame!(0.016)).toBe(false);
  });

  it('yields to the endpaper map, returning true once on each flip', () => {
    const { env, layer, mesh } = setup();
    env.skipScene = true;
    expect(layer.frame!(0.016)).toBe(true);
    expect(mesh.visible).toBe(false);
    expect(layer.frame!(0.016)).toBe(false);
    env.skipScene = false;
    expect(layer.frame!(0.016)).toBe(true);
    expect(mesh.visible).toBe(true);
    expect(layer.frame!(0.016)).toBe(false);
  });
});
