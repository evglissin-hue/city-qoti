import { content } from '@qoti/content';
import {
  applyTurn,
  buildView,
  canPaintRoad,
  canPlaceBuilding,
  canPlaceDecor,
  createTickCtx,
  createWorld,
  defaultSettings,
  UNDO_DEPTH,
  worldIndex,
  type Command,
  type ValleySettings,
} from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { Mirror } from './mirror';
import { UndoStack } from './undo';

/**
 * A world, its mirror and seat 0's undo stack, wired the way the session wires them: submit
 * records the command, the turn carries it, the mirror applies the update, the stack observes.
 */
function rig(seed: string, settings: Partial<ValleySettings> = {}) {
  const world = createWorld(seed, { ...defaultSettings(), ...settings });
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
    const change = mirror.apply(update);
    undo.observe(change, mirror);
    return change;
  };
  /** Submits without recording (undo's own inverses). */
  const raw = (cmd: Command) => {
    queue.push({ seq: ++seq, cmd });
    return seq;
  };
  /** Submits and records, like Session.submit. */
  const submit = (cmd: Command) => {
    const before = undo.prepare(cmd, mirror);
    const s = raw(cmd);
    if (before) undo.submitted(s, cmd, before, mirror.lastTurn.value);
    return s;
  };
  raw({ t: 'sys.seatJoined', seat: 0 });
  turn();
  const [x0, z0, x1, z1] = world.meta.startArea;
  const center: [number, number] = [Math.floor((x0 + x1) / 2), Math.floor((z0 + z1) / 2)];
  return { world, mirror, undo, submit, raw, turn, center };
}

function buildingSpot(r: ReturnType<typeof rig>, def: string): [number, number] {
  const d = content.buildingById.get(def)!;
  const reader = worldIndex(r.world).reader;
  for (let dz = -15; dz <= 15; dz++) {
    for (let dx = -15; dx <= 15; dx++) {
      const x = r.center[0] + dx;
      const z = r.center[1] + dz;
      if (canPlaceBuilding(reader, d, x, z, 0).ok) return [x, z];
    }
  }
  throw new Error('no spot');
}

