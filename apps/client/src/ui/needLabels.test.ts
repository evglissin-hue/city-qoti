// R2B (player's chair): the evenings need showed as a bare "evenings" in the resident inspector's
// bars. Every need the sim has gets a label, so a new need never reaches the screen as an id.
import { NEED_IDS } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { NEED_LABEL } from './hamlet';

describe('need labels', () => {
  it('names every need the sim has', () => {
    for (const id of NEED_IDS) {
      expect(NEED_LABEL[id], id).toBeTruthy();
      expect(NEED_LABEL[id]![0], id).toBe(NEED_LABEL[id]![0]!.toUpperCase());
    }
  });
});
