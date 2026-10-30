// The Pattern Book: every I1 detector with positive and negative fixtures, then the engine
// (stable keys, discovery credit and Built Together, unlocks, hints) and Kitchen Garden food.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TILE_FP } from '../../src/constants';
import type { SeatId, WorldState } from '../../src/contracts';
import { removeById } from '../../src/state/entities';
import { worldIndex } from '../../src/state/worldIndex';
import { kitchenGardenHarvest } from '../../src/systems/hearth/patterns';
import { detectors } from '../../src/systems/hearth/patterns/detectors';
import { kitchenGardenMissing } from '../../src/systems/hearth/patterns/detectors/kitchenGarden';
import { inspect } from '../../src/view/inspect';
import { patternProgress } from '../../src/systems/hearth/patterns/progress';
import { refillHints, runPatterns } from '../../src/systems/hearth/patterns/engine';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run } from '../helpers';
import { build, colRun, decor, events, road, rowRun, S, standardWorld, tree } from './helpers';

function detect(state: WorldState, pattern: string) {
  const def = content.patternById.get(pattern)!;
  return detectors.get(def.detector)!(state, def);
}

function removeDecor(state: WorldState, id: number): void {
  const d = removeById(state.decor, id)!;
  worldIndex(state).decorGrid.remove(d);
}

/** A well with two benches, a tree and three homes nearby, east of the river. */
function wellScene(seats: { well?: SeatId; benches?: [SeatId, SeatId] } = {}) {
  const w = standardWorld();
  const well = build(w, 'well', 130, 40, 0, seats.well ?? 0);
  const benches = [
    decor(w, 'bench', 129, 41, seats.benches?.[0] ?? 0),
    decor(w, 'bench', 131, 41, seats.benches?.[1] ?? 0),
  ];
  tree(w, 130, 43);
  const homes = [build(w, 'cottage', 125, 36), build(w, 'cottage', 133, 36), build(w, 'cottage', 126, 44)];
  return { w, well, benches, homes };
}

describe('Well Gathering Place', () => {
  it('finds the well in the hamlet fixture', () => {
    const f = hamletFixture();
    const sites = detect(f.state, 'well-gathering-place');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.anchor).toBe(52 * S + 57);
    expect(sites[0]!.members).toEqual(expect.arrayContaining([f.b.well, ...f.decor.benches]));
  });

  it('needs two benches, a tree and three homes', () => {
    const ok = wellScene();
    expect(detect(ok.w, 'well-gathering-place')).toHaveLength(1);

    const oneBench = wellScene();
    removeDecor(oneBench.w, oneBench.benches[1]!);
    expect(detect(oneBench.w, 'well-gathering-place')).toHaveLength(0);

    const noTree = wellScene();
    noTree.w.map.tree[43 * S + 130] = 0;
    expect(detect(noTree.w, 'well-gathering-place')).toHaveLength(0);
    // An ornamental tree will do instead.
    decor(noTree.w, 'apple-tree', 131, 43);
    expect(detect(noTree.w, 'well-gathering-place')).toHaveLength(1);

    const twoHomes = wellScene();
    twoHomes.w.buildings = twoHomes.w.buildings.filter((b) => b.id !== twoHomes.homes[2]!.id);
    expect(detect(twoHomes.w, 'well-gathering-place')).toHaveLength(0);

    const farBench = wellScene();
    removeDecor(farBench.w, farBench.benches[1]!);
    decor(farBench.w, 'bench', 134, 40);
    expect(detect(farBench.w, 'well-gathering-place')).toHaveLength(0);
  });
});

describe('Tree Place', () => {
  function scene(paths: 'two' | 'one' | 'none', benches = 2) {
    const w = standardWorld();
    tree(w, 140, 60);
    if (benches >= 1) decor(w, 'bench', 139, 60);
    if (benches >= 2) decor(w, 'bench', 141, 60);
    if (paths !== 'none') road(w, 'path', 136, 58, 144, 58);
    if (paths === 'two') road(w, 'path', 142, 59, 142, 64);
    return w;
  }

  it('a big tree with two benches where paths lead off two ways', () => {
    const sites = detect(scene('two'), 'tree-place');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.anchor).toBe(60 * S + 140);
  });

  it('not without the paths or the benches', () => {
    expect(detect(scene('one'), 'tree-place')).toHaveLength(0);
    expect(detect(scene('none'), 'tree-place')).toHaveLength(0);
    expect(detect(scene('two', 1), 'tree-place')).toHaveLength(0);
    const young = scene('two');
    tree(young, 140, 60, 2);
    expect(detect(young, 'tree-place')).toHaveLength(0);
  });

  it('an ornamental tree counts as a big tree', () => {
    const w = standardWorld();
    const cherry = decor(w, 'cherry-tree', 140, 60);
    decor(w, 'bench', 139, 60, 0, { fx: 139 * TILE_FP + 100, fz: 60 * TILE_FP + 128 });
    decor(w, 'bench', 141, 60, 0, { fx: 141 * TILE_FP + 156, fz: 60 * TILE_FP + 128 });
    road(w, 'path', 136, 58, 144, 58);
    road(w, 'path', 142, 59, 142, 64);
    const sites = detect(w, 'tree-place');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.members).toContain(cherry);
  });
});

