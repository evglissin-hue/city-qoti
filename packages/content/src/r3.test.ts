import { describe, expect, it } from 'vitest';
import * as callingsModule from './callings';
import { SUPPLIES, MASTERY, TOWN_BOOK, callingPhrases, content } from './index';
import type { Leaning, ProductionMethod, SupplyKind } from './types';

// R3.0 content rules (docs/spec/19-evenings.md: Supplies, Masters, The Town Book; 15-progression.md:
// Callings).

const { goods, decor, trades, buildings, masters, specialties, customs, callings } = content;
const goodIds = new Set(goods.map((g) => g.id));
const LEANINGS: Leaning[] = ['industry', 'gardens', 'pilgrimage'];

const sortedUnique = (ids: string[]) => {
  expect(ids).toEqual([...ids].sort());
  expect(new Set(ids).size).toBe(ids.length);
};

/** Every string reachable in a value. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out);
  return out;
}

describe('R3 supplies on decor', () => {
  const supplied = decor.filter((d) => d.supply);

  it('is well formed for its kind and names goods that exist', () => {
    expect(supplied.length).toBeGreaterThan(0);
    for (const d of supplied) {
      const s = d.supply!;
      const where = d.id;
      if (s.good !== undefined) expect(goodIds.has(s.good), `${where} good ${s.good}`).toBe(true);
      switch (s.kind) {
        case 'nightly':
          expect(s.good && s.qty && s.per, where).toBeTruthy();
          break;
        case 'evening':
          expect(s.good && s.qty, where).toBeTruthy();
          expect(s.seasons?.length, where).toBeGreaterThan(0);
          for (const n of s.seasons ?? []) expect(n >= 0 && n <= 3, `${where} season ${n}`).toBe(true);
          break;
        case 'season':
          expect(s.good && s.qty, where).toBeTruthy();
          break;
        case 'outlet':
        case 'well':
          expect(s.radius, where).toBeGreaterThan(0);
          break;
      }
    }
  });

  it('puts supplies on exactly the pieces the spec names', () => {
    expect(supplied.map((d) => d.id).sort()).toEqual(
      [
        'lantern',
        'hanging-lantern',
        'lamp-post',
        'bonfire',
        'brazier',
        'cafe-table',
        'festival-table',
        'bunting',
        'flower-arch',
        'maypole',
        'festival-stage',
        'fountain',
        'birdbath',
      ].sort(),
    );
  });

  it('has sane tuning numbers', () => {
    expect(content.supplies).toBe(SUPPLIES);
    expect(SUPPLIES.litHour).toBeGreaterThan(SUPPLIES.settleHour);
    expect(SUPPLIES.restCharmPercent).toBeGreaterThan(0);
    expect(SUPPLIES.restCharmPercent).toBeLessThan(100);
  });
});

describe("R3X neighbors and the masters' goods", () => {
  // The nine masters' goods are the town's own: no neighbor sells one, and each has a buyer, so the
  // carrier can sell what the masters make (a Village's outside income grows with them).
  const masterGoods = masters.flatMap((m) => (m.good ? [m.good] : []));
  it("has nine masters' goods, each bought by a neighbor and sold by none", () => {
    expect(new Set(masterGoods).size).toBe(9);
    for (const g of masterGoods) {
      expect(
        content.neighbors.some((n) => n.buys.some(([x]) => x === g)),
        `a neighbor buys ${g}`,
      ).toBe(true);
      for (const n of content.neighbors) {
        expect(
          n.sells.some(([x]) => x === g),
          `${n.id} sells ${g}`,
        ).toBe(false);
        expect(
          (n.seasonal ?? []).some(([x]) => x === g),
          `${n.id} seasonal ${g}`,
        ).toBe(false);
      }
    }
  });
});

describe('R3 masters', () => {
  const tradeIds = new Set(trades.map((t) => t.id));
  const specializedIds = new Set(buildings.filter((b) => b.specialized).map((b) => b.id));

  it('has one row for each trade and each specialized building that has masters, sorted and unique', () => {
    sortedUnique(masters.map((m) => m.of));
    for (const m of masters) {
      expect(tradeIds.has(m.of) || specializedIds.has(m.of), m.of).toBe(true);
      expect(content.masterByOf.get(m.of)).toBe(m);
      expect(m.title, m.of).toMatch(/^[a-z ]+$/);
    }
    for (const t of trades) expect(content.masterByOf.has(t.id), `trade ${t.id}`).toBe(true);
    expect(content.mastery).toBe(MASTERY);
  });

  it('gives every good one maker, from raw goods the trade already takes or makes', () => {
    const goodsMade = new Map<string, string[]>();
    for (const m of masters) {
      if (m.good === undefined) {
        expect(m.method, `${m.of} has a method but no good`).toBeUndefined();
        continue;
      }
      expect(goodIds.has(m.good), `${m.of} good ${m.good}`).toBe(true);
      expect(m.method, `${m.of} method`).toBeDefined();
      goodsMade.set(m.good, [...(goodsMade.get(m.good) ?? []), m.of]);
      const method = m.method as ProductionMethod;
      expect(
        method.outputs.map(([g]) => g),
        m.of,
      ).toContain(m.good);
      for (const [g] of method.outputs) expect(goodIds.has(g), `${m.of} output ${g}`).toBe(true);
      // Inputs are raw goods the trade takes, or (a specialized building) what its own method makes.
      const trade = trades.find((t) => t.id === m.of);
      const allowed = new Set<string>();
      if (trade) {
        for (const g of trade.from) allowed.add(g);
        if (trade.makes) allowed.add(trade.makes);
      } else {
        for (const meth of content.buildingById.get(m.of)?.methods ?? [])
          for (const [g] of meth.outputs) allowed.add(g);
      }
      for (const [g] of method.inputs) {
        expect(content.goodById.get(g)?.raw, `${m.of} input ${g} is raw`).toBe(true);
        expect(allowed.has(g), `${m.of} input ${g}`).toBe(true);
      }
      // A shelf: some shop level sells the good's family.
      const family = content.goodById.get(m.good)!.family;
      const shelf = trades.some((t) => t.sells?.some((level) => level.includes(family)));
      expect(shelf, `${m.good} has a shelf`).toBe(true);
    }
    for (const [good, makers] of goodsMade) expect(makers, good).toHaveLength(1);
    // Every new good has its maker.
    for (const g of goods.slice(16))
      if (!g.raw || g.id === 'butter') expect(goodsMade.has(g.id), g.id).toBe(true);
  });

  it('puts the nine new goods in their families', () => {
    const family = (id: string) => content.goodById.get(id)?.family;
    for (const id of ['pies', 'jam', 'cordial', 'mead']) expect(family(id), id).toBe('treats');
    for (const id of ['coats', 'toys', 'soap']) expect(family(id), id).toBe('wares');
    for (const id of ['butter', 'smoked-fish']) expect(family(id), id).toBe('food');
    expect(content.goodById.get('butter')?.raw).toBe(true);
    expect(content.goodById.get('smoked-fish')?.spoilsDays).toBeUndefined();
  });

  it('names a trade in `room`, and level 3 only for trades', () => {
    for (const m of masters) {
      if (m.room !== undefined) expect(tradeIds.has(m.room), `${m.of} room ${m.room}`).toBe(true);
      if (specializedIds.has(m.of)) expect(m.level3, `${m.of} is specialized`).toBeUndefined();
    }
  });
});

describe('R3 Town Book', () => {
  const patternIds = new Set(content.patterns.map((p) => p.id));
  const buildingIds = new Set(buildings.map((b) => b.id));
  const supplyKinds = new Set<SupplyKind>(decor.flatMap((d) => (d.supply ? [d.supply.kind] : [])));

  it('has specialties whose pattern exists and whose good is a Treat', () => {
    sortedUnique(specialties.map((s) => s.id));
    for (const s of specialties) {
      expect(patternIds.has(s.pattern), `${s.id} pattern ${s.pattern}`).toBe(true);
      expect(content.goodById.get(s.good)?.family, `${s.id} good`).toBe('treats');
      expect(LEANINGS, s.id).toContain(s.leaning);
      expect(s.text && s.hint && s.name, s.id).toBeTruthy();
      expect(content.specialtyById.get(s.id)).toBe(s);
    }
  });

  it('has customs with exactly the fields their kind needs', () => {
    sortedUnique(customs.map((c) => c.id));
    for (const c of customs) {
      expect(LEANINGS, c.id).toContain(c.leaning);
      expect(c.text && c.hint && c.name, c.id).toBeTruthy();
      expect(content.customById.get(c.id)).toBe(c);
      if (c.kind === 'day') {
        expect(c.supply, `${c.id} day has no supply`).toBeUndefined();
        expect(c.pattern !== undefined && c.host !== undefined, `${c.id} pattern or host`).toBe(false);
        if (c.pattern !== undefined) expect(patternIds.has(c.pattern), `${c.id} pattern`).toBe(true);
        if (c.host !== undefined) expect(buildingIds.has(c.host), `${c.id} host`).toBe(true);
      } else {
        expect(c.pattern === undefined && c.host === undefined, `${c.id} supply has no place`).toBe(true);
        expect(c.supply && supplyKinds.has(c.supply), `${c.id} supply kind in use`).toBe(true);
      }
    }
  });

  it('gives every leaning at least one specialty and one custom', () => {
    for (const l of LEANINGS) {
      expect(
        specialties.some((s) => s.leaning === l),
        `${l} specialty`,
      ).toBe(true);
      expect(
        customs.some((c) => c.leaning === l),
        `${l} custom`,
      ).toBe(true);
    }
  });

  it('has sane tuning numbers', () => {
    expect(content.townBook).toBe(TOWN_BOOK);
    expect(TOWN_BOOK.pagesForCalling).toBeGreaterThan(0);
    expect(TOWN_BOOK.hints).toBeGreaterThan(0);
  });
});

describe('R3 callings', () => {
  const specializedIds = new Set(buildings.filter((b) => b.specialized).map((b) => b.id));

  it('has three callings, one for each leaning, with a locked signature piece', () => {
    sortedUnique(callings.map((c) => c.id));
    expect(callings.map((c) => c.id)).toEqual(['garden-village', 'mill-town', 'pilgrims-rest']);
    expect(new Set(callings.map((c) => c.leaning)).size).toBe(callings.length);
    for (const c of callings) {
      expect(content.callingById.get(c.id)).toBe(c);
      const piece = content.decorById.get(c.signature);
      expect(piece?.locked, `${c.id} signature ${c.signature}`).toBe(true);
      expect(c.effectLines.length, c.id).toBeGreaterThan(0);
      for (const b of c.room?.buildings ?? []) expect(specializedIds.has(b), `${c.id} room ${b}`).toBe(true);
    }
  });

  it('has the County letter and the Chronicle template', () => {
    for (const key of ['{town}', '{calling}', '{signature}', '{leaning}'])
      expect(callingPhrases.earned).toContain(key);
    const template = content.chronicleByKind.get('calling');
    expect(template?.text).toHaveLength(3);
    for (const line of template?.text ?? [])
      for (const key of ['{town}', '{calling}', '{credit}']) expect(line).toContain(key);
  });
});

describe('R3 writing', () => {
  it('uses no em dash in any new content string', () => {
    const everything = [
      goods.slice(16),
      masters,
      specialties,
      customs,
      callings,
      callingsModule,
      content.supplies,
      content.townBook,
      content.mastery,
      content.achievements.filter((a) =>
        ['lamplighters-round', 'master-of-the-house', 'made-together'].includes(a.id),
      ),
    ];
    for (const s of strings(everything)) expect(s).not.toContain(String.fromCharCode(0x2014));
  });

  it('adds the three achievements, shared', () => {
    for (const id of ['lamplighters-round', 'master-of-the-house', 'made-together']) {
      expect(content.achievementById.get(id)?.lane, id).toBe('shared');
    }
  });
});
