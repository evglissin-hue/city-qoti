// @vitest-environment happy-dom
// P3A: the Ledger's feed says when a business grew a level today.
import { TICKS_PER_DAY } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { alertsForLens, computeAlerts } from './alerts';
import { mockSession } from './mocks/session';

function ledgerWith(
  entries: { id: number; tick: number; kind?: string; refs?: number[] }[],
  now = 10 * TICKS_PER_DAY,
) {
  const mock = mockSession();
  const m = mock.session.mirror;
  m.tick.value = now;
  m.chronicle.value = entries.map((e) => ({
    id: e.id,
    tick: e.tick,
    kind: e.kind ?? 'business-grew',
    text: `Business is good at number ${e.id}: level 2 now.`,
    refs: e.refs ?? [e.id + 100],
    seats: [],
  }));
  return alertsForLens(computeAlerts(m, [], { seat: 0 }), 'ledger', new Set());
}

const grew = (all: ReturnType<typeof ledgerWith>) => all.filter((a) => a.key.startsWith('grew-'));

describe('business-grew lines', () => {
  it('shows one entry as its own sentence, linked to the building', () => {
    const [a, ...rest] = grew(ledgerWith([{ id: 7, tick: 10 * TICKS_PER_DAY - 10 }]));
    expect(rest).toEqual([]);
    expect(a).toMatchObject({
      key: 'grew-7',
      tone: 'news',
      text: 'Business is good at number 7: level 2 now.',
      action: { kind: 'building', id: 107 },
    });
  });
  it('folds several into one counted line that opens the Businesses book', () => {
    const lines = grew(
      ledgerWith([
        { id: 1, tick: 10 * TICKS_PER_DAY - 5 },
        { id: 2, tick: 10 * TICKS_PER_DAY - 6 },
        { id: 3, tick: 10 * TICKS_PER_DAY - 7 },
      ]),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      key: 'grew-1+2+3',
      text: '3 businesses grew a level today. Business is good.',
      action: { kind: 'panel', panel: 'businesses' },
    });
  });
  it('ignores old entries and other kinds', () => {
    const all = ledgerWith([
      { id: 1, tick: 10 * TICKS_PER_DAY - TICKS_PER_DAY - 1 },
      { id: 2, tick: 10 * TICKS_PER_DAY - 1, kind: 'founding' },
    ]);
    expect(grew(all)).toEqual([]);
  });
  it('comes after the warnings, never before them', () => {
    const mock = mockSession();
    const m = mock.session.mirror;
    m.tick.value = 10 * TICKS_PER_DAY;
    m.budget.value = { ...m.budget.value!, leanTimes: true };
    m.chronicle.value = [
      { id: 5, tick: 10 * TICKS_PER_DAY - 1, kind: 'business-grew', text: 'Grew.', refs: [9], seats: [] },
    ];
    const all = alertsForLens(computeAlerts(m, [], { seat: 0 }), 'ledger', new Set());
    const i = all.findIndex((a) => a.key === 'grew-5');
    expect(i).toBeGreaterThan(all.findIndex((a) => a.key === 'lean'));
  });
});
