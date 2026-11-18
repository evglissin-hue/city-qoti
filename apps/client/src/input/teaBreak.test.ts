import { describe, expect, it } from 'vitest';
import type { Mirror } from '../state/mirror';
import { chooseTeaBreak, IdleTimer, TEA_BREAK_AFTER_MS, type TeaBreakGuards } from './teaBreak';

const guards = (o: Partial<Record<keyof TeaBreakGuards, boolean>> = {}): TeaBreakGuards => ({
  enabled: () => o.enabled ?? true,
  toolInHand: () => o.toolInHand ?? false,
  cardOpen: () => o.cardOpen ?? false,
  busy: () => o.busy ?? false,
});

describe('V4.0: the tea break idle timer', () => {
  it('waits 90 seconds from the last input', () => {
    expect(TEA_BREAK_AFTER_MS).toBe(90_000);
    const t = new IdleTimer(1000);
    expect(t.due(1000 + TEA_BREAK_AFTER_MS - 1, guards())).toBe(false);
    expect(t.due(1000 + TEA_BREAK_AFTER_MS, guards())).toBe(true);
    t.poke(50_000);
    expect(t.idleFor(60_000)).toBe(10_000);
    expect(t.due(60_000, guards())).toBe(false);
    expect(t.due(50_000 + TEA_BREAK_AFTER_MS, guards())).toBe(true);
  });

  it('never starts with the setting off, a tool in hand, a card open or the camera busy', () => {
    const t = new IdleTimer(0);
    const late = TEA_BREAK_AFTER_MS * 3;
    expect(t.due(late, guards({ enabled: false }))).toBe(false);
    expect(t.due(late, guards({ toolInHand: true }))).toBe(false);
    expect(t.due(late, guards({ cardOpen: true }))).toBe(false);
    expect(t.due(late, guards({ busy: true }))).toBe(false);
    expect(t.due(late, guards())).toBe(true);
  });

  it('picks nothing until V4C', () => {
    expect(chooseTeaBreak({} as Mirror)).toBe(null);
  });
});
