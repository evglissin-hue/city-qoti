// R1D: the zones-first predicates behind the guide's letters, the story arcs, the wishes and the
// festival twists (docs/build/cycle-r1d-hearth-first-days.md, tasks 4 to 6).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/constants';
import { evaluate } from '../../src/conditions';
import { findById } from '../../src/state/entities';
import { guideFarmland, guideHomes } from '../../src/systems/guide/goals';
import { shelfInReach, tradeCouldOpen } from '../../src/systems/hearth/wishes/predicates';
import { seasonDeal, stallFlavors } from '../../src/systems/stories/predicates';
import { goodMakeable, twistOffered } from '../../src/systems/festivals/twists';
import { hamletFixture } from '../fixtures/hamlet';
import { build, standardWorld } from '../hearth/helpers';

const S = MAP_SIZE;
const layer = (id: string) => content.zoneById.get(id)!.layerValue;

function zone(
  state: { map: { zone: Uint8Array } },
  id: string,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
) {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) state.map.zone[z * S + x] = layer(id);
}

describe('the guide: homes zoned and built, Farmland on good soil', () => {
  it('counts homes on lots, not the founding cottages', () => {
    const w = standardWorld();
    build(w, 'cottage', 10, 10);
    expect(guideHomes(w, {}, [])).toBe(false);
    const a = build(w, 'cottage', 20, 10);
    a.lot = 1;
    expect(guideHomes(w, {}, [])).toBe(false);
    const b = build(w, 'cottage', 24, 10);
    b.lot = 2;
    expect(guideHomes(w, {}, [])).toBe(true);
    b.stage = 'construction';
    expect(guideHomes(w, {}, [])).toBe(false);
  });

  it('wants nine Farmland tiles on rich soil', () => {
    const w = standardWorld();
    zone(w, 'farms', 30, 30, 32, 32);
    for (let i = 0; i < w.map.fertility.length; i++) w.map.fertility[i] = 10;
    expect(guideFarmland(w, {}, [])).toBe(false);
    for (let z = 30; z <= 32; z++) for (let x = 30; x <= 32; x++) w.map.fertility[z * S + x] = 80;
    expect(guideFarmland(w, {}, [])).toBe(true);
    expect(guideFarmland(w, {}, [['tiles', 10]])).toBe(false);
  });
});

describe('Bakery Nearby is voiced only where a baker could open', () => {
  it('needs Workshops land near home inside a standing windmill reach', () => {
    const f = hamletFixture();
    const s = f.state;
    // Clear any Workshops land and windmills the fixture has.
    for (let i = 0; i < s.map.zone.length; i++) if (s.map.zone[i] === layer('crafts')) s.map.zone[i] = 0;
    s.buildings = s.buildings.filter((b) => b.def !== 'windmill');
    const home = build(s, 'cottage', 140, 140);
    const bind = { home: home.id };
    expect(tradeCouldOpen(s, bind, [['within', 12]], 'baker')).toBe(false);
    zone(s, 'crafts', 146, 140, 148, 142);
    expect(tradeCouldOpen(s, bind, [['within', 12]], 'baker')).toBe(false);
    build(s, 'windmill', 150, 146);
    expect(tradeCouldOpen(s, bind, [['within', 12]], 'baker')).toBe(true);
    // Too far from home.
    expect(tradeCouldOpen(s, bind, [['within', 3]], 'baker')).toBe(false);
    // A trade that needs no reach only needs its zone.
    zone(s, 'farms', 141, 146, 143, 148);
    expect(tradeCouldOpen(s, bind, [['within', 12]], 'grain-farm')).toBe(true);
  });
});

describe('Fresh Fish and Odette want goods on a shelf in reach', () => {
  it('reads a stall whose reach covers the home door', () => {
    const f = hamletFixture();
    const s = f.state;
    const stall = findById(s.buildings, f.b.stall)!;
    const fish = content.goodIndex.get('fish')!;
    const near = build(s, 'cottage', stall.x + 4, stall.z + 4);
    const far = build(s, 'cottage', stall.x + 60, stall.z + 60);
    stall.rt!.store[fish] = 0;
    expect(shelfInReach(s, { home: near.id }, [], 'fish')).toBe(false);
    stall.rt!.store[fish] = 2;
    expect(shelfInReach(s, { home: near.id }, [], 'fish')).toBe(true);
    expect(shelfInReach(s, { home: far.id }, [], 'fish')).toBe(false);
  });

  it("counts kinds of Food on Odette's stall", () => {
    const f = hamletFixture();
    const s = f.state;
    const stall = findById(s.buildings, f.b.stall)!;
    stall.rt!.store.fill(0);
    const put = (g: string) => (stall.rt!.store[content.goodIndex.get(g)!] = 4);
    put('fish');
    put('bread');
    put('honey');
    expect(stallFlavors(s, { market: stall.id }, [['flavors', 3]])).toBe(false);
    put('vegetables');
    expect(stallFlavors(s, { market: stall.id }, [['flavors', 3]])).toBe(true);
    expect(stallFlavors(s, {}, [['flavors', 1]])).toBe(false);
  });

  it("takes a season's deal from the plan", () => {
    const s = standardWorld();
    expect(seasonDeal(s)).toBe(false);
    s.seasonPlan.deal = 'millhaven:materials:buy';
    expect(seasonDeal(s)).toBe(true);
  });
});

describe('festival twists the town cannot meet are not offered', () => {
  it('offers the costume parade only when cloth can be had, and never the pie contest', () => {
    const s = standardWorld();
    expect(twistOffered(s, 'pie-contest')).toBe(false);
    // A fresh flat world: no weaver, no wool, nothing in stock.
    expect(goodMakeable(s, 'cloth')).toBe(false);
    expect(twistOffered(s, 'costume-parade')).toBe(false);
    const f = hamletFixture();
    const store = f.state.buildings.find(
      (b) => b.rt?.store && content.buildingById.get(b.def)?.tags?.includes('storehouse'),
    )!;
    store.rt!.store[content.goodIndex.get('cloth')!] = 8;
    expect(goodMakeable(f.state, 'cloth')).toBe(true);
    // Or a weaver at work (nothing in stock yet).
    const w2 = standardWorld();
    build(w2, 'workshop', 40, 40, 0, 0, 'weaver');
    expect(goodMakeable(w2, 'cloth')).toBe(true);
  });

  it('refuses a menu of timber', () => {
    const f = hamletFixture();
    expect(evaluate(f.state, { code: 'festivalMenu', ref: 'timber' })).toBe(false);
  });
});
