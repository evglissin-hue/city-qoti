// Playtest item 4: no wish asks for something the town cannot do yet, and a wish that becomes
// impossible is let go quietly.
import { type Condition, content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/conditions';
import { lanternRoute } from '../../src/conditions/code';
import { findRoute } from '../../src/conditions/route';
import { MAP_SIZE, TICKS_PER_DAY } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { findById, removeById } from '../../src/state/entities';
import { seasonAt } from '../../src/state/seasons';
import { achievable } from '../../src/systems/hearth/wishes/achievable';
import { bindFor, checkWishes, generateWishes, makeWish, wishBinding } from '../../src/systems/hearth/wishes';
import { wishProgress } from '../../src/systems/hearth/wishes/progress';
import { doorTileOf } from '../../src/systems/movement/api';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { bakerCouldOpen, build, decor, plot, road, settle, standardWorld } from '../hearth/helpers';

const S = MAP_SIZE;
const wish = (id: string) => content.wishById.get(id)!;

function removeBuilding(s: WorldState, id: number): void {
  const b = removeById(s.buildings, id)!;
  for (let i = 0; i < s.map.occupant.length; i++) if (s.map.occupant[i] === b.id) s.map.occupant[i] = 0;
}

describe('the achievability walk', () => {
  it('needs a building the town has or can place now', () => {
    const s = standardWorld();
    // R1: a carpenter grows in a sawmill's reach, and the sawmill waits for Pippa's water wheel.
    const carpenter: Condition = { near: { buildingTag: 'carpenter', of: 'home', within: 12 } };
    expect(achievable(s, carpenter)).toBe(false);
    s.innovations.find((i) => i.id === 'water-wheel')!.unlockedTick = 1;
    expect(achievable(s, carpenter)).toBe(true);
    const s1 = standardWorld();
    build(s1, 'sawmill', 60, 60);
    expect(achievable(s1, carpenter)).toBe(true);
    const s2 = standardWorld();
    build(s2, 'workshop', 60, 60, 0, 0, 'carpenter');
    expect(achievable(s2, carpenter)).toBe(true);
    // A baker wants a windmill's reach, and a windmill needs nothing.
    expect(achievable(standardWorld(), { near: { buildingTag: 'baker', of: 'home', within: 12 } })).toBe(
      true,
    );
    // A well has no requirements.
    expect(achievable(standardWorld(), { near: { building: 'well', of: 'home', within: 4 } })).toBe(true);
  });

  it('skips grown-only buildings in standard valleys', () => {
    const s = standardWorld();
    const grown = content.buildings.find((d) => d.grows && !d.grows.handPlaced && !d.requires);
    if (!grown) return;
    expect(achievable(s, { near: { building: grown.id, of: 'home', within: 3 } })).toBe(false);
  });

  it('needs an unlocked piece of decor', () => {
    const s = standardWorld();
    const herb: Condition = { near: { tag: 'herb', of: 'home', within: 3 } };
    expect(achievable(s, herb)).toBe(false);
    s.hearth.unlocked.push('herb-planter');
    expect(achievable(s, herb)).toBe(true);
    expect(achievable(s, { near: { decor: 'bench', of: 'home', within: 3 } })).toBe(true);
  });

  it('reads all, any and not, and counts everything else as achievable', () => {
    const s = standardWorld();
    const no: Condition = { near: { buildingTag: 'carpenter', of: 'home', within: 12 } };
    const yes: Condition = { near: { building: 'well', of: 'home', within: 4 } };
    expect(achievable(s, { all: [yes, no] })).toBe(false);
    expect(achievable(s, { any: [yes, no] })).toBe(true);
    expect(achievable(s, { any: [no, no] })).toBe(false);
    expect(achievable(s, { not: no })).toBe(true);
    expect(achievable(s, { code: 'pathRoute' })).toBe(true);
    expect(achievable(s, { stock: { good: 'fish', atLeast: 1 } })).toBe(true);
    const bench = { tag: 'bench', of: 'home', within: 3, also: { target: { water: true }, within: 2 } };
    expect(achievable(s, { near: bench } as Condition)).toBe(true);
  });

  it('does not offer a wish whose target is out of reach', () => {
    const f = hamletFixture();
    const s = f.state;
    // The fixture has a baker and a windmill, so the wish is on offer far from them.
    findById(s.households, f.households[2])!.homeId = build(s, 'cottage', 140, 140).id;
    // R1 (R1D): and only where a baker could open: Workshops land in a windmill's reach.
    expect(generateWishes(s, createTickCtx(s), [wish('bakery-nearby')])).toBe(0);
    bakerCouldOpen(s, 143, 140);
    expect(generateWishes(s, createTickCtx(s), [wish('bakery-nearby')])).toBeGreaterThanOrEqual(1);
    // R1: a baker is always within reach (a windmill needs nothing), so the same wish asking for a
    // carpenter stands in: no sawmill and no water wheel, no wish, until a sawmill stands.
    const carpentry = {
      ...wish('bakery-nearby'),
      target: { near: { buildingTag: 'carpenter', of: 'home', within: 12 } },
    } as const;
    const g = hamletFixture();
    const t = g.state;
    findById(t.households, g.households[2])!.homeId = build(t, 'cottage', 140, 140).id;
    bakerCouldOpen(t, 143, 140);
    expect(generateWishes(t, createTickCtx(t), [carpentry])).toBe(0);
    build(t, 'sawmill', 120, 120);
    expect(generateWishes(t, createTickCtx(t), [carpentry])).toBeGreaterThanOrEqual(1);
  });
});

describe('lanterns over bridges and through gates', () => {
  it('routes over a road on water, as a bridge', () => {
    const f = hamletFixture();
    const s = f.state;
    const a = 95 + 60 * S;
    const b = 105 + 60 * S;
    expect(findRoute(s, a, b, false)).toBeNull();
    road(s, 'lane', 100, 60, 101, 60);
    const walk = findRoute(s, a, b, false)!;
    expect(walk).not.toBeNull();
    expect(walk).toContain(100 + 60 * S);
    // Road-only routes are untouched: grass still breaks them.
    expect(findRoute(s, a, b, true)).toBeNull();
    road(s, 'lane', 95, 60, 105, 60);
    expect(findRoute(s, a, b, true)).not.toBeNull();
  });

  it('walks through an open gate on a road, but not a shut one', () => {
    const f = hamletFixture();
    const s = f.state;
    road(s, 'lane', 69, 70, 71, 70);
    const gate = build(s, 'gate', 70, 70);
    const a = 69 + 70 * S;
    const b = 71 + 70 * S;
    expect(findRoute(s, a, b, false)).toContain(70 + 70 * S);
    gate.rt!.open = false;
    // A shut gate is a wall: the walk goes round it, never over it.
    const around = findRoute(s, a, b, false);
    expect(around === null || !around.includes(70 + 70 * S)).toBe(true);
  });

  it('grants a commute across a bridge', () => {
    const f = hamletFixture();
    const s = f.state;
    const home = build(s, 'cottage', 108, 46);
    findById(s.households, f.households[0])!.homeId = home.id;
    const r = findById(s.residents, f.residents[0]![1]!)!;
    r.jobId = f.b.bakery;
    // The lane runs on over the river from the bakery's street.
    road(s, 'lane', 90, 50, 112, 50);
    settle(s);
    const bind = bindFor(s, r);
    expect(bind.work).toBe(f.b.bakery);
    const walk = findRoute(s, doorTileOf(s, bind.work!), doorTileOf(s, bind.home!), false);
    expect(walk).not.toBeNull();
    expect(walk!.some((i) => s.map.water[i]! > 0)).toBe(true);
    expect(lanternRoute(s, bind, [['share', 50]])).toBe(false);
    for (let i = 0; i < walk!.length; i += 2) decor(s, 'lantern', walk![i]! % S, Math.floor(walk![i]! / S));
    expect(lanternRoute(s, bind, [['share', 50]])).toBe(true);
    const ctx = createTickCtx(s);
    makeWish(s, ctx, r, wish('lantern-on-my-way-home'));
    expect(checkWishes(s, ctx)).toEqual([1, 0]);
  });
});

describe('fresh fish and the frozen river', () => {
  it('is not offered while the river is frozen', () => {
    const f = hamletFixture();
    const s = f.state;
    s.weather.river.frozen = true;
    expect(generateWishes(s, createTickCtx(s), [wish('fresh-fish')])).toBe(0);
    s.weather.river.frozen = false;
    expect(generateWishes(s, createTickCtx(s), [wish('fresh-fish')])).toBeGreaterThanOrEqual(1);
  });
});

describe('neighbors wait for the warm months', () => {
  it('is offered in spring and summer only', () => {
    const f = hamletFixture();
    const s = f.state;
    const seen = new Map<number, boolean>();
    const home = findById(s.buildings, f.b.cottages[0])!;
    for (let d = 0; d < 400 && seen.size < 4; d++) {
      s.tick = d * TICKS_PER_DAY + 1;
      const season = seasonAt(s.tick).season;
      if (seen.has(season)) continue;
      seen.set(season, evaluate(s, wish('neighbors').when, { home: home.id, residentId: 0 }));
    }
    expect([...seen.entries()].sort()).toEqual([
      [0, true],
      [1, true],
      [2, false],
      [3, false],
    ]);
  });
});

describe('rebinding places that are gone', () => {
  it('moves a wish to the current job when its workplace is demolished', () => {
    const f = hamletFixture();
    const s = f.state;
    const r = findById(s.residents, f.residents[0]![1]!)!;
    const ctx = createTickCtx(s);
    const w = makeWish(s, ctx, r, wish('lantern-on-my-way-home'));
    expect(w.work).toBe(f.b.bakery);
    removeBuilding(s, f.b.bakery);
    r.jobId = f.b.sawpit;
    expect(checkWishes(s, ctx)).toEqual([0, 0]);
    expect(w.work).toBe(f.b.sawpit);
    expect(s.wishes).toContain(w);
    // The Wishes book reads the same place.
    const wants = wishProgress(s).find((p) => p.id === w.id)?.wants;
    expect(wants).toContain('walk home from work');
  });

  it('lets the wish go quietly when there is no job to rebind to', () => {
    const f = hamletFixture();
    const s = f.state;
    const r = findById(s.residents, f.residents[0]![1]!)!;
    const ctx = createTickCtx(s);
    const w = makeWish(s, ctx, r, wish('lantern-on-my-way-home'));
    const mood = r.mood;
    removeBuilding(s, f.b.bakery);
    r.jobId = 0;
    expect(checkWishes(s, ctx)).toEqual([0, 1]);
    expect(s.wishes).toHaveLength(0);
    expect(r.wishId).toBe(0);
    expect(r.mood).toBe(mood);
    expect(r.modifiers).toHaveLength(0);
    expect(wishBinding(w).work).toBe(f.b.bakery);
  });

  it('rebinds a demolished market to the nearest one, or lets the fish wish go', () => {
    const f = hamletFixture();
    const s = f.state;
    const r = findById(s.residents, f.residents[1]![0]!)!;
    const ctx = createTickCtx(s);
    const w = makeWish(s, ctx, r, wish('fresh-fish'));
    expect(w.market).toBe(f.b.stall);
    const second = build(s, 'market-stall', 70, 48);
    removeBuilding(s, f.b.stall);
    expect(checkWishes(s, ctx)).toEqual([0, 0]);
    expect(w.market).toBe(second.id);
    removeBuilding(s, second.id);
    expect(checkWishes(s, ctx)).toEqual([0, 1]);
    expect(r.wishId).toBe(0);
  });
});

describe('what the garden and quiet wishes say they still want', () => {
  it('a garden plot counts a market garden and suggests only what the town can do now', () => {
    const f = hamletFixture();
    const s = f.state;
    const r = findById(s.residents, f.residents[0]![0]!)!;
    const ctx = createTickCtx(s);
    const w = makeWish(s, ctx, r, wish('a-garden-plot'));
    const home = findById(s.buildings, w.home)!;
    let wants = wishProgress(s).find((p) => p.id === w.id)!.wants;
    expect(wants).toContain('garden bed');
    expect(wants).not.toContain('garden-bed');
    expect(wants).not.toContain('herb planter');
    expect(wants).not.toContain('herb garden');
    s.hearth.unlocked.push('herb-planter');
    wants = wishProgress(s).find((p) => p.id === w.id)!.wants;
    expect(wants).toContain('herb planter');
    expect(evaluate(s, wish('a-garden-plot').target, wishBinding(w))).toBe(false);
    plot(s, home.x, home.z - 4);
    expect(evaluate(s, wish('a-garden-plot').target, wishBinding(w))).toBe(true);
  });

  it('quiet please names the loudest neighbor, and Quiet Hours once the Policies book is open', () => {
    const f = hamletFixture();
    const s = f.state;
    build(s, 'quarry', 53, 44);
    settle(s);
    const r = findById(s.residents, f.residents[0]![0]!)!;
    const w = makeWish(s, createTickCtx(s), r, wish('quiet-please'));
    let wants = wishProgress(s).find((p) => p.id === w.id)?.wants;
    expect(wants).toContain('the quarry');
    expect(wants).toContain('move it');
    expect(wants).not.toContain('Quiet Hours');
    s.charter.rank = 'village';
    wants = wishProgress(s).find((p) => p.id === w.id)?.wants;
    expect(wants).toContain('Quiet Hours');
  });
});
