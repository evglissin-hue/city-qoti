// The dead-end hunt's class for "wishes that can never be granted": every wish target, Charter
// goal, guide step goal, achievement and innovation condition must be something the content alone
// can bring about, in some reachable rank. The walk reads each condition down to its leaves: a
// building target needs a def a player can place (a rank a Charter reaches, an innovation or story
// that exists, the buildings it asks for themselves reachable), a decor target a piece that is
// free or unlocked by something, a good a building makes, a pattern, sighting, trial or story
// that exists. The sim's own `achievable()` (offer time) is tested in wish-dead-ends.test.ts; this
// one needs no valley, so it covers every rank at once.
//
// R1: businesses grow on zoned lots, so a trade is reachable when its zone can be painted at a
// reachable rank and what it asks (a rank, an innovation, a specialized building's reach) is
// reachable too. A business answers to its trade id and its building's id and tags (hasTag), and
// its trade's method makes goods. Story steps, the twists a season offers and commission asks are
// walked as well (the R1 stand-ins rewrote several of them).
import { type BuildingDef, type Condition, content, type Target, type TradeDef } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { codePredicates } from '../../src/conditions/code';

/** Conditions that cannot be met by content alone yet, with why. Keyed `<source>:<id>`. */
const ALLOWED = new Map<string, string>();

// --- What the content can reach -----------------------------------------------------------------

/** Ranks a Charter leads to (the hamlet is where every valley starts). */
const ranks = new Set<string>(['hamlet', ...content.charters.map((c) => c.rank)]);

/** Every string anywhere in content except the lists being asked about: who names this id? */
function named(id: string, skip: readonly unknown[]): boolean {
  // The lists that can unlock or reward a def: every other content list is data about something else.
  const lists: readonly unknown[] = [
    content.wishes,
    content.patterns,
    content.achievements,
    content.innovations,
    content.charters,
    content.stories,
    content.festivals,
    content.twists,
    content.commissions,
    content.renown,
    content.guide,
    content.events,
    content.wildlife,
    content.modules,
  ];
  return lists.some((l) => !skip.includes(l) && (JSON.stringify(l) ?? '').includes(`"${id}"`));
}

function handPlaceable(d: BuildingDef): boolean {
  if (d.modes && !d.modes.includes('standard')) return false;
  return !(d.grows && !d.grows.handPlaced);
}

/**
 * What a valley that reaches `ranks` can do: R1D made the walk a function of the ranks reached, so
 * the first days guide is checked against the Hamlet alone (its letters come in the first six days).
 */
