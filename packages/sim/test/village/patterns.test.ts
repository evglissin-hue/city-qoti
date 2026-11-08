// C4C: the six Village patterns, each with positive and negative fixtures, and the engine looking
// for them only from Village rank on. Scenes are built east of the river on the flat test world.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { removeById } from '../../src/state/entities';
import { worldIndex } from '../../src/state/worldIndex';
import { detectors } from '../../src/systems/hearth/patterns/detectors';
import { refillHints, runPatterns } from '../../src/systems/hearth/patterns/engine';
import { createTickCtx } from '../../src/turn';
import { build, decor, road, S, standardWorld, tree } from '../hearth/helpers';

function detect(state: WorldState, pattern: string) {
  const def = content.patternById.get(pattern)!;
  return detectors.get(def.detector)!(state, def);
}

function removeDecor(state: WorldState, id: number): void {
  const d = removeById(state.decor, id)!;
  worldIndex(state).decorGrid.remove(d);
}

function paint(state: WorldState, kind: keyof typeof Road, x0: number, z0: number, x1: number, z1: number) {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) state.map.road[z * S + x] = Road[kind];
}

describe('Small Square', () => {
  function scene() {
    const w = standardWorld();
    paint(w, 'path', 120, 40, 122, 42);
    const north = build(w, 'cottage', 120, 37);
    const east = build(w, 'cottage', 124, 40);
    const west = build(w, 'cottage', 117, 40);
    const bench = decor(w, 'bench', 121, 41);
    const lantern = decor(w, 'lantern', 122, 42);
    return { w, north, east, west, bench, lantern };
  }

  it('finds a paved square closed on three sides with a bench and a light', () => {
    const s = scene();
    const sites = detect(s.w, 'small-square');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.anchor).toBe(40 * S + 120);
    expect(sites[0]!.members).toEqual(
      expect.arrayContaining([s.bench, s.lantern, s.north.id, s.east.id, s.west.id]),
    );
  });

  it('needs three sides, a lantern and paving (a lane is not a square)', () => {
    const open = scene();
    removeById(open.w.buildings, open.west.id);
    for (const [x, z] of [
      [117, 40],
      [118, 40],
      [117, 41],
      [118, 41],
    ] as const)
      open.w.map.occupant[z * S + x] = 0;
    expect(detect(open.w, 'small-square')).toHaveLength(0);

    const dark = scene();
    removeDecor(dark.w, dark.lantern);
    expect(detect(dark.w, 'small-square')).toHaveLength(0);

    const lane = scene();
    paint(lane.w, 'lane', 120, 40, 122, 42);
    expect(detect(lane.w, 'small-square')).toHaveLength(0);
  });
});

describe('Corner Cafe', () => {
  function scene(def = 'tavern') {
    const w = standardWorld();
    const cafe = build(w, def, 130, 60); // door at (131, 62)
    paint(w, 'lane', 126, 62, 136, 62);
    paint(w, 'lane', 133, 56, 133, 61); // a corner at (133, 62)
    const seats = [decor(w, 'bench', 129, 61), decor(w, 'bench', 132, 59)];
    const flowers = decor(w, 'flower-bed', 130, 59);
    return { w, cafe, seats, flowers };
  }

  it('finds a tavern on a corner with seats and flowers outside', () => {
    const s = scene();
    const sites = detect(s.w, 'corner-cafe');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.members).toEqual(expect.arrayContaining([s.cafe.id, ...s.seats, s.flowers]));
    expect(detect(scene('bakery').w, 'corner-cafe')).toHaveLength(1);
  });

  it('needs the corner, two seats, flowers and a cafe', () => {
    const straight = scene();
    paint(straight.w, 'none', 133, 56, 133, 61);
    expect(detect(straight.w, 'corner-cafe')).toHaveLength(0);

    const one = scene();
    removeDecor(one.w, one.seats[1]!);
    expect(detect(one.w, 'corner-cafe')).toHaveLength(0);

    const bare = scene();
    removeDecor(bare.w, bare.flowers);
    expect(detect(bare.w, 'corner-cafe')).toHaveLength(0);

    expect(detect(scene('storehouse').w, 'corner-cafe')).toHaveLength(0);
  });
});

describe('Village Green', () => {
  function scene() {
    const w = standardWorld();
    tree(w, 142, 82);
    const bench = decor(w, 'bench', 140, 85);
    const homes = [
      build(w, 'cottage', 137, 80),
      build(w, 'cottage', 146, 80),
      build(w, 'cottage', 140, 87),
      build(w, 'cottage', 144, 76),
    ];
    return { w, bench, homes };
  }

  it('finds an open lawn with a grown tree, a bench at its edge and homes all round', () => {
    const s = scene();
    const sites = detect(s.w, 'village-green');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.tiles).toHaveLength(25);
    expect(sites[0]!.members).toEqual(expect.arrayContaining([s.bench, ...s.homes.map((h) => h.id)]));
  });

  it('needs the lawn whole, four homes, a grown tree and a bench', () => {
    const crossed = scene();
    road(crossed.w, 'path', 137, 82, 147, 82);
    expect(detect(crossed.w, 'village-green')).toHaveLength(0);

    const few = scene();
    const gone = few.homes[3]!;
    removeById(few.w.buildings, gone.id);
    expect(detect(few.w, 'village-green')).toHaveLength(0);

    const sapling = scene();
    tree(sapling.w, 142, 82, 1);
    expect(detect(sapling.w, 'village-green')).toHaveLength(0);

    const noBench = scene();
    removeDecor(noBench.w, noBench.bench);
    expect(detect(noBench.w, 'village-green')).toHaveLength(0);
  });
});

