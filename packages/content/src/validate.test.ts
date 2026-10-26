import { describe, expect, it } from 'vitest';
import {
  achievements,
  buildings,
  chronicle,
  content,
  decor,
  familyNames,
  goods,
  patterns,
  roads,
  species,
  traits,
  trees,
  wishes,
} from './index';
import type { Condition, Cost, PlacementRule, Target } from './types';

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const DEPOSITS = new Set(['stone', 'clay', 'sand', 'coal']);

function expectSaneCost(cost: Cost | undefined, where: string): void {
  if (!cost) return;
  if (cost.coins !== undefined) {
    expect(Number.isInteger(cost.coins) && cost.coins >= 0, `${where} coins`).toBe(true);
  }
  for (const [good, qty] of cost.goods ?? []) {
    expect(good, `${where} good id`).toMatch(KEBAB);
    expect(Number.isInteger(qty) && qty > 0, `${where} ${good} quantity`).toBe(true);
  }
}

function expectSaneRule(rule: PlacementRule, where: string): void {
  switch (rule.kind) {
    case 'deposit':
      expect(DEPOSITS.has(rule.deposit), `${where} deposit`).toBe(true);
      break;
    case 'fertility':
      expect(rule.min >= 0 && rule.min <= 100, `${where} fertility`).toBe(true);
      break;
    case 'height':
      expect((rule.min ?? 0) <= (rule.max ?? 15), `${where} height range`).toBe(true);
      break;
    case 'waterEdge':
      break;
  }
}

describe('content', () => {
  it('has unique kebab-case ids across every kind', () => {
    const ids = [...buildings, ...decor, ...roads, ...trees].map((d) => d.id);
    for (const id of ids) expect(id).toMatch(KEBAB);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps registries in alphabetical order by id', () => {
    for (const list of [buildings, decor, roads, trees]) {
      const ids = list.map((d) => d.id);
      expect(ids).toEqual([...ids].sort());
    }
  });

  it('ships the I0 and I1 content lists', () => {
    expect(buildings.map((b) => b.id).sort()).toEqual(
      [
        'bakery',
        'builders-yard',
        'cottage',
        'farmhouse',
        'fishers-hut',
        'foresters-lodge',
        'house',
        'market-stall',
        'quarry',
        'sawpit',
        'shed',
        'storehouse',
        'town-hall',
        'vegetable-plot',
        'well',
        'windmill',
        'woodcutter',
      ].sort(),
    );
    expect(decor.map((d) => d.id).sort()).toEqual(
      [
        'apple-tree',
        'barrels',
        'bench',
        'birdbath',
        'cherry-tree',
        'crates',
        'curved-bench',
        'fence',
        'flower-bed',
        'hanging-lantern',
        'hedge',
        'herb-planter',
        'lantern',
        'low-wall',
        'mooring-post',
        'planter',
        'planter-wall',
        'ring-bench',
        'signpost',
        'wildflower-verge',
      ].sort(),
    );
    expect(roads.map((r) => r.id).sort()).toEqual(['lane', 'path', 'street']);
    expect(trees.map((t) => t.id).sort()).toEqual(['birch', 'oak', 'pine']);
  });

  it('gives buildings sane footprints, entrances, rules and costs', () => {
    for (const b of buildings) {
      const [w, d] = b.size;
      expect(Number.isInteger(w) && w >= 1 && w <= 8, `${b.id} width`).toBe(true);
      expect(Number.isInteger(d) && d >= 1 && d <= 8, `${b.id} depth`).toBe(true);
      const [ex, ez] = b.entrance;
      expect(ex >= 0 && ex < w && ez >= 0 && ez < d, `${b.id} entrance inside footprint`).toBe(true);
      for (const rule of b.placement ?? []) expectSaneRule(rule, b.id);
      expectSaneCost(b.cost, b.id);
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.art.kit).toMatch(KEBAB);
    }
  });

  it('gives decor sane radii and flags', () => {
    for (const d of decor) {
      expect(Number.isInteger(d.radius) && d.radius > 0 && d.radius <= 512, `${d.id} radius`).toBe(true);
      if (d.linear) expect(d.radius, `${d.id} linear radius`).toBeLessThanOrEqual(128);
      expect(d.tags.length, `${d.id} tags`).toBeGreaterThan(0);
      expect(d.art.kit).toMatch(KEBAB);
    }
    expect(decor.filter((d) => d.linear).map((d) => d.id)).toEqual([
      'fence',
      'hedge',
      'low-wall',
      'planter-wall',
      'wildflower-verge',
    ]);
  });

  it('maps roads and trees to unique layer values', () => {
    const roadValues = roads.map((r) => r.layerValue);
    expect(new Set(roadValues).size).toBe(roads.length);
    for (const v of roadValues) expect(v >= 1 && v <= 4).toBe(true);
    for (const r of roads) expectSaneCost(r.cost, r.id);
    const species = trees.map((t) => t.species);
    expect(new Set(species).size).toBe(trees.length);
    for (const s of species) expect(s >= 1 && s <= 31).toBe(true);
  });

  it('indexes every def by id', () => {
    for (const b of buildings) expect(content.buildingById.get(b.id)).toBe(b);
    for (const d of decor) expect(content.decorById.get(d.id)).toBe(d);
    for (const r of roads) expect(content.roadById.get(r.id)).toBe(r);
    for (const t of trees) expect(content.treeById.get(t.id)).toBe(t);
  });
});

