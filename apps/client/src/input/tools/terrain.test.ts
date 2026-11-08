import { describe, expect, it } from 'vitest';
import { MAP_SIZE, PENNIES_PER_COIN, TERRAFORM_COST, type WorldState } from '@qoti/sim';
import { Road } from '../../../../../packages/sim/src/map/layers';
import { flatWorld, reader, rejection, run } from '../../../../../packages/sim/test/helpers';
import { INPUT_COPY } from '../copy';
import {
  EARTH_MAX_COMMANDS,
  earthBox,
  earthCoins,
  planEarthworks,
  terrainTool,
  type EarthPlan,
  type EarthworkKind,
} from './terrain';

const S = MAP_SIZE;
type Tile = [number, number];

function standardWorld(): WorldState {
  const s = flatWorld();
  s.settings.mode = 'standard';
  s.economy.treasury = 1_000_000;
  return s;
}

const rect = (x0: number, z0: number, x1: number, z1: number) => earthBox([x0, z0], [x1, z1]);
const heightAt = (s: WorldState, x: number, z: number) => s.map.height[z * S + x]!;

/** A seeded pseudo-random number in [0, n), so the property test is repeatable. */
function lcg(seed: number) {
  let v = seed;
  return (n: number) => {
    v = (v * 1664525 + 1013904223) >>> 0;
    return v % n;
  };
}

/** Sends every planned command to the sim, one turn each, and returns the rejections. */
function apply(s: WorldState, plan: EarthPlan): (string | undefined)[] {
  if (!plan.ok) throw new Error('no plan');
  return plan.commands.map((cmd, k) => rejection(run(s, cmd, 0, k + 1)));
}

