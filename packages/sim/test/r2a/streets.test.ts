// Street names by road run (R2A): runs, anchors, naming and keeping.
import { content, STREET_NAMES } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { Household, WorldState } from '../../src/contracts';
import { insertBuilding } from '../../src/state/place';
import { deserialize, serialize } from '../../src/state/serialize';
import { refreshStreets, streetTiles } from '../../src/systems/places/streets';
import { createTickCtx } from '../../src/turn';
import { flatWorld, run, S } from '../helpers';

/** Paints road tiles (kind 2, a lane, unless told) and bumps the network version as the commands do. */
function paint(state: WorldState, x: number, z: number, len: number, axis: 'x' | 'z', kind = 2): void {
  for (let k = 0; k < len; k++) {
    const i = axis === 'x' ? z * S + x + k : (z + k) * S + x;
    state.map.road[i] = kind;
  }
  state.networkVersion++;
}

function unpaint(state: WorldState, x: number, z: number, len: number, axis: 'x' | 'z'): void {
  for (let k = 0; k < len; k++) state.map.road[axis === 'x' ? z * S + x + k : (z + k) * S + x] = 0;
  state.networkVersion++;
}

function refresh(state: WorldState): ReturnType<typeof createTickCtx> {
  const ctx = createTickCtx(state);
  refreshStreets(state, ctx);
  return ctx;
}

function home(state: WorldState, x: number, z: number, family: string): void {
  const b = insertBuilding(state, null, content.buildingById.get('cottage')!, x, z, 0, 0, { site: false });
  state.households.push({ id: state.nextId++, family, members: [], homeId: b.id } as unknown as Household);
}

const tileOf = (x: number, z: number): number => z * S + x;

describe('street runs', () => {
  it('a straight lane of ten tiles is one street named for a lane', () => {
    const s = flatWorld();
    paint(s, 50, 60, 10, 'x');
    refresh(s);
    expect(s.streets).toHaveLength(1);
    expect(s.streets[0]!.name.endsWith('Lane')).toBe(true);
    expect(streetTiles(s, s.streets[0]!)).toHaveLength(10);
  });

  it('a path under the minimum is no street', () => {
    const s = flatWorld();
    paint(s, 50, 60, STREET_NAMES.minTiles - 1, 'x', 1);
    refresh(s);
    expect(s.streets).toHaveLength(0);
  });

  it('a path of the minimum is a street named for a path', () => {
    const s = flatWorld();
    paint(s, 50, 60, STREET_NAMES.minTiles, 'z', 1);
    refresh(s);
    expect(s.streets).toHaveLength(1);
    expect(/(Path|Walk)$/.test(s.streets[0]!.name)).toBe(true);
  });

  it('a crossing makes two streets, anchored off the crossing', () => {
    const s = flatWorld();
    paint(s, 50, 60, 10, 'x');
    paint(s, 55, 56, 10, 'z');
    refresh(s);
    expect(s.streets).toHaveLength(2);
    for (const st of s.streets) expect(st.anchor).not.toBe(tileOf(55, 60));
    expect(new Set(s.streets.map((st) => st.name)).size).toBe(2);
    expect(streetTiles(s, s.streets[0]!)).toHaveLength(10);
    expect(streetTiles(s, s.streets[1]!)).toHaveLength(10);
  });

  it('streetTiles falls back to the anchor when no run holds it', () => {
    const s = flatWorld();
    paint(s, 50, 60, 10, 'x');
    refresh(s);
    const st = s.streets[0]!;
    unpaint(s, 50, 60, 10, 'x');
    expect(streetTiles(s, st)).toEqual([st.anchor]);
  });

  it('an avenue is an Avenue and a street is a Street', () => {
    const s = flatWorld();
    paint(s, 50, 60, 8, 'x', 4);
    paint(s, 50, 70, 8, 'x', 3);
    refresh(s);
    expect(s.streets.map((st) => st.name.split(' ').pop())).toEqual(['Avenue', 'Street']);
  });
});