describe('Pocket Park', () => {
  function scene(sides: number, flowers = 2) {
    const w = standardWorld();
    tree(w, 150, 70);
    decor(w, 'bench', 151, 70);
    if (flowers >= 1) decor(w, 'flower-bed', 150, 71);
    if (flowers >= 2) decor(w, 'planter', 151, 71);
    if (sides >= 1) build(w, 'cottage', 148, 70);
    if (sides >= 2) build(w, 'cottage', 150, 67);
    return w;
  }

  it('a small green room between buildings', () => {
    const sites = detect(scene(2), 'pocket-park');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.anchor).toBe(70 * S + 150);
    expect(sites[0]!.tiles).toHaveLength(4);
  });

  it('not out in the open, and not without the flowers', () => {
    expect(detect(scene(1), 'pocket-park')).toHaveLength(0);
    expect(detect(scene(2, 1), 'pocket-park')).toHaveLength(0);
    const paved = scene(2);
    road(paved, 'path', 150, 70, 151, 71);
    expect(detect(paved, 'pocket-park')).toHaveLength(0);
  });

  it('a second bench in the same park does not make a second park', () => {
    const w = scene(2);
    decor(w, 'bench', 152, 71);
    expect(detect(w, 'pocket-park')).toHaveLength(1);
  });
});

describe('Kitchen Garden', () => {
  function scene(plots: number, fence: boolean) {
    const w = standardWorld();
    const home = build(w, 'cottage', 160, 80);
    if (plots >= 1) build(w, 'vegetable-plot', 163, 80);
    if (plots >= 2) build(w, 'vegetable-plot', 160, 83);
    if (fence) colRun(w, 'fence', 165, 80, 81);
    return { w, home };
  }

  it('a home with two plots and a fence beside them', () => {
    const { w, home } = scene(2, true);
    const sites = detect(w, 'kitchen-garden');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.anchor).toBe(home.z * S + home.x);
  });

  it('not with one plot, and not unfenced', () => {
    expect(detect(scene(1, true).w, 'kitchen-garden')).toHaveLength(0);
    expect(detect(scene(2, false).w, 'kitchen-garden')).toHaveLength(0);
  });

  it("tells the home's inspector what the garden still wants", () => {
    expect(kitchenGardenMissing(scene(1, false).w, scene(1, false).home)).toBe('plot');
    const unfenced = scene(2, false);
    expect(kitchenGardenMissing(unfenced.w, unfenced.home)).toBe('fence');
    expect(inspect(unfenced.w, 'building', unfenced.home.id)).toMatchObject({
      status: expect.arrayContaining([
        'Plots at the door: a bit of fence or hedge along them would make a Kitchen Garden',
      ]),
    });
    const done = scene(2, true);
    expect(kitchenGardenMissing(done.w, done.home)).toBeNull();
    expect(kitchenGardenMissing(scene(0, false).w, scene(0, false).home)).toBeNull();
  });

  it('counts a row of plots running on from the home, fenced all round (playtest round six)', () => {
    const w = standardWorld();
    const home = build(w, 'cottage', 160, 80);
    // Two plots side by side to the east: the second is four tiles from the home itself.
    build(w, 'vegetable-plot', 163, 80);
    build(w, 'vegetable-plot', 166, 80);
    rowRun(w, 'fence', 162, 168, 78);
    rowRun(w, 'fence', 162, 168, 83);
    colRun(w, 'fence', 169, 78, 83);
    const sites = detect(w, 'kitchen-garden');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.anchor).toBe(home.z * S + home.x);
    expect(sites[0]!.members.length).toBeGreaterThanOrEqual(3);
  });

  it('herb planters count as plots and a hedge as a fence', () => {
    const w = standardWorld();
    build(w, 'cottage', 160, 80);
    decor(w, 'herb-planter', 162, 80);
    decor(w, 'herb-planter', 162, 81);
    expect(detect(w, 'kitchen-garden')).toHaveLength(0);
    colRun(w, 'hedge', 163, 80, 81);
    expect(detect(w, 'kitchen-garden')).toHaveLength(1);
  });

  it('puts a little extra in the pantry each morning, while there is room', () => {
    const f = hamletFixture();
    const s = f.state;
    const home = s.buildings.find((b) => b.id === f.b.cottages[0])!;
    build(s, 'vegetable-plot', home.x - 3, home.z);
    build(s, 'vegetable-plot', home.x, home.z - 3);
    colRun(s, 'fence', home.x - 4, home.z, home.z + 1);
    const ctx = createTickCtx(s);
    runPatterns(s, ctx);
    expect(s.hearth.sites.some((x) => x.pattern === 'kitchen-garden')).toBe(true);
    const veg = content.goodIndex.get('vegetables')!;
    const h = s.households.find((x) => x.homeId === home.id)!;
    expect(h.pantry[veg]).toBe(3);
    kitchenGardenHarvest(s, ctx);
    expect(h.pantry[veg]).toBe(4);
    // Round six: the neighbors' cottage is near enough to share the garden; this household's once.
    expect(events(ctx, 'household.updated').filter((e) => e.h.id === h.id)).toHaveLength(1);
    h.pantry[veg] = 5; // with 3 bread, the pantry is full at 8
    kitchenGardenHarvest(s, ctx);
    expect(h.pantry[veg]).toBe(5);
  });
});

