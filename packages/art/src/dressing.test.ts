import { describe, expect, it } from 'vitest';
import {
  content,
  DRESSING_MAX_PER_RULE,
  DRESSING_STATS,
  type DressingAnchor,
  type DressingRule,
} from '@qoti/content';
import { ANCHOR_NAMES, anchorsFor, deriveAnchors } from './anchors';
import {
  dressingCount,
  matches,
  resolveDressing,
  rulesFor,
  subjectKey,
  validateDressingRules,
  type DressingSubject,
} from './dressing';
import { kitById } from './kits';

const isKit = (id: string): boolean => kitById.has(id);
const isTrade = (id: string): boolean => content.tradeById.has(id);
const isDef = (id: string): boolean => content.buildingById.has(id);

/** A decor kit that exists, for synthetic rules. */
const PIECE = 'barrels';

function rule(over: Partial<DressingRule> & { id: string; seed: number }): DressingRule {
  return { who: {}, anchor: 'yard', piece: { kit: PIECE }, count: { base: 1, max: 4 }, ...over };
}

function home(over: Partial<DressingSubject> = {}): DressingSubject {
  return {
    id: 7,
    def: 'cottage',
    kind: 'home',
    level: 1,
    tier: 'settler',
    season: 'summer',
    stats: { members: 3, firewood: 3 },
    ...over,
  };
}

const ANCHORS = deriveAnchors(
  [2, 2],
  [1, 1],
  [
    [0.6, 0.52, 1.76],
    [1.4, 0.52, 1.76],
  ],
);

describe('the dressing table (V3.0)', () => {
  it('ships sound (V3A fills it; dressingRules.test.ts tests what it says)', () => {
    expect(content.dressingRules.length).toBeGreaterThan(0);
    expect(validateDressingRules(content.dressingRules, isKit, isTrade, isDef)).toEqual([]);
  });

  it('names the same anchors as the art package', () => {
    const names: DressingAnchor[] = ['door', 'yard', 'walls', 'sills', 'front', 'garden', 'eaves'];
    expect([...ANCHOR_NAMES]).toEqual(names);
  });

  it('lists every stat once, alphabetically, all shared, each stand-in with its gap', () => {
    const ids = DRESSING_STATS.map((s) => s.id);
    expect(ids).toEqual([...new Set(ids)].sort());
    for (const s of DRESSING_STATS) {
      expect(s.scope).toBe('shared');
      if (s.status === 'stand-in') expect(s.gap, s.id).toBeTruthy();
    }
  });

  it('fails a bad rule', () => {
    const bad: DressingRule[] = [
      rule({ id: 'a', seed: 1, piece: { kit: 'no-such-kit' } }),
      rule({ id: 'b', seed: 2, anchor: 'roof' as DressingAnchor }),
      rule({ id: 'c', seed: 3, count: { base: 0, stat: 'gold' as 'fill', perUnit: 1, max: 3 } }),
      rule({ id: 'd', seed: 4, count: { base: 2, max: DRESSING_MAX_PER_RULE + 1 } }),
      rule({ id: 'e', seed: 5, count: { base: 5, max: 3 } }),
      rule({ id: 'a', seed: 6 }),
      rule({ id: 'g', seed: 6 }),
      rule({ id: 'h', seed: 8, chance: 1.5 }),
      rule({ id: 'i', seed: 9, who: { trade: ['alchemy'] } }),
      rule({ id: 'j', seed: 10, who: { def: ['castle'] } }),
      rule({ id: 'k', seed: 11, who: { minLevel: 4 } }),
      rule({ id: 'l', seed: 12, count: { base: 1, perUnit: 2, max: 3 } }),
    ];
    const errors = validateDressingRules(bad, isKit, isTrade, isDef);
    for (const want of [
      'rule a: no kit no-such-kit',
      'rule b: no anchor roof',
      'rule c: no stat gold',
      'rule d: count out of bounds',
      'rule e: count out of bounds',
      'rule a: duplicate id',
      'rule g: seed 6',
      'rule h: chance',
      'rule i: no trade alchemy',
      'rule j: no building castle',
      'rule k: minLevel 4',
      'rule l: perUnit without a stat',
    ])
      expect(
        errors.some((e) => e.startsWith(want)),
        want,
      ).toBe(true);
    expect(validateDressingRules([rule({ id: 'ok', seed: 1 })], isKit, isTrade, isDef)).toEqual([]);
  });
});

