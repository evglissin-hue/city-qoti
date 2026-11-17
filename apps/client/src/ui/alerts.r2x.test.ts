// @vitest-environment happy-dom
// R2X: two classes the feed read wrong on a busy morning. Story letters fold by sender, not by story
// ("Two letters from Pippa Quill." beside "A letter from Pippa Quill."), and the town's gaps come first
// in both lenses, so "Closed by" (what the other lane did for this one) is never pushed past the lines
// the feed shows by letters, plans and wishes.
import type { LetterView, WishView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { alertsForLens, computeAlerts, FEED_SHOWN } from './alerts';
import { overlayEveningMocks } from './mocks/evening';
import { mockSession } from './mocks/session';

function letter(arc: string, from: string, step: number, tick: number): LetterView {
  return { arc, from, residentId: 0, text: 'Dear both,\nA line.', tick, step };
}

function wish(id: number, template: string, text: string, tick: number): WishView {
  return {
    id,
    template,
    residentId: 0,
    text,
    lane: 'hearth',
    homeId: 0,
    area: null,
    createdTick: tick,
    expiresTick: 9e9,
  };
}

describe('story letters in the feed (R2X)', () => {
  it('read as one line per sender, whatever stories they come from, opening the newest', () => {
    const mock = mockSession();
    const m = mock.session.mirror;
    const now = m.tick.value;
    m.letters.value = [
      letter('quill-mill', 'Pippa Quill', -1, now - 30),
      letter('quill-mill', 'Pippa Quill', 0, now - 20),
      letter('quill-bridge', 'Pippa Quill', -1, now - 10),
      letter('ash-orchard', 'Hob Ashworth', -1, now - 5),
    ];
    for (const lens of ['hearth', 'ledger'] as const) {
      const lines = alertsForLens(computeAlerts(m, [], { seat: 0 }), lens, new Set()).filter(
        (a) => a.icon === 'letter',
      );
      expect(lines.map((a) => a.text)).toEqual([
        '3 letters from Pippa Quill.',
        'A letter from Hob Ashworth.',
      ]);
      expect(lines[0]!.action).toEqual({ kind: 'letter', arc: 'quill-bridge', step: -1 });
      // The class: no two letter lines name the same correspondent.
      const senders = lines.map((a) => /from (.+)\.$/.exec(a.text)?.[1]);
      expect(new Set(senders).size).toBe(senders.length);
    }
  });
});

describe('gaps come first in the feed (R2X)', () => {
  it('keeps "Closed by" among the lines shown however many letters and wishes arrive', () => {
    const mock = mockSession();
    const m = mock.session.mirror;
    overlayEveningMocks(mock.session);
    const now = m.tick.value;
    m.letters.value = ['Pippa Quill', 'Hob Ashworth', 'Wren Tolley', 'Odo Marsh'].map((from, i) =>
      letter(`arc-${i}`, from, -1, now - i),
    );
    const asks = ['bench', 'flowers', 'tree', 'pond', 'lamp', 'fence'];
    asks.forEach((t, i) => m.wishes.set(900 + i, wish(900 + i, t, `Somebody would like a ${t}.`, now)));
    for (const lens of ['hearth', 'ledger'] as const) {
      const shown = alertsForLens(computeAlerts(m, [], { seat: 0 }), lens, new Set()).slice(0, FEED_SHOWN);
      expect(shown.some((a) => a.text.startsWith('Closed by '))).toBe(true);
      expect(shown.some((a) => a.key.startsWith('gap-'))).toBe(true);
    }
  });
});

describe('the feed at rest (P3B)', () => {
  it('a gap is among the three lines shown at rest, in both lenses', async () => {
    const { FEED_AT_REST } = await import('./panels/Alerts');
    const mock = mockSession();
    const m = mock.session.mirror;
    overlayEveningMocks(mock.session);
    const now = m.tick.value;
    const asks = ['bench', 'flowers', 'tree', 'pond', 'lamp', 'fence'];
    asks.forEach((t, i) => m.wishes.set(900 + i, wish(900 + i, t, `Somebody would like a ${t}.`, now)));
    for (const lens of ['hearth', 'ledger'] as const) {
      const shown = alertsForLens(computeAlerts(m, [], { seat: 0 }), lens, new Set()).slice(0, FEED_AT_REST);
      expect(shown.some((a) => a.key.startsWith('gap-'))).toBe(true);
    }
  });
});