describe('Lantern Walk', () => {
  function scene(spacing: number, count: number) {
    const w = standardWorld();
    road(w, 'path', 110, 90, 135, 90);
    for (let i = 0; i < count; i++) decor(w, 'lantern', 111 + i * spacing, 91);
    return w;
  }

  it('ten lit steps or more, never three dark ones in a row', () => {
    const sites = detect(scene(5, 3), 'lantern-walk');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.members).toHaveLength(3);
    expect(sites[0]!.tiles.length).toBeGreaterThanOrEqual(10);
    expect(sites[0]!.anchor).toBe(90 * S + 110);
  });

  it('not with dark gaps of three, and not with only two lanterns', () => {
    expect(detect(scene(6, 4), 'lantern-walk')).toHaveLength(0);
    expect(detect(scene(5, 2), 'lantern-walk')).toHaveLength(0);
  });

  it('follows a path around a corner', () => {
    const w = standardWorld();
    road(w, 'path', 110, 90, 115, 90);
    road(w, 'path', 115, 91, 115, 96);
    decor(w, 'lantern', 111, 91);
    decor(w, 'lantern', 114, 89);
    decor(w, 'lantern', 116, 93);
    decor(w, 'lantern', 114, 96);
    expect(detect(w, 'lantern-walk')).toHaveLength(1);
  });
});

describe('Promenade by the Water', () => {
  function scene(benches: number, x = 99) {
    const w = standardWorld();
    road(w, 'path', x, 10, x, 20);
    for (let i = 0; i < benches; i++) decor(w, 'bench', x - 1, 12 + i * 4);
    decor(w, 'lantern', x - 1, 14);
    decor(w, 'lantern', x - 1, 18);
    return w;
  }

  it('a path along the river with benches and lanterns', () => {
    const sites = detect(scene(2), 'promenade-by-the-water');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.members).toHaveLength(4);
  });

  it('not with one bench, and not away from the water', () => {
    expect(detect(scene(1), 'promenade-by-the-water')).toHaveLength(0);
    expect(detect(scene(2, 97), 'promenade-by-the-water')).toHaveLength(0);
  });
});

describe('Hedgerow Lane', () => {
  function scene(north: number, south: number) {
    const w = standardWorld();
    road(w, 'lane', 110, 100, 121, 100);
    if (north) rowRun(w, 'hedge', 112, 112 + north - 1, 99);
    if (south) rowRun(w, 'hedge', 112, 112 + south - 1, 101);
    return w;
  }

  it('hedges on both sides along four tiles or more', () => {
    const sites = detect(scene(5, 5), 'hedgerow-lane');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.members).toHaveLength(10);
    expect(sites[0]!.tiles.length).toBeGreaterThanOrEqual(6);
  });

  it('not with one side bare, and not with three', () => {
    expect(detect(scene(6, 0), 'hedgerow-lane')).toHaveLength(0);
    expect(detect(scene(3, 3), 'hedgerow-lane')).toHaveLength(0);
  });

  it('runs north to south too', () => {
    const w = standardWorld();
    road(w, 'path', 170, 100, 170, 110);
    colRun(w, 'hedge', 169, 102, 106);
    colRun(w, 'hedge', 171, 102, 106);
    expect(detect(w, 'hedgerow-lane')).toHaveLength(1);
  });
});

