// R2A: the place index's sources by example and its determinism rule (a pure function of saved state).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TILE_FP } from '../../src/constants';
import { insertBuilding } from '../../src/state/place';
import { deserialize, serialize } from '../../src/state/serialize';
import { invalidatePlaces, placeFeatures, placeIndex } from '../../src/systems/places';
import { placeById } from '../../src/systems/places/api';
import { DAYS_PER_SEASON, TICKS_PER_DAY } from '../../src/constants';
import { findById } from '../../src/state/entities';
import { placeDraw, placesNear, placeServes } from '../../src/systems/places/api';
import { villageFixture } from '../fixtures/village';
import { flatWorld, run, S } from '../helpers';

const fp = (t: number) => t * TILE_FP + TILE_FP / 2;

function place(def: string, x: number, z: number, w = flatWorld()) {
  run(w, { t: 'decor.place', def, fx: fp(x), fz: fp(z), rot: 0 });
  return w;
}

describe('the place index', () => {
  it('finds a bench as a sitting spot with its seats, standing room and kind', () => {
    const w = place('bench', 40, 40);
    const [p] = placeIndex(w).places;
    expect(p).toBeDefined();
    expect(p!.source).toBe('seats');
    expect(p!.id).toBe(`seats:${w.decor[0]!.id}`);
    expect(p!.seats).toBe(2);
    expect(p!.childSeats).toBe(0);
    expect(p!.standing).toBe(content.places.standingMin);
    expect(p!.kinds).toEqual(['sit']);
    expect(p!.tile).toBe(40 * S + 40);
  });

  it('groups seat pieces within spotRadius, up to spotMaxPieces, and starts another spot beyond', () => {
    const w = flatWorld();
    for (let i = 0; i < 5; i++) place('bench', 40 + i, 40, w);
    const ps = placeIndex(w).places;
    expect(ps.length).toBe(2);
    expect(ps[0]!.members.length).toBe(content.places.spotMaxPieces);
    expect(ps[0]!.seats).toBe(2 * content.places.spotMaxPieces);
    expect(ps[1]!.members.length).toBe(1);
  });

  it('gives a swing child seats and the play kind', () => {
    const w = place('swing', 40, 40);
    const [p] = placeIndex(w).places;
    expect(p!.childSeats).toBe(2);
    expect(p!.kinds).toContain('play');
    expect(p!.kinds).not.toContain('sit');
  });

  it('a fire near a bench warms it; a fire alone is a place of its own', () => {
    const w = place('bench', 40, 40);
    place('brazier', 41, 40, w);
    place('brazier', 60, 60, w);
    const ps = placeIndex(w).places;
    const spot = ps.find((p) => p.source === 'seats')!;
    expect(spot.warm).toBe(true);
    expect(spot.standing).toBe(8 + content.places.standingMin);
    const fire = ps.find((p) => p.id.startsWith('fire:'))!;
    expect(fire.standing).toBe(8 + content.places.standingMin);
    expect(fire.warm).toBe(true);
  });

  it('a built tavern is a host with its seats, standing share, shelter and warmth', () => {
    const w = flatWorld();
    const b = insertBuilding(w, null, content.buildingById.get('tavern')!, 50, 50, 0, 0, { site: false });
    const p = placeById(w, `host:${b.id}`)!;
    expect(p).toBeDefined();
    expect(p.seats).toBe(12);
    expect(p.standing).toBe(6);
    expect(p.sheltered).toBe(true);
    expect(p.warm).toBe(true);
    expect(p.kinds).toEqual(['sit', 'eat', 'meet']);
  });

  it('sees a piece placed this turn and one pulled down, and is the same after a round trip through a save', () => {
    const w = place('bench', 40, 40);
    expect(placeIndex(w).places.length).toBe(1);
    place('bench', 70, 70, w);
    expect(placeIndex(w).places.length).toBe(2);
    run(w, { t: 'decor.remove', ids: [w.decor[0]!.id] });
    expect(placeIndex(w).places.length).toBe(1);
    const copy = deserialize(serialize(w));
    expect(JSON.stringify(placeIndex(copy).places)).toBe(JSON.stringify(placeIndex(w).places));
    invalidatePlaces(w);
    expect(JSON.stringify(placeIndex(copy).places)).toBe(JSON.stringify(placeIndex(w).places));
  });

  it('draws from the charm over its tiles, capped, and a view of water', () => {
    const w = place('bench', 97, 40);
    const p = placeIndex(w).places[0]!;
    expect(p.kinds).toContain('view');
    expect(p.parts.water).toBe(content.places.waterBonus);
    for (const t of p.tiles) w.map.charm[t] = 90;
    w.tick += 1;
    const q = placeIndex(w).places[0]!;
    expect(q.parts.charm).toBe(content.places.charmCap);
    expect(q.draw).toBe(content.places.charmCap + q.parts.pieces + q.parts.water);
  });

  it('a pattern site holds its member seats, the site part of the draw, and a walk its strollers', () => {
    const w = place('bench', 40, 40);
    place('bench', 42, 40, w);
    const tiles = [40 * S + 39, 40 * S + 40, 40 * S + 41, 40 * S + 42, 40 * S + 43];
    w.hearth.sites.push({
      pattern: 'lantern-walk',
      anchor: 40 * S + 40,
      members: w.decor.map((d) => d.id),
      tiles,
      seats: [0],
      tick: 0,
    });
    const ps = placeIndex(w).places;
    expect(ps.length).toBe(1);
    const p = ps[0]!;
    expect(p.id).toBe(`site:lantern-walk:${40 * S + 40}`);
    expect(p.source).toBe('site');
    expect(p.seats).toBe(4);
    expect(p.kinds).toEqual(['sit', 'walk']);
    expect(p.parts.site).toBe(content.places.siteBonus);
    const strollers = Math.floor(tiles.length / content.places.walkTilesPerStroller);
    expect(p.standing).toBe(strollers + Math.max(content.places.standingMin, 2));
  });

  it('a porch seats its own household; an outlet within reach serves a bench, live from its shelf', () => {
    const { state: s, b, households } = villageFixture();
    const home = findById(s.buildings, b.cottages[0]!)!;
    home.rt!.modules = [['front', 'porch']];
    const porch = placeById(s, `porch:${home.id}`)!;
    expect(porch.seats).toBe(content.places.porchSeats);
    expect(porch.standing).toBe(0);
    expect(porch.household).toBe(s.households.find((h) => h.homeId === home.id)!.id);
    expect(households.length).toBeGreaterThan(0);

    // A bench across the lane from the first stall (stalls are outlets).
    const stall = findById(s.buildings, b.stalls[0])!;
    run(s, { t: 'decor.place', def: 'bench', fx: fp(stall.x), fz: fp(52), rot: 0 });
    const bench = placeIndex(s).places.find((p) => p.source === 'seats')!;
    expect(bench.outlets).toContain(stall.id);
    expect(bench.kinds).toContain('eat');
    const treats = content.goods.findIndex((g) => g.family === 'treats');
    stall.rt!.store[treats] = 0;
    for (let g = 0; g < content.goods.length; g++)
      if (content.goods[g]!.family === 'treats') stall.rt!.store[g] = 0;
    expect(placeServes(s, bench)).not.toContain(stall.id);
    const dry = placeDraw(s, bench);
    stall.rt!.store[treats] = 3;
    expect(placeServes(s, bench)).toContain(stall.id);
    expect(placeDraw(s, bench)).toBe(Math.min(100, dry + content.places.treatsBonus));
  });

  it('the frozen river makes skating ice; winter takes from an open bench and spares a fire', () => {
    const { state: s } = villageFixture();
    s.weather.river.frozen = true;
    s.weather.river.frozenTick = 1;
    const ice = placeIndex(s).places.filter((p) => p.id.startsWith('ice:'));
    expect(ice.length).toBeGreaterThan(0);
    expect(ice[0]!.standing).toBe(content.places.iceStanding + content.places.standingMin);
    expect(ice[0]!.kinds).toEqual(
      content.places.iceKinds
        .slice()
        .sort((a, b) => 'sit,eat,view,play,meet,walk'.indexOf(a) - 'sit,eat,view,play,meet,walk'.indexOf(b)),
    );

    const w = place('bench', 40, 40);
    place('bench', 60, 40, w);
    place('brazier', 61, 40, w);
    w.tick = 3 * DAYS_PER_SEASON * TICKS_PER_DAY + 10;
    const [cold, warm] = placeIndex(w).places;
    expect(cold!.parts.winter).toBe(-content.places.winterPenalty);
    expect(warm!.warm).toBe(true);
    expect(warm!.parts.winter).toBe(0);
    expect(ice[0]!.parts.winter).toBe(0);
  });

  it('the festival site is a place on its night, its pieces part of it', () => {
    const w = place('festival-table', 50, 50);
    expect(placeIndex(w).places[0]!.source).toBe('seats');
    w.festival.live = true;
    w.festival.plan = {
      festival: content.festivals[0]!.id,
      season: 0,
      year: 0,
      site: { rect: [48, 48, 54, 54] },
      menu: [],
      reserved: [],
      twist: '',
      music: 'none',
      musician: 0,
      by: 0,
      tick: 0,
    };
    w.tick += 1;
    const ps = placeIndex(w).places;
    expect(ps.length).toBe(1);
    expect(ps[0]!.id).toBe(`festival:${48 * S + 48}`);
    expect(ps[0]!.seats).toBe(6);
    expect(ps[0]!.standing).toBe(content.places.festivalStanding + 3);
  });

  it('placesNear finds exactly the places a full scan finds, in id order', () => {
    const w = flatWorld();
    for (let i = 0; i < 40; i++) place('bench', 10 + ((i * 37) % 80), 10 + ((i * 53) % 80), w);
    const all = placeIndex(w).places;
    for (const [x, z, r] of [
      [40, 40, 12],
      [5, 5, 6],
      [90, 20, 18],
      [60, 85, 3],
      [0, 0, 200],
    ] as const) {
      const scan = all.filter((p) => Math.abs((p.tile % S) - x) + Math.abs(Math.floor(p.tile / S) - z) <= r);
      expect(placesNear(w, z * S + x, r).map((p) => p.id)).toEqual(scan.map((p) => p.id));
    }
  });

  it('after every kind of input change the live index equals a fresh rebuild from a save', () => {
    const { state: w } = villageFixture();
    for (const [x, z] of [
      [44, 58],
      [50, 58],
      [56, 58],
      [62, 56],
    ] as const) {
      run(w, { t: 'decor.place', def: 'bench', fx: fp(x), fz: fp(z), rot: 0 });
      run(w, { t: 'decor.place', def: 'lantern', fx: fp(x + 1), fz: fp(z), rot: 0 });
    }
    const snapshot = (s: typeof w) =>
      JSON.stringify(placeIndex(s).places.map((p) => [p, placeFeatures(s, p)]));
    const same = (why: string) => {
      w.tick += 1;
      const live = snapshot(w);
      const fresh = deserialize(serialize(w));
      expect(snapshot(fresh), why).toBe(live);
    };
    same('as placed');
    const bench = placeIndex(w).places.find((p) => p.source === 'seats')!;
    w.map.tree[bench.tiles[0]!] = 0xff;
    same('a tree matured on a place');
    w.map.charm[bench.tile] = 77;
    same('charm moved');
    const stall = w.buildings.find((b) => b.def === 'market-stall')!;
    stall.level = 2;
    same('a level changed');
    stall.trade = 'baker';
    same('a business retooled (its taste bits read the trade)');
    const home = w.buildings.find((b) => b.def === 'cottage')!;
    home.rt!.modules = [['front', 'porch']];
    same('a porch went up');
    w.households[0]!.homeId = w.households[1]!.homeId;
    same('a family moved');
    run(w, { t: 'decor.move', id: w.decor[0]!.id, fx: fp(70), fz: fp(60), rot: 0 });
    same('a piece moved');
    w.weather.river.frozen = true;
    w.weather.river.frozenTick = w.tick;
    same('the river froze');
    w.tick = 3 * DAYS_PER_SEASON * TICKS_PER_DAY + 13 * 200;
    same('winter, lanterns lit');
  });

  it('a fruit tree among its pieces gives a place the tree taste, kept as the hours move', () => {
    const w = place('bench', 40, 40);
    place('apple-tree', 41, 40, w);
    const tree = 2; // PlaceFeature.tree
    const p = placeIndex(w).places.find((q) => q.source === 'seats')!;
    expect(placeFeatures(w, p) & tree).toBe(tree);
    w.tick += 1;
    const q = placeIndex(w).places.find((r) => r.source === 'seats')!;
    expect(placeFeatures(w, q) & tree).toBe(tree);
  });

  it('kept from build to build, the index equals a fresh rebuild after each of a long run of random edits', () => {
    const { state: w } = villageFixture();
    let seed = 0x2a2a;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return (seed >>> 8) % n;
    };
    const defs = ['bench', 'lantern', 'flower-bed', 'brazier', 'apple-tree', 'swing', 'ring-bench', 'hedge'];
    const snapshot = (s: typeof w) =>
      JSON.stringify(placeIndex(s).places.map((p) => [p, placeFeatures(s, p)]));
    for (let step = 0; step < 160; step++) {
      const k = rand(10);
      const built = w.buildings.filter((b) => b.stage === 'built');
      if (k <= 3 || w.decor.length === 0) {
        const def = defs[rand(defs.length)]!;
        run(w, { t: 'decor.place', def, fx: fp(36 + rand(50)), fz: fp(40 + rand(30)), rot: 0 });
      } else if (k === 4) {
        run(w, { t: 'decor.remove', ids: [w.decor[rand(w.decor.length)]!.id] });
      } else if (k === 5) {
        const d = w.decor[rand(w.decor.length)]!;
        run(w, { t: 'decor.move', id: d.id, fx: fp(36 + rand(50)), fz: fp(40 + rand(30)), rot: 0 });
      } else if (k === 6) {
        const b = built[rand(built.length)]!;
        b.trade = b.trade ? undefined : 'baker';
      } else if (k === 7) {
        const b = built[rand(built.length)]!;
        b.level = 1 + rand(3);
      } else if (k === 8) {
        const hs = w.households;
        hs[rand(hs.length)]!.homeId = hs[rand(hs.length)]!.homeId;
      } else {
        const homes = built.filter((b) => b.def === 'cottage');
        const home = homes[rand(homes.length)]!;
        home.rt!.modules = home.rt!.modules?.length ? [] : [['front', 'porch']];
      }
      w.tick += 1;
      expect(snapshot(deserialize(serialize(w))), `step ${step}`).toBe(snapshot(w));
    }
  });
});
