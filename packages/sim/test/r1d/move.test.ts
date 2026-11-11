// R1D (T1): decor.move and build.move run the placing validators at the new spot with the piece
// itself left out; buildings in a standard valley are raised again by the builders for a third of
// the work and no materials.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, TICKS_PER_HOUR, TILE_FP } from '../../src/constants';
import { canPlaceBuilding, readerWithout } from '../../src/rules';
import { findById } from '../../src/state/entities';
import { worldIndex } from '../../src/state/worldIndex';
import { hamletFixture } from '../fixtures/hamlet';
import { flatWorld, rejection, run } from '../helpers';
import { building, everyoneToWork, ticksUntil, untilHour } from '../ledger/helpers';

const S = MAP_SIZE;
const fp = (t: number) => t * TILE_FP + TILE_FP / 2;

describe('readerWithout', () => {
  it('reads a building as free and drops one decor piece', () => {
    const f = hamletFixture();
    const c = building(f.state, f.b.cottages[0]);
    const r = worldIndex(f.state).reader;
    expect(r.occupant(c.x, c.z)).toBe(c.id);
    const w = readerWithout(r, { building: c.id });
    expect(w.occupant(c.x, c.z)).toBe(0);
    expect(w.occupant(56, 48)).toBe(f.b.cottages[1]);
    const bench = f.decor.benches[0]!;
    expect(r.decorNear(fp(56), fp(53), TILE_FP).some((d) => d.id === bench)).toBe(true);
    expect(
      readerWithout(r, { decor: bench })
        .decorNear(fp(56), fp(53), TILE_FP)
        .some((d) => d.id === bench),
    ).toBe(false);
  });
});

describe('decor.move', () => {
  it('moves a piece, keeping its id and builder, and updates the grid and events', () => {
    const f = hamletFixture();
    const id = f.decor.benches[0]!;
    const before = { ...findById(f.state.decor, id)! };
    const ctx = run(f.state, { t: 'decor.move', id, fx: fp(60), fz: fp(55), rot: 5 });
    expect(rejection(ctx)).toBeUndefined();
    const d = findById(f.state.decor, id)!;
    expect(d).toMatchObject({ id, def: before.def, builtBy: before.builtBy, fx: fp(60), fz: fp(55), rot: 5 });
    const grid = worldIndex(f.state).decorGrid;
    expect(grid.near(fp(60), fp(55), 10).some((x) => x.id === id)).toBe(true);
    expect(grid.near(before.fx, before.fz, 10).some((x) => x.id === id)).toBe(false);
    const kinds = ctx.events.map((e) => e.e);
    expect(kinds).toContain('decor.removed');
    expect(kinds).toContain('decor.added');
  });

  it('charges nothing and refunds nothing', () => {
    const f = hamletFixture();
    const before = f.state.economy.treasury;
    run(f.state, { t: 'decor.move', id: f.decor.benches[0]!, fx: fp(60), fz: fp(55), rot: 0 });
    expect(f.state.economy.treasury).toBe(before);
  });

  it('may land overlapping only its own old place, and undoes by moving back', () => {
    const f = hamletFixture();
    const id = f.decor.benches[0]!;
    const old = { ...findById(f.state.decor, id)! };
    const nudge = { t: 'decor.move', id, fx: old.fx + 20, fz: old.fz, rot: 0 } as const;
    expect(rejection(run(f.state, nudge))).toBeUndefined();
    const back = { t: 'decor.move', id, fx: old.fx, fz: old.fz, rot: old.rot } as const;
    expect(rejection(run(f.state, back))).toBeUndefined();
    expect(findById(f.state.decor, id)).toMatchObject({ fx: old.fx, fz: old.fz, rot: old.rot });
  });

  it('refuses water, a building, another piece, bad input and a missing id', () => {
    const f = hamletFixture();
    const id = f.decor.benches[0]!;
    const move = (fx: number, fz: number, rot = 0) =>
      rejection(run(f.state, { t: 'decor.move', id, fx, fz, rot }));
    expect(move(fp(100), fp(60))).toBe('WATER');
    expect(move(fp(53), fp(48))).toBe('OCCUPIED');
    const other = findById(f.state.decor, f.decor.benches[1]!)!;
    expect(move(other.fx, other.fz)).toBe('OCCUPIED');
    expect(move(fp(60), fp(55), 64)).toBe('INVALID');
    expect(move(1.5, 4)).toBe('INVALID');
    expect(rejection(run(f.state, { t: 'decor.move', id: 9999, fx: fp(60), fz: fp(55), rot: 0 }))).toBe(
      'NOT_FOUND',
    );
  });

  it('keeps the festival flag', () => {
    const f = hamletFixture();
    const id = f.decor.lanterns[0]!;
    findById(f.state.decor, id)!.festival = { kept: true };
    run(f.state, { t: 'decor.move', id, fx: fp(60), fz: fp(55), rot: 0 });
    expect(findById(f.state.decor, id)!.festival).toEqual({ kept: true });
  });
});

