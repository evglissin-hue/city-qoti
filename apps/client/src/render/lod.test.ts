import {
  BoxGeometry,
  Matrix4,
  PerspectiveCamera,
  Scene,
  Vector3,
  MeshBasicMaterial,
  type InstancedMesh,
} from 'three';
import { describe, expect, it } from 'vitest';
import { InstanceField, levelFor, LOD_HYSTERESIS, SwapQueue, type FieldKind } from './lod';

describe('levels of detail (V1D)', () => {
  it('keeps a level inside the hysteresis band and switches outside it', () => {
    const t = 60;
    const band = (t * LOD_HYSTERESIS) / 2;
    expect(levelFor(undefined, t - 1, t)).toBe('high');
    expect(levelFor(undefined, t + 1, t)).toBe('low');
    expect(levelFor('high', t + band * 0.9, t)).toBe('high');
    expect(levelFor('high', t + band * 1.1, t)).toBe('low');
    expect(levelFor('low', t - band * 0.9, t)).toBe('low');
    expect(levelFor('low', t - band * 1.1, t)).toBe('high');
  });

  it('applies queued swaps nearest first, a capped number a frame', () => {
    const q = new SwapQueue(2, 1000, () => 0);
    q.set(1, 'low', 90);
    q.set(2, 'high', 10);
    q.set(3, 'low', 50);
    const done: number[] = [];
    expect(q.drain((id) => done.push(id))).toBe(2);
    expect(done).toEqual([2, 3]);
    expect(q.drain((id) => done.push(id))).toBe(1);
    expect(done).toEqual([2, 3, 1]);
    expect(q.size).toBe(0);
  });

  it('stops a frame’s swaps once their time budget is spent (but always does one)', () => {
    let now = 0;
    const q = new SwapQueue(10, 4, () => now);
    for (let i = 0; i < 5; i++) q.set(i, 'low', i);
    const done: number[] = [];
    q.drain((id) => {
      done.push(id);
      now += 3;
    });
    expect(done).toEqual([0, 1]);
    q.delete(2);
    q.drain((id) => done.push(id));
    expect(done).toEqual([0, 1, 3, 4]);
  });

  it('applies every swap at once on the first look after a load', () => {
    const q = new SwapQueue(2, 1000, () => 0);
    for (let i = 0; i < 10; i++) q.set(i, 'low', 10 - i);
    expect(q.drain(() => {}, true)).toBe(10);
    expect(q.size).toBe(0);
  });
});

describe('the decor field (V1D)', () => {
  const kinds: Record<string, FieldKind> = {
    bench: { high: new BoxGeometry(), low: new BoxGeometry(), small: true, height: 1 },
    gazebo: { high: new BoxGeometry(), low: new BoxGeometry(), small: false, height: 3 },
  };

  function setup(): { field: InstanceField; scene: Scene; camera: PerspectiveCamera } {
    const scene = new Scene();
    const field = new InstanceField(scene, new MeshBasicMaterial(), (k) => kinds[k]!);
    // A wide lens, so everything ahead of the camera down to the horizon is in view.
    const camera = new PerspectiveCamera(100, 1.6, 0.5, 2000);
    camera.position.set(96, 40, 140);
    camera.lookAt(96, 0, 96);
    camera.updateMatrixWorld();
    return { field, scene, camera };
  }

  const at = (key: string, x: number, z: number) => ({ key, matrix: new Matrix4().makeTranslation(x, 0, z) });

  function counts(scene: Scene): Record<string, number> {
    const out: Record<string, number> = {};
    scene.traverse((o) => {
      const m = o as InstancedMesh;
      if (m.isInstancedMesh && m.visible) out[m.name] = m.count;
    });
    return out;
  }

  it('draws what is in view at full detail and leaves out what is behind the camera', () => {
    const { field, scene, camera } = setup();
    field.setDetail(80);
    field.set([at('bench', 96, 96), at('bench', 100, 100), at('bench', 96, 190)]);
    expect(field.update(camera, new Vector3(96, 0, 96))).toBe(true);
    expect(counts(scene)).toEqual({ 'bench:high': 2 });
    // Nothing moved: no refill.
    expect(field.update(camera, new Vector3(96, 0, 96))).toBe(false);
  });

  it('switches larger pieces to their far level and lets small props go beyond the distance', () => {
    const { field, scene, camera } = setup();
    field.setDetail(40);
    // About 50 and 120 tiles from the camera, both in view.
    field.set([at('bench', 96, 96), at('gazebo', 96, 96), at('bench', 96, 20), at('gazebo', 96, 20)]);
    field.update(camera, new Vector3(96, 0, 96));
    expect(counts(scene)).toEqual({ 'gazebo:low': 2 });
    field.setDetail(80);
    field.update(camera, new Vector3(96, 0, 96));
    expect(counts(scene)).toEqual({ 'bench:high': 1, 'gazebo:high': 1, 'gazebo:low': 1 });
    expect(field.drawn).toEqual({ high: 2, low: 1 });
  });
});
