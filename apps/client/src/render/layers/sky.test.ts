import { Group, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import type { Mirror } from '../../state/mirror';
import { createWorldEnv } from '../env';
import { hearthsOf, skyLayer } from './sky';

function fakeMirror(homes: [number, number][]): Mirror {
  const buildings = new Map(homes.map(([x, z], i) => [i + 1, { id: i + 1, x, z }]));
  const households = new Map(homes.map((_, i) => [i + 1, { id: i + 1, homeId: i + 1 }]));
  return { buildings, households } as unknown as Mirror;
}

describe('the sky layer (V3C haze driver)', () => {
  it('counts hearths and where they gather', () => {
    const h = hearthsOf(
      fakeMirror([
        [10, 10],
        [20, 10],
        [10, 20],
        [20, 20],
      ]),
    );
    expect(h.count).toBe(4);
    expect(h.x).toBe(15);
    expect(h.z).toBe(15);
    expect(h.radius).toBeGreaterThan(8);
    expect(hearthsOf(fakeMirror([])).count).toBe(0);
  });

  it('never asks for a frame at rest, and sets the haze as the dome draws', () => {
    const env = createWorldEnv(new PerspectiveCamera());
    const scene = new Group();
    const layer = skyLayer();
    layer.init({
      scene: scene as never,
      mirror: fakeMirror([[50, 50]]),
      material: new MeshBasicMaterial(),
      invalidate: () => {},
      camera: env.camera,
      env,
    });
    expect(layer.frame?.(0.016)).toBe(false);
    env.shown.hour = 6;
    const dome = scene.children[0]!;
    dome.onBeforeRender(
      null as never,
      null as never,
      env.camera,
      null as never,
      null as never,
      null as never,
    );
    expect(env.haze.adds.value.x).toBeGreaterThan(0);
    expect(env.haze.terms.value.x).toBeGreaterThan(0);
    expect(env.haze.town.value.x).toBe(50);
    layer.dispose();
  });
});