describe('Window Gardens', () => {
  function scene() {
    const w = standardWorld();
    const homes = [
      build(w, 'cottage', 110, 100),
      build(w, 'cottage', 113, 100),
      build(w, 'cottage', 116, 100),
    ];
    for (const h of homes) h.custom = { windowBoxes: true };
    return { w, homes };
  }

  it('finds three homes side by side with window boxes', () => {
    const s = scene();
    const sites = detect(s.w, 'window-gardens');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.members).toEqual(s.homes.map((h) => h.id));
    expect(sites[0]!.anchor).toBe(100 * S + 110);
  });

  it('needs every home boxed, in one row, facing one way, close together', () => {
    const bare = scene();
    bare.homes[1]!.custom = { windowBoxes: false };
    expect(detect(bare.w, 'window-gardens')).toHaveLength(0);

    const turned = scene();
    turned.homes[2]!.rot = 2;
    expect(detect(turned.w, 'window-gardens')).toHaveLength(0);

    const spread = scene();
    spread.homes[2]!.x = 117; // two tiles from its neighbor
    expect(detect(spread.w, 'window-gardens')).toHaveLength(0);
  });
});

describe('Market Cross', () => {
  function scene() {
    const w = standardWorld();
    paint(w, 'lane', 150, 100, 150, 110);
    paint(w, 'lane', 145, 105, 155, 105);
    const stalls = [build(w, 'market-stall', 147, 103), build(w, 'market-stall', 152, 106)];
    const well = build(w, 'well', 151, 104);
    return { w, stalls, well };
  }

  it('finds a crossroads with a well at the crossing and stalls gathered round', () => {
    const s = scene();
    const sites = detect(s.w, 'market-cross');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.anchor).toBe(105 * S + 150);
    expect(sites[0]!.members).toEqual(expect.arrayContaining([...s.stalls.map((b) => b.id), s.well.id]));
  });

  it('a grown tree marks the crossing as well as a well does', () => {
    const s = scene();
    removeById(s.w.buildings, s.well.id);
    s.w.map.occupant[104 * S + 151] = 0;
    expect(detect(s.w, 'market-cross')).toHaveLength(0);
    tree(s.w, 149, 104);
    expect(detect(s.w, 'market-cross')).toHaveLength(1);
  });

  it('needs four ways and two stalls', () => {
    const tee = scene();
    paint(tee.w, 'none', 150, 106, 150, 110);
    expect(detect(tee.w, 'market-cross')).toHaveLength(0);

    const one = scene();
    removeById(one.w.buildings, one.stalls[1]!.id);
    expect(detect(one.w, 'market-cross')).toHaveLength(0);
  });
});

describe('Bridge Crossing', () => {
  function scene() {
    const w = standardWorld();
    paint(w, 'lane', 97, 120, 104, 120); // over the river at x 100 and 101
    const lanterns = [decor(w, 'lantern', 99, 119), decor(w, 'lantern', 102, 121)];
    const bench = decor(w, 'bench', 98, 121);
    return { w, lanterns, bench };
  }

  it('finds a bridge lit at both ends with a seat to watch from', () => {
    const s = scene();
    const sites = detect(s.w, 'bridge-crossing');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.tiles).toEqual([120 * S + 100, 120 * S + 101]);
    expect(sites[0]!.members).toEqual(expect.arrayContaining([...s.lanterns, s.bench]));
  });

  it('needs both ends lit, a bench, and a road over water', () => {
    const half = scene();
    removeDecor(half.w, half.lanterns[1]!);
    expect(detect(half.w, 'bridge-crossing')).toHaveLength(0);

    const noSeat = scene();
    removeDecor(noSeat.w, noSeat.bench);
    expect(detect(noSeat.w, 'bridge-crossing')).toHaveLength(0);

    const dry = scene();
    paint(dry.w, 'none', 100, 120, 101, 120);
    expect(detect(dry.w, 'bridge-crossing')).toHaveLength(0);
  });
});

describe('the Pattern Book at Village rank', () => {
  function squareWorld(): WorldState {
    const w = standardWorld();
    paint(w, 'path', 120, 40, 122, 42);
    build(w, 'cottage', 120, 37);
    build(w, 'cottage', 124, 40);
    build(w, 'cottage', 117, 40);
    decor(w, 'bench', 121, 41);
    decor(w, 'lantern', 122, 42);
    return w;
  }

  it('looks for the Village patterns only from Village rank on', () => {
    const w = squareWorld();
    runPatterns(w, createTickCtx(w));
    expect(w.hearth.discovered.map((d) => d.pattern)).not.toContain('small-square');
    w.charter.rank = 'village';
    runPatterns(w, createTickCtx(w));
    expect(w.hearth.discovered.map((d) => d.pattern)).toContain('small-square');
    expect(w.hearth.unlocked).toContain('fountain');
  });

  it('hints at Village patterns once the Hamlet ones are found or shown', () => {
    const w = standardWorld();
    refillHints(w, null);
    for (const id of w.hearth.hints) expect(content.patternById.get(id)!.rank).toBe('hamlet');
    w.charter.rank = 'village';
    for (const p of content.patterns.filter((x) => x.rank === 'hamlet'))
      w.hearth.discovered.push({ pattern: p.id, tick: 0, seat: 0, together: false, anchor: 0 });
    refillHints(w, null);
    expect(w.hearth.hints).toHaveLength(3);
    for (const id of w.hearth.hints) expect(content.patternById.get(id)!.rank).toBe('village');
  });

  it('every Village pattern has a detector and unlocks a piece', () => {
    for (const p of content.patterns.filter((x) => x.rank === 'village')) {
      expect(detectors.has(p.detector), p.id).toBe(true);
      expect(p.unlocks.length, p.id).toBeGreaterThan(0);
    }
  });
});