function world(ranks: ReadonlySet<string>) {
  /** Building defs a standard valley's player can place once the earlier ones stand (a fixpoint). */
  const reachable = (() => {
    const have = new Set<string>();
    const has = (id: string) => [...have].some((h) => countsAs(h, id));
    const countsAs = (h: string, want: string) => {
      let def: string | undefined = want;
      for (let i = 0; def && i < 8; i++, def = content.buildingById.get(def)?.upgradesTo?.def)
        if (def === h) return true;
      return false;
    };
    for (let changed = true; changed;) {
      changed = false;
      for (const d of content.buildings) {
        if (have.has(d.id) || !handPlaceable(d)) continue;
        const r = d.requires;
        if (r) {
          if (r.rank && !ranks.has(r.rank)) continue;
          if (r.innovation && !content.innovationById.has(r.innovation)) continue;
          if (r.story && !named(d.id, [content.buildings])) continue;
          if (r.renown && r.renown > content.renown.length) continue;
          if (!(r.built ?? []).every(([id]) => has(id))) continue;
        }
        have.add(d.id);
        changed = true;
      }
    }
    return have;
  })();

  const defsOf = (ids: Iterable<string>) => [...ids].map((id) => content.buildingById.get(id)!);

  /** R1: trades that can grow: their zone paintable at a reachable rank, their needs reachable. */
  const trades: readonly TradeDef[] = content.trades.filter((t) => {
    const zone = content.zones.find((z) => z.id === t.zone);
    if (!zone || (zone.requires?.rank && !ranks.has(zone.requires.rank))) return false;
    const def = content.buildingById.get(t.building);
    if (def?.grows?.zone !== t.zone) return false;
    if (t.requires?.rank && !ranks.has(t.requires.rank)) return false;
    if (t.requires?.innovation && !content.innovationById.has(t.requires.innovation)) return false;
    return !t.wants.reach || reachable.has(t.wants.reach);
  });

  /** True when some reachable building (placed, or a business of a reachable trade) answers to `tag`. */
  function answersTo(tag: string): boolean {
    const asDef = (d: BuildingDef) => d.id === tag || (d.tags ?? []).includes(tag);
    return (
      defsOf(reachable).some(asDef) ||
      trades.some((t) => t.id === tag || asDef(content.buildingById.get(t.building)!))
    );
  }

  function targetOk(t: Target): string | null {
    const live = defsOf(reachable);
    if ('building' in t)
      return reachable.has(t.building) || trades.some((x) => x.building === t.building)
        ? null
        : `no player can place ${t.building}`;
    if ('buildingTag' in t)
      return answersTo(t.buildingTag) ? null : `no placeable building tagged ${t.buildingTag}`;
    if ('buildingCategory' in t)
      return live.some((d) => d.category === t.buildingCategory) ||
        trades.some((x) => content.buildingById.get(x.building)?.category === t.buildingCategory)
        ? null
        : `no placeable building in ${t.buildingCategory}`;
    if ('decor' in t || 'tag' in t) {
      const pieces = content.decor.filter((d) => ('decor' in t ? d.id === t.decor : d.tags.includes(t.tag)));
      if (pieces.length === 0) return `no decor matches ${JSON.stringify(t)}`;
      const free = pieces.some((d) => !d.locked || named(d.id, [content.decor]));
      return free ? null : `every matching piece is locked and nothing unlocks it`;
    }
    return null;
  }

  function producible(good: string): boolean {
    return (
      defsOf(reachable).some((d) => d.methods?.some((m) => m.outputs.some(([o]) => o === good))) ||
      trades.some((t) => t.method?.outputs.some(([o]) => o === good))
    );
  }

  /** A good the carrier can bring in: some neighbor sells it. */
  function importable(good: string): boolean {
    return content.neighbors.some((n) => n.sells.some(([g]) => g === good));
  }

  const COUNT_REF: Partial<Record<string, (ref: string) => string | null>> = {
    goodProduced: (ref) => (producible(ref) ? null : `nothing placeable makes ${ref}`),
    pattern: (ref) => (content.patternById.has(ref) ? null : `no pattern ${ref}`),
    sighted: (ref) => (content.wildlifeById.has(ref) ? null : `no wildlife ${ref}`),
    innovation: (ref) => (content.innovationById.has(ref) ? null : `no innovation ${ref}`),
    buildings: (ref) => (answersTo(ref) ? null : `no placeable building or tag ${ref}`),
    byWater: (ref) => (answersTo(ref) ? null : `no placeable building or tag ${ref}`),
    // R1 (R1D): a business answers to its trade or its building (and only grows on a lot).
    businesses: (ref) =>
      trades.some((t) => t.id === ref || t.building === ref) ? null : `no trade or business ${ref}`,
  };

  /** R1D: goods of a family the town can have: made by something reachable, or brought in. */
  const flavors = (family: string) =>
    content.goods.filter(
      (g) => g.family === family && g.id !== 'wool' && (producible(g.id) || importable(g.id)),
    );

  /** R1D: counts whose reach is a number of things rather than a ref. */
  function countProblem(what: string, ref: string | undefined, atLeast: number): string | null {
    if (what === 'businessTrades') {
      const n = trades.filter((t) => ref === undefined || t.id === ref || t.building === ref).length;
      return n >= atLeast ? null : `only ${n} trades could grow for ${ref ?? 'any building'}`;
    }
    if (what === 'foodFlavors') {
      const n = flavors(ref ?? 'food').length;
      return n >= atLeast ? null : `only ${n} flavors of ${ref ?? 'food'} can be had`;
    }
    return null;
  }

  /** Zones a valley at these ranks can paint. */
  const zoneOpen = (id: string) => {
    const z = content.zones.find((x) => x.id === id);
    return !!z && (!z.requires?.rank || ranks.has(z.requires.rank));
  };
  const paramOf = (c: Extract<Condition, { code: string }>, name: string, fallback: number) =>
    c.params?.find(([k]) => k === name)?.[1] ?? fallback;

  /** Why a condition cannot be met by content alone, or null when it can. */
  function problem(c: Condition): string | null {
    if ('all' in c) {
      for (const x of c.all) {
        const p = problem(x);
        if (p) return p;
      }
      return null;
    }
    if ('any' in c) {
      const ps = c.any.map(problem);
      return ps.every((p) => p !== null) ? ps[0]! : null;
    }
    if ('not' in c) return null;
    if ('near' in c) {
      const n = c.near;
      return targetOk(n) ?? (n.also ? targetOk(n.also.target) : null);
    }
    if ('stock' in c) {
      const g = c.stock.good;
      if (!content.goodById.has(g)) return `no good ${g}`;
      // R1: what nothing in town makes, the carrier may still bring (a family's rule to Always).
      return producible(g) || importable(g) ? null : `nothing placeable makes ${g} and no neighbor sells it`;
    }
    if ('count' in c) {
      const { what, ref } = c.count;
      const n = countProblem(what, ref, c.count.atLeast ?? 1);
      if (n) return n;
      return ref !== undefined ? (COUNT_REF[what]?.(ref) ?? null) : null;
    }
    if ('code' in c) {
      if (!codePredicates.has(c.code)) return `no code predicate ${c.code}`;
      if (c.code === 'trialPassed')
        return content.charters.some((x) => x.id === c.ref && x.trial) ? null : `no trial ${c.ref}`;
      // A festival menu twist names a good: something must make it or bring it.
      if (c.code === 'festivalMenu' && c.ref !== undefined)
        return producible(c.ref) || importable(c.ref) ? null : `no way to put ${c.ref} on a menu`;
      // R1 (R1D): the zones-first goals.
      if (c.code === 'tradeCouldOpen')
        return trades.some((t) => t.id === c.ref) ? null : `no trade ${c.ref} can grow`;
      if (c.code === 'shelfInReach' && c.ref !== undefined)
        return (producible(c.ref) || importable(c.ref)) && answersTo('market')
          ? null
          : `no way to put ${c.ref} on a stall`;
      if (c.code === 'stallFlavors')
        return flavors('food').length >= paramOf(c, 'flavors', 3) && answersTo('market')
          ? null
          : 'not enough kinds of Food for a stall';
      if (c.code === 'porridgeNoMore') return flavors('food').length >= 3 ? null : 'not three kinds of Food';
      if (c.code === 'marketDay') {
        const base = content.goods.filter((g) => g.family === 'food' && g.raw);
        const missing = base.find((g) => !(producible(g.id) || importable(g.id)));
        return missing ? `no way to have ${missing.id}` : answersTo('market') ? null : 'no stall';
      }
      if (c.code === 'guideFarmland') return zoneOpen('farms') ? null : 'Farmland cannot be zoned';
      if (c.code === 'guideHomes') return zoneOpen('homes-low') ? null : 'Homes cannot be zoned';
      if (c.code === 'guideFoodWorked')
        return reachable.has('fishery') || trades.some((t) => t.building === 'farmstead')
          ? null
          : 'no fishery or farmstead';
      if (c.code === 'seasonDeal') return content.neighbors.length > 0 ? null : 'no neighbor to deal with';
      return null;
    }
    return null;
  }

  return { reachable, trades, answersTo, producible, problem };
}

