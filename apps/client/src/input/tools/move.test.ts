import { content } from '@qoti/content';
import {
  buildView,
  canPlaceBuilding,
  createWorld,
  defaultSettings,
  insertBuilding,
  worldIndex,
  type BuildingView,
} from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../../state/mirror';
import { checkSpot, pickUp, type Picked } from './move';

function sandbox() {
  const world = createWorld('move-tool', { ...defaultSettings(), mode: 'sandbox' });
  const mirror = new Mirror();
  mirror.load(buildView(world));
  return { world, mirror };
}

function stand(
  m: Mirror,
  def: string,
  x: number,
  z: number,
  extra: Partial<BuildingView> = {},
): BuildingView {
  const b: BuildingView = {
    id: 9001 + m.buildings.size,
    def,
    x,
    z,
    rot: 0,
    builtBy: 0,
    handmade: false,
    stage: 'built',
    foundation: false,
    ...extra,
  };
  m.buildings.set(b.id, b);
  return b;
}

describe('move tool', () => {
  it('picks up hand-placed buildings and decor, and says why it leaves the rest', () => {
    const { mirror } = sandbox();
    const home = stand(mirror, 'house', 10, 10);
    expect(pickUp(mirror, { kind: 'building', id: home.id })).toMatchObject({
      kind: 'building',
      id: home.id,
    });
    const grown = stand(mirror, 'house', 20, 10, { lot: 4 });
    expect(pickUp(mirror, { kind: 'building', id: grown.id })).toBe('NOT_ALLOWED');
    const wall = content.buildings.find((d) => d.tags?.includes('wall'));
    if (wall) {
      const w = stand(mirror, wall.id, 30, 10);
      expect(pickUp(mirror, { kind: 'building', id: w.id })).toBe('NOT_ALLOWED');
    }
    mirror.settings.value = { ...mirror.settings.value, mode: 'standard' };
    const hall = stand(mirror, 'town-hall', 40, 10);
    expect(pickUp(mirror, { kind: 'building', id: hall.id })).toBe('HALL_STAYS');
    expect(pickUp(mirror, { kind: 'note', id: 1 })).toBeNull();
    expect(pickUp(mirror, { kind: 'decor', id: 987654 })).toBeNull();
  });

  it('judges a spot without the piece blocking itself, as the sim does', () => {
    const world = createWorld('move-tool', { ...defaultSettings(), mode: 'sandbox' });
    const def = content.buildingById.get('house')!;
    const reader = worldIndex(world).reader;
    let at: [number, number] | null = null;
    for (let z = 40; z < 80 && !at; z++)
      for (let x = 40; x < 80 && !at; x++)
        if (canPlaceBuilding(reader, def, x, z, 0).ok && canPlaceBuilding(reader, def, x + 3, z, 0).ok)
          at = [x, z];
    const [x, z] = at!;
    const b = insertBuilding(world, null, def, x, z, 0, 0);
    const mirror = new Mirror();
    mirror.load(buildView(world));
    const picked = pickUp(mirror, { kind: 'building', id: b.id }) as Picked;
    const tile = { x: x + 1, z, fx: 0, fz: 0 };
    expect(canPlaceBuilding(mirror, def, x + 1, z, 0).ok).toBe(false);
    expect(checkSpot(mirror, picked, tile, 0).ok).toBe(true);
    // And a spot on top of something else is still refused.
    expect(checkSpot(mirror, picked, { x: 0, z: 0, fx: 0, fz: 0 }, 0).ok).toBe(false);
  });
});
