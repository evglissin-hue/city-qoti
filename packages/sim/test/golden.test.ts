import { describe, expect, it } from 'vitest';
import type { Turn, ValleySettings } from '../src/contracts';
import { createWorld } from '../src/state/create';
import { hashState } from '../src/state/hash';
import { deserialize, serialize } from '../src/state/serialize';
import { advanceTo, applyTurns, createTickCtx } from '../src/turn';
import golden from './golden/i0-basic.json';

interface GoldenScript {
  seed: string;
  settings: ValleySettings;
  lastTurn: number;
  turns: Turn[];
}

const script = golden as GoldenScript;

function replay(upTo = script.lastTurn) {
  const world = createWorld(script.seed, script.settings);
  const ctx = createTickCtx(world);
  applyTurns(
    world,
    script.turns.filter((t) => t.t <= upTo),
    ctx,
  );
  advanceTo(world, upTo, ctx);
  return world;
}

describe('golden script i0-basic', () => {
  it('holds 2,000 turns of mixed commands', () => {
    expect(script.lastTurn).toBe(2000);
    const kinds = new Set(script.turns.flatMap((t) => t.cmds.map((c) => c.cmd.t)));
    for (const kind of [
      'road.paint',
      'build.place',
      'decor.place',
      'decor.placeRun',
      'tree.plant',
      'note.pin',
    ]) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
  });

  it('replays twice to the same hash', () => {
    const a = replay();
    const b = replay();
    expect(a.lastTurn).toBe(2000);
    expect(hashState(a)).toBe(hashState(b));
    expect(a.buildings.length).toBeGreaterThan(10);
  });

  it('resumes from a mid-script snapshot to the same hash', () => {
    const straight = replay();
    const mid = deserialize(serialize(replay(1000)));
    const ctx = createTickCtx(mid);
    applyTurns(
      mid,
      script.turns.filter((t) => t.t > 1000),
      ctx,
    );
    advanceTo(mid, script.lastTurn, ctx);
    expect(hashState(mid)).toBe(hashState(straight));
  });
});
