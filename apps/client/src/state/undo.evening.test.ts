import {
  applyTurn,
  buildView,
  canPaintRoad,
  createTickCtx,
  createWorld,
  defaultSettings,
  worldIndex,
  type Command,
  type PlaceView,
  type SimEvent,
  type StreetView,
} from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { mockView } from '../ui/mocks/session';
import { Mirror } from './mirror';
import { UndoStack } from './undo';

// R2D: undo for the evening street brush and the two renames.
function realRig(seed: string) {
  const world = createWorld(seed, defaultSettings());
  const ctx = createTickCtx(world);
  const mirror = new Mirror();
  mirror.load(buildView(world));
  const undo = new UndoStack(0);
  let seq = 0;
  const queue: { seq: number; cmd: Command }[] = [];
  const turn = () => {
    const t = { t: world.lastTurn + 1, cmds: queue.splice(0).map((q) => ({ seat: 0 as const, ...q })) };
    undo.sawTurn(t);
    applyTurn(world, t, ctx);
    const update = {
      t: world.lastTurn,
      tick: world.tick,
      events: ctx.events,
      patches: ctx.dirty.collectPatches(world.map),
    };
    ctx.events = [];
    undo.observe(mirror.apply(update), mirror);
  };
  const raw = (cmd: Command) => {
    queue.push({ seq: ++seq, cmd });
    return seq;
  };
  const submit = (cmd: Command) => {
    const before = undo.prepare(cmd, mirror);
    const s = raw(cmd);
    if (before) undo.submitted(s, cmd, before, mirror.lastTurn.value);
  };
  raw({ t: 'sys.seatJoined', seat: 0 });
  turn();
  const [x0, z0, x1, z1] = world.meta.startArea;
  const center: [number, number] = [Math.floor((x0 + x1) / 2), Math.floor((z0 + z1) / 2)];
  return { world, mirror, undo, submit, raw, turn, center };
}

describe('undo for evening streets', () => {
  it('puts the old marks back, only on the tiles the command flipped', () => {
    const r = realRig('undo-evening');
    const reader = worldIndex(r.world).reader;
    let tiles: [number, number][] = [];
    for (let dz = -10; dz <= 10 && !tiles.length; dz++) {
      const run: [number, number][] = [0, 1, 2, 3, 4].map((i) => [r.center[0] + i, r.center[1] + dz]);
      if (canPaintRoad(reader, 'lane', run).ok && run.every(([x, z]) => !r.mirror.road(x, z))) tiles = run;
    }
    expect(tiles.length).toBe(5);
    r.raw({ t: 'road.paint', kind: 'lane', tiles });
    r.turn();
    const marks = () => tiles.map(([x, z]) => r.mirror.eveningStreet(x, z));

    // Two tiles already kept; the brush then covers all five.
    r.raw({ t: 'road.setEvening', tiles: tiles.slice(0, 2), on: true });
    r.turn();
    expect(marks()).toEqual([true, true, false, false, false]);
    r.submit({ t: 'road.setEvening', tiles, on: true });
    r.turn();
    expect(marks()).toEqual([true, true, true, true, true]);

    expect(r.undo.undo(r.mirror, r.raw)).toMatchObject({ ok: true, label: 'the evening street' });
    r.turn();
    expect(marks()).toEqual([true, true, false, false, false]);

    // Giving a stretch back to the carts is undone the other way.
    r.submit({ t: 'road.setEvening', tiles: tiles.slice(0, 2), on: false });
    r.turn();
    expect(marks()).toEqual([false, false, false, false, false]);
    r.undo.undo(r.mirror, r.raw);
    r.turn();
    expect(marks()).toEqual([true, true, false, false, false]);
  });

  it('refuses once someone else changed the marks', () => {
    const r = realRig('undo-evening-changed');
    const reader = worldIndex(r.world).reader;
    let tiles: [number, number][] = [];
    for (let dz = -10; dz <= 10 && !tiles.length; dz++) {
      const run: [number, number][] = [0, 1, 2].map((i) => [r.center[0] + i, r.center[1] + dz]);
      if (canPaintRoad(reader, 'lane', run).ok && run.every(([x, z]) => !r.mirror.road(x, z))) tiles = run;
    }
    r.raw({ t: 'road.paint', kind: 'lane', tiles });
    r.turn();
    r.submit({ t: 'road.setEvening', tiles, on: true });
    r.turn();
    r.raw({ t: 'road.setEvening', tiles: tiles.slice(1), on: false });
    r.turn();
    expect(r.undo.undo(r.mirror, r.raw)).toEqual({ ok: false, reason: 'CHANGED' });
  });
});

