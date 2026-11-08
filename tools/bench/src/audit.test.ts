// A cut-down playability audit (npm run audit -w @qoti/bench is the full one): two seeds for
// twelve days must raise no dead-end flag, and the wish ledger must see wishes come and go.
import { describe, expect, it } from 'vitest';
import { audit, formatSummary } from './audit';

describe('the playability audit', { timeout: 90_000 }, () => {
  it('finds no dead ends in two seeds over twelve days', () => {
    const r = audit(['willow', 'hazel'], 12, 0);
    const why = `\n${formatSummary(r)}\n${r.flags.map((f) => `${f.run} ${f.kind}: ${f.text}`).join('\n')}`;
    expect(r.flags, why).toEqual([]);
    expect(r.runs).toHaveLength(2);
    const offered = r.wishes.reduce((n, s) => n + s.offered, 0);
    expect(offered, why).toBeGreaterThan(0);
    expect(
      r.wishes.reduce((n, s) => n + s.granted, 0),
      why,
    ).toBeGreaterThan(0);
  });
});