describe('Sitting Wall', () => {
  function scene(segments: number, flowers: boolean, beside = true) {
    const w = standardWorld();
    road(w, 'path', 110, beside ? 110 : 105, 120, beside ? 110 : 105);
    rowRun(w, 'low-wall', 112, 112 + segments - 1, 111);
    if (flowers) decor(w, 'flower-bed', 113, 112);
    return w;
  }

  it('a low wall beside a path with flowers behind it', () => {
    const sites = detect(scene(4, true), 'sitting-wall');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.members).toHaveLength(5);
  });

  it('not too short, not bare, not away from a path', () => {
    expect(detect(scene(3, true), 'sitting-wall')).toHaveLength(0);
    expect(detect(scene(4, false), 'sitting-wall')).toHaveLength(0);
    expect(detect(scene(4, true, false), 'sitting-wall')).toHaveLength(0);
  });

  it('flowers on the path side do not count', () => {
    const w = scene(4, false);
    decor(w, 'planter', 113, 110);
    expect(detect(w, 'sitting-wall')).toHaveLength(0);
  });
});

describe('the engine', () => {
  it('discovers once, credits the seat that placed most pieces, and counts Built Together', () => {
    const { w } = wellScene({ well: 1, benches: [0, 0] });
    const ctx = createTickCtx(w);
    runPatterns(w, ctx);
    expect(w.hearth.discovered).toEqual([
      { pattern: 'well-gathering-place', tick: 0, seat: 0, together: true, anchor: 40 * S + 130 },
    ]);
    expect(w.stats.builtTogether).toBe(1);
    expect(w.hearth.sites[0]!.seats).toEqual([0, 1]);
    expect(events(ctx, 'pattern.discovered')).toHaveLength(1);
    const notice = events(ctx, 'notify').find((e) => e.kind === 'pattern')!;
    expect(notice.seat).toBeUndefined();
    expect(notice.text).toContain('Well Gathering Place');
    expect(notice.text).toContain('Curved bench');
    const entry = w.chronicle.find((c) => c.kind === 'pattern-discovered')!;
    expect(entry.text).toContain('Well Gathering Place');
    expect(entry.text).toMatch(/Ada and Bo/);
    expect(entry.seats).toEqual([0, 1]);
  });

  it('one seat alone gets sole credit; a tie goes to whoever placed the last piece', () => {
    const solo = wellScene({ well: 1, benches: [1, 1] });
    runPatterns(solo.w, createTickCtx(solo.w));
    expect(solo.w.hearth.discovered[0]).toMatchObject({ seat: 1, together: false });
    expect(solo.w.stats.builtTogether).toBe(0);

    const tie = wellScene({ well: 1, benches: [1, 0] });
    tie.w.map.tree[43 * S + 130] = 0;
    decor(tie.w, 'apple-tree', 131, 43, 0);
    runPatterns(tie.w, createTickCtx(tie.w));
    expect(tie.w.hearth.discovered[0]).toMatchObject({ seat: 0, together: true });
  });

  it('keeps sites stable by pattern and anchor, updates and removes them', () => {
    const { w, benches } = wellScene();
    runPatterns(w, createTickCtx(w));
    const first = w.hearth.sites[0]!;

    w.tick = 500;
    const quiet = createTickCtx(w);
    runPatterns(w, quiet);
    expect(quiet.events.filter((e) => e.e.startsWith('pattern.'))).toHaveLength(0);
    expect(w.hearth.sites[0]!.tick).toBe(first.tick);

    const extra = decor(w, 'bench', 130, 39);
    const grew = createTickCtx(w);
    runPatterns(w, grew);
    expect(events(grew, 'pattern.updated').map((e) => e.p.id)).toContain('well-gathering-place');
    expect(w.hearth.sites[0]!.members).toContain(extra);
    expect(w.hearth.sites[0]!.anchor).toBe(first.anchor);

    removeDecor(w, extra);
    removeDecor(w, benches[0]!);
    w.hearth.dirtyChunks.length = 0;
    const gone = createTickCtx(w);
    runPatterns(w, gone);
    expect(w.hearth.sites).toHaveLength(0);
    expect(events(gone, 'pattern.siteRemoved')).toHaveLength(1);
    expect(w.hearth.discovered).toHaveLength(1);
    // The bonus goes too: charm around the site is due for a recompute.
    expect(w.hearth.dirtyChunks.length).toBeGreaterThan(0);
    expect(w.hearth.charmSoon).toBe(true);
  });

  it('a second site is added without a second discovery', () => {
    const { w } = wellScene();
    runPatterns(w, createTickCtx(w));
    build(w, 'well', 140, 40);
    decor(w, 'bench', 139, 41);
    decor(w, 'bench', 141, 41);
    tree(w, 140, 43);
    build(w, 'cottage', 143, 36);
    build(w, 'cottage', 136, 44);
    const ctx = createTickCtx(w);
    runPatterns(w, ctx);
    expect(w.hearth.sites).toHaveLength(2);
    expect(w.hearth.discovered).toHaveLength(1);
    expect(events(ctx, 'pattern.siteAdded')).toHaveLength(1);
    expect(events(ctx, 'pattern.discovered')).toHaveLength(0);
  });

  it('unlocks Pattern Book pieces', () => {
    const { w } = wellScene();
    const at = { fx: 120 * TILE_FP + 128, fz: 50 * TILE_FP + 128, rot: 0 };
    expect(rejection(run(w, { t: 'decor.place', def: 'curved-bench', ...at }))).toBe('LOCKED');
    runPatterns(w, createTickCtx(w));
    expect(w.hearth.unlocked).toEqual(['curved-bench']);
    expect(rejection(run(w, { t: 'decor.place', def: 'curved-bench', ...at }))).toBeUndefined();
  });

  it('keeps three hints visible, revealing the next in order', () => {
    const { w } = wellScene();
    refillHints(w, null);
    expect(w.hearth.hints).toEqual(['well-gathering-place', 'tree-place', 'kitchen-garden']);
    const ctx = createTickCtx(w);
    runPatterns(w, ctx);
    expect(w.hearth.hints).toEqual(['tree-place', 'kitchen-garden', 'lantern-walk']);
    expect(events(ctx, 'pattern.updated').map((e) => e.p.id)).toContain('lantern-walk');
    const view = events(ctx, 'pattern.discovered')[0]!.p;
    expect(view).toMatchObject({ id: 'well-gathering-place', discovered: true, hinted: false });
  });
});

