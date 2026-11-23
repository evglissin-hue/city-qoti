// R3B: the job rebalance leaves a master with their trade (level 3 and the master's good need them on
// the crew), as it leaves an apprentice to see their season out. Without the rule the newest hand of
// a building is the one moved, and a new master often is the newest.
import { describe, expect, it } from 'vitest';
import { ResidentFlags } from '../../src/constants';
import type { Building, Resident } from '../../src/contracts';
import { masterKeeps } from '../../src/systems/masters/api';
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

describe('who the rebalance keeps', () => {
  const master = (mastery: string) => ({ flags: ResidentFlags.master, mastery }) as unknown as Resident;
  const at = (def: string, trade?: string, level = 2) => ({ def, trade, level }) as unknown as Building;

  it('keeps a master where the good, the room or level 3 needs them', () => {
    expect(masterKeeps(master('baker'), at('workshop', 'baker'))).toBe(true);
    expect(masterKeeps(master('windmill'), at('windmill'))).toBe(true);
    expect(masterKeeps(master('shop'), at('corner-shop', 'shop', 3))).toBe(true);
  });

  it('lets a master go where their trade brings neither, and never keeps them at another trade', () => {
    expect(masterKeeps(master('shop'), at('corner-shop', 'shop', 2))).toBe(false);
    expect(masterKeeps(master('foresters-lodge'), at('foresters-lodge'))).toBe(false);
    expect(masterKeeps(master('baker'), at('workshop', 'carpenter'))).toBe(false);
    expect(
      masterKeeps({ flags: 0, mastery: undefined } as unknown as Resident, at('workshop', 'baker')),
    ).toBe(false);
  });
});