describe('resolveDressing (V3.0)', () => {
  it('gives equal output for equal input', () => {
    const rules = [
      rule({
        id: 'pile',
        seed: 11,
        anchor: 'eaves',
        count: { base: 0, stat: 'firewood', perUnit: 1, max: 6 },
      }),
      rule({ id: 'boots', seed: 12, anchor: 'door', count: { base: 2, max: 2 } }),
      rule({ id: 'pots', seed: 13, anchor: 'walls', count: { base: 5, max: 5 } }),
    ];
    const a = resolveDressing(home(), rules, ANCHORS, 99);
    const b = resolveDressing(
      home(),
      rules.slice(),
      deriveAnchors(
        [2, 2],
        [1, 1],
        [
          [0.6, 0.52, 1.76],
          [1.4, 0.52, 1.76],
        ],
      ),
      99,
    );
    expect(a).toEqual(b);
    expect(a.length).toBe(3 + 2 + 5);
    // Another building, or another valley seed, varies the jitter.
    expect(resolveDressing(home({ id: 8 }), rules, ANCHORS, 99)).not.toEqual(a);
    expect(resolveDressing(home(), rules, ANCHORS, 100)).not.toEqual(a);
  });

  it('bounds every count by its max and the table limit', () => {
    const c = { base: 1, stat: 'firewood' as const, perUnit: 2, max: 5 };
    expect(dressingCount(c, home({ stats: { firewood: 0 } }))).toBe(1);
    expect(dressingCount(c, home({ stats: { firewood: 1 } }))).toBe(3);
    expect(dressingCount(c, home({ stats: { firewood: 1e9 } }))).toBe(5);
    expect(
      dressingCount({ base: 0, stat: 'fill', perUnit: 1, max: 1e6 }, home({ stats: { fill: 1e9 } })),
    ).toBe(DRESSING_MAX_PER_RULE);
    expect(dressingCount({ base: 3, stat: 'fill', perUnit: -1, max: 9 }, home({ stats: { fill: 10 } }))).toBe(
      0,
    );
    // A missing stat reads as 0.
    expect(dressingCount(c, home({ stats: {} }))).toBe(1);
    const many = rule({ id: 'many', seed: 1, count: { base: 0, stat: 'members', perUnit: 100, max: 4 } });
    expect(resolveDressing(home(), [many], ANCHORS, 1)).toHaveLength(4);
  });

  it('matches by kind, def, trade, level, place, tier and season', () => {
    const shop: DressingSubject = { ...home(), kind: 'business', def: 'shop', trade: 'baker', level: 2 };
    expect(matches(rule({ id: 'x', seed: 1, who: { kind: ['business'] } }), shop)).toBe(true);
    expect(matches(rule({ id: 'x', seed: 1, who: { kind: ['home'] } }), shop)).toBe(false);
    expect(matches(rule({ id: 'x', seed: 1, who: { def: ['shop'] } }), shop)).toBe(true);
    expect(matches(rule({ id: 'x', seed: 1, who: { trade: ['baker'] } }), shop)).toBe(true);
    expect(matches(rule({ id: 'x', seed: 1, who: { trade: ['baker'] } }), home())).toBe(false);
    expect(matches(rule({ id: 'x', seed: 1, who: { minLevel: 2 } }), shop)).toBe(true);
    expect(matches(rule({ id: 'x', seed: 1, who: { minLevel: 3 } }), shop)).toBe(false);
    expect(matches(rule({ id: 'x', seed: 1, who: { place: ['tavern'] } }), shop)).toBe(false);
    expect(
      matches(rule({ id: 'x', seed: 1, who: { place: ['tavern'] } }), { ...shop, place: 'tavern' }),
    ).toBe(true);
    expect(matches(rule({ id: 'x', seed: 1, who: { tier: ['merchant'] } }), home())).toBe(false);
    expect(matches(rule({ id: 'x', seed: 1, who: { tier: ['settler'] } }), home())).toBe(true);
    expect(matches(rule({ id: 'x', seed: 1, who: { season: ['winter'] } }), home())).toBe(false);
    expect(matches(rule({ id: 'x', seed: 1 }), { ...home(), kind: null })).toBe(false);
  });

  it('puts pieces inside their anchor and facing its way', () => {
    const rules: DressingRule[] = [
      rule({ id: 'y', seed: 1, anchor: 'yard', count: { base: 4, max: 4 } }),
      rule({ id: 'g', seed: 2, anchor: 'garden', count: { base: 3, max: 3 } }),
      rule({ id: 'd', seed: 3, anchor: 'door', count: { base: 1, max: 1 } }),
      rule({ id: 's', seed: 4, anchor: 'sills', count: { base: 2, max: 2 } }),
    ];
    const out = resolveDressing(home(), rules, ANCHORS, 5);
    for (const p of out.filter((q) => q.rule === 'y')) {
      const r = ANCHORS.yard;
      const hx = r.size[0] / 2 + 1e-9;
      const hz = r.size[1] / 2 + 1e-9;
      expect(Math.abs(p.at[0] - r.center[0])).toBeLessThanOrEqual(hx);
      expect(Math.abs(p.at[2] - r.center[2])).toBeLessThanOrEqual(hz);
    }
    const door = out.find((q) => q.rule === 'd')!;
    expect(door.at).toEqual(ANCHORS.door.at);
    expect(door.yaw).toBeCloseTo(0, 9);
    const sills = out.filter((q) => q.rule === 's');
    expect(sills.map((q) => q.at)).toEqual(ANCHORS.sills.map((q) => q.at));
    for (const p of out) {
      expect(p.scale).toBeGreaterThanOrEqual(0.9);
      expect(p.scale).toBeLessThanOrEqual(1.1);
    }
  });

  it('puts nothing at an anchor the plot lacks, and nothing for a building the dressing leaves alone', () => {
    const r = [rule({ id: 'y', seed: 1, anchor: 'yard' })];
    expect(resolveDressing(home(), r, {}, 1)).toEqual([]);
    expect(resolveDressing({ ...home(), kind: null }, r, ANCHORS, 1)).toEqual([]);
  });

  it('applies chance by building, the same every time', () => {
    const cat = rule({ id: 'cat', seed: 77, chance: 0.25 });
    let got = 0;
    for (let id = 1; id <= 400; id++) {
      const a = resolveDressing(home({ id }), [cat], ANCHORS, 3).length;
      expect(resolveDressing(home({ id }), [cat], ANCHORS, 3).length).toBe(a);
      got += a;
    }
    expect(got).toBeGreaterThan(60);
    expect(got).toBeLessThan(140);
  });

  it('keys a subject by everything the resolver reads', () => {
    expect(subjectKey(home())).toBe(subjectKey(home()));
    expect(subjectKey(home({ id: 99 }))).toBe(subjectKey(home()));
    expect(subjectKey(home({ season: 'winter' }))).not.toBe(subjectKey(home()));
    expect(subjectKey(home({ stats: { members: 3, firewood: 4 } }))).not.toBe(subjectKey(home()));
    expect(subjectKey(home({ tier: 'merchant' }))).not.toBe(subjectKey(home()));
  });

  it('keeps only signs and stock piles on Low', () => {
    const r = [rule({ id: 'a', seed: 1 }), rule({ id: 'b', seed: 2, low: true })];
    expect(rulesFor('all', r)).toHaveLength(2);
    expect(rulesFor('some', r).map((x) => x.id)).toEqual(['b']);
  });

  it('reads anchors from anchorsFor on a real kit', () => {
    const kit = kitById.get('cottage')!;
    const anchors = anchorsFor(kit, { size: [2, 2], entrance: [1, 1] });
    const out = resolveDressing(home(), [rule({ id: 'y', seed: 1, count: { base: 2, max: 2 } })], anchors, 1);
    expect(out).toHaveLength(2);
  });
});
