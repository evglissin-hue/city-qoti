import type { Command } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import {
  DECISIONS_LIMIT,
  decisionVerdict,
  formatDecisions,
  tallyDecisions,
  type DecisionRecord,
} from './decisions';
import type { PlayLane } from './advisors/types';

const rec = (
  cmd: Command,
  lane: PlayLane = 'ledger',
  day = 1,
  ok = true,
  advisor = 'street',
): DecisionRecord => ({ day, advisor, lane, kind: cmd.t, ok, label: cmd.t, cmd });

const zone: Command = { t: 'zone.paint', zone: 'homes', tiles: [[1, 1]] };
const tree: Command = { t: 'tree.plant', species: 'oak', x: 1, z: 1 } as Command;

describe('tallyDecisions', () => {
  it('counts by kind, lane, refusal and advisor within the days', () => {
    const t = tallyDecisions(
      [
        rec(zone),
        rec(zone, 'ledger', 2, false),
        rec(zone, 'hearth', 3, true, 'hearth'),
        rec(tree, 'hearth', 71, true, 'hearth'),
      ],
      70,
    );
    expect(t.ledger).toBe(1);
    expect(t.hearth).toBe(1);
    expect(t.refused).toBe(1);
    expect(t.kinds).toEqual([
      { kind: 'zone.paint', ledger: 1, hearth: 1, ledgerRefused: 1, hearthRefused: 0 },
    ]);
    expect(t.advisors.map((a) => [a.advisor, a.total, a.refused])).toEqual([
      ['street', 2, 1],
      ['hearth', 1, 0],
    ]);
  });
});

describe('decisionVerdict', () => {
  it('passes a modest, well-behaved town', () => {
    expect(decisionVerdict([rec(zone), rec(tree, 'hearth')])).toEqual([]);
  });
  it('fails a Ledger over the limit, counting accepted commands in the first days only', () => {
    const many = Array.from({ length: DECISIONS_LIMIT }, () => rec(zone));
    expect(decisionVerdict(many)).toEqual([]);
    expect(decisionVerdict([...many, rec(zone)])).toHaveLength(1);
    expect(decisionVerdict([...many, rec(zone, 'ledger', 71)])).toEqual([]);
    expect(decisionVerdict([...many, rec(zone, 'ledger', 1, false)])).toEqual([]);
  });
  it('fails a Ledger pause but not a resume', () => {
    expect(decisionVerdict([rec({ t: 'build.setPaused', id: 1, paused: false })])).toEqual([]);
    expect(decisionVerdict([rec({ t: 'build.setPaused', id: 1, paused: true })])).toHaveLength(1);
  });
  it('fails a Ledger that places decor or trees', () => {
    expect(decisionVerdict([rec(tree)])).toHaveLength(1);
    expect(decisionVerdict([rec({ t: 'decor.place', def: 'bench', fx: 0, fz: 0, rot: 0 })])).toHaveLength(1);
    expect(
      decisionVerdict([rec({ t: 'decor.placeRun', def: 'fence', from: [0, 0], to: [1, 1] })]),
    ).toHaveLength(1);
    expect(decisionVerdict([rec({ t: 'decor.move', id: 1, fx: 0, fz: 0, rot: 0 })])).toHaveLength(1);
  });
  it('fails a Hearth that zones, lays streets or places a specialized building, not paths', () => {
    expect(decisionVerdict([rec(zone, 'hearth')])).toHaveLength(1);
    expect(decisionVerdict([rec({ t: 'road.paint', kind: 'path', tiles: [[1, 1]] }, 'hearth')])).toEqual([]);
    expect(decisionVerdict([rec({ t: 'road.paint', kind: 'lane', tiles: [[1, 1]] }, 'hearth')])).toHaveLength(
      1,
    );
    expect(
      decisionVerdict([rec({ t: 'road.paint', kind: 'street', tiles: [[1, 1]] }, 'hearth')]),
    ).toHaveLength(1);
    expect(
      decisionVerdict([rec({ t: 'build.place', def: 'quarry', x: 1, z: 1, rot: 0 }, 'hearth')]),
    ).toHaveLength(1);
    expect(decisionVerdict([rec({ t: 'build.place', def: 'well', x: 1, z: 1, rot: 0 }, 'hearth')])).toEqual(
      [],
    );
  });
});

describe('formatDecisions', () => {
  it('prints the table, the total line and the verdict without em dashes', () => {
    const text = formatDecisions([rec(zone), rec(tree)], 70);
    expect(text).toContain('zone.paint');
    expect(text).toContain(`Ledger 2 of ${DECISIONS_LIMIT} in 70 days`);
    expect(text).toContain('FAIL: ');
    expect(text).not.toContain('—');
    expect(formatDecisions([rec(zone)], 70)).toMatch(/PASS$/);
  });
});
