// V3A: what the shipped dressing table says (packages/content/src/dressingRules.ts), read through
// the resolver on a real kit's anchors: woodpiles follow firewood, stock piles follow fill, Low keeps
// signs and stock piles, and both seats get the same plot.
import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import { anchorsFor } from './anchors';
import { resolveDressing, rulesFor, validateDressingRules, type DressingSubject } from './dressing';
import { kitById } from './kits';

const RULES = content.dressingRules;
const SEED = 0x5eed1e55;

function cottage(over: Partial<DressingSubject> = {}): DressingSubject {
  return {
    id: 41,
    def: 'cottage',
    kind: 'home',
    level: 1,
    tier: 'settler',
    season: 'summer',
    stats: { members: 3, firewood: 3, cloth: 0, births: 0 },
    ...over,
  };
}

const COTTAGE = anchorsFor(kitById.get('cottage')!, { size: [2, 2], entrance: [1, 1], lot: [0, -1, 2, 2] });
const STORE = anchorsFor(kitById.get('storehouse')!, { size: [3, 3], entrance: [1, 2] });

const count = (subject: DressingSubject, rule: string, anchors = COTTAGE): number =>
  resolveDressing(subject, RULES, anchors, SEED).filter((p) => p.rule === rule).length;

describe('the shipped dressing table (V3A)', () => {
  it('passes validation, every piece a registered kit', () => {
    const errors = validateDressingRules(
      RULES,
      (id) => kitById.has(id),
      (id) => content.tradeById.has(id),
      (id) => content.buildingById.has(id),
    );
    expect(errors).toEqual([]);
  });

  it('grows a woodpile with the firewood, and the stand-in doubles it in autumn and winter', () => {
    const sizes = [1, 2, 3, 4, 6, 8].map((fw) =>
      count(cottage({ stats: { members: fw, firewood: fw } }), 'home-woodpile'),
    );
    expect(sizes).toEqual([1, 1, 2, 2, 3, 4]);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]!);
    // The stand-in (members, doubled in autumn and winter) as the layer builds it.
    const members = 3;
    const summer = count(cottage({ stats: { members, firewood: members } }), 'home-woodpile');
    const winter = count(
      cottage({ season: 'winter', stats: { members, firewood: members * 2 } }),
      'home-woodpile',
    );
    expect(winter).toBeGreaterThan(summer);
  });

  it('hangs washing once there is cloth, and a pram after a birth', () => {
    expect(count(cottage(), 'home-washing')).toBe(0);
    expect(
      count(cottage({ tier: 'craftsfolk', stats: { members: 3, firewood: 3, cloth: 1 } }), 'home-washing'),
    ).toBe(1);
    expect(count(cottage(), 'home-pram')).toBe(0);
    expect(count(cottage({ stats: { members: 3, firewood: 3, births: 1 } }), 'home-pram')).toBe(1);
  });

  it("piles a storehouse's stock as it fills, and a granary's sacks too", () => {
    const store = (fill: number): DressingSubject => ({
      id: 9,
      def: 'storehouse',
      kind: 'specialized',
      level: 1,
      season: 'summer',
      stats: { fill },
    });
    const piles = (fill: number): number =>
      resolveDressing(store(fill), RULES, STORE, SEED).filter((p) => p.rule.startsWith('storehouse-')).length;
    expect(piles(0)).toBe(0);
    expect(piles(50)).toBeGreaterThan(piles(10));
    expect(piles(100)).toBeGreaterThan(piles(50));
    const granary = (fill: number): number =>
      resolveDressing({ ...store(fill), def: 'granary' }, RULES, STORE, SEED).filter(
        (p) => p.rule === 'granary-sacks',
      ).length;
    expect(granary(25)).toBeLessThan(granary(75));
  });

  it('keeps only signs and stock piles on Low', () => {
    const low = rulesFor('some', RULES);
    expect(low.length).toBeGreaterThan(0);
    for (const r of low) expect(r.id.startsWith('sign-') || r.who.def !== undefined).toBe(true);
    for (const r of low) expect(['yard-sign', 'goods-sacks', 'crates', 'barrels']).toContain(r.piece.kit);
  });

  it('dresses a level 2 business with its sign and goods, and leaves the orchard alone', () => {
    const shop = (level: number, trade = 'shop'): DressingSubject => ({
      id: 12,
      def: 'corner-shop',
      kind: 'business',
      trade,
      level,
      season: 'summer',
      stats: { level },
    });
    const kit = kitById.get('shop')!;
    const a = anchorsFor(kit, { size: [2, 2], entrance: [1, 1] });
    const rules = (s: DressingSubject): string[] => resolveDressing(s, RULES, a, SEED).map((p) => p.rule);
    expect(rules(shop(1))).not.toContain('sign-shop');
    expect(rules(shop(2))).toEqual(expect.arrayContaining(['sign-shop', 'goods-shop']));
    expect(rules(shop(3))).toEqual(expect.arrayContaining(['awning-l3', 'yard-l3']));
    expect(rules(shop(3, 'orchard'))).toEqual([]);
  });

  it('gives both seats the same plot: equal input, equal placements', () => {
    const a = resolveDressing(
      cottage({ stats: { members: 4, firewood: 8, births: 1 } }),
      RULES,
      COTTAGE,
      SEED,
    );
    const b = resolveDressing(
      cottage({ stats: { members: 4, firewood: 8, births: 1 } }),
      RULES,
      COTTAGE,
      SEED,
    );
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('keeps a plot to a few well chosen things', () => {
    // The fullest home the table allows (winter, a big household, cloth, a birth, every chance).
    let most = 0;
    for (let id = 1; id <= 200; id++) {
      const s = cottage({
        id,
        tier: 'craftsfolk',
        season: 'winter',
        stats: { members: 6, firewood: 12, cloth: 1, births: 1 },
      });
      most = Math.max(most, resolveDressing(s, RULES, COTTAGE, SEED).length);
    }
    expect(most).toBeLessThanOrEqual(12);
  });
});