describe('closest attempts (playtest round six)', () => {
  it('says what a well, a garden and a lit path still want, and stops once a page is found', () => {
    const w = standardWorld();
    const well = build(w, 'well', 130, 40);
    decor(w, 'bench', 131, 41);
    const home = build(w, 'cottage', 160, 80);
    build(w, 'vegetable-plot', 163, 80);
    road(w, 'path', 110, 90, 116, 90);
    decor(w, 'lantern', 112, 91);
    const byId = new Map(patternProgress(w).map((p) => [p.pattern, p]));
    const gathering = byId.get('well-gathering-place')!;
    expect([gathering.x, gathering.z]).toEqual([well.x, well.z]);
    expect(gathering.wants.join(' ')).toContain('1 more bench');
    expect(gathering.wants.join(' ')).toContain('a tree for shade');
    const garden = byId.get('kitchen-garden')!;
    expect([garden.x, garden.z]).toEqual([home.x, home.z]);
    expect(garden.wants.join(' ')).toContain('1 more plot');
    expect(garden.wants.join(' ')).toContain('fence or hedge');
    expect(byId.get('lantern-walk')!.wants.join(' ')).toContain('2 more lanterns');
    // A page once found is no longer explained.
    build(w, 'vegetable-plot', 160, 83);
    colRun(w, 'fence', 165, 80, 81);
    runPatterns(w, createTickCtx(w));
    expect(patternProgress(w).some((p) => p.pattern === 'kitchen-garden')).toBe(false);
  });

  it('counts a plot two tiles across and one down from the house (the round six screenshot)', () => {
    const w = standardWorld();
    const home = build(w, 'cottage', 160, 80);
    build(w, 'vegetable-plot', 157, 76);
    build(w, 'vegetable-plot', 154, 76);
    rowRun(w, 'fence', 153, 159, 75);
    expect(detect(w, 'kitchen-garden').map((s) => s.anchor)).toEqual([home.z * S + home.x]);
  });
});