describe('street names', () => {
  it('a lane beside a windmill is Mill Lane', () => {
    const s = flatWorld();
    paint(s, 50, 60, 10, 'x');
    insertBuilding(s, null, content.buildingById.get('windmill')!, 54, 61, 0, 0, { site: false });
    refresh(s);
    expect(s.streets[0]!.name).toBe('Mill Lane');
  });

  it('three cottages of one family beside a lane make Family Row', () => {
    const s = flatWorld();
    paint(s, 50, 60, 10, 'x');
    for (const x of [50, 52, 54]) home(s, x, 61, 'Underbank');
    refresh(s);
    expect(s.streets[0]!.name).toBe('Underbank Row');
  });

  it('a family that holds little of the run names it without Row', () => {
    const s = flatWorld();
    paint(s, 50, 60, 20, 'x');
    for (const x of [50, 52]) home(s, x, 61, 'Underbank');
    refresh(s);
    expect(s.streets[0]!.name).toBe('Underbank Lane');
  });

  it('water beside a run names it', () => {
    const s = flatWorld();
    // The river is x 100 and 101; a lane along z at x 98 runs beside it.
    paint(s, 98, 60, 10, 'z');
    refresh(s);
    expect(/^(River|Brook) Lane$/.test(s.streets[0]!.name)).toBe(true);
  });

  it('the same name is never generated twice', () => {
    const s = flatWorld();
    for (let k = 0; k < 12; k++) {
      paint(s, 50, 10 + k * 6, 8, 'x');
      // A windmill beside each: they would all be Mill Lane.
      insertBuilding(s, null, content.buildingById.get('windmill')!, 54, 11 + k * 6, 0, 0, { site: false });
    }
    refresh(s);
    expect(s.streets).toHaveLength(12);
    const names = s.streets.map((st) => st.name);
    expect(new Set(names).size).toBe(12);
    expect(names[0]).toBe('Mill Lane');
    expect(names[1]).toBe('Upper Mill Lane');
    for (const n of names) {
      expect(n.length).toBeLessThanOrEqual(STREET_NAMES.maxLength);
      expect(/^[A-Z][a-z]+( [A-Z][a-z]+)+$/.test(n)).toBe(true);
      expect(n).not.toContain('—');
    }
  });
});

describe('street keeping', () => {
  it('extending the road keeps the street id and name', () => {
    const s = flatWorld();
    paint(s, 50, 60, 6, 'x');
    refresh(s);
    const before = { ...s.streets[0]! };
    paint(s, 56, 60, 6, 'x');
    refresh(s);
    expect(s.streets).toHaveLength(1);
    expect(s.streets[0]!.id).toBe(before.id);
    expect(s.streets[0]!.name).toBe(before.name);
    expect(streetTiles(s, s.streets[0]!)).toHaveLength(12);
  });

  it('a pass over an unchanged town changes nothing and says nothing', () => {
    const s = flatWorld();
    paint(s, 50, 60, 10, 'x');
    refresh(s);
    const snap = JSON.stringify(s.streets);
    const ctx = refresh(s);
    expect(JSON.stringify(s.streets)).toBe(snap);
    expect(ctx.events.some((e) => e.e === 'streets.updated')).toBe(false);
  });

  it('removing every tile of the run drops the street and says so', () => {
    const s = flatWorld();
    paint(s, 50, 60, 10, 'x');
    refresh(s);
    unpaint(s, 50, 60, 10, 'x');
    const ctx = refresh(s);
    expect(s.streets).toHaveLength(0);
    expect(ctx.events.some((e) => e.e === 'streets.updated')).toBe(true);
  });

  it('joining two streets keeps the lower id', () => {
    const s = flatWorld();
    paint(s, 50, 60, 5, 'x');
    paint(s, 56, 60, 5, 'x');
    refresh(s);
    expect(s.streets).toHaveLength(2);
    const [a, b] = s.streets as [(typeof s.streets)[0], (typeof s.streets)[0]];
    expect(a.id).toBeLessThan(b.id);
    paint(s, 55, 60, 1, 'x');
    const ctx = refresh(s);
    expect(s.streets.map((st) => st.id)).toEqual([a.id]);
    expect(streetTiles(s, s.streets[0]!)).toHaveLength(11);
    expect(ctx.events.some((e) => e.e === 'streets.updated')).toBe(true);
  });

  it('a renamed street keeps its custom name through the hourly pass', () => {
    const s = flatWorld();
    paint(s, 50, 60, 10, 'x');
    refresh(s);
    const id = s.streets[0]!.id;
    run(s, { t: 'road.rename', id, name: 'Honeysuckle Way' });
    expect(s.streets[0]!.custom).toBe('Honeysuckle Way');
    refresh(s);
    expect(s.streets[0]!.custom).toBe('Honeysuckle Way');
    expect(s.streets[0]!.renamedBy).toBe(0);
    expect(s.streets[0]!.id).toBe(id);
  });

  it('a street survives serialize and deserialize, and the next pass changes nothing', () => {
    const s = flatWorld();
    paint(s, 50, 60, 10, 'x');
    paint(s, 55, 56, 10, 'z');
    refresh(s);
    const back = deserialize(serialize(s));
    expect(back.streets).toEqual(s.streets);
    const ctx = refresh(back);
    expect(back.streets).toEqual(s.streets);
    expect(ctx.events.some((e) => e.e === 'streets.updated')).toBe(false);
  });
});
