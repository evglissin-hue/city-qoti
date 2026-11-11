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
  trades,
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
    case 'river':
      break;
    case 'woods':
      expect(rule.trees > 0 && rule.within > 0, `${where} woods`).toBe(true);
      break;
    case 'openGround':
      expect(rule.clear > 0, `${where} open ground`).toBe(true);
      break;
    case 'road':
      for (const r of rule.roads ?? []) expect(['path', 'lane', 'street'], `${where} road`).toContain(r);
      break;
    case 'valleyRoad':
      expect(rule.within > 0, `${where} valley road`).toBe(true);
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

  it('ships the I0 to I3 content lists', () => {
    expect(buildings.map((b) => b.id).sort()).toEqual(
      [
        'builders-yard',
        'cottage',
        'house',
        'shed',
        'town-hall',
        'well',
        // R1: the thirteen specialized buildings (docs/spec/13-ledger.md, Land and specialized buildings)
        'brickworks',
        'cart-shed',
        'fishery',
        'foresters-lodge',
        'granary',
        'market-square',
        'market-stall',
        'quarry',
        'river-dock',
        'sawmill',
        'storehouse',
        'trading-post',
        'windmill',
        // R1: the business defs a trade grows as, and the Hearth's Apiary (hives placed by hand)
        'apiary',
        'corner-shop',
        'farmstead',
        'workshop',
        // Services, homes and civic buildings as built
        'bath-house',
        'bell-tower',
        'gate',
        'herbalist',
        'herbalists-cottage',
        'net-trap',
        'palisade',
        'pit-trap',
        'school',
        'stone-bridge',
        'stone-wall',
        'tavern',
        'townhouse',
        'watch-house',
        'watchtower',
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
        // I2 (C4C)
        'cafe-table',
        'flower-cart',
        'fountain',
        'lamp-post',
        'maypole',
        'notice-board',
        // I3 (C5D): the Town Gate and Watch Lookout pieces
        'gate-banner',
        'lookout-bench',
        // I3 (C5.0): festival pieces
        'bonfire',
        'bunting',
        'festival-stage',
        'festival-stall',
        'festival-table',
        'flower-arch',
        // I3 (C5C): play, and the I3 Hearth patterns' unlocks
        'arbor-seat',
        'pear-tree',
        'reed-bed',
        'see-saw',
        'swing',
        // Playtest round seven: pricier decor that helps a workplace
        'flower-trellis',
        'painted-shop-sign',
        'rain-barrel',
        'tool-rack',
        'weathervane',
        // P1: signature pieces of the callings (locked until R3 brings callings back)
        'millstone-bench',
        'rose-arch',
        'wayside-shrine',
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
      'bunting',
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
    const kind = c.count.what === 'pattern' ? 'pattern' : c.count.what === 'sighted' ? 'wildlife' : 'good';
    out.push(`${kind}:${c.count.ref}`);
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
    // C5.0: the Field Guide's species arrive with C5C; until then a sighting may name one ahead.
    wildlife: new Set(content.wildlife.length ? content.wildlife.map((w) => w.id) : ['kingfisher']),
  };
  const known = (ref: string) => {
    const [kind, id] = ref.split(':') as [keyof typeof ids, string];
    return ids[kind].has(id);
  };

  it('keeps the goods order fixed (saves index per-good arrays by it)', () => {
    // R1.0: the sixteen goods of docs/spec/13-ledger.md, in its order; append-only from here.
    expect(goods.map((g) => g.id)).toEqual([
      'grain',
      'vegetables',
      'fruit',
      'fish',
      'cheese',
      'bread',
      'firewood',
      'timber',
      'stone',
      'brick',
      'wool',
      'cloth',
      'furniture',
      'candles',
      'honey',
      'cider',
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
      // R1: method switching is gone; a building has at most one method.
      expect((b.methods ?? []).length, `${b.id} methods`).toBeLessThanOrEqual(1);
      for (const [good] of b.upgradesTo?.goods ?? [])
        expect(ids.good.has(good), `${b.id} upgrade ${good}`).toBe(true);
    }
  });

  it('has seven species, sixteen traits with symmetric clashes, and name pools', () => {
    expect(species).toHaveLength(7);
    // Sixteen to roll for newcomers, and Reformed [I3], which is only ever given.
    expect(traits).toHaveLength(17);
    expect(traits.filter((t) => t.special).map((t) => t.id)).toEqual(['reformed']);
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

  it('meets the I3 name targets: 400 given names and 150 family names, no repeats', () => {
    const given = species.flatMap((s) => s.givenNames);
    expect(given.length).toBeGreaterThanOrEqual(400);
    expect(new Set(given).size).toBe(given.length);
    expect(familyNames.length).toBeGreaterThanOrEqual(150);
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

  it('has the thirteen wishes, twenty patterns (eight I1, six I2, six I3) and twenty achievements, with valid references', () => {
    // P1 (playtest): A Second Well joined the twelve I1 wishes.
    expect(wishes).toHaveLength(13);
    expect(patterns).toHaveLength(20);
    // R1 (R1D): Market Day, A Winter Without Imports, A Town That Builds Itself, Porridge No More.
    expect(achievements).toHaveLength(20);
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
    // Festival pieces [I3] are placed by the festival planner, not unlocked by a pattern. The
    // callings' signature pieces [P1] wait, locked, for R3 to bring callings back earned.
    for (const d of decor.filter((x) => x.locked && !x.festival && !x.tags.includes('calling')))
      expect(unlockable.has(d.id), `${d.id} has an unlock`).toBe(true);
  });

  it('has Chronicle templates for every I1 kind', () => {
    expect(chronicle.map((c) => c.kind).sort()).toEqual(
      expect.arrayContaining([
        'achievement',
        'first-of',
        'founding',
        'household-arrived',
        'household-left',
        'pattern-discovered',
        'season-summary',
        'wishes-digest',
      ]),
    );
  });
});

describe('building unlocks (playtest round six)', () => {
  it('name real buildings, in counts of one or more, and never loop', () => {
    for (const b of buildings) {
      for (const [def, count] of b.requires?.built ?? []) {
        expect(content.buildingById.has(def), `${b.id} requires ${def}`).toBe(true);
        expect(Number.isInteger(count) && count >= 1, `${b.id} count`).toBe(true);
      }
    }
    // Following the chain from any building never comes back to it.
    const visit = (id: string, path: string[]): void => {
      expect(path.includes(id), `${[...path, id].join(' > ')}`).toBe(false);
      for (const [def] of content.buildingById.get(id)?.requires?.built ?? []) visit(def, [...path, id]);
    };
    for (const b of buildings) visit(b.id, []);
  });
});

// --- R1 (R1.0): the zones-first Ledger's content rules (docs/spec/13-ledger.md) -----------------

const FAMILIES = ['food', 'fuel', 'materials', 'wares', 'treats'] as const;

describe('R1 content', () => {
  const goodIds = new Set(goods.map((g) => g.id));

  it('puts every good in exactly one of the five families, raw or made', () => {
    for (const g of goods) {
      expect(FAMILIES, g.id).toContain(g.family);
      expect(typeof g.raw, g.id).toBe('boolean');
    }
    // Every family but Fuel has a made good to add variety; Fuel is firewood alone.
    for (const f of FAMILIES)
      expect(
        goods.some((g) => g.family === f),
        f,
      ).toBe(true);
    expect(goods.filter((g) => !g.raw).map((g) => g.id)).toEqual([
      'bread',
      'brick',
      'cloth',
      'furniture',
      'candles',
      'cider',
    ]);
  });

  it('never uses a made good as an input (rule 2), in any trade or production method', () => {
    const made = new Set(goods.filter((g) => !g.raw).map((g) => g.id));
    // A method that makes something; a service that only uses a good up (the tavern pours cider,
    // the Bath House burns firewood) makes nothing, so no workshop waits on it.
    const methods = [
      ...buildings.flatMap((b) =>
        (b.methods ?? []).filter((m) => m.outputs.length > 0).map((m) => [b.id, m] as const),
      ),
      ...trades.flatMap((t) => (t.method ? [[t.id, t.method] as const] : [])),
    ];
    for (const [where, m] of methods) {
      for (const [good] of m.inputs) expect(made.has(good), `${where} takes ${good}`).toBe(false);
    }
    for (const t of trades)
      for (const good of t.from) expect(made.has(good), `${t.id} from ${good}`).toBe(false);
  });

  it('gives every trade real goods, a zone, a business def, a crew and a consistent method', () => {
    expect(trades.map((t) => t.id)).toEqual([
      'baker',
      'carpenter',
      'chandler',
      'cider-maker',
      'dairy',
      'grain-farm',
      'hives',
      'market-garden',
      'orchard',
      'sheep-run',
      'shop',
      'weaver',
    ]);
    for (const t of trades) {
      expect(t.id, t.id).toMatch(KEBAB);
      expect(content.zoneById.has(t.zone), `${t.id} zone`).toBe(true);
      const b = content.buildingById.get(t.building);
      expect(b?.grows?.zone, `${t.id} grows as ${t.building}`).toBe(t.zone);
      expect(t.crew[0] >= 1 && t.crew[0] <= t.crew[1] && t.crew[1] <= t.crew[2], `${t.id} crew`).toBe(true);
      // A business of the trade starts at level 1 with its def's jobs.
      expect(b?.jobs?.count, `${t.id} level 1 crew`).toBe(t.crew[0]);
      for (const good of t.from) expect(goodIds.has(good), `${t.id} from ${good}`).toBe(true);
      if (t.makes === null) {
        expect(t.method, `${t.id} shop has no method`).toBeNull();
        expect(t.sells?.length, `${t.id} sells by level`).toBe(3);
        continue;
      }
      expect(goodIds.has(t.makes), `${t.id} makes ${t.makes}`).toBe(true);
      const m = t.method!;
      expect(
        m.outputs.map(([g]) => g),
        `${t.id} method makes it`,
      ).toEqual([t.makes]);
      expect(m.inputs.map(([g]) => g).sort(), `${t.id} method takes from`).toEqual([...t.from].sort());
      expect(m.workers, `${t.id} workers`).toBe(t.crew[0]);
      for (const [good, qty] of [...m.inputs, ...m.outputs])
        expect(goodIds.has(good) && qty > 0, `${t.id} ${good}`).toBe(true);
      // A raw good comes from land (a Farmland trade); a made good from a workshop, from raw goods.
      expect(t.zone === 'farms', `${t.id} raw from land`).toBe(content.goodById.get(t.makes)!.raw);
    }
  });

  it('wires reach wants to the specialized building that enables the trade', () => {
    for (const t of trades) {
      const at = t.wants.reach;
      if (!at) continue;
      const b = content.buildingById.get(at);
      expect(b?.specialized, `${t.id} wants ${at}`).toBe(true);
      expect(b?.enables, `${at} enables ${t.id}`).toContain(t.id);
      expect((b?.reach ?? 0) > 0 && (b?.capacity ?? 0) > 0, `${at} reach and capacity`).toBe(true);
    }
    for (const b of buildings)
      for (const id of b.enables ?? [])
        expect(content.tradeById.get(id)?.wants.reach, `${b.id} enables ${id}`).toBe(b.id);
  });

  it('gives every specialized building a site rule, and the thirteen are the spec list', () => {
    const specialized = buildings.filter((b) => b.specialized).map((b) => b.id);
    expect(specialized.sort()).toEqual(
      [
        'brickworks',
        'cart-shed',
        'fishery',
        'foresters-lodge',
        'granary',
        'market-square',
        'market-stall',
        'quarry',
        'river-dock',
        'sawmill',
        'storehouse',
        'trading-post',
        'windmill',
      ].sort(),
    );
    for (const b of buildings.filter((x) => x.specialized)) {
      expect((b.placement ?? []).length, `${b.id} site rule`).toBeGreaterThan(0);
      expect(b.grows, `${b.id} is hand-placed`).toBeUndefined();
      for (const f of b.stores ?? []) expect(FAMILIES, `${b.id} stores`).toContain(f);
    }
  });

  it('gives each tier a basket by family, with amount and variety wants', () => {
    for (const basket of content.baskets) {
      const families = basket.wants.map((w) => w.family);
      expect(families, basket.tier).not.toContain('materials');
      expect(families, `${basket.tier} in family order`).toEqual(
        FAMILIES.filter((f) => families.includes(f)),
      );
      for (const w of basket.wants) {
        expect(
          w.amount >= 0 && Number.isInteger(w.variety) && w.variety >= 0,
          `${basket.tier} ${w.family}`,
        ).toBe(true);
        if (w.season !== undefined) expect(w.season >= 0 && w.season <= 3).toBe(true);
      }
    }
  });

  it('opens Homes, Workshops and Farmland at founding, and Shops and Townhouses from Village rank', () => {
    const open = content.zones.filter((z) => !z.requires?.rank).map((z) => z.id);
    expect(open.sort()).toEqual(['crafts', 'farms', 'homes-low']);
    for (const z of content.zones.filter((x) => x.requires?.rank)) expect(z.requires!.rank).toBe('village');
  });

  it('lets the neighbors sell something of every family, in real goods', () => {
    const sold = new Set(
      content.neighbors.flatMap((n) => n.sells.map(([g]) => content.goodById.get(g)!.family)),
    );
    for (const f of FAMILIES) expect(sold.has(f), `a neighbor sells ${f}`).toBe(true);
    for (const n of content.neighbors)
      for (const [g] of [...n.sells, ...n.buys, ...(n.seasonal ?? [])])
        expect(goodIds.has(g), `${n.id} ${g}`).toBe(true);
  });

  // R1 (R1D): a pattern's Lay it out ghost names real pieces: decor, linear decor for runs, a
  // building the Hearth can place, and every layout fits within a small ground.
  it('lays out patterns with real pieces, linear runs and a handful of tiles', () => {
    let laid = 0;
    for (const p of patterns) {
      if (!p.layout) continue;
      laid++;
      expect(p.layout.length, p.id).toBeGreaterThan(0);
      for (const piece of p.layout) {
        if ('decor' in piece)
          expect(content.decorById.get(piece.decor)?.linear, `${p.id} ${piece.decor}`).toBeFalsy();
        if ('run' in piece)
          expect(content.decorById.get(piece.run)?.linear, `${p.id} ${piece.run}`).toBe(true);
        if ('building' in piece)
          expect(content.buildingById.has(piece.building), `${p.id} ${piece.building}`).toBe(true);
        for (const v of Object.values(piece))
          if (typeof v === 'number') expect(Math.abs(v), p.id).toBeLessThanOrEqual(10);
      }
    }
    expect(laid).toBeGreaterThanOrEqual(12);
  });
});
