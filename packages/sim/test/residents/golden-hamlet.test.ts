import { describe, expect, it } from 'vitest';
import type { Turn, ValleySettings } from '../../src/contracts';
import { createWorld } from '../../src/state/create';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { advanceTo, applyTurns, createTickCtx } from '../../src/turn';
import golden from '../golden/i1-hamlet.json';

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
  const kinds = new Map<string, number>();
  applyTurns(
    world,
    script.turns.filter((t) => t.t <= upTo),
    ctx,
  );
  advanceTo(world, upTo, ctx);
  for (const e of ctx.events) kinds.set(e.e, (kinds.get(e.e) ?? 0) + 1);
  return { world, kinds };
}

let first: ReturnType<typeof replay> | null = null;
const straight = () => (first ??= replay());

describe('golden script i1-hamlet', () => {
  it('plays a standard valley for over two in-game days with real commands', () => {
    expect(script.settings.mode).toBe('standard');
    const kinds = new Set(script.turns.flatMap((t) => t.cmds.map((c) => c.cmd.t)));
    for (const kind of ['road.paint', 'decor.place', 'build.place', 'build.remove', 'time.setSpeed']) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
    const { world, kinds: events } = straight();
    expect(world.tick).toBeGreaterThan(2 * 4800);
    expect(world.stats.arrivals).toBe(2);
    expect(events.get('resident.added')).toBe(8);
    expect(events.get('chronicle.added')).toBeGreaterThanOrEqual(3);
  });

  it('replays twice to the same hash', () => {
    const a = straight().world;
    const b = replay().world;
    expect(hashState(a)).toBe(hashState(b));
  });

  it('resumes from a mid-script snapshot (residents mid-walk) to the same hash', () => {
    const half = Math.floor(script.lastTurn * 0.55);
    const mid = deserialize(serialize(replay(half).world));
    expect(mid.residents.some((r) => r.move)).toBe(true);
    const ctx = createTickCtx(mid);
    applyTurns(
      mid,
      script.turns.filter((t) => t.t > half),
      ctx,
    );
    advanceTo(mid, script.lastTurn, ctx);
    expect(hashState(mid)).toBe(hashState(straight().world));
  });
});
