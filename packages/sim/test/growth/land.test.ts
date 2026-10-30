// C4B land: desire paths worn by walking, and terraforming with its limits (docs/spec/10-world-
// and-building.md, Terrain rules and Roads). Walks are driven with requestMove and the movement
// system alone, so the residents' own schedule never sends anyone elsewhere.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import { evaluate } from '../../src/conditions';
import { Flags, Road, Terrain, TREE_MATURE, treeValue } from '../../src/map/layers';
import { pipeline, withoutSystems } from '../../src/systems';
import { requestMove } from '../../src/systems/movement/api';
import { REGROW_OFFSET } from '../../src/systems/traffic';
import {
  DESIRE_PATH_WEAR,
  desirePathTiles,
  pavedDesireTiles,
  WEAR_STEP,
} from '../../src/systems/traffic/wear';
import { withoutNightHurry } from '../../src/speed';
import { advanceTo, createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { flatWorld, rejection, run, S } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';

const WALKING = new Set(['clock', 'movement', 'traffic']);
const OTHERS = pipeline.map((s) => s.id).filter((id) => !WALKING.has(id));

describe('desire paths', () => {
  it('wear into the grass where people really walk, and heal where they stop', () => {
    const f = villageFixture();
    const s = f.state;
    const r = s.residents[0]!;
    r.inside = 0;
    // Back and forth across open grass south of lane A, where no road goes.
    const a = 58 * S + 40;
    const b = 58 * S + 58;
    r.tile = a;
    const ctx = createTickCtx(s);
    withoutSystems(OTHERS, () =>
      withoutNightHurry(() => {
        for (let k = 0; k < 40; k++) {
          requestMove(s, r.id, k % 2 === 0 ? b : a, 'leisure');
          for (let t = 0; t < 400 && r.move; t++) advanceTo(s, s.tick + 1, ctx);
        }
      }),
    );
    const worn = desirePathTiles(s.map, 39, 55, 59, 61);
    expect(worn.length).toBeGreaterThan(5);
    for (const [x, z] of worn) expect(s.map.road[z * S + x]).toBe(0);
    // Roads never wear; the walk shows up in the patches.
    expect(s.map.wear[50 * S + 45]).toBe(0);
    // A night or two without walkers and the grass comes back a little.
    const before = s.map.wear[worn[0]![1] * S + worn[0]![0]]!;
    withoutSystems(OTHERS, () => advanceTo(s, s.tick + TICKS_PER_DAY, ctx));
    expect(s.map.wear[worn[0]![1] * S + worn[0]![0]]!).toBeLessThan(before);
    expect(REGROW_OFFSET).toBeGreaterThan(0);
    expect(WEAR_STEP).toBeGreaterThan(0);
  });

  it('count once paved: the Desire Lines predicate', () => {
    const f = villageFixture();
    const s = f.state;
    for (let x = 40; x < 52; x++) s.map.wear[58 * S + x] = DESIRE_PATH_WEAR + 10;
    const cond = { code: 'desireLines', params: [['tiles', 12]] as [string, number][] };
    expect(evaluate(s, cond, {})).toBe(false);
    const tiles = desirePathTiles(s.map, 30, 55, 60, 60);
    expect(tiles).toHaveLength(12);
    const ctx = run(s, { t: 'road.paint', kind: 'path', tiles });
    expect(rejection(ctx)).toBeUndefined();
    expect(pavedDesireTiles(s)).toBe(12);
    expect(evaluate(s, cond, {})).toBe(true);
  });
});

describe('terraforming', () => {
  it('never makes a new cliff, but may soften an old one', () => {
    const s = flatWorld();
    s.settings.mode = 'standard';
    s.economy.treasury = 100000;
    run(s, { t: 'terrain.raise', tiles: [[60, 60]] });
    expect(s.map.height[60 * S + 60]).toBe(3);
    // A second level on the same tile would stand two above its neighbors.
    expect(rejection(run(s, { t: 'terrain.raise', tiles: [[60, 60]] }))).toBe('TOO_STEEP');
    // Raising the ring around it first makes room.
    const ring: [number, number][] = [];
    for (let z = 59; z <= 61; z++) for (let x = 59; x <= 61; x++) if (x !== 60 || z !== 60) ring.push([x, z]);
    expect(rejection(run(s, { t: 'terrain.raise', tiles: ring }))).toBeUndefined();
    expect(rejection(run(s, { t: 'terrain.raise', tiles: [[60, 60]] }))).toBeUndefined();
    expect(s.map.height[60 * S + 60]).toBe(4);
    // The cliff block at x 20 to 29 is 6 high next to 2: lowering its edge is fine.
    expect(rejection(run(s, { t: 'terrain.lower', tiles: [[20, 25]] }))).toBeUndefined();
  });

  it('uproots trees, turns over fields, starts worn ground fresh and pays per tile', () => {
    const f = villageFixture();
    const s = f.state;
    const before = moneySnapshot(s);
    const coins = s.economy.treasury;
    s.map.tree[60 * S + 90] = treeValue(1, TREE_MATURE);
    s.map.wear[60 * S + 91] = 200;
    s.map.terrain[60 * S + 92] = Terrain.field;
    s.map.fieldOwner[60 * S + 92] = f.b.bakery;
    s.map.crop[60 * S + 92] = 180;
    const ctx = run(s, {
      t: 'terrain.raise',
      tiles: [
        [90, 60],
        [91, 60],
        [92, 60],
      ],
    });
    expect(rejection(ctx)).toBeUndefined();
    expect(s.map.tree[60 * S + 90]).toBe(0);
    expect(s.map.wear[60 * S + 91]).toBe(0);
    expect(s.map.crop[60 * S + 92]).toBe(0);
    expect(s.map.fieldOwner[60 * S + 92]).toBe(f.b.bakery);
    expect(s.economy.treasury).toBeLessThan(coins);
    expectMoneyInvariant(before, s);
  });

  it('refuses decor, buildings, roads and water, and gives paths stairs where they now climb', () => {
    const f = villageFixture();
    const s = f.state;
    run(s, { t: 'decor.place', def: 'bench', fx: 90 * 256 + 128, fz: 62 * 256 + 128, rot: 0 });
    expect(rejection(run(s, { t: 'terrain.raise', tiles: [[90, 62]] }))).toBe('OCCUPIED');
    expect(rejection(run(s, { t: 'terrain.raise', tiles: [[40, 50]] }))).toBe('OCCUPIED');
    expect(rejection(run(s, { t: 'terrain.raise', tiles: [[100, 50]] }))).toBe('WATER');
    // The path at x = 64 crosses open ground south of lane A: lift the grass beside it, then
    // repave the step as a path onto the raised tile.
    run(s, { t: 'terrain.raise', tiles: [[65, 60]] });
    run(s, { t: 'road.paint', kind: 'path', tiles: [[65, 60]] });
    expect(s.map.road[60 * S + 65]).toBe(Road.path);
    expect(s.map.flags[60 * S + 64]! & Flags.stairs).toBe(Flags.stairs);
  });
});
