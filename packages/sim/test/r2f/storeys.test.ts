// R2F: storeys by tier and level, and the row rule (docs/build/cycle-r2f-street-lots.md, task 4).
import { content, type BuildingDef } from '@qoti/content';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Building, Lot, SimEvent, WorldState } from '../../src/contracts';
import { insertBuilding } from '../../src/state/place';
import {
  baseStoreys,
  MAX_STOREYS,
  refitRow,
  refitStoreys,
  storeysFor,
} from '../../src/systems/zoning/storeys';
import { createTickCtx } from '../../src/turn';
import { flatWorld } from '../helpers';

const COTTAGE = content.buildingById.get('cottage')!;
const TOWNHOUSE = content.buildingById.get('townhouse')!;
/** No merchant home ships yet; a copy of the townhouse housing merchants stands in. */
const MANOR: BuildingDef = { ...TOWNHOUSE, id: 'test-manor', tier: 'merchant' };
const WORKSHOP = content.buildingById.get(content.trades[0]!.building)!;

beforeAll(() => {
  (content.buildingById as Map<string, BuildingDef>).set(MANOR.id, MANOR);
});
afterAll(() => {
  (content.buildingById as Map<string, BuildingDef>).delete(MANOR.id);
});

const ROW = 900;

/** A lot of a row along x, `i` lots from the row's start (3 wide, so lots touch). */
function addLot(state: WorldState, i: number, row = ROW, kind: Lot['kind'] = 'plot'): Lot {
  const lot: Lot = {
    id: state.nextId++,
    zone: 0,
    x: 10 + i * 3,
    z: 10,
    w: 3,
    d: 3,
    rot: 2,
    frontage: 9 * 256 + 10 + i * 3,
    desirability: 0,
    style: '',
    buildingId: 0,
    tick: 0,
    row,
    kind,
  };
  state.lots.push(lot);
  return lot;
}

function build(state: WorldState, lot: Lot, def: BuildingDef, level?: number, trade?: string): Building {
  const b = insertBuilding(state, null, def, lot.x, lot.z, 2, 0, {
    lot: lot.id,
    site: false,
    ...(trade !== undefined && { trade }),
  });
  if (level !== undefined) b.level = level;
  lot.buildingId = b.id;
  b.storeys = baseStoreys(def, level ?? 1, trade);
  return b;
}

const storeysOf = (state: WorldState, lot: Lot): number | undefined =>
  state.buildings.find((b) => b.id === lot.buildingId)?.storeys;

describe('base storeys', () => {
  it('follow the home tier and the business level', () => {
    expect(baseStoreys(COTTAGE)).toBe(1.5);
    expect(baseStoreys(TOWNHOUSE)).toBe(2);
    expect(baseStoreys(MANOR)).toBe(3);
    expect([1, 2, 3].map((l) => baseStoreys(WORKSHOP, l))).toEqual([1, 1.5, 2]);
    expect(baseStoreys(MANOR)).toBeLessThanOrEqual(MAX_STOREYS);
  });

  it('count a home with a trade set as a business', () => {
    expect(baseStoreys(TOWNHOUSE, 1, 'anything')).toBe(1);
  });

  it('give a lot with no row its base', () => {
    const s = flatWorld();
    const a = addLot(s, 0, 0);
    const b = addLot(s, 1, 0);
    build(s, a, MANOR);
    expect(storeysFor(s, b, COTTAGE)).toBe(1.5);
  });
});

