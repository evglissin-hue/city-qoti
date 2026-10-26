import { describe, expect, it } from 'vitest';
import { commandHandlers } from '../src/commands';
import { DECOR_CAP } from '../src/constants';
import type { Command, SimEvent } from '../src/contracts';
import { Road, treeValue } from '../src/map/layers';
import { worldIndex } from '../src/state/worldIndex';
import { flatWorld, rejection, run, S, tile } from './helpers';

const fp = (t: number) => t * 256 + 128;

function eventsOf<K extends SimEvent['e']>(events: SimEvent[], kind: K): Extract<SimEvent, { e: K }>[] {
  return events.filter((e): e is Extract<SimEvent, { e: K }> => e.e === kind);
}

describe('command registry', () => {
  it('registers every I0, I1 and I2 command once, sorted by type', () => {
    const types = commandHandlers.map((h) => h.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types).toEqual([...types].sort());
    expect(types.length).toBeGreaterThanOrEqual(42); // 41 in C4.0, plus plan.edit (C4D)
  });
});

describe('road commands', () => {
  it('paints a path, clears trees and reports the change', () => {
    const w = flatWorld();
    w.map.tree[50 * S + 51] = treeValue(1, 3);
    const ctx = run(w, {
      t: 'road.paint',
      kind: 'path',
      tiles: [
        [50, 50],
        [51, 50],
      ],
    });
    expect(tile(w, 'road', 50, 50)).toBe(Road.path);
    expect(tile(w, 'tree', 51, 50)).toBe(0);
    expect(eventsOf(ctx.events, 'tiles.changed')[0]).toEqual({
      e: 'tiles.changed',
      rect: [50, 50, 51, 50],
      layers: ['road', 'tree'],
    });
    expect(ctx.dirty.collectPatches(w.map).map((p) => p.layer)).toEqual(['road', 'tree']);
  });

  it('rejects a bad run without changing anything', () => {
    const w = flatWorld();
    const ctx = run(
      w,
      {
        t: 'road.paint',
        kind: 'lane',
        tiles: [
          [99, 5],
          [100, 5],
        ],
      },
      1,
      7,
    );
    expect(tile(w, 'road', 99, 5)).toBe(0);
    expect(eventsOf(ctx.events, 'command.rejected')).toEqual([
      { e: 'command.rejected', seat: 1, seq: 7, reason: 'WATER', detail: '100,5' },
    ]);
  });

  it('removes roads, and says NOT_FOUND when there are none', () => {
    const w = flatWorld();
    run(w, { t: 'road.paint', kind: 'lane', tiles: [[10, 10]] });
    run(w, { t: 'road.remove', tiles: [[10, 10]] });
    expect(tile(w, 'road', 10, 10)).toBe(0);
    expect(rejection(run(w, { t: 'road.remove', tiles: [[10, 10]] }))).toBe('NOT_FOUND');
    expect(rejection(run(w, { t: 'road.remove', tiles: [] }))).toBe('INVALID');
  });
});

describe('building commands', () => {
  it('places a cottage instantly in sandbox and marks its footprint', () => {
    const w = flatWorld();
    w.map.tree[51 * S + 51] = treeValue(2, 3);
    const ctx = run(w, { t: 'build.place', def: 'cottage', x: 50, z: 50, rot: 1 }, 1);
    expect(w.buildings).toHaveLength(1);
    const b = w.buildings[0]!;
    expect(b).toMatchObject({
      id: 1,
      def: 'cottage',
      builtBy: 1,
      stage: 'built',
      handmade: false,
      foundation: false,
    });
    for (const [x, z] of [
      [50, 50],
      [51, 50],
      [50, 51],
      [51, 51],
    ] as const)
      expect(tile(w, 'occupant', x, z)).toBe(1);
    expect(tile(w, 'tree', 51, 51)).toBe(0);
    expect(eventsOf(ctx.events, 'building.added')[0]!.b.id).toBe(1);
    expect(w.nextId).toBe(2);
  });

  it('rejects unknown defs and bad spots', () => {
    const w = flatWorld();
    expect(rejection(run(w, { t: 'build.place', def: 'castle', x: 50, z: 50, rot: 0 }))).toBe('INVALID');
    expect(rejection(run(w, { t: 'build.place', def: 'house', x: 100, z: 50, rot: 0 }))).toBe('WATER');
    expect(w.buildings).toHaveLength(0);
  });

  it('removes buildings and frees their tiles', () => {
    const w = flatWorld();
    run(w, { t: 'build.place', def: 'town-hall', x: 60, z: 60, rot: 0 });
    const ctx = run(w, { t: 'build.remove', ids: [1] });
    expect(w.buildings).toHaveLength(0);
    expect(tile(w, 'occupant', 61, 61)).toBe(0);
    expect(eventsOf(ctx.events, 'building.removed')).toEqual([{ e: 'building.removed', id: 1 }]);
    expect(rejection(run(w, { t: 'build.remove', ids: [1] }))).toBe('NOT_FOUND');
  });
});

