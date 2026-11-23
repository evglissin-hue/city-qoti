import { describe, expect, it } from 'vitest';
import { ago } from './format';

describe('ago', () => {
  const now = 1_000_000_000_000;
  it('reads minutes, hours and days, and is singular for one day', () => {
    expect(ago(now - 20_000, now)).toBe('just now');
    expect(ago(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(ago(now - 24 * 3_600_000, now)).toBe('1 day ago');
    expect(ago(now - 36 * 3_600_000, now)).toBe('2 days ago');
    expect(ago(now - 9 * 86_400_000, now)).toBe('9 days ago');
  });
});
