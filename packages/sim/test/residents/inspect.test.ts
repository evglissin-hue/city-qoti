import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { ResidentDetail } from '../../src/contracts';
import { addMoodModifier } from '../../src/systems/residents/api';
import { inspect } from '../../src/view/inspect';
import { hamletFixture } from '../fixtures/hamlet';
import { eventsOf, resident, runner, ticks, untilHour } from './helpers';

function detail(state: Parameters<typeof inspect>[0], id: number): ResidentDetail {
  const d = inspect(state, 'resident', id);
  if (!d || !('r' in d)) throw new Error('no detail');
  return d;
}

describe('resident inspector', () => {
  it('says what they are doing and where, in plain words', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const hazel = f.residents[0]![1]!;
    expect(detail(f.state, hazel).doing).toBe('At home');
    untilHour(r, 9);
    expect(detail(f.state, hazel).doing).toBe('At work at the bakery');
    untilHour(r, 2);
    expect(detail(f.state, hazel).doing).toBe('Asleep');
  });

  it('breaks mood down into needs, traits and modifiers that add up', () => {
    const f = hamletFixture();
    const clover = resident(f.state, f.residents[0]![0]!);
    clover.needs = [90, 100, 100, 40, 55];
    addMoodModifier(f.state, clover.id, { kind: 'wish-granted', value: 12, ticks: TICKS_PER_DAY });
    const d = detail(f.state, clover.id);
    const labels = d.moodLines.map((l) => l.label);
    expect(labels).toContain('Fed well, with some variety');
    expect(labels).toContain('Water close by');
    expect(labels).toContain('A roof of their own');
    expect(labels).toContain('Still making friends');
    expect(labels).toContain('A pleasant enough lane');
    expect(labels).toContain('Cheerful');
    expect(labels).toContain('Wish granted');
    const sum = d.moodLines.reduce((a, l) => a + l.value, 0);
    expect(
      Math.abs(sum - (90 * 25 + 100 * 15 + 100 * 20 + 40 * 15 + 55 * 15) / 90 - 5 - 12),
    ).toBeLessThanOrEqual(3);
  });

  it('writes a bio and readable history', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const crumb = f.residents[2]![2]!;
    ticks(r, 2 * TICKS_PER_HOUR);
    const d = detail(f.state, crumb);
    expect(d.bio).toMatch(/^An? early bird, generous mouse\. Crumb /);
    const texts = d.history.map((h) => h.text);
    expect(texts[0]).toBe('Arrived in the valley with the family');
    expect(texts.some((t) => t.startsWith('Started '))).toBe(true);
    for (const t of [d.bio, d.doing, ...texts, ...d.moodLines.map((l) => l.label)])
      expect(t).not.toMatch(/\u2014/);
  });
});

describe('coarse resident events', () => {
  it('sends resident.updated only when the coarse view changes', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    ticks(r, TICKS_PER_DAY);
    const updates = eventsOf(r, 'resident.updated');
    // Nine residents, a day of walking about: a handful of job, friendship-driven mood and flag changes.
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.length).toBeLessThan(60);
    const crumb = updates.filter((e) => e.r.id === f.residents[2]![2]!);
    expect(crumb.some((e) => e.r.jobId !== 0)).toBe(true);
  });
});
