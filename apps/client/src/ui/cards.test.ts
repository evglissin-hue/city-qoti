// R1 (R1C): cards wait their turn, oldest first; paper by lamplight from dusk to dawn.
import { signal } from '@preact/signals';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import type { Session } from '../app/session';
import { CARDS, cardQueue, lamplit, waitingWords } from './cards';

function fakeSession() {
  const ui = {
    letter: signal<unknown>(null),
    chapter: signal(false),
    festivalCard: signal<unknown>(null),
    raidCard: signal<unknown>(null),
    rankUp: signal<unknown>(null),
    almanac: signal<unknown>(null),
    storyLetter: signal<unknown>(null),
  };
  return { ui, session: { ui } as unknown as Session };
}

describe('cards wait their turn', () => {
  it('lists every card kind once, in sorted order', () => {
    const ids = CARDS.map((c) => c.panel);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows the first to arrive, then the next once it is closed', () => {
    const { ui, session } = fakeSession();
    expect(cardQueue(session)).toEqual([]);
    ui.almanac.value = { kind: 'card' };
    expect(cardQueue(session)).toEqual(['season-card']);
    ui.rankUp.value = { rank: 'village' };
    cardQueue(session);
    ui.letter.value = { away: 1 };
    // Arrival order, not the list's order: the almanac came first.
    expect(cardQueue(session)).toEqual(['season-card', 'rankup', 'away']);
    ui.almanac.value = null;
    expect(cardQueue(session)).toEqual(['rankup', 'away']);
    // A card that comes back joins the back of the line.
    ui.almanac.value = { kind: 'report' };
    expect(cardQueue(session)).toEqual(['rankup', 'away', 'season-card']);
    expect(waitingWords(2)).toBe('2 more waiting');
  });

  it('lights the lamps from half past seven until six', () => {
    const at = (h: number) => 3 * TICKS_PER_DAY + Math.round(h * TICKS_PER_HOUR);
    expect(lamplit(at(12))).toBe(false);
    expect(lamplit(at(19.4))).toBe(false);
    expect(lamplit(at(19.5))).toBe(true);
    expect(lamplit(at(2))).toBe(true);
    expect(lamplit(at(6))).toBe(false);
  });
});
