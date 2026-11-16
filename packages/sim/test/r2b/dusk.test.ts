// R2B: dusk at half speed (docs/spec/19-evenings.md, The day in two acts: the evening lingers).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/constants';
import type { Speed, WorldState } from '../../src/contracts';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { isLingeringDusk, ticksThisTurn, withoutNightHurry } from '../../src/speed';
import { applyTurn, createTickCtx } from '../../src/turn';
import { clockView } from '../../src/view';
import { flatWorld } from '../helpers';

/** Ticks from the start (06:00) to an hour of the first day. */
const at = (hour: number) => (hour - 6) * TICKS_PER_HOUR;
const P = content.places;

function worldAt(hour: number, speed: Speed = 1): WorldState {
  const w = flatWorld();
  w.time.desired = [speed, speed, 1, 1];
  w.tick = at(hour);
  return w;
}

/** Ticks each of the next `n` turns runs (applying them). */
function turnTicks(w: WorldState, n: number): number[] {
  const ctx = createTickCtx(w);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const before = w.tick;
    applyTurn(w, { t: w.lastTurn + 1, cmds: [] }, ctx);
    out.push(w.tick - before);
  }
  return out;
}

describe('the evening lingers', () => {
  it('runs from eveningHour to homeHour, unless the valley turns it off', () => {
    expect(P.eveningHour).toBe(17);
    expect(P.homeHour).toBe(21);
    expect(isLingeringDusk(worldAt(16))).toBe(false);
    expect(isLingeringDusk(worldAt(17))).toBe(true);
    expect(isLingeringDusk(worldAt(20))).toBe(true);
    expect(isLingeringDusk(worldAt(21))).toBe(false);
    const off = worldAt(18);
    off.settings.eveningLingers = false;
    expect(isLingeringDusk(off)).toBe(false);
    const on = worldAt(18);
    on.settings.eveningLingers = true;
    expect(isLingeringDusk(on)).toBe(true);
  });

  it('at 1x runs a tick on even turns and none on odd ones', () => {
    const w = worldAt(17, 1);
    expect(turnTicks(w, 6)).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it('at 3x rounds 1.5 ticks down on odd turns and up on even ones', () => {
    const w = worldAt(17, 3);
    expect(turnTicks(w, 4)).toEqual([1, 2, 1, 2]);
  });

  it('at 2x runs one tick a turn, and paused stays paused', () => {
    expect(turnTicks(worldAt(18, 2), 3)).toEqual([1, 1, 1]);
    expect(turnTicks(worldAt(18, 0), 3)).toEqual([0, 0, 0]);
  });

  it('runs at full speed before 17:00, after 21:00 and when switched off', () => {
    expect(turnTicks(worldAt(16, 1), 3)).toEqual([1, 1, 1]);
    expect(turnTicks(worldAt(21, 1), 3)).toEqual([1, 1, 1]);
    const off = worldAt(18, 1);
    off.settings.eveningLingers = false;
    expect(turnTicks(off, 3)).toEqual([1, 1, 1]);
  });

  it('makes the evening take twice the turns at 1x', () => {
    const w = worldAt(17, 1);
    const ctx = createTickCtx(w);
    let turns = 0;
    while (w.tick < at(21)) {
      applyTurn(w, { t: w.lastTurn + 1, cmds: [] }, ctx);
      turns++;
    }
    expect(turns).toBe(2 * 4 * TICKS_PER_HOUR);
  });

  it('shows in the clock view', () => {
    expect(clockView(worldAt(18)).lingering).toBe(true);
    expect(clockView(worldAt(12)).lingering).toBeUndefined();
    expect(clockView(worldAt(18)).speed).toBe(1);
  });

  it('is left out for tests that count turns as ticks', () => {
    const w = worldAt(18, 1);
    w.lastTurn = 1;
    withoutNightHurry(() => expect(ticksThisTurn(w)).toBe(1));
  });

  it('resumes the same from a save made mid-evening, on an odd turn', () => {
    const a = worldAt(17, 3);
    turnTicks(a, 7); // lastTurn 7: the next turn is even
    const b = deserialize(serialize(a));
    expect(hashState(b)).toBe(hashState(a));
    const ta = turnTicks(a, 9);
    const tb = turnTicks(b, 9);
    expect(tb).toEqual(ta);
    expect(ta.slice(0, 2)).toEqual([2, 1]);
    expect(hashState(b)).toBe(hashState(a));
  });
});
