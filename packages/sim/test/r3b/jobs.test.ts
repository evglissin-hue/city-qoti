// R3B: the job rebalance leaves a master with their trade (level 3 and the master's good need them on
// the crew), as it leaves an apprentice to see their season out. Without the rule the newest hand of
// a building is the one moved, and a new master often is the newest.
import { describe, expect, it } from 'vitest';
import { ResidentFlags } from '../../src/constants';
import { rebalanceJobs } from '../../src/systems/residents/jobs';
import { place } from '../village/helpers';
import { masterWorld, res } from './masterFixture';

/** A new storehouse with no porter: its first porter's job outranks any bakery hand's (a clear step up). */
function moved(asMaster: boolean): boolean {
  const { state, bakery, crew } = masterWorld(2);
  place(state, 'storehouse', 70, 40);
  const newest = crew[crew.length - 1]!;
  if (asMaster) {
    const r = res(state, newest);
    r.flags |= ResidentFlags.master;
    r.mastery = 'baker';
  }
  for (let i = 0; i < 20 && rebalanceJobs(state); i++) {
    if (!bakery.rt!.workers.includes(newest)) return true;
  }
  return !bakery.rt!.workers.includes(newest);
}

describe('the job rebalance and masters', () => {
  it('moves the newest bakery hand when they are not a master (the case the rule guards)', () => {
    expect(moved(false)).toBe(true);
  });

  it('leaves a master baker at the bakery', () => {
    expect(moved(true)).toBe(false);
  });
});