describe('UndoStack', () => {
  it('undoes a placed building, and a removal puts it back', () => {
    const r = rig('undo-place');
    const [x, z] = buildingSpot(r, 'house');
    r.submit({ t: 'build.place', def: 'house', x, z, rot: 0 });
    r.turn();
    expect(r.mirror.buildings.size).toBe(1);
    expect(r.undo.size.value).toBe(1);
    const out = r.undo.undo(r.mirror, r.raw);
    expect(out).toMatchObject({ ok: true, label: 'the house' });
    r.turn();
    expect(r.mirror.buildings.size).toBe(0);
    expect(r.undo.size.value).toBe(0);

    r.submit({ t: 'build.place', def: 'house', x, z, rot: 1 });
    r.turn();
    const id = [...r.mirror.buildings.keys()][0]!;
    r.submit({ t: 'build.remove', ids: [id] });
    r.turn();
    expect(r.mirror.buildings.size).toBe(0);
    r.undo.undo(r.mirror, r.raw);
    r.turn();
    const back = [...r.mirror.buildings.values()];
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ def: 'house', x, z, rot: 1 });
  });

  it('undoes painted paths, keeping roads that were already there', () => {
    const r = rig('undo-paint');
    const reader = worldIndex(r.world).reader;
    let tiles: [number, number][] = [];
    for (let dz = -10; dz <= 10 && !tiles.length; dz++) {
      const run: [number, number][] = [0, 1, 2, 3, 4].map((i) => [r.center[0] + i, r.center[1] + dz]);
      if (canPaintRoad(reader, 'path', run).ok && run.every(([x, z]) => !r.mirror.road(x, z))) tiles = run;
    }
    expect(tiles.length).toBe(5);
    r.submit({ t: 'road.paint', kind: 'path', tiles: tiles.slice(0, 2) });
    r.turn();
    r.submit({ t: 'road.paint', kind: 'lane', tiles });
    r.turn();
    expect(tiles.every(([x, z]) => r.mirror.road(x, z) === 2)).toBe(true);
    r.undo.undo(r.mirror, r.raw);
    r.turn();
    expect(tiles.map(([x, z]) => r.mirror.road(x, z))).toEqual([1, 1, 0, 0, 0]);
    r.undo.undo(r.mirror, r.raw);
    r.turn();
    expect(tiles.map(([x, z]) => r.mirror.road(x, z))).toEqual([0, 0, 0, 0, 0]);
  });

  it('refuses gently when the target changed since', () => {
    const r = rig('undo-changed');
    const [x, z] = buildingSpot(r, 'house');
    r.submit({ t: 'build.place', def: 'house', x, z, rot: 0 });
    r.turn();
    const id = [...r.mirror.buildings.keys()][0]!;
    // The partner (or anything else) removes it first.
    r.raw({ t: 'build.remove', ids: [id] });
    r.turn();
    expect(r.undo.undo(r.mirror, r.raw)).toEqual({ ok: false, reason: 'CHANGED' });
    expect(r.undo.undo(r.mirror, r.raw)).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('does not record rejected commands', () => {
    const r = rig('undo-rejected');
    r.submit({ t: 'build.place', def: 'house', x: -4, z: 0, rot: 0 });
    const change = r.turn();
    expect(change.rejections).toHaveLength(1);
    expect(r.undo.size.value).toBe(0);
  });

  it('undoes decor and notes', () => {
    const r = rig('undo-decor');
    const def = content.decorById.get('bench')!;
    const reader = worldIndex(r.world).reader;
    let spot: [number, number] | null = null;
    for (let i = 0; i < 400 && !spot; i++) {
      const fx = (r.center[0] + (i % 20) - 10) * 256 + 128;
      const fz = (r.center[1] + Math.floor(i / 20) - 10) * 256 + 128;
      if (canPlaceDecor(reader, def, fx, fz, 0).ok) spot = [fx, fz];
    }
    r.submit({ t: 'decor.place', def: 'bench', fx: spot![0], fz: spot![1], rot: 0 });
    r.turn();
    const id = [...r.mirror.decor.keys()][0]!;
    r.submit({ t: 'decor.remove', ids: [id] });
    r.turn();
    expect(r.mirror.decor.size).toBe(0);
    r.undo.undo(r.mirror, r.raw);
    r.turn();
    expect([...r.mirror.decor.values()][0]).toMatchObject({ def: 'bench', fx: spot![0], fz: spot![1] });

    r.submit({ t: 'note.pin', x: r.center[0], z: r.center[1], text: 'Tea at four?' });
    r.turn();
    expect(r.mirror.notes.size).toBe(1);
    r.undo.undo(r.mirror, r.raw);
    r.turn();
    expect(r.mirror.notes.size).toBe(0);
  });

  it('builds inverses for customize, priority, pause, fields and sales', () => {
    const r = rig('undo-hamlet', { mode: 'standard' });
    const hall = [...r.mirror.buildings.values()].find((b) => b.def === 'town-hall')!;
    const before = r.undo.prepare({ t: 'build.customize', id: hall.id, custom: { wall: 'rose' } }, r.mirror);
    expect(before).toEqual({ t: 'custom', values: { wall: null } });
    expect(r.undo.prepare({ t: 'build.setPaused', id: hall.id, paused: true }, r.mirror)).toEqual({
      t: 'flag',
      value: false,
    });
    expect(r.undo.prepare({ t: 'field.paint', farm: hall.id, tiles: [[1, 1]] }, r.mirror)).toEqual({
      t: 'tiles',
      values: [0],
    });
    // Speed and profile changes are not undoable.
    expect(r.undo.prepare({ t: 'time.setSpeed', speed: 2 }, r.mirror)).toBeNull();
  });

  it(`keeps only the last ${UNDO_DEPTH}`, () => {
    const r = rig('undo-depth');
    for (let i = 0; i < UNDO_DEPTH + 5; i++) {
      r.submit({
        t: 'note.pin',
        x: r.center[0] + (i % 6),
        z: r.center[1] + Math.floor(i / 6),
        text: `n${i}`,
      });
      r.turn();
    }
    expect(r.undo.size.value).toBe(UNDO_DEPTH);
  });
});

describe('UndoStack, moves (R1D)', () => {
  it('undoes a building move and a decor move by moving back', () => {
    const r = rig('undo-move', { mode: 'sandbox' });
    const [x, z] = buildingSpot(r, 'house');
    r.submit({ t: 'build.place', def: 'house', x, z, rot: 0 });
    r.turn();
    const id = [...r.mirror.buildings.keys()][0]!;
    r.submit({ t: 'build.move', id, x: x + 5, z, rot: 1 });
    r.turn();
    expect(r.mirror.buildings.get(id)).toMatchObject({ x: x + 5, z, rot: 1 });
    expect(r.undo.labels().at(-1)).toBe('moving the house');
    expect(r.undo.undo(r.mirror, r.raw)).toMatchObject({ ok: true });
    r.turn();
    expect(r.mirror.buildings.get(id)).toMatchObject({ x, z, rot: 0 });

    const def = content.decorById.get('bench')!;
    const reader = worldIndex(r.world).reader;
    let spot: [number, number] | null = null;
    for (let i = 0; i < 400 && !spot; i++) {
      const fx = (r.center[0] + (i % 20) - 10) * 256 + 128;
      const fz = (r.center[1] + Math.floor(i / 20) - 10) * 256 + 128;
      if (canPlaceDecor(reader, def, fx, fz, 0).ok) spot = [fx, fz];
    }
    r.submit({ t: 'decor.place', def: 'bench', fx: spot![0], fz: spot![1], rot: 0 });
    r.turn();
    const did = [...r.mirror.decor.keys()][0]!;
    r.submit({ t: 'decor.move', id: did, fx: spot![0] + 512, fz: spot![1], rot: 8 });
    r.turn();
    expect(r.mirror.decor.get(did)).toMatchObject({ fx: spot![0] + 512, rot: 8 });
    r.undo.undo(r.mirror, r.raw);
    r.turn();
    expect(r.mirror.decor.get(did)).toMatchObject({ fx: spot![0], fz: spot![1], rot: 0 });
  });

  it('refuses to undo a move when the piece has moved on', () => {
    const r = rig('undo-move-changed', { mode: 'sandbox' });
    const [x, z] = buildingSpot(r, 'house');
    r.submit({ t: 'build.place', def: 'house', x, z, rot: 0 });
    r.turn();
    const id = [...r.mirror.buildings.keys()][0]!;
    r.submit({ t: 'build.move', id, x: x + 5, z, rot: 0 });
    r.turn();
    r.raw({ t: 'build.move', id, x: x + 9, z, rot: 0 });
    r.turn();
    expect(r.undo.undo(r.mirror, r.raw)).toEqual({ ok: false, reason: 'CHANGED' });
  });
});

