// R3H: the Ledger's lines for a level climbed or lost: one line each, several of a kind folded.
import { TICKS_PER_DAY, type ChronicleEntryView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../state/mirror';
import { computeAlerts } from './alerts';
import { specializedLevelAlerts } from './specializedAlerts';

const now = TICKS_PER_DAY * 3;

function mirrorWith(entries: ChronicleEntryView[]): Mirror {
  const m = new Mirror();
  m.tick.value = now;
  m.chronicle.value = entries;
  return m;
}

const entry = (id: number, kind: string, tick: number, text: string, ref = id): ChronicleEntryView => ({
  id,
  tick,
  kind,
  text,
  refs: [ref],
  seats: [],
});

describe('specializedLevelAlerts', () => {
  it('says a climb once, as news, with the building to click', () => {
    const m = mirrorWith([
      entry(1, 'specialized-grew', now - 10, 'Level 2 for the granary, with a third porter.', 42),
    ]);
    const a = specializedLevelAlerts(m);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ lens: 'ledger', tone: 'news', action: { kind: 'building', id: 42 } });
    expect(a[0]!.text).toBe('Level 2 for the granary, with a third porter.');
  });

  it('says a slide as a warning', () => {
    const m = mirrorWith([entry(1, 'specialized-shrank', now - 10, 'Back to level 1 for the stall.')]);
    expect(specializedLevelAlerts(m)[0]!.tone).toBe('warn');
  });

  it('folds several of a kind into one counted line', () => {
    const m = mirrorWith([1, 2, 3].map((i) => entry(i, 'specialized-grew', now - i, `Grew ${i}.`)));
    const a = specializedLevelAlerts(m);
    expect(a).toHaveLength(1);
    expect(a[0]!.text).toBe("Three of the town's buildings grew a level today.");
  });

  it('leaves out old entries and other kinds', () => {
    const m = mirrorWith([
      entry(1, 'specialized-grew', now - TICKS_PER_DAY - 1, 'Old.'),
      entry(2, 'wish', now - 1, 'Other.'),
    ]);
    expect(specializedLevelAlerts(m)).toEqual([]);
  });

  it('reaches the feed through computeAlerts', () => {
    const m = mirrorWith([entry(1, 'specialized-grew', now - 10, 'Level 2 for the quarry.')]);
    expect(computeAlerts(m).some((x) => x.text === 'Level 2 for the quarry.')).toBe(true);
  });
});