/** Every content id a condition refers to. */
function conditionRefs(c: Condition, out: string[] = []): string[] {
  const target = (t: Target) => {
    if ('decor' in t) out.push(`decor:${t.decor}`);
    if ('building' in t) out.push(`building:${t.building}`);
  };
  if ('all' in c) for (const x of c.all) conditionRefs(x, out);
  else if ('any' in c) for (const x of c.any) conditionRefs(x, out);
  else if ('not' in c) conditionRefs(c.not, out);
  else if ('near' in c) {
    target(c.near);
    if (c.near.also) target(c.near.also.target);
  } else if ('stock' in c) out.push(`good:${c.stock.good}`);
  else if ('resident' in c) {
    for (const s of c.resident.species ?? []) out.push(`species:${s}`);
    for (const t of c.resident.traits ?? []) out.push(`trait:${t}`);
  } else if ('count' in c && c.count.ref) {
    out.push(c.count.what === 'pattern' ? `pattern:${c.count.ref}` : `good:${c.count.ref}`);
  }
  return out;
}

describe('I1 content', () => {
  const ids = {
    building: new Set(buildings.map((b) => b.id)),
    decor: new Set(decor.map((d) => d.id)),
    good: new Set(goods.map((g) => g.id)),
    species: new Set(species.map((s) => s.id)),
    trait: new Set(traits.map((t) => t.id)),
    pattern: new Set(patterns.map((p) => p.id)),
  };
  const known = (ref: string) => {
    const [kind, id] = ref.split(':') as [keyof typeof ids, string];
    return ids[kind].has(id);
  };

  it('keeps the goods order fixed (saves index per-good arrays by it)', () => {
    expect(goods.map((g) => g.id)).toEqual([
      'logs',
      'planks',
      'stone',
      'wheat',
      'flour',
      'bread',
      'vegetables',
      'fish',
      // I2 (C4.0)
      'clay',
      'bricks',
      'wool',
      'yarn',
      'cloth',
      'milk',
      'cheese',
      'apples',
      'cider',
      'firewood',
      'herbs',
      'tools',
    ]);
    goods.forEach((g, i) => expect(content.goodIndex.get(g.id)).toBe(i));
    for (const g of goods) expect(g.basePrice > 0 && g.carry > 0, g.id).toBe(true);
  });

  it('refers only to goods that exist, in costs and production methods', () => {
    for (const b of buildings) {
      for (const [good] of b.cost?.goods ?? []) expect(ids.good.has(good), `${b.id} cost ${good}`).toBe(true);
      for (const m of b.methods ?? []) {
        for (const [good, qty] of [...m.inputs, ...m.outputs]) {
          expect(ids.good.has(good) && qty > 0, `${b.id} ${m.id} ${good}`).toBe(true);
        }
        expect(m.hours > 0 && m.workers >= 1, `${b.id} ${m.id}`).toBe(true);
        expect(m.workers, `${b.id} ${m.id} workers`).toBeLessThanOrEqual(b.jobs?.count ?? 0);
      }
    }
  });

  it('has seven species, sixteen traits with symmetric clashes, and name pools', () => {
    expect(species).toHaveLength(7);
    expect(traits).toHaveLength(16);
    for (const t of traits) {
      for (const c of t.clashes) {
        expect(ids.trait.has(c), `${t.id} clashes ${c}`).toBe(true);
        expect(content.traitById.get(c)!.clashes, `${c} clashes back with ${t.id}`).toContain(t.id);
      }
      for (const f of t.befriends ?? []) expect(ids.trait.has(f), `${t.id} befriends ${f}`).toBe(true);
    }
    for (const s of species) expect(s.givenNames.length, s.id).toBeGreaterThan(0);
    expect(familyNames.length).toBeGreaterThan(0);
  });

  it('meets the I1 name targets: 200 given names and 100 family names, no repeats', () => {
    const given = species.flatMap((s) => s.givenNames);
    expect(given.length).toBeGreaterThanOrEqual(200);
    expect(new Set(given).size).toBe(given.length);
    expect(familyNames.length).toBeGreaterThanOrEqual(100);
    expect(new Set(familyNames).size).toBe(familyNames.length);
    expect([...familyNames].sort()).toEqual(familyNames);
    for (const name of [...given, ...familyNames]) expect(name).toMatch(/^[A-Z][a-z]+$/);
    for (const s of species) {
      for (const bio of s.bios ?? []) {
        expect(bio, s.id).toContain('{name}');
        expect(bio).not.toMatch(/\u2014/);
      }
    }
  });

  it('pairs every trait with at least eleven others (compatible pairs exist for all)', () => {
    for (const t of traits) {
      const ok = traits.filter((o) => o.id !== t.id && !t.clashes.includes(o.id));
      expect(ok.length, t.id).toBeGreaterThanOrEqual(11);
    }
  });

  it('has the twelve wishes, eight patterns and ten achievements, with valid references', () => {
    expect(wishes).toHaveLength(12);
    expect(patterns).toHaveLength(8);
    expect(achievements).toHaveLength(10);
    for (const w of wishes) {
      for (const ref of [...conditionRefs(w.when), ...conditionRefs(w.target)]) {
        expect(known(ref), `${w.id} ${ref}`).toBe(true);
      }
      expect(w.text.length && w.thanks.length, w.id).toBeTruthy();
      for (const t of [...w.text, ...w.thanks]) expect(t).not.toMatch(/\u2014/);
    }
    for (const p of patterns) {
      for (const u of p.unlocks)
        expect(ids.decor.has(u) || ids.building.has(u), `${p.id} unlocks ${u}`).toBe(true);
    }
    for (const a of achievements) {
      for (const ref of conditionRefs(a.condition)) expect(known(ref), `${a.id} ${ref}`).toBe(true);
    }
    const unlockable = new Set(patterns.flatMap((p) => p.unlocks));
    for (const d of decor.filter((x) => x.locked))
      expect(unlockable.has(d.id), `${d.id} has an unlock`).toBe(true);
  });

  it('has Chronicle templates for every I1 kind', () => {
    expect(chronicle.map((c) => c.kind).sort()).toEqual(
      [
        'achievement',
        'first-of',
        'founding',
        'household-arrived',
        'household-left',
        'pattern-discovered',
        'season-summary',
        'wishes-digest',
      ].sort(),
    );
  });
});