// The sim's answers for names are written by hand, as the hamlet tests do.
function nameRig() {
  const mirror = new Mirror();
  mirror.load(mockView());
  const undo = new UndoStack(0);
  let seq = 0;
  const sent: Command[] = [];
  const raw = (cmd: Command) => {
    sent.push(cmd);
    return ++seq;
  };
  const play = (cmd: Command, events: SimEvent[]) => {
    const before = undo.prepare(cmd, mirror);
    const s = raw(cmd);
    if (before) undo.submitted(s, cmd, before, mirror.lastTurn.value);
    const t = mirror.lastTurn.value + 1;
    undo.sawTurn({ t, cmds: [{ seat: 0, seq: s, cmd }] });
    undo.observe(mirror.apply({ t, events, patches: [] }), mirror);
  };
  const happen = (events: SimEvent[]) => {
    undo.observe(mirror.apply({ t: mirror.lastTurn.value + 1, events, patches: [] }), mirror);
  };
  return { mirror, undo, sent, raw, play, happen };
}

const street = (name: string, custom = false): StreetView => ({
  id: 7,
  name,
  generated: 'Mill Lane',
  ...(custom ? { renamedBy: 0 as const } : {}),
  anchor: 100,
  tiles: [100, 101, 102],
});

const place = (name: string, custom = false): PlaceView =>
  ({
    id: 'seats:12',
    name,
    generated: 'The Bench Corner',
    ...(custom ? { renamedBy: 0 as const } : {}),
  }) as PlaceView;

describe('undo for renames', () => {
  it('a street goes back to its generated name, then to an earlier custom one', () => {
    const r = nameRig();
    r.happen([{ e: 'streets.updated', s: [street('Mill Lane')] }]);
    r.play({ t: 'road.rename', id: 7, name: 'Cobbler Row' }, [
      { e: 'streets.updated', s: [street('Cobbler Row', true)] },
    ]);
    expect(r.undo.undo(r.mirror, r.raw)).toMatchObject({ ok: true, label: 'the rename' });
    expect(r.sent.pop()).toEqual({ t: 'road.rename', id: 7, name: '' });

    r.happen([{ e: 'streets.updated', s: [street('Cobbler Row', true)] }]);
    r.play({ t: 'road.rename', id: 7, name: 'Tinker Street' }, [
      { e: 'streets.updated', s: [street('Tinker Street', true)] },
    ]);
    r.undo.undo(r.mirror, r.raw);
    expect(r.sent.pop()).toEqual({ t: 'road.rename', id: 7, name: 'Cobbler Row' });
  });

  it('a street refuses once the partner renamed it again', () => {
    const r = nameRig();
    r.happen([{ e: 'streets.updated', s: [street('Mill Lane')] }]);
    r.play({ t: 'road.rename', id: 7, name: 'Cobbler Row' }, [
      { e: 'streets.updated', s: [street('Cobbler Row', true)] },
    ]);
    r.happen([{ e: 'streets.updated', s: [street('Rope Walk', true)] }]);
    expect(r.undo.undo(r.mirror, r.raw)).toEqual({ ok: false, reason: 'CHANGED' });
  });

  it('a place goes back to the name it wore', () => {
    const r = nameRig();
    r.happen([{ e: 'places.updated', p: { places: [place('The Bench Corner')] } }]);
    r.play({ t: 'place.rename', id: 'seats:12', name: 'Gossip Corner' }, [
      { e: 'places.updated', p: { places: [place('Gossip Corner', true)] } },
    ]);
    expect(r.undo.undo(r.mirror, r.raw)).toMatchObject({ ok: true, label: 'the rename' });
    expect(r.sent.pop()).toEqual({ t: 'place.rename', id: 'seats:12', name: '' });
  });
});
