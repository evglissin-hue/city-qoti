// R2C's class for the dead-end hunt: an open gap that nothing the town can build would close is
// flagged after a day (view/health.ts, 'gap-dead-end'), and a gap the town can meet never is.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import { openGap } from '../../src/systems/gaps/api';
import { HealthWatch } from '../../src/view/health';
import { villageFixture } from '../fixtures/village';

describe('the gap dead-end hunt', () => {
  it('flags an open gap no one can close after a day, and only that one', () => {
    const s = villageFixture().state;
    // R3's row: nothing in R2 closes it, so gapAchievable says no.
    openGap(s, null, 'shortOfSupplies', 'seats:1', 100, 2);
    // A Village can always put up a stall and a bench: these are meetable.
    openGap(s, null, 'nothingToSell', 'seats:2', 101, 9);
    openGap(s, null, 'nowhereToGo', 'street:3', 102, 6);
    const watch = new HealthWatch();
    expect(watch.check(s).filter((i) => i.kind === 'gap-dead-end')).toEqual([]);
    s.tick += TICKS_PER_DAY;
    const flags = watch.check(s).filter((i) => i.kind === 'gap-dead-end');
    expect(flags.map((f) => f.text)).toEqual([
      'gap shortOfSupplies (seats:1) asks for something no one can do',
    ]);
  });
});
