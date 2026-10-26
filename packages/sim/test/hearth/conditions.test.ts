// The Condition DSL evaluator: every node kind, places and the named route predicates.
import { content, type Condition } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { type Binding, evaluate } from '../../src/conditions';
import { findById } from '../../src/state/entities';
import { hamletFixture } from '../fixtures/hamlet';
import { build, decor, road, S, settle, standardWorld } from './helpers';

function clover() {
  const f = hamletFixture();
  const id = f.residents[0]![0]!;
  const bind: Binding = { residentId: id, home: f.b.cottages[0], work: f.b.townHall, market: f.b.stall };
  return { f, s: f.state, bind };
}

describe('near', () => {
  it('measures from the place footprint, in tile gaps', () => {
    const { s, f } = clover();
    const home: Binding = { home: f.b.cottages[1] };
    // The bench at (56, 53) is four steps south of the cottage's back row (z 49).
    expect(evaluate(s, { near: { tag: 'bench', of: 'home', within: 4 } }, home)).toBe(true);
    expect(evaluate(s, { near: { tag: 'bench', of: 'home', within: 3 } }, home)).toBe(false);
    expect(evaluate(s, { near: { building: 'well', of: 'home', within: 3 } }, home)).toBe(true);
    expect(evaluate(s, { near: { building: 'well', of: 'home', within: 2 } }, home)).toBe(false);
    expect(evaluate(s, { near: { tree: 'any', of: 'home', within: 5 } }, home)).toBe(true);
    expect(evaluate(s, { near: { tree: 'any', of: 'home', within: 4 } }, home)).toBe(false);
    expect(evaluate(s, { near: { tree: 'mature', of: 'home', within: 5 } }, home)).toBe(true);
    expect(evaluate(s, { near: { tag: 'flower', of: 'home', within: 4, atLeast: 2 } }, home)).toBe(true);
    expect(evaluate(s, { near: { tag: 'flower', of: 'home', within: 4, atLeast: 3 } }, home)).toBe(false);
    expect(evaluate(s, { near: { buildingTag: 'bakery', of: 'home', within: 12 } }, home)).toBe(true);
    expect(evaluate(s, { near: { buildingCategory: 'civic', of: 'home', within: 9 } }, home)).toBe(true);
    expect(evaluate(s, { near: { buildingCategory: 'civic', of: 'home', within: 8 } }, home)).toBe(false);
    expect(evaluate(s, { near: { road: 'lane', of: 'home', within: 1 } }, home)).toBe(true);
    expect(evaluate(s, { near: { road: 'lane', of: 'home', within: 0 } }, home)).toBe(false);
    expect(evaluate(s, { near: { road: 'path', of: 'home', within: 2 } }, home)).toBe(false);
  });

  it('counts ornamental trees as trees', () => {
    const w = standardWorld();
    const home = build(w, 'cottage', 130, 40);
    expect(evaluate(w, { near: { tree: 'any', of: 'home', within: 2 } }, { home: home.id })).toBe(false);
    decor(w, 'cherry-tree', 133, 41);
    expect(evaluate(w, { near: { tree: 'any', of: 'home', within: 2 } }, { home: home.id })).toBe(true);
  });

  it('finds occupied homes, excluding its own', () => {
    const { s, f } = clover();
    const c: Condition = { near: { home: 'occupied', of: 'home', within: 4, excludeSelf: true } };
    expect(evaluate(s, c, { home: f.b.cottages[0] })).toBe(true);
    // The Quills live five steps from the Underbanks: not quite neighbors.
    expect(evaluate(s, c, { home: f.b.cottages[2] })).toBe(false);
    const w = standardWorld();
    const lone = build(w, 'cottage', 130, 40);
    expect(evaluate(w, { near: { home: 'occupied', of: 'home', within: 4 } }, { home: lone.id })).toBe(false);
  });

  it('with also, a counted bench must itself be near water', () => {
    const w = standardWorld();
    const home = build(w, 'cottage', 92, 40);
    const c: Condition = {
      near: { tag: 'bench', of: 'home', within: 10, also: { target: { water: true }, within: 2 } },
    };
    decor(w, 'bench', 92, 44);
    expect(evaluate(w, c, { home: home.id })).toBe(false);
    decor(w, 'bench', 98, 44);
    expect(evaluate(w, c, { home: home.id })).toBe(true);
    expect(evaluate(w, { near: { water: true, of: 'home', within: 10 } }, { home: home.id })).toBe(true);
    expect(evaluate(w, { near: { water: true, of: 'home', within: 4 } }, { home: home.id })).toBe(false);
  });

  it('an unbound or missing place is never near anything', () => {
    const { s } = clover();
    expect(evaluate(s, { near: { tag: 'bench', of: 'home', within: 50 } }, {})).toBe(false);
    expect(evaluate(s, { near: { tag: 'bench', of: 'home', within: 50 } }, { home: 999999 })).toBe(false);
    expect(evaluate(s, { near: { tag: 'bench', of: { tile: [56, 53] }, within: 0 } })).toBe(true);
  });
});

