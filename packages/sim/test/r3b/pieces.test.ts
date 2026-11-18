// R3B: what the quarry's and the forester's masters bring (carved stone and ornamental trees, locked
// Hearth pieces) and the miller's room for one more baker (docs/spec/19-evenings.md, Masters).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { ResidentFlags } from '../../src/constants';
import { capacityOf } from '../../src/systems/specialized/api';
import { masterRoom } from '../../src/systems/masters/api';
import { hamletFixture } from '../fixtures/hamlet';
import { flatWorld, rejection, run } from '../helpers';
import { building, hire, resident } from '../ledger/helpers';

const FP = 256;

describe('the pieces masters bring', () => {
  it('are locked decor, named by the quarry and the forester masters', () => {
    for (const [def, id] of [
      ['quarry', 'carved-stone'],
      ['foresters-lodge', 'ornamental-tree'],
    ] as const) {
      expect(content.decorById.get(id)?.locked, id).toBe(true);
      expect(content.masterByOf.get(def)?.unlocks, def).toEqual([id]);
    }
  });

  it('look like existing kits and cost real materials', () => {
    for (const id of ['carved-stone', 'ornamental-tree']) {
      const d = content.decorById.get(id)!;
      expect(d.lane).toBe('hearth');
      expect(d.cost?.goods?.length, id).toBeGreaterThan(0);
      expect(d.charm?.length, id).toBeGreaterThan(0);
    }
  });

  it('cannot be placed until a master unlocks them, then are no longer locked', () => {
    for (const id of ['carved-stone', 'ornamental-tree']) {
      const w = flatWorld();
      w.settings.mode = 'standard';
      const cmd = { t: 'decor.place', def: id, fx: 60 * FP, fz: 60 * FP, rot: 0 } as const;
      expect(rejection(run(w, cmd)), id).toBe('LOCKED');
      w.hearth.unlocked.push(id);
      // Open now; a bare test valley may still lack the coins or the stone.
      expect(rejection(run(w, cmd)), id).not.toBe('LOCKED');
    }
  });
});

describe("the master miller's room", () => {
  it('gives the windmill one more baker in capacityOf while a master miller is on its crew', () => {
    const f = hamletFixture();
    const s = f.state;
    const mill = building(s, f.b.windmill);
    const base = capacityOf(s, mill);
    expect(masterRoom(s, mill)).toBe(0);
    const [id] = hire(s, mill.id, 1);
    const r = resident(s, id!);
    // A master of some other trade on the crew does not count.
    r.flags |= ResidentFlags.master;
    r.mastery = 'baker';
    expect(capacityOf(s, mill)).toBe(base);
    r.mastery = 'windmill';
    expect(masterRoom(s, mill)).toBe(1);
    expect(capacityOf(s, mill)).toBe(base + 1);
    // The master leaves the crew: the room goes.
    mill.rt!.workers = [];
    expect(capacityOf(s, mill)).toBe(base);
  });
});
