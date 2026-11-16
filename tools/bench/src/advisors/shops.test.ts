// R2E: the shops advisor's readings (walk frontage, the evening-street rule) and the bench's care
// for R2F's garden lots (never offered, zoned, grown or counted).
import { content } from '@qoti/content';
import {
  doorTile,
  Flags,
  MAP_SIZE,
  placesView,
  Road,
  Zone,
  type Building,
  type Lot,
  type WorldState,
} from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { autoplay } from '../autoplay';
import { startingTown } from '../hamlet';
import { Planner } from '../planner';
import { farFrontages, frontageFor, growthLine } from '../village';
import { growableLots } from '../town';
import { land } from './land';
import { eveningStretch, shopsNear, walkFrontage } from './shops';

const S = MAP_SIZE;
const PLACES = content.places;
const cheb = (a: number, b: number) =>
  Math.max(Math.abs((a % S) - (b % S)), Math.abs(Math.floor(a / S) - Math.floor(b / S)));
const at = (x: number, z: number) => z * S + x;

/** A fresh town with a clear patch of ground (x 50 to 110, z 50 to 110) to draw roads on by hand. */
function patch(): WorldState {
  const w = startingTown('willow').world;
  for (let z = 50; z <= 110; z++)
    for (let x = 50; x <= 110; x++) {
      const i = at(x, z);
      w.map.road[i] = 0;
      w.map.water[i] = 0;
      w.map.tree[i] = 0;
      w.map.flags[i] = 0;
    }
  return w;
}

function road(w: WorldState, tiles: [number, number][]): void {
  for (const [x, z] of tiles) w.map.road[at(x, z)] = Road.lane;
}

/** A ring of road, x 60 to 66 by z 60 to 64: a cart can go round either way. */
function ring(w: WorldState): void {
  const tiles: [number, number][] = [];
  for (let x = 60; x <= 66; x++) tiles.push([x, 60], [x, 64]);
  for (let z = 61; z <= 63; z++) tiles.push([60, z], [66, z]);
  road(w, tiles);
}

function footfall(w: WorldState, tiles: [number, number][], n = 200): void {
  for (const [x, z] of tiles) w.map.footfallEve[at(x, z)] = n;
}

const TOP: [number, number][] = [61, 62, 63, 64, 65].map((x) => [x, 60]);

describe('walkFrontage', () => {
  it('follows the live places before anyone walks: on a fresh town, frontage by its well', () => {
    const w = startingTown('willow').world;
    // R2X: the starting well is a place (R2A's hosts), so the walks start there, not at null.
    const wells = placesView(w).places;
    expect(wells.map((p) => p.kinds)).toEqual([['meet']]);
    const walk = walkFrontage(w);
    expect(walk).not.toBeNull();
    expect(walk!.some(([x, z]) => cheb(z * S + x, wells[0]!.tile) <= PLACES.placeNearShopRadius)).toBe(true);
  });

  it('picks the frontage the walkers pass once there is footfall', () => {
    const w = startingTown('willow').world;
    const before = walkFrontage(w);
    const all = frontageFor(w, 'shops', { tiles: 200 }) ?? [];
    expect(all.length).toBeGreaterThan(8);
    // The least preferred open frontage: write the walk beside it by hand.
    const [lx, lz] = all[all.length - 1]!;
    for (let z = lz - 6; z <= lz + 6; z++)
      for (let x = lx - 6; x <= lx + 6; x++) if (w.map.road[at(x, z)]) w.map.footfallEve[at(x, z)] = 500;
    const walk = walkFrontage(w);
    expect(walk).not.toBeNull();
    const [wx, wz] = walk![0]!;
    expect(Math.max(Math.abs(wx - lx), Math.abs(wz - lz))).toBeLessThanOrEqual(8);
    // The same ground as before when the walk is gone again.
    w.map.footfallEve.fill(0);
    expect(walkFrontage(w)).toEqual(before);
  });
});

