import { DAYS_PER_SEASON } from '@qoti/sim';
import { BoxGeometry, MeshBasicMaterial, PerspectiveCamera, Scene, type InstancedMesh } from 'three';
import { describe, expect, it } from 'vitest';
import { createWorldEnv } from './env';
import { addInstance, emptyScatterChunk, ScatterField } from './scatter';
import { StepCache, THIN_STEPS, thinStep } from './thin';

const spring = 0;
const summer = 1;
const autumn = 2;
const winter = 3;

describe('thinStep (V2B)', () => {
  it('follows the season table', () => {
    expect(thinStep(spring, 1)).toBe(0.5);
    for (let d = 2; d <= DAYS_PER_SEASON; d++) expect(thinStep(spring, d)).toBe(1);
    for (let d = 1; d <= DAYS_PER_SEASON; d++) expect(thinStep(summer, d)).toBe(1);
    expect([1, 2, 3, 4, 5, 6].map((d) => thinStep(autumn, d))).toEqual([1, 1, 1, 0.75, 0.5, 0.25]);
    for (let d = 1; d <= DAYS_PER_SEASON; d++) expect(thinStep(winter, d)).toBe(0);
  });

  it('only ever gives one of the five steps, and changes at most once a day over a year', () => {
    let prev = thinStep(winter, DAYS_PER_SEASON);
    let changes = 0;
    for (let year = 0; year < 2; year++) {
      for (let season = 0; season < 4; season++) {
        for (let day = 1; day <= DAYS_PER_SEASON; day++) {
          const step = thinStep(season, day);
          expect(THIN_STEPS).toContain(step);
          // The hour is not an input, so every frame of a day gives the same step by construction.
          expect(thinStep(season, day)).toBe(step);
          if (step !== prev) changes++;
          prev = step;
        }
      }
    }
    // Two years: per year the steps go 0 to 0.5 to 1 to 0.75, 0.5, 0.25, 0, which is six changes.
    expect(changes).toBe(12);
  });
});

describe('StepCache (V2B)', () => {
  it('builds each step once, however many days walk through it', () => {
    const made: number[] = [];
    const cache = new StepCache<{ thin: number }>((thin) => {
      made.push(thin);
      return { thin };
    });
    for (let year = 0; year < 2; year++)
      for (let season = 0; season < 4; season++)
        for (let day = 1; day <= DAYS_PER_SEASON; day++) {
          const step = thinStep(season, day);
          expect(cache.get(step).thin).toBe(step);
        }
    expect(cache.builds).toBeLessThanOrEqual(5);
    expect(made.length).toBe(cache.builds);
    expect(new Set(made).size).toBe(made.length);
    expect([...cache.values()].length).toBe(cache.builds);
  });
});

describe('ScatterField.setGeometry (V2B)', () => {
  it('swaps the geometry of the kind and its existing mesh without rebuilding instances', () => {
    const scene = new Scene();
    const env = createWorldEnv(new PerspectiveCamera());
    const a = new BoxGeometry(1, 1, 1);
    const b = new BoxGeometry(2, 2, 2);
    const field = new ScatterField(
      scene,
      new MeshBasicMaterial(),
      [{ id: 'k', high: a, shadows: false }],
      env,
    );
    const chunk = emptyScatterChunk(1);
    addInstance(chunk, 0, 8, 0, 8, 0, 1, 0, 0, 1, 1, 1, 1);
    field.setChunk(0, chunk);
    const camera = new PerspectiveCamera(60, 1, 0.1, 500);
    camera.position.set(8, 6, 16);
    camera.lookAt(8, 0, 8);
    expect(field.update(camera)).toBe(true);
    const mesh = scene.children[0] as InstancedMesh;
    expect(mesh.geometry).toBe(a);
    expect(mesh.count).toBe(1);

    field.setGeometry(0, b);
    expect(field.kinds[0]!.high).toBe(b);
    expect(mesh.geometry).toBe(b);
    expect(mesh.count).toBe(1);
    expect(scene.children.length).toBe(1);
  });
});