describe('logic, counts, charm, stock and residents', () => {
  it('all, any and not', () => {
    const { s } = clover();
    const yes: Condition = { count: { what: 'residents', atLeast: 1 } };
    const no: Condition = { count: { what: 'residents', atLeast: 100 } };
    expect(evaluate(s, { all: [yes, yes] })).toBe(true);
    expect(evaluate(s, { all: [yes, no] })).toBe(false);
    expect(evaluate(s, { any: [no, yes] })).toBe(true);
    expect(evaluate(s, { any: [no] })).toBe(false);
    expect(evaluate(s, { not: no })).toBe(true);
  });

  it('counts town facts', () => {
    const { s } = clover();
    expect(evaluate(s, { count: { what: 'residents', atLeast: 9, atMost: 9 } })).toBe(true);
    expect(evaluate(s, { count: { what: 'households', atLeast: 3 } })).toBe(true);
    expect(evaluate(s, { count: { what: 'wishesGranted', atLeast: 1 } })).toBe(false);
    s.stats.wishesGranted = 5;
    expect(evaluate(s, { count: { what: 'wishesGranted', atLeast: 5 } })).toBe(true);
    expect(evaluate(s, { count: { what: 'goodProduced', ref: 'bread', atLeast: 1 } })).toBe(false);
    s.economy.everProduced[content.goodIndex.get('bread')!] = 5;
    expect(evaluate(s, { count: { what: 'goodProduced', ref: 'bread', atLeast: 1 } })).toBe(true);
    expect(evaluate(s, { count: { what: 'seasonsInSurplus', atLeast: 1 } })).toBe(false);
    s.economy.seasonsInSurplus = 1;
    expect(evaluate(s, { count: { what: 'seasonsInSurplus', atLeast: 1 } })).toBe(true);
    expect(evaluate(s, { count: { what: 'patternsDiscovered', atLeast: 1 } })).toBe(false);
    s.hearth.sites.push({ pattern: 'tree-place', anchor: 0, members: [], tiles: [], seats: [0, 1], tick: 0 });
    expect(evaluate(s, { count: { what: 'pattern', ref: 'tree-place', atLeast: 1 } })).toBe(true);
    expect(evaluate(s, { count: { what: 'togetherSites', atLeast: 1 } })).toBe(true);
    expect(evaluate(s, { count: { what: 'builtTogether', atLeast: 1 } })).toBe(false);
  });

  it('reads charm at a place, noise as a magnitude', () => {
    const w = standardWorld();
    const home = build(w, 'cottage', 130, 40);
    settle(w);
    const quiet: Condition = { charm: { of: 'home', layer: 'noise', atMost: 3 } };
    expect(evaluate(w, quiet, { home: home.id })).toBe(true);
    build(w, 'quarry', 133, 39);
    settle(w);
    expect(evaluate(w, quiet, { home: home.id })).toBe(false);
    expect(evaluate(w, { charm: { of: 'home', layer: 'noise', atLeast: 4 } }, { home: home.id })).toBe(true);
  });

  it('checks stock at the bound market or in the whole town', () => {
    const { s, f, bind } = clover();
    const fish: Condition = { stock: { good: 'fish', at: 'nearestMarket', atLeast: 1 } };
    expect(evaluate(s, fish, bind)).toBe(false);
    expect(evaluate(s, { stock: { good: 'fish', atLeast: 8 } })).toBe(true);
    findById(s.buildings, f.b.stall)!.rt!.store[content.goodIndex.get('fish')!] = 2;
    expect(evaluate(s, fish, bind)).toBe(true);
  });

  it('matches resident facts', () => {
    const { s, f, bind } = clover();
    expect(evaluate(s, { resident: { species: ['rabbit'] } }, bind)).toBe(true);
    expect(evaluate(s, { resident: { species: ['otter'] } }, bind)).toBe(false);
    expect(evaluate(s, { resident: { traits: ['shy', 'cheerful'] } }, bind)).toBe(true);
    expect(evaluate(s, { resident: { hasJob: true } }, bind)).toBe(true);
    expect(evaluate(s, { resident: { noHome: false } }, bind)).toBe(true);
    const pip = { residentId: f.residents[0]![2]! };
    expect(evaluate(s, { resident: { hasJob: false } }, pip)).toBe(true);
    const r = findById(s.residents, bind.residentId!)!;
    r.needs[1] = 30;
    expect(evaluate(s, { resident: { needBelow: ['water', 40] } }, bind)).toBe(true);
    expect(evaluate(s, { resident: { needBelow: ['food', 40] } }, bind)).toBe(false);
    expect(evaluate(s, { resident: {} }, {})).toBe(false);
  });
});

describe('route predicates', () => {
  it('pathRoute wants a road from door to door', () => {
    const { s, bind } = clover();
    expect(evaluate(s, { code: 'pathRoute' }, bind)).toBe(true);
    // A workshop whose door opens onto grass, three tiles off the lane.
    const shed = build(s, 'bakery', 80, 53);
    const away = { ...bind, work: shed.id };
    expect(evaluate(s, { code: 'pathRoute' }, away)).toBe(false);
    road(s, 'path', 81, 51, 81, 55);
    expect(evaluate(s, { code: 'pathRoute' }, away)).toBe(true);
  });

  it('lanternRoute wants lanterns along half the walk home', () => {
    const { s, bind } = clover();
    const lit: Condition = { code: 'lanternRoute', params: [['share', 50]] };
    expect(evaluate(s, lit, bind)).toBe(false);
    decor(s, 'lantern', 47, 51);
    expect(evaluate(s, lit, bind)).toBe(false);
    decor(s, 'lantern', 50, 51);
    expect(evaluate(s, lit, bind)).toBe(true);
    expect(evaluate(s, { code: 'lanternRoute', params: [['share', 100]] }, bind)).toBe(false);
  });

  it('unknown predicates are false', () => {
    const { s, bind } = clover();
    expect(evaluate(s, { code: 'noSuchThing' }, bind)).toBe(false);
    expect(S).toBe(192);
  });
});