describe('decor commands', () => {
  it('places, indexes and removes decor', () => {
    const w = flatWorld();
    run(w, { t: 'decor.place', def: 'bench', fx: fp(40), fz: fp(40), rot: 12 }, 1);
    expect(w.decor[0]).toEqual({ id: 1, def: 'bench', fx: fp(40), fz: fp(40), rot: 12, builtBy: 1 });
    expect(worldIndex(w).decorGrid.near(fp(40), fp(40), 10)).toHaveLength(1);
    // Seat 0 may remove seat 1's handmade decor: the confirmation lives in the client.
    const ctx = run(w, { t: 'decor.remove', ids: [1] }, 0);
    expect(w.decor).toHaveLength(0);
    expect(worldIndex(w).decorGrid.near(fp(40), fp(40), 10)).toHaveLength(0);
    expect(eventsOf(ctx.events, 'decor.removed')).toHaveLength(1);
  });

  it('places a fence run as aligned segments', () => {
    const w = flatWorld();
    const ctx = run(w, { t: 'decor.placeRun', def: 'fence', from: [fp(30), fp(60)], to: [fp(30), fp(64)] });
    expect(w.decor).toHaveLength(4);
    expect(w.decor.every((d) => d.rot === 16 && d.def === 'fence')).toBe(true);
    expect(eventsOf(ctx.events, 'decor.added')).toHaveLength(4);
  });

  it('enforces the decor cap', () => {
    const w = flatWorld();
    for (let i = 0; i < DECOR_CAP; i++)
      w.decor.push({ id: 1000 + i, def: 'bench', fx: 10, fz: 10, rot: 0, builtBy: 0 });
    expect(rejection(run(w, { t: 'decor.place', def: 'bench', fx: fp(40), fz: fp(40), rot: 0 }))).toBe(
      'TOO_MANY',
    );
  });
});

describe('tree commands', () => {
  it('plants a sapling and removes trees', () => {
    const w = flatWorld();
    run(w, { t: 'tree.plant', species: 'birch', x: 33, z: 44 });
    expect(tile(w, 'tree', 33, 44)).toBe(treeValue(2, 0));
    expect(rejection(run(w, { t: 'tree.plant', species: 'oak', x: 33, z: 44 }))).toBe('OCCUPIED');
    expect(rejection(run(w, { t: 'tree.plant', species: 'palm' as never, x: 34, z: 44 }))).toBe('INVALID');
    run(w, { t: 'tree.remove', tiles: [[33, 44]] });
    expect(tile(w, 'tree', 33, 44)).toBe(0);
    expect(rejection(run(w, { t: 'tree.remove', tiles: [[33, 44]] }))).toBe('NOT_FOUND');
  });
});

describe('note commands', () => {
  it('pins and removes notes, trimming text', () => {
    const w = flatWorld();
    run(w, { t: 'note.pin', x: 12, z: 13, text: '  Bakery goes here  ' }, 1);
    expect(w.notes[0]).toMatchObject({ id: 1, x: 12, z: 13, text: 'Bakery goes here', by: 1 });
    expect(rejection(run(w, { t: 'note.pin', x: 12, z: 13, text: '   ' }))).toBe('INVALID');
    expect(rejection(run(w, { t: 'note.pin', x: 12, z: 13, text: 'x'.repeat(201) }))).toBe('INVALID');
    expect(rejection(run(w, { t: 'note.pin', x: 500, z: 13, text: 'far' }))).toBe('OUT_OF_BOUNDS');
    run(w, { t: 'note.remove', id: 1 });
    expect(w.notes).toHaveLength(0);
    expect(rejection(run(w, { t: 'note.remove', id: 1 }))).toBe('NOT_FOUND');
  });
});

