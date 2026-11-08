// P1 (playtest item 13): every valley is named from its seed unless the players typed a name.
import { describe, expect, it } from 'vitest';
import { createWorld, defaultSettings } from '../../src';
import { valleyNameFor } from '../../src/map/worldgen';

describe('valley names', () => {
  it('an empty name takes valleyNameFor(seed)', () => {
    for (const blank of ['', '   ']) {
      const w = createWorld('willow-1', { ...defaultSettings(), valleyName: blank });
      expect(w.settings.valleyName).toBe(valleyNameFor('willow-1'));
    }
    expect(valleyNameFor('willow-1')).not.toBe('Riverbend');
  });

  it('a typed name wins, and different seeds give different names', () => {
    expect(createWorld('willow-1', { ...defaultSettings(), valleyName: 'Home' }).settings.valleyName).toBe(
      'Home',
    );
    const names = new Set(Array.from({ length: 20 }, (_, i) => valleyNameFor(`seed-${i}`)));
    expect(names.size).toBeGreaterThan(10);
  });
});
