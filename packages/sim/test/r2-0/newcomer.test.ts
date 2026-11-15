// R2.0: a newcomer starts with the evenings need at content.places.needStart, set explicitly.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { NEED_IDS } from '../../src/constants';
import { rngFromSeed } from '../../src/rng/streams';
import { EVENINGS_NEED } from '../../src/state/evenings';
import { createHousehold } from '../../src/systems/residents/generate';
import { flatWorld } from '../helpers';

describe('a generated newcomer', () => {
  it('has every need, with evenings at needStart', () => {
    const s = flatWorld();
    const { members } = createHousehold(s, rngFromSeed('newcomer', 'residents'), {
      species: 'human',
      stages: ['adult', 'adult', 'child'],
      homeId: 0,
      tile: 50 * 256 + 50,
      inside: 0,
      activity: 'idle',
    });
    expect(members.length).toBe(3);
    for (const r of members) {
      expect(r.needs.length).toBe(NEED_IDS.length);
      expect(r.needs[EVENINGS_NEED]).toBe(content.places.needStart);
      expect(r.needs[NEED_IDS.length - 1]).toBe(content.places.needStart);
    }
  });
});