describe('the row rule', () => {
  it('raises a cottage beside a manor and leaves the manor alone', () => {
    const s = flatWorld();
    const a = addLot(s, 0);
    const b = addLot(s, 1);
    build(s, a, COTTAGE);
    build(s, b, MANOR);
    refitStoreys(s, null);
    expect(storeysOf(s, a)).toBe(2);
    expect(storeysOf(s, b)).toBe(3);
  });

  it('gives a lot built later the height of the row it joins', () => {
    const s = flatWorld();
    const a = addLot(s, 0);
    const b = addLot(s, 1);
    build(s, a, MANOR);
    expect(storeysFor(s, b, COTTAGE)).toBe(2);
    expect(storeysFor(s, b, WORKSHOP)).toBe(2);
  });

  it('breaks a chain at an empty lot', () => {
    const s = flatWorld();
    const lots = [0, 1, 2].map((i) => addLot(s, i));
    build(s, lots[0]!, COTTAGE);
    build(s, lots[2]!, MANOR);
    refitStoreys(s, null);
    expect(storeysOf(s, lots[0]!)).toBe(1.5);
    expect(storeysOf(s, lots[2]!)).toBe(3);
    // Fill the gap and the row steps down by at most one.
    build(s, lots[1]!, WORKSHOP);
    refitRow(s, null, ROW);
    expect(storeysOf(s, lots[1]!)).toBe(2);
    expect(storeysOf(s, lots[0]!)).toBe(1.5);
  });

  it('ignores garden lots', () => {
    const s = flatWorld();
    const a = addLot(s, 0);
    addLot(s, 1, ROW, 'garden');
    build(s, a, COTTAGE);
    refitStoreys(s, null);
    expect(storeysOf(s, a)).toBe(1.5);
  });

  it('picks up a tier change with building.updated and lot.updated', () => {
    const s = flatWorld();
    const a = addLot(s, 0);
    const b = addLot(s, 1);
    const home = build(s, a, COTTAGE);
    build(s, b, WORKSHOP);
    refitStoreys(s, null);
    expect(storeysOf(s, b)).toBe(1);
    home.def = 'townhouse';
    const ctx = createTickCtx(s);
    refitStoreys(s, ctx);
    expect(home.storeys).toBe(2);
    expect(storeysOf(s, b)).toBe(1);
    const kinds = ctx.events.map((e: SimEvent) => e.e);
    expect(kinds).toContain('building.updated');
    expect(kinds).toContain('lot.updated');
    // A second pass changes nothing and says nothing.
    const again = createTickCtx(s);
    refitStoreys(s, again);
    expect(again.events).toEqual([]);
  });

  it('keeps the storeys of a building whose def is gone', () => {
    const s = flatWorld();
    const a = addLot(s, 0);
    const home = build(s, a, COTTAGE);
    home.def = 'no-such-def';
    home.storeys = 2.5;
    refitStoreys(s, null);
    expect(home.storeys).toBe(2.5);
  });
});

/** A tiny integer hash; never Math.random. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return (h ^ (h >>> 12)) >>> 0;
}

describe('the row rule, over 100 seeds', () => {
  const DEFS: [BuildingDef, number | undefined][] = [
    [COTTAGE, undefined],
    [TOWNHOUSE, undefined],
    [MANOR, undefined],
    [WORKSHOP, 1],
    [WORKSHOP, 2],
    [WORKSHOP, 3],
  ];

  function run(seed: number, reverse: boolean): { bases: (number | null)[]; got: (number | null)[] } {
    const s = flatWorld();
    const n = 1 + (hash(seed, 0) % 12);
    const lots = Array.from({ length: n }, (_, i) => addLot(s, i));
    const picks = lots.map((_, i) =>
      hash(seed, i + 1) % 5 === 0 ? null : DEFS[hash(seed, i + 100) % DEFS.length]!,
    );
    const order = lots.map((_, i) => i);
    if (reverse) order.reverse();
    for (const i of order) {
      const p = picks[i];
      if (p) build(s, lots[i]!, p[0], p[1], p[0] === WORKSHOP ? content.trades[0]!.id : undefined);
    }
    refitStoreys(s, null);
    return {
      bases: picks.map((p) => (p ? baseStoreys(p[0], p[1] ?? 1, p[0] === WORKSHOP ? 'x' : undefined) : null)),
      got: lots.map((l) => storeysOf(s, l) ?? null),
    };
  }

  it('keeps neighbors within one storey, above their base, under the ceiling, in half steps', () => {
    for (let seed = 0; seed < 100; seed++) {
      const { bases, got } = run(seed, false);
      const chainMax = Math.max(...bases.map((b) => b ?? 0));
      for (let i = 0; i < got.length; i++) {
        const g = got[i];
        if (g === null) continue;
        expect(g, `seed ${seed} lot ${i}`).toBeGreaterThanOrEqual(bases[i]!);
        expect(g).toBeLessThanOrEqual(MAX_STOREYS);
        expect(g).toBeLessThanOrEqual(chainMax);
        expect((g * 2) % 1).toBe(0);
        const next = got[i + 1];
        if (next !== null && next !== undefined)
          expect(Math.abs(g - next), `seed ${seed} at ${i}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('does not depend on the order the buildings went up in', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(run(seed, true).got, `seed ${seed}`).toEqual(run(seed, false).got);
    }
  });
});
