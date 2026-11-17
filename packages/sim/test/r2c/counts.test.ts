// R2C's counts (docs/spec/15-progression.md, the [R2] notes; 19-evenings.md, Gaps): the five R2
// CountWhats read what the gaps pass keeps, a closed gap counts where a fulfilled request did, and
// Mind the Gap wants both seats mending.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { countOf, evaluate } from '../../src/conditions';
import { villageFixture } from '../fixtures/village';

describe('the R2 counts', () => {
  it('read the gaps and the evenings runs', () => {
    const s = villageFixture().state;
    for (const what of [
      'gapsClosed',
      'gapsClosedEachSeat',
      'eveningsOut',
      'eveningsHalfOut',
      'eveningsAllOut',
      'seatedSeasons',
    ])
      expect(countOf(s, what)).toBe(0);
    s.gaps.closedCount = 5;
    s.gaps.closedBySeat = [1, 4, 0, 0];
    s.evenings.outRun = 2;
    s.evenings.allOut = 1;
    s.evenings.seatedSeasons = 3;
    expect(countOf(s, 'gapsClosed')).toBe(5);
    expect(countOf(s, 'gapsClosedEachSeat')).toBe(1);
    expect(countOf(s, 'eveningsOut')).toBe(2);
    expect(countOf(s, 'eveningsAllOut')).toBe(1);
    expect(countOf(s, 'seatedSeasons')).toBe(3);
  });

  it('count closed gaps where fulfilled requests counted', () => {
    const s = villageFixture().state;
    const before = countOf(s, 'requestsFulfilled');
    s.gaps.closedCount += 2;
    expect(countOf(s, 'requestsFulfilled')).toBe(before + 2);
  });

  it('keep Mind the Gap for a pair who both mended', () => {
    const s = villageFixture().state;
    const feat = content.achievements.find((a) => a.id === 'mind-the-gap')!;
    s.gaps.closedCount = 12;
    s.gaps.closedBySeat = [0, 12, 0, 0];
    expect(evaluate(s, feat.condition)).toBe(false);
    s.gaps.closedBySeat = [3, 9, 0, 0];
    expect(evaluate(s, feat.condition)).toBe(true);
  });
});