describe('build.move', () => {
  it('refuses water, an occupied tile, another building and bad input', () => {
    const f = hamletFixture();
    const id = f.b.cottages[0];
    const move = (x: number, z: number, rot = 0) =>
      rejection(run(f.state, { t: 'build.move', id, x, z, rot: rot as 0 }));
    expect(move(99, 60)).toBe('WATER');
    expect(move(56, 48)).toBe('OCCUPIED');
    expect(move(52, 50)).toBe('OCCUPIED');
    expect(move(-1, 48)).toBe('OUT_OF_BOUNDS');
    expect(move(60, 60, 4)).toBe('INVALID');
    expect(rejection(run(f.state, { t: 'build.move', id: 9999, x: 60, z: 60, rot: 0 }))).toBe('NOT_FOUND');
  });

  it('allows a spot that overlaps only its own old footprint', () => {
    const f = hamletFixture();
    const c = building(f.state, f.b.cottages[0]);
    const oldX = c.x;
    const def = content.buildingById.get('cottage')!;
    expect(canPlaceBuilding(worldIndex(f.state).reader, def, oldX + 1, c.z, 0).ok).toBe(false);
    expect(
      rejection(run(f.state, { t: 'build.move', id: c.id, x: oldX + 1, z: c.z, rot: 0 })),
    ).toBeUndefined();
    expect(c.x).toBe(oldX + 1);
    expect(f.state.map.occupant[c.z * S + oldX]).toBe(0);
    expect(f.state.map.occupant[c.z * S + oldX + 2]).toBe(c.id);
  });

  it('keeps identity, runtime and stores, and raises it again for a third of the work, no materials', () => {
    const f = hamletFixture();
    const sh = building(f.state, f.b.storehouse);
    const goodsBefore = [...sh.rt!.store];
    const treasury = f.state.economy.treasury;
    const def = content.buildingById.get('storehouse')!;
    const ctx = run(f.state, { t: 'build.move', id: sh.id, x: sh.x, z: sh.z, rot: 0 });
    expect(rejection(ctx)).toBeUndefined();
    expect(sh.id).toBe(f.b.storehouse);
    expect(sh.stage).toBe('construction');
    const c = sh.rt!.construction!;
    expect(c.work).toBe(Math.ceil(((def.work ?? 8) * TICKS_PER_HOUR) / 3));
    expect(c.needs.every((n) => n === 0)).toBe(true);
    expect(c.delivered.every((n) => n === 0)).toBe(true);
    expect(sh.rt!.store).toEqual(goodsBefore);
    expect(f.state.economy.treasury).toBe(treasury);
    expect(ctx.events.some((e) => e.e === 'building.updated')).toBe(true);
    // Builders finish it, and the runtime is intact.
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticksUntil(f.state, (s) => findById(s.buildings, sh.id)!.stage === 'built', 10 * TICKS_PER_HOUR);
    expect(sh.stage).toBe('built');
    expect(sh.rt!.construction).toBeNull();
    expect(sh.rt!.store).toEqual(goodsBefore);
  });

  it('keeps households housed and workers employed while it is raised again', () => {
    const f = hamletFixture();
    const c = building(f.state, f.b.cottages[0]);
    const bakery = building(f.state, f.b.bakery);
    const workers = [...bakery.rt!.workers];
    run(f.state, { t: 'build.move', id: c.id, x: c.x + 1, z: c.z, rot: 0 });
    run(f.state, { t: 'build.move', id: bakery.id, x: bakery.x, z: bakery.z, rot: 0 });
    expect(f.state.households[0]!.homeId).toBe(c.id);
    for (const r of f.state.residents) {
      if (r.inside === c.id) expect(r.tile).toBe((c.z + 2) * S + c.x + 1);
    }
    untilHour(f.state, 8);
    ticksUntil(f.state, () => false, TICKS_PER_HOUR);
    expect(f.state.households[0]!.homeId).toBe(c.id);
    expect(bakery.rt!.workers).toEqual(workers);
  });

  it('moves a site that is still going up as it is', () => {
    const f = hamletFixture();
    run(f.state, { t: 'build.place', def: 'cottage', x: 52, z: 51, rot: 2 });
    const site = f.state.buildings[f.state.buildings.length - 1]!;
    const before = JSON.stringify(site.rt!.construction);
    expect(rejection(run(f.state, { t: 'build.move', id: site.id, x: 52, z: 52, rot: 2 }))).toBeUndefined();
    expect(site.stage).toBe('construction');
    expect(JSON.stringify(site.rt!.construction)).toBe(before);
  });

  it('refuses the town hall, a grown building, walls, gates and bridges', () => {
    const f = hamletFixture();
    const move = (id: number) => rejection(run(f.state, { t: 'build.move', id, x: 60, z: 60, rot: 0 }));
    expect(move(f.b.townHall)).toBe('HALL_STAYS');
    const grown = building(f.state, f.b.cottages[0]);
    grown.lot = 5;
    expect(move(grown.id)).toBe('NOT_ALLOWED');
    let checked = 0;
    for (const def of content.buildings) {
      const stays =
        def.tags?.includes('wall') ||
        def.defense?.blocks ||
        def.defense?.passable === 'gate' ||
        def.category === 'landmark' ||
        def.tags?.includes('bridge');
      if (!stays) continue;
      const b = { ...f.state.buildings[0]!, id: 9000 + checked, def: def.id, lot: undefined };
      f.state.buildings.push(b);
      expect(move(b.id)).toBe('NOT_ALLOWED');
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('moves back to undo', () => {
    const f = hamletFixture();
    const c = building(f.state, f.b.cottages[0]);
    const old = { x: c.x, z: c.z, rot: c.rot };
    run(f.state, { t: 'build.move', id: c.id, x: 60, z: 53, rot: 1 });
    expect(rejection(run(f.state, { t: 'build.move', id: c.id, ...old }))).toBeUndefined();
    expect({ x: c.x, z: c.z, rot: c.rot }).toEqual(old);
  });

  it('in a sandbox moves at once and stays built', () => {
    const state = flatWorld();
    run(state, { t: 'build.place', def: 'cottage', x: 60, z: 60, rot: 0 });
    const b = state.buildings[0]!;
    expect(rejection(run(state, { t: 'build.move', id: b.id, x: 70, z: 60, rot: 0 }))).toBeUndefined();
    expect(b).toMatchObject({ x: 70, z: 60, stage: 'built' });
    expect(state.map.occupant[60 * S + 60]).toBe(0);
    expect(state.map.occupant[60 * S + 70]).toBe(b.id);
  });
});
