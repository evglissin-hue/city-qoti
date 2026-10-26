// build.customize: paint and details against the content swatches; marks the building handmade.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { BuildingCustom } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run } from '../helpers';
import { charm, events, settle } from './helpers';

function customize(custom: BuildingCustom | Record<string, unknown>, which: 'c1' | 'missing' = 'c1') {
  const f = hamletFixture();
  const id = which === 'c1' ? f.b.cottages[0] : 999999;
  const ctx = run(f.state, { t: 'build.customize', id, custom: custom as BuildingCustom });
  return { f, ctx, b: findById(f.state.buildings, f.b.cottages[0])! };
}

describe('build.customize', () => {
  it('paints with content swatches and marks the building handmade', () => {
    const { ctx, b } = customize({ wall: 'rose', roof: 'slate', roofMaterial: 'thatch', accent: 'teal' });
    expect(rejection(ctx)).toBeUndefined();
    expect(b.custom).toEqual({ wall: 'rose', roof: 'slate', roofMaterial: 'thatch', accent: 'teal' });
    expect(b.handmade).toBe(true);
    const updated = events(ctx, 'building.updated');
    expect(updated).toHaveLength(1);
    expect(updated[0]!.b.custom).toEqual(b.custom);
    expect(updated[0]!.b.handmade).toBe(true);
  });

  it('sets details and a trimmed sign, and null clears a field', () => {
    const f = hamletFixture();
    const id = f.b.bakery;
    run(
      f.state,
      { t: 'build.customize', id, custom: { shutters: true, chimney: false, sign: '  The Rising Loaf ' } },
      0,
      1,
    );
    const b = findById(f.state.buildings, id)!;
    expect(b.custom).toEqual({ shutters: true, chimney: false, sign: 'The Rising Loaf' });
    run(f.state, { t: 'build.customize', id, custom: { sign: null, wall: 'butter' } }, 1, 2);
    expect(b.custom).toEqual({ wall: 'butter', shutters: true, chimney: false });
    run(f.state, { t: 'build.customize', id, custom: { wall: null, shutters: null, chimney: null } }, 1, 3);
    expect(b.custom).toBeUndefined();
    expect(b.handmade).toBe(true);
  });

  it('rejects unknown swatches, swatches from the wrong group, bad signs and empty edits', () => {
    expect(rejection(customize({ wall: 'chartreuse' }).ctx)).toBe('INVALID');
    expect(rejection(customize({ wall: 'terracotta' }).ctx)).toBe('INVALID');
    expect(rejection(customize({ roofMaterial: 'rose' }).ctx)).toBe('INVALID');
    expect(rejection(customize({ shutters: 'yes' }).ctx)).toBe('INVALID');
    expect(rejection(customize({ sign: 'A'.repeat(25) }).ctx)).toBe('INVALID');
    expect(rejection(customize({ sign: '   ' }).ctx)).toBe('INVALID');
    expect(rejection(customize({ sign: 'Bad\nsign' }).ctx)).toBe('INVALID');
    expect(rejection(customize({}).ctx)).toBe('INVALID');
    expect(rejection(customize({ paint: 'everything' }).ctx)).toBe('INVALID');
    expect(rejection(customize({ wall: 'rose' }, 'missing').ctx)).toBe('NOT_FOUND');
    const { b } = customize({ wall: 'chartreuse' });
    expect(b.custom).toBeUndefined();
    expect(b.handmade).toBe(false);
  });

  it('accepts every swatch in its own group', () => {
    const f = hamletFixture();
    let seq = 1;
    for (const s of content.swatches) {
      // The custom field for each swatch group has the group's name.
      const custom = { [s.group]: s.id } as BuildingCustom;
      const ctx = run(f.state, { t: 'build.customize', id: f.b.cottages[0], custom }, 0, seq++);
      expect(rejection(ctx), s.id).toBeUndefined();
    }
  });

  it('window boxes add a little nature on the next tick', () => {
    const { f, b } = customize({ windowBoxes: true });
    expect(b.custom).toEqual({ windowBoxes: true });
    const before = hamletFixture();
    settle(before.state);
    expect(charm(f.state, 'charmNature', b.x, b.z - 1)).toBeGreaterThan(
      charm(before.state, 'charmNature', b.x, b.z - 1),
    );
  });
});