const ALL = world(ranks);
const { reachable, trades, answersTo, producible, problem } = ALL;
/** R1D: the first days happen at the Hamlet: every guide step must be met there. */
const HAMLET = world(new Set(['hamlet']));

// --- The checks ---------------------------------------------------------------------------------

function check(source: string, id: string, c: Condition): void {
  const key = `${source}:${id}`;
  const p = problem(c);
  if (ALLOWED.has(key)) {
    expect(p, `${key} is achievable now: take it off the allowlist`).not.toBeNull();
    return;
  }
  expect(p, `${key} cannot be met by content alone`).toBeNull();
}

describe('every goal can be met by content alone', () => {
  it('knows a reachable set of buildings', () => {
    expect(reachable.has('well')).toBe(true);
    expect(reachable.has('windmill')).toBe(true);
    // R1: the chain economy's 22 hand-placed defs are gone, so the count is smaller; every
    // hand-placed def is reachable save those behind a rank no Charter reaches yet (Town).
    expect(reachable.size).toBeGreaterThan(25);
    const behindRank = (d: BuildingDef) => !!d.requires?.rank && !ranks.has(d.requires.rank);
    for (const d of content.buildings)
      if (handPlaceable(d) && !behindRank(d)) expect(reachable.has(d.id), d.id).toBe(true);
    // R1: every trade can grow somewhere, and a baker answers to 'baker'.
    expect(trades.map((t) => t.id).sort()).toEqual(content.trades.map((t) => t.id).sort());
    expect(answersTo('baker')).toBe(true);
    expect(producible('bread')).toBe(true);
  });

  for (const w of content.wishes) it(`wish ${w.id}`, () => check('wish', w.id, w.target));
  for (const a of content.achievements)
    it(`achievement ${a.id}`, () => check('achievement', a.id, a.condition));
  for (const s of content.guide.steps)
    it(`guide step ${s.id}, at the Hamlet`, () => {
      expect(HAMLET.problem(s.goal), `guide:${s.id} cannot be met at the Hamlet`).toBeNull();
    });
  for (const i of content.innovations) it(`innovation ${i.id}`, () => check('innovation', i.id, i.condition));

  for (const arc of content.stories)
    arc.steps.forEach((st, i) =>
      it(`story ${arc.id} step ${i}`, () => check('story', `${arc.id}.${i}`, st.goal)),
    );
  // Twists a season offers (an empty list offers it in none: the Pie Contest waits for R3).
  for (const t of content.twists)
    if (t.goal && (t.seasons === undefined || t.seasons.length > 0))
      it(`twist ${t.id}`, () => check('twist', t.id, t.goal!));
  for (const c of content.commissions)
    it(`commission ${c.id}`, () => {
      if ('condition' in c.ask) check('commission', c.id, c.ask.condition);
      else for (const [g] of c.ask.goods) check('commission', c.id, { stock: { good: g, atLeast: 1 } });
    });

  for (const ch of content.charters)
    for (const g of ch.goals)
      it(`charter ${ch.id} goal ${g.id}`, () => {
        const cond: Condition = { count: { what: g.measure.what, ref: g.measure.ref, atLeast: g.target } };
        check('charter', `${ch.id}.${g.id}`, cond);
      });

  it('catches what it should', () => {
    expect(problem({ near: { building: 'no-such-building', of: 'home', within: 3 } })).not.toBeNull();
    expect(problem({ near: { decor: 'no-such-decor', of: 'home', within: 3 } })).not.toBeNull();
    expect(problem({ count: { what: 'goodProduced', ref: 'no-such-good' } })).not.toBeNull();
    expect(problem({ any: [{ count: { what: 'pattern', ref: 'nope' } }] })).not.toBeNull();
    expect(problem({ code: 'noSuchPredicate' })).not.toBeNull();
    // R1: a removed good, a removed def's tag, a menu of pies.
    expect(problem({ stock: { good: 'pies', atLeast: 1 } })).not.toBeNull();
    expect(problem({ near: { buildingTag: 'bakery', of: 'home', within: 12 } })).not.toBeNull();
    expect(problem({ code: 'festivalMenu', ref: 'pies', params: [['atLeast', 10]] })).not.toBeNull();
    // A business answers to its trade.
    expect(problem({ near: { buildingTag: 'market-garden', of: 'home', within: 3 } })).toBeNull();
    expect(problem({ count: { what: 'goodProduced', ref: 'cider', atLeast: 1 } })).toBeNull();
    // R1D: the first days at the Hamlet: Shops cannot be zoned there, a Market Square waits.
    expect(HAMLET.problem({ near: { buildingTag: 'shop', of: 'home', within: 3 } })).not.toBeNull();
    expect(HAMLET.problem({ count: { what: 'buildings', ref: 'market-square', atLeast: 1 } })).not.toBeNull();
    expect(problem({ count: { what: 'businessTrades', ref: 'workshop', atLeast: 99 } })).not.toBeNull();
    expect(problem({ code: 'tradeCouldOpen', ref: 'no-such-trade' })).not.toBeNull();
    // A well needs nothing: a wish for one is not a dead end.
    expect(problem({ near: { building: 'well', of: 'home', within: 4 } })).toBeNull();
  });

  it('keeps the allowlist honest', () => {
    for (const [key, why] of ALLOWED) expect(why.length, `${key} needs a reason`).toBeGreaterThan(10);
  });
});