describe('time, seat and valley commands', () => {
  it('sets desired speed per seat; effective speed is the minimum', () => {
    const w = flatWorld();
    run(w, { t: 'time.setSpeed', speed: 3 }, 0);
    const ctx = run(w, { t: 'time.setSpeed', speed: 2 }, 1);
    expect(w.time.desired.slice(0, 2)).toEqual([3, 2]);
    expect(eventsOf(ctx.events, 'clock')[0]!.c.speed).toBe(2);
    expect(rejection(run(w, { t: 'time.setSpeed', speed: 4 as never }))).toBe('INVALID');
  });

  it('updates profiles', () => {
    const w = flatWorld();
    const ctx = run(w, { t: 'seat.setProfile', name: ' Mira ', color: 0x123456, lens: 'ledger' }, 0);
    expect(w.seats[0]).toMatchObject({ name: 'Mira', color: 0x123456, lens: 'ledger' });
    expect(eventsOf(ctx.events, 'seat.updated')[0]!.s.name).toBe('Mira');
    expect(rejection(run(w, { t: 'seat.setProfile', name: '', color: 1, lens: 'hearth' }))).toBe('INVALID');
    expect(rejection(run(w, { t: 'seat.setProfile', name: 'A', color: -1, lens: 'hearth' }))).toBe('INVALID');
  });

  it('changes valley settings field by field', () => {
    const w = flatWorld();
    const ctx = run(w, { t: 'valley.setSettings', settings: { townName: 'Bramble', togetherOnly: true } });
    expect(w.settings.townName).toBe('Bramble');
    expect(w.settings.togetherOnly).toBe(true);
    expect(eventsOf(ctx.events, 'settings.updated')).toHaveLength(1);
    expect(rejection(run(w, { t: 'valley.setSettings', settings: {} }))).toBe('INVALID');
    expect(rejection(run(w, { t: 'valley.setSettings', settings: { threat: 'apocalyptic' as never } }))).toBe(
      'INVALID',
    );
  });
});

describe('sys commands and together-only valleys', () => {
  it('tracks connected seats', () => {
    const w = flatWorld();
    w.time.connected = [];
    w.seats = [];
    run(w, { t: 'sys.seatJoined', seat: 1 }, 1, 0);
    run(w, { t: 'sys.seatJoined', seat: 0 }, 0, 0);
    expect(w.time.connected).toEqual([0, 1]);
    expect(w.seats.map((s) => s.seat)).toEqual([0, 1]);
    run(w, { t: 'sys.seatLeft', seat: 1 }, 1, 0);
    expect(w.time.connected).toEqual([0]);
  });

  it('only accepts notes, profiles and settings while a together-only seat is alone', () => {
    const w = flatWorld();
    w.settings.togetherOnly = true;
    w.time.connected = [0];
    const blocked: Command = { t: 'build.place', def: 'well', x: 50, z: 50, rot: 0 };
    expect(rejection(run(w, blocked))).toBe('TOGETHER_ONLY');
    expect(rejection(run(w, { t: 'note.pin', x: 1, z: 1, text: 'hi' }))).toBeUndefined();
    expect(w.tick).toBe(0); // alone in a together-only valley: time stands still
  });

  it('rejects unknown and malformed commands without throwing', () => {
    const w = flatWorld();
    expect(rejection(run(w, { t: 'dance.party' } as never))).toBe('INVALID');
    expect(rejection(run(w, { t: 'road.paint', kind: 'path', tiles: 'nope' } as never))).toBe('INVALID');
    expect(rejection(run(w, { t: 'decor.placeRun', def: 'fence', from: null, to: [1, 2] } as never))).toBe(
      'INVALID',
    );
  });
});