describe('earthworks planning', () => {
  it('levels a lumpy box to the starting ground and the sim accepts every command', () => {
    const s = standardWorld();
    const lumps: [number, number, number][] = [
      [60, 60, 3],
      [61, 60, 3],
      [60, 61, 3],
      [63, 62, 1],
      [64, 62, 1],
    ];
    for (const [x, z, h] of lumps) s.map.height[z * S + x] = h;
    const box = rect(58, 58, 66, 65);
    const plan = planEarthworks(reader(s), 'level', box, heightAt(s, 58, 58));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.commands.every((c) => c.tiles.length <= 64)).toBe(true);
    const before = s.economy.treasury;
    expect(apply(s, plan).filter(Boolean)).toEqual([]);
    for (const [x, z] of box) expect(heightAt(s, x, z)).toBe(2);
    expect(before - s.economy.treasury).toBe(earthCoins(plan.moves) * PENNIES_PER_COIN);
    expect(earthCoins(plan.moves)).toBe(plan.moves * TERRAFORM_COST);
  });

  it('is free in a sandbox', () => {
    const s = standardWorld();
    s.settings.mode = 'sandbox';
    s.map.height[60 * S + 60] = 3;
    const plan = planEarthworks(reader(s), 'level', rect(59, 59, 61, 61), 2);
    expect(plan.ok).toBe(true);
    expect(apply(s, plan)).toEqual([undefined]);
    expect(heightAt(s, 60, 60)).toBe(2);
  });

  it('raises and lowers a box one level', () => {
    const s = standardWorld();
    const up = planEarthworks(reader(s), 'raise', rect(60, 60, 64, 64));
    expect(apply(s, up).filter(Boolean)).toEqual([]);
    expect(heightAt(s, 62, 62)).toBe(3);
    const down = planEarthworks(reader(s), 'lower', rect(60, 60, 64, 64));
    expect(apply(s, down).filter(Boolean)).toEqual([]);
    expect(heightAt(s, 62, 62)).toBe(2);
  });

  it('splits more than 64 tiles into several commands, in order', () => {
    const s = standardWorld();
    const plan = planEarthworks(reader(s), 'raise', rect(50, 50, 61, 61));
    expect(plan.ok && plan.commands.length).toBe(3);
    expect(apply(s, plan).filter(Boolean)).toEqual([]);
    expect(heightAt(s, 61, 61)).toBe(3);
  });

  it('digs a hill down in passes, each one level', () => {
    const s = standardWorld();
    // A gentle mound, 2 up to 5 in the middle.
    for (let z = 58; z <= 66; z++)
      for (let x = 58; x <= 66; x++)
        s.map.height[z * S + x] = 2 + Math.max(0, 3 - Math.max(Math.abs(x - 62), Math.abs(z - 62)));
    const box = rect(56, 56, 68, 68);
    const plan = planEarthworks(reader(s), 'level', earthBox([56, 56], [67, 67]), 2);
    expect(box.length).toBeGreaterThan(0);
    expect(plan.ok).toBe(true);
    expect(apply(s, plan).filter(Boolean)).toEqual([]);
    for (const [x, z] of earthBox([56, 56], [67, 67])) expect(heightAt(s, x, z)).toBe(2);
  });

  it('refuses a plan that would leave a cliff at the edge, as the sim would', () => {
    const s = standardWorld();
    // Ground 4 beside ground 2 next to the box: leveling up to 4 would stand 2 above the far side.
    for (let z = 60; z <= 64; z++) for (let x = 60; x <= 62; x++) s.map.height[z * S + x] = 3;
    const plan = planEarthworks(reader(s), 'raise', rect(60, 60, 62, 64));
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.why).toBe('cliff');
    expect(rejection(run(s, { t: 'terrain.raise', tiles: rect(60, 60, 62, 64) }))).toBe('TOO_STEEP');
    expect(INPUT_COPY.earthWhy('cliff', 'raise')).toContain('cliff at the edge');
  });

  it('says why: roads and buildings stay put, water does not level, the plan is not too big', () => {
    const s = standardWorld();
    s.map.road[62 * S + 62] = Road.path;
    const road = planEarthworks(reader(s), 'raise', rect(60, 60, 64, 64));
    expect(!road.ok && road.why).toBe('occupied');
    expect(rejection(run(s, { t: 'terrain.raise', tiles: rect(60, 60, 64, 64) }))).toBe('OCCUPIED');
    const water = planEarthworks(reader(s), 'lower', rect(98, 60, 99, 61));
    expect(water.ok).toBe(true);
    const wet = planEarthworks(reader(s), 'lower', rect(99, 60, 100, 61));
    expect(!wet.ok && wet.why).toBe('water');
    // Ground at the floor cannot go lower.
    for (let z = 70; z <= 71; z++) for (let x = 70; x <= 71; x++) s.map.height[z * S + x] = 1;
    const low = planEarthworks(reader(s), 'lower', rect(70, 70, 71, 71));
    expect(!low.ok && low.why).toBe('limit');
    // A flat box has nothing to do.
    const flat = planEarthworks(reader(s), 'level', rect(75, 75, 78, 78), 2);
    expect(!flat.ok && flat.why).toBe('flat');
  });

  it('keeps every plan within the command budget, or says it is too much', () => {
    const s = standardWorld();
    // A tall stack of terraces across the whole box.
    for (let z = 50; z < 62; z++) for (let x = 50; x < 62; x++) s.map.height[z * S + x] = 2 + ((x - 50) >> 1);
    const plan = planEarthworks(reader(s), 'level', rect(50, 50, 61, 61), 2);
    if (plan.ok) expect(plan.commands.length).toBeLessThanOrEqual(EARTH_MAX_COMMANDS);
    else expect(plan.why).toBe('tooMuch');
  });

  it('clamps a drag to a box of 12 tiles a side', () => {
    expect(earthBox([10, 10], [50, 12])).toHaveLength(12 * 3);
    expect(earthBox([50, 50], [20, 20])).toHaveLength(12 * 12);
  });

  it('property: any plan it makes is accepted whole and ends as promised', () => {
    const rnd = lcg(7);
    let made = 0;
    for (let trial = 0; trial < 60; trial++) {
      const s = standardWorld();
      // Level ground with scattered one-level lumps and dips, now and then a pair a cliff apart.
      for (let z = 50; z < 76; z++)
        for (let x = 50; x < 76; x++) s.map.height[z * S + x] = 3 + (rnd(5) === 0 ? rnd(3) - 1 : 0);
      const kinds: EarthworkKind[] = ['level', 'raise', 'lower'];
      const kind = kinds[rnd(3)]!;
      const a: Tile = [52 + rnd(18), 52 + rnd(18)];
      const b: Tile = [52 + rnd(18), 52 + rnd(18)];
      const box = earthBox(a, b);
      const target = heightAt(s, a[0], a[1]);
      const plan = planEarthworks(reader(s), kind, box, target);
      if (!plan.ok) continue;
      made++;
      const start = s.map.height.slice();
      expect(apply(s, plan).filter(Boolean)).toEqual([]);
      for (const [x, z] of box) {
        const i = z * S + x;
        if (kind === 'level') expect(s.map.height[i]).toBe(target);
        else expect(s.map.height[i]).toBe(start[i]! + (kind === 'raise' ? 1 : -1));
      }
    }
    expect(made).toBeGreaterThan(15);
  });
});

describe('the earthworks tool', () => {
  it('registers as a Ledger tool with Level, Raise and Lower, free in a sandbox', () => {
    const tool = terrainTool({} as never);
    expect(tool.id).toBe('terrain');
    expect(tool.label).toBe('Earthworks');
    expect(tool.lane).toBe('ledger');
    expect(tool.order).toBe(34);
    expect(tool.modes).toEqual(['standard', 'sandbox']);
    expect(tool.variants?.map((v) => v.id)).toEqual(['level', 'raise', 'lower']);
    expect(tool.variant?.value).toBe('level');
  });

  it('words the cost like the brief', () => {
    expect(INPUT_COPY.earthSummary('level', 18, 36)).toBe('Level 18 tiles: 36 coins');
    expect(INPUT_COPY.earthSummary('raise', 1, null)).toBe('Raise 1 tile');
  });
});
