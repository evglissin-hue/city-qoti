// R3B, apprentices (11-residents.md, Lives; 19-evenings.md, Masters): the master path needs no
// school, the school path joins a master's workshop under them, a finished apprentice of a master
// stays at the trade, and ten days of their own make a master with no hearts asked.
import { MASTERY } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { APPRENTICE_DAYS, ResidentFlags } from '../../src/constants';
import { isMaster } from '../../src/systems/masters/api';
import { lifeMorning, MAX_APPRENTICES_PER_DAY } from '../../src/systems/residents/life';
import { createTickCtx } from '../../src/turn';
import { hire } from '../ledger/helpers';
import { place } from '../village/helpers';
import { mastersDay, masterWorld, res, today } from './masterFixture';

/** The bakery's first hand is its master, with the sign up. */
function withMaster(w: ReturnType<typeof masterWorld>): void {
  const m = res(w.state, w.crew[0]!);
  m.flags |= ResidentFlags.master;
  m.mastery = 'baker';
  w.bakery.masterId = m.id;
}

function morning(state: ReturnType<typeof masterWorld>['state']): void {
  lifeMorning(state, createTickCtx(state));
}

describe('apprentices', () => {
  it('the master path starts an apprenticeship with no school in town', () => {
    const w = masterWorld();
    withMaster(w);
    const young = res(w.state, w.crew[1]!);
    young.stage = 'young';
    morning(w.state);
    expect(young.apprentice).toEqual({
      at: w.bakery.id,
      trade: 'baker',
      untilDay: today(w.state) + APPRENTICE_DAYS,
      master: w.crew[0],
    });
    expect(young.history.some((h) => h.kind === 'apprentice')).toBe(true);
  });

  it('starts none where there is no master, no school, or the trade takes none', () => {
    const w = masterWorld();
    const young = res(w.state, w.crew[1]!);
    young.stage = 'young';
    morning(w.state);
    expect(young.apprentice).toBeUndefined();
  });

  it('shares the day’s starts between both paths', () => {
    const w = masterWorld(MAX_APPRENTICES_PER_DAY + 1);
    withMaster(w);
    for (const id of w.crew.slice(1)) res(w.state, id).stage = 'young';
    morning(w.state);
    const started = w.crew.filter((id) => res(w.state, id).apprentice).length;
    expect(started).toBe(MAX_APPRENTICES_PER_DAY);
  });

  it('the school path joins a master’s workshop under the master', () => {
    const w = masterWorld();
    place(w.state, 'school', 70, 30, 0);
    // A second bakery with a master and an open place, nearest to the student's home.
    const second = place(w.state, 'workshop', 66, 40, 0, 'baker');
    second.level = 3;
    const [mid] = hire(w.state, second.id, 1);
    const m = res(w.state, mid!);
    m.flags |= ResidentFlags.master;
    m.mastery = 'baker';
    second.masterId = m.id;
    // Fill the first bakery so the open place is the second one's.
    hire(w.state, w.bakery.id, 3);
    const young = res(w.state, w.crew[2]!);
    young.stage = 'young';
    young.jobId = 0;
    w.bakery.rt!.workers = w.bakery.rt!.workers.filter((id) => id !== young.id);
    // Only the second bakery has an open place (the Forester's Lodge is a workshop too).
    for (const o of w.state.buildings) if (o !== second && o.rt && o.def !== 'school') o.rt.paused = true;
    young.needs = young.needs.map(() => 90);
    // The fixture's own young folk would take the day's starts first.
    for (const o of w.state.residents) if (o !== young && o.stage === 'young') o.stage = 'adult';
    morning(w.state);
    expect(young.apprentice?.master).toBe(m.id);
    expect(young.apprentice?.at).toBe(second.id);
  });

  it('a finished apprentice of a master stays at the trade, and goes to a skilled opening without one', () => {
    for (const underMaster of [true, false]) {
      const w = masterWorld();
      withMaster(w);
      // An open skilled job elsewhere that a graduate would otherwise take.
      place(w.state, 'school', 66, 40, 0);
      const r = res(w.state, w.crew[1]!);
      r.stage = 'young';
      r.apprentice = {
        at: w.bakery.id,
        trade: 'baker',
        untilDay: today(w.state),
        ...(underMaster && { master: w.crew[0]! }),
      };
      morning(w.state);
      if (underMaster) expect(r.jobId).toBe(w.bakery.id);
      else expect(r.jobId).not.toBe(w.bakery.id);
    }
  });

  it('ten days of their own make a master, with no hearts asked', () => {
    const w = masterWorld();
    withMaster(w);
    const r = res(w.state, w.crew[1]!);
    r.bond = 0;
    r.apprentice = { at: w.bakery.id, trade: 'baker', untilDay: today(w.state) - 1, master: w.crew[0]! };
    for (let d = 0; d < MASTERY.apprenticeDays - 1; d++) mastersDay(w.state);
    expect(isMaster(r)).toBe(false);
    expect(r.apprentice.ownDays).toBe(MASTERY.apprenticeDays - 1);
    mastersDay(w.state);
    expect(isMaster(r)).toBe(true);
    expect(r.mastery).toBe('baker');
  });

  it('days of their own do not count for an apprentice of the wrong trade or under no master', () => {
    const w = masterWorld();
    withMaster(w);
    const a = res(w.state, w.crew[1]!);
    const b = res(w.state, w.crew[2]!);
    a.apprentice = { at: w.bakery.id, trade: 'weaver', untilDay: today(w.state) - 1, master: w.crew[0]! };
    b.apprentice = { at: w.bakery.id, trade: 'baker', untilDay: today(w.state) - 1 };
    for (let d = 0; d < MASTERY.apprenticeDays + 2; d++) mastersDay(w.state);
    expect(a.apprentice.ownDays).toBeUndefined();
    expect(b.apprentice.ownDays).toBeUndefined();
    expect(isMaster(a) || isMaster(b)).toBe(false);
  });
});