describe('UndoStack, the carrier (R1C)', () => {
  const standard = { mode: 'standard', economy: 'standard' } as const;
  const food = (r: ReturnType<typeof rig>) =>
    r.mirror.balances.value!.lines.find((l) => l.family === 'food')!;

  it('undoes a rule and the selling switch together, back to the old terms', () => {
    const r = rig('undo-carrier-rule', standard);
    const before = { rule: food(r).rule, sell: food(r).sell };
    r.submit({ t: 'carrier.setRule', family: 'food', rule: 'never', sell: !before.sell });
    r.turn();
    expect(food(r)).toMatchObject({ rule: 'never', sell: !before.sell });
    expect(r.undo.undo(r.mirror, r.raw)).toMatchObject({ ok: true });
    r.turn();
    expect(food(r)).toMatchObject(before);
  });

  it('undoes a reserve, and a budget, one family or purse at a time', () => {
    const r = rig('undo-carrier-reserve', standard);
    const reserve = food(r).reserve;
    const budget = r.mirror.balances.value!.budget;
    r.submit({ t: 'carrier.setReserve', family: 'food', reserve: reserve + 2 });
    r.turn();
    r.submit({ t: 'carrier.setBudget', coins: 77 });
    r.turn();
    expect(food(r).reserve).toBe(reserve + 2);
    expect(r.mirror.balances.value!.budget).toBe(7700);
    r.undo.undo(r.mirror, r.raw);
    r.turn();
    expect(r.mirror.balances.value!.budget).toBe(budget);
    expect(food(r).reserve).toBe(reserve + 2);
    r.undo.undo(r.mirror, r.raw);
    r.turn();
    expect(food(r).reserve).toBe(reserve);
  });

  it('says CHANGED when the partner set the family since', () => {
    const r = rig('undo-carrier-changed', standard);
    r.submit({ t: 'carrier.setReserve', family: 'fuel', reserve: 9 });
    r.turn();
    r.raw({ t: 'carrier.setReserve', family: 'fuel', reserve: 4 });
    r.turn();
    expect(r.undo.undo(r.mirror, r.raw)).toEqual({ ok: false, reason: 'CHANGED' });
  });
});

describe('UndoStack, the season plan (R1C)', () => {
  const standard = { mode: 'standard', economy: 'standard' } as const;
  const plan = (r: ReturnType<typeof rig>) => r.mirror.balances.value!.plan;

  it('puts back only the answer it changed', () => {
    const r = rig('undo-plan', standard);
    const before = { ...plan(r) };
    r.submit({ t: 'season.setPlan', plan: { food: 12, fuel: 10 } });
    r.turn();
    r.submit({ t: 'season.setPlan', plan: { buildFirst: 'farms' } });
    r.turn();
    expect(plan(r)).toMatchObject({ food: 12, fuel: 10, buildFirst: 'farms' });
    expect(r.undo.undo(r.mirror, r.raw)).toMatchObject({ ok: true });
    r.turn();
    expect(plan(r)).toMatchObject({ food: 12, fuel: 10, buildFirst: before.buildFirst });
    r.undo.undo(r.mirror, r.raw);
    r.turn();
    expect(plan(r)).toEqual(before);
  });

  it('says CHANGED when the partner answered the same question since', () => {
    const r = rig('undo-plan-changed', standard);
    r.submit({ t: 'season.setPlan', plan: { reserve: 10 } });
    r.turn();
    r.raw({ t: 'season.setPlan', plan: { reserve: 6 } });
    r.turn();
    expect(r.undo.undo(r.mirror, r.raw)).toEqual({ ok: false, reason: 'CHANGED' });
  });
});
