// The dead-end hunt's class for "wishes that can never be granted": every wish target, Charter
// goal, guide step goal, achievement and innovation condition must be something the content alone
// can bring about, in some reachable rank. The walk reads each condition down to its leaves: a
// building target needs a def a player can place (a rank a Charter reaches, an innovation or story
// that exists, the buildings it asks for themselves reachable), a decor target a piece that is
// free or unlocked by something, a good a building makes, a pattern, sighting, trial or story
// that exists. The sim's own `achievable()` (offer time) is tested in wish-dead-ends.test.ts; this
// one needs no valley, so it covers every rank at once.
import { type BuildingDef, type Condition, content, type Target } from '@qoti/content';
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

function targetOk(t: Target): string | null {
  const live = defsOf(reachable);
  if ('building' in t) return reachable.has(t.building) ? null : `no player can place ${t.building}`;
  if ('buildingTag' in t)
    return live.some((d) => (d.tags ?? []).includes(t.buildingTag))
      ? null
      : `no placeable building tagged ${t.buildingTag}`;
  if ('buildingCategory' in t)
    return live.some((d) => d.category === t.buildingCategory)
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
  return defsOf(reachable).some((d) => d.methods?.some((m) => m.outputs.some(([o]) => o === good)));
}

const COUNT_REF: Partial<Record<string, (ref: string) => string | null>> = {
  goodProduced: (ref) => (producible(ref) ? null : `nothing placeable makes ${ref}`),
  pattern: (ref) => (content.patternById.has(ref) ? null : `no pattern ${ref}`),
  sighted: (ref) => (content.wildlifeById.has(ref) ? null : `no wildlife ${ref}`),
  innovation: (ref) => (content.innovationById.has(ref) ? null : `no innovation ${ref}`),
  buildings: (ref) =>
    defsOf(reachable).some((d) => d.id === ref || (d.tags ?? []).includes(ref))
      ? null
      : `no placeable building or tag ${ref}`,
  byWater: (ref) =>
    defsOf(reachable).some((d) => d.id === ref || (d.tags ?? []).includes(ref))
      ? null
      : `no placeable building or tag ${ref}`,
};

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
    return producible(g) || content.goodById.get(g)?.food === undefined
      ? null
      : `nothing placeable makes ${g}`;
  }
  if ('count' in c) {
    const { what, ref } = c.count;
    return ref !== undefined ? (COUNT_REF[what]?.(ref) ?? null) : null;
  }
  if ('code' in c) {
    if (!codePredicates.has(c.code)) return `no code predicate ${c.code}`;
    if (c.code === 'trialPassed')
      return content.charters.some((x) => x.id === c.ref && x.trial) ? null : `no trial ${c.ref}`;
    return null;
  }
  return null;
}

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
    expect(reachable.size).toBeGreaterThan(30);
  });

  for (const w of content.wishes) it(`wish ${w.id}`, () => check('wish', w.id, w.target));
  for (const a of content.achievements)
    it(`achievement ${a.id}`, () => check('achievement', a.id, a.condition));
  for (const s of content.guide.steps) it(`guide step ${s.id}`, () => check('guide', s.id, s.goal));
  for (const i of content.innovations) it(`innovation ${i.id}`, () => check('innovation', i.id, i.condition));

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
    // A well needs nothing: a wish for one is not a dead end.
    expect(problem({ near: { building: 'well', of: 'home', within: 4 } })).toBeNull();
  });

  it('keeps the allowlist honest', () => {
    for (const [key, why] of ALLOWED) expect(why.length, `${key} needs a reason`).toBeGreaterThan(10);
  });
});
