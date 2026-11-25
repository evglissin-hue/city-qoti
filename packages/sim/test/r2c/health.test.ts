// R2C's class for the dead-end hunt: an open gap that nothing the town can build would close is
// flagged after a day (view/health.ts, 'gap-unmeetable'), and a gap the town can meet never is.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import { openGap } from '../../src/systems/gaps/api';
import { HealthWatch } from '../../src/view/health';
import { villageFixture } from '../fixtures/village';
import { decor } from '../hearth/helpers';

describe('the gap dead-end hunt', () => {
  it('flags an open gap no one can close after a day, and only that one', () => {
    const s = villageFixture().state;
    // R3's row: a lantern draws candles and no one makes or sells them (stripped below), so it is
    // unmeetable.
    decor(s, 'lantern', 50, 40);
    openGap(s, null, 'shortOfSupplies', 'seats:1', 100, 2);
    // A Village can always put up a stall and a bench: these are meetable.
    openGap(s, null, 'nothingToSell', 'seats:2', 101, 9);
    openGap(s, null, 'nowhereToGo', 'street:3', 102, 6);
    const trades = [...content.trades];
    const sells = content.neighbors.map((n) => n.sells);
    (content.trades as unknown as unknown[]).splice(
      0,
      content.trades.length,
      ...trades.filter((t) => t.makes !== 'candles'),
    );
    for (const n of content.neighbors) n.sells = n.sells.filter(([g]) => g !== 'candles');
    try {
      checkFlags(s);
    } finally {
      (content.trades as unknown as unknown[]).splice(0, content.trades.length, ...trades);
      content.neighbors.forEach((n, i) => (n.sells = sells[i]!));
    }
  });
});

function checkFlags(s: ReturnType<typeof villageFixture>['state']): void {
  const watch = new HealthWatch();
  expect(watch.check(s).filter((i) => i.kind === 'gap-unmeetable')).toEqual([]);
  s.tick += TICKS_PER_DAY;
  const flags = watch.check(s).filter((i) => i.kind === 'gap-unmeetable');
  expect(flags.map((f) => f.text)).toEqual([
    'gap shortOfSupplies (seats:1) asks for something no one can do',
  ]);
}