describe('the evening street rule', () => {
  const place = { tile: at(63, 59) };

  it('marks a busy stretch of a loop', () => {
    const w = patch();
    ring(w);
    footfall(w, TOP);
    const stretch = eveningStretch(w, place);
    expect(stretch).not.toBeNull();
    expect(stretch!.length).toBeLessThanOrEqual(8);
    expect(stretch!.every((i) => w.map.road[i])).toBe(true);
    expect(stretch).toContain(at(63, 60));
  });

  it('leaves a quiet stretch alone', () => {
    const w = patch();
    ring(w);
    expect(eveningStretch(w, place)).toBeNull();
  });

  it('refuses a dead end: no way round', () => {
    const w = patch();
    road(
      w,
      Array.from({ length: 12 }, (_, k): [number, number] => [60 + k, 80]),
    );
    const p = { tile: at(65, 79) };
    footfall(w, [[65, 80]]);
    expect(eveningStretch(w, p)).toBeNull();
    // And a street that simply ends beside the place.
    const w2 = patch();
    road(
      w2,
      Array.from({ length: 6 }, (_, k): [number, number] => [60 + k, 80]),
    );
    footfall(w2, [[65, 80]]);
    expect(eveningStretch(w2, { tile: at(65, 79) })).toBeNull();
  });

  it('refuses a stretch a workshop door fronts', () => {
    const w = patch();
    ring(w);
    footfall(w, TOP);
    expect(eveningStretch(w, place)).not.toBeNull();
    const def = content.buildings.find((d) => d.tags?.includes('workshop') && d.id === 'workshop')!;
    const b = { ...w.buildings[0]!, id: 99999, def: def.id, x: 63, z: 58, rot: 0, lot: 0 } as Building;
    const d = doorTile(b);
    b.x += (at(63, 60) % S) - (d % S);
    b.z += Math.floor(at(63, 60) / S) - Math.floor(d / S);
    w.buildings.push(b);
    expect(doorTile(b)).toBe(at(63, 60));
    expect(eveningStretch(w, place)).toBeNull();
  });

  it('refuses a bridge and a stretch already marked', () => {
    const w = patch();
    ring(w);
    footfall(w, TOP);
    w.map.water[at(63, 60)] = 1;
    expect(eveningStretch(w, place)).toBeNull();
    w.map.water[at(63, 60)] = 0;
    w.map.flags[at(64, 60)] = Flags.evening;
    expect(eveningStretch(w, place)).toBeNull();
  });

  it('refuses a way round that is far longer than the stretch', () => {
    const w = patch();
    // A loop of 60 tiles: the long way round.
    const loop: [number, number][] = [];
    for (let x = 60; x <= 70; x++) loop.push([x, 60], [x, 80]);
    for (let z = 61; z <= 79; z++) loop.push([60, z], [70, z]);
    road(w, loop);
    footfall(w, [[65, 60]]);
    expect(eveningStretch(w, { tile: at(65, 59) })).toBeNull();
  });
});

describe('shopsNear', () => {
  it('finds open ground by a road within a place reach', () => {
    const w = patch();
    ring(w);
    const tiles = shopsNear(w, { tile: at(63, 55) });
    // Ring is 5 tiles off: nothing within the serve radius of that spot.
    expect(tiles).toBeNull();
    const near = shopsNear(w, { tile: at(63, 58) });
    expect(near).not.toBeNull();
    expect(near!.every(([x, z]) => !w.map.road[at(x, z)])).toBe(true);
  });
});

describe('garden lots (R2F)', { timeout: 120_000 }, () => {
  /** A short Village run's world, with one empty garden lot of the Shops zone pushed in. */
  function withGarden(): { run: ReturnType<typeof autoplay>; garden: Lot } {
    const run = autoplay('hazel', 14, { villageDay: 12 });
    const w = run.hamlet.world;
    // Nothing else is offered: drop the empty shops lots, so a garden is the only candidate.
    w.lots = w.lots.filter((l) => l.buildingId || l.zone !== Zone.shops);
    const garden: Lot = {
      id: 900001,
      zone: Zone.shops,
      x: 100,
      z: 100,
      w: 2,
      d: 2,
      rot: 0,
      frontage: at(100, 98),
      desirability: 50,
      style: '',
      buildingId: 0,
      tick: w.tick,
      row: 0,
      kind: 'garden',
    };
    w.lots.push(garden);
    for (let z = 100; z < 102; z++) for (let x = 100; x < 102; x++) w.map.lot[at(x, z)] = garden.id;
    return { run, garden };
  }

  it('growableLots and the counters skip a garden lot', () => {
    const { run, garden } = withGarden();
    const w = run.hamlet.world;
    expect(w.lots).toContain(garden);
    expect(growableLots(w)).not.toContain(garden);
    expect(growableLots(w).length).toBe(w.lots.length - 1);
    expect(growthLine(w).lots).toBe(w.lots.length - 1);
    expect(farFrontages(w)).not.toContain(garden.frontage);
  });

  it('the land advisor does not read a garden lot as an offered empty lot', () => {
    const { run, garden } = withGarden();
    const h = run.hamlet;
    const w = h.world;
    w.demand.lit[1] = true;
    const p = new Planner(h);
    const adv = land.create(p) as unknown as { answerBars(): void };
    adv.answerBars();
    expect(p.actions.some((a) => a.includes('zone shops for its bar'))).toBe(true);
    // The same lot as a plot is offered: the bar is left to it.
    garden.kind = 'plot';
    const q = new Planner(h);
    (land.create(q) as unknown as { answerBars(): void }).answerBars();
    expect(q.actions.some((a) => a.includes('zone shops for its bar'))).toBe(false);
  });
});

describe('the shops advisor on stand-ins', { timeout: 120_000 }, () => {
  it('sends nothing while no place and no footfall exist, and never places decor', () => {
    const run = autoplay('willow', 14, { village: true });
    expect(run.decisions.filter((d) => d.advisor === 'shops')).toEqual([]);
    expect(run.decisions.some((d) => d.advisor === 'shops' && d.kind === 'decor.place')).toBe(false);
  });
});
