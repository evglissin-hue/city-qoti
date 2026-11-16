// R2A: the place view's present count and wants by example, and the seated pose in the agent frame.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import {
  AGENT_STRIDE,
  AgentAnim,
  AgentFlags,
  RoundFlags,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TILE_FP,
} from '../../src/constants';
import type { Resident, WorldState } from '../../src/contracts';
import { rngFromSeed } from '../../src/rng/streams';
import { placeIndex } from '../../src/systems/places';
import { refreshRows } from '../../src/systems/places/rows';
import { createHousehold } from '../../src/systems/residents/generate';
import { dayIndex } from '../../src/systems/residents/time';
import { createTickCtx } from '../../src/turn';
import { agentFrame, readAgentRow } from '../../src/view/agents';
import { placeView, placesView } from '../../src/view/places';
import { flatWorld, run, S } from '../helpers';

const fp = (t: number) => t * TILE_FP + TILE_FP / 2;
const tickAt = (day: number, hour: number, minute: number): number =>
  day * TICKS_PER_DAY +
  hour * TICKS_PER_HOUR +
  Math.round((minute * TICKS_PER_HOUR) / 60) -
  START_HOUR * TICKS_PER_HOUR;

/** A world with one bench at (40, 40), found by the rows pass, at 18:30 on day 2. */
function benchWorld(def = 'bench', hour = 18): { w: WorldState; id: string } {
  const w = flatWorld();
  run(w, { t: 'decor.place', def, fx: fp(40), fz: fp(40), rot: 0 });
  w.tick = tickAt(2, hour, 30);
  refreshRows(w, createTickCtx(w));
  return { w, id: placeIndex(w).places[0]!.id };
}

function resident(w: WorldState, tile: number): Resident {
  const { members } = createHousehold(w, rngFromSeed('views', 'residents'), {
    species: 'human',
    stages: ['adult'],
    homeId: 0,
    tile,
    inside: 0,
    activity: { kind: 'home' },
  });
  return members[0]!;
}

/** Puts a resident on a stop of the round that is under way now. */
function seat(w: WorldState, r: Resident, place: string, flags: number): void {
  r.round = [{ place, kind: 'sit', tile: r.tile, draw: 50, flags, arrived: w.tick }];
  r.roundDay = dayIndex(w.tick);
  r.activity = { kind: 'leisure', tile: r.tile };
  r.move = null;
  r.inside = 0;
}

describe('the place view', () => {
  it('counts a resident whose stop is under way as present', () => {
    const { w, id } = benchWorld();
    const view = () => placesView(w).places.find((p) => p.id === id)!;
    expect(view().present).toBe(0);
    const r = resident(w, 40 * S + 40);
    seat(w, r, id, RoundFlags.arrived | RoundFlags.seated);
    w.tick += 1; // occupancy is counted once per tick: the next tick sees them seated
    expect(view().present).toBe(1);
  });

  it('wants a stall when many came and nothing serves it', () => {
    const { w, id } = benchWorld('bench', 22);
    w.places[0]!.visitors = [3, 14];
    const v = placesView(w).places.find((p) => p.id === id)!;
    expect(v.wants).toContain('a stall would sell to the 14 who come');
  });

  it('wants more seats when last evening overflowed them, and a lantern and a brazier', () => {
    const { w, id } = benchWorld('bench', 22);
    w.places[0]!.visitors = [0, 20];
    const v = placesView(w).places.find((p) => p.id === id)!;
    expect(v.wants).toContain('more seats would keep the 20 who came off their feet');
    expect(v.wants).toContain('a lantern would see them home after dark');
    expect(v.wants.length).toBeLessThanOrEqual(3);
    for (const line of v.wants) {
      expect(line.endsWith('.')).toBe(false);
      expect(line).not.toContain('—');
    }
  });

  it('reads the evening under way as not yet closed between 17:00 and 21:00', () => {
    const { w, id } = benchWorld('bench', 18);
    w.places[0]!.visitors = [9, 1];
    const v = placesView(w).places.find((p) => p.id === id)!;
    expect(v.wants).toContain('a stall would sell to the 9 who come');
  });

  it('wants no lantern where one stands', () => {
    const { w } = benchWorld('bench', 22);
    run(w, { t: 'decor.place', def: 'lantern', fx: fp(40), fz: fp(41), rot: 0 });
    refreshRows(w, createTickCtx(w));
    const id = placeIndex(w).places[0]!.id;
    expect(placeIndex(w).places[0]!.tiles.length).toBeGreaterThan(1);
    const place = placeIndex(w).places.find((p) => p.id === id)!;
    expect(placeView(w, place).wants.join(' ')).not.toContain('lantern');
  });

  it('wants a bench when it has no grown-up seats and drew visitors', () => {
    const { w, id } = benchWorld('brazier', 22);
    const row = w.places.find((p) => p.id === id)!;
    row.visitors = [6];
    const place = placeIndex(w).places.find((p) => p.id === id)!;
    expect(place.seats).toBe(0);
    expect(placeView(w, place).wants).toContain('a bench would seat the 6 who stand');
    expect(content.places.unservedVisitors).toBeGreaterThan(0);
  });
});

describe('the seated pose', () => {
  it('writes the sit anim for a seated resident, and not for a standing one', () => {
    const { w, id } = benchWorld();
    const sitter = resident(w, 40 * S + 40);
    seat(w, sitter, id, RoundFlags.arrived | RoundFlags.seated);
    const stander = resident(w, 41 * S + 40);
    seat(w, stander, id, RoundFlags.arrived | RoundFlags.standing);
    const frame = agentFrame(w);
    const rows = new Map<number, ReturnType<typeof readAgentRow>>();
    for (let o = 0; o < frame.length; o += AGENT_STRIDE) {
      const v = readAgentRow(frame, o);
      rows.set(v.id, v);
    }
    expect(rows.get(sitter.id)!.anim).toBe(AgentAnim.sit);
    expect(rows.get(sitter.id)!.pose).toBe('sit');
    expect(rows.get(stander.id)!.anim).toBe(AgentAnim.idle);
    expect(rows.get(stander.id)!.pose).toBe('stand');
  });

  it('flags skating for a stop on the ice', () => {
    const { w } = benchWorld();
    const r = resident(w, 40 * S + 41);
    seat(w, r, 'ice:4141', RoundFlags.arrived | RoundFlags.standing);
    const frame = agentFrame(w);
    let flags = -1;
    for (let o = 0; o < frame.length; o += AGENT_STRIDE) {
      const v = readAgentRow(frame, o);
      if (v.id === r.id) flags = v.flags;
    }
    expect(flags & AgentFlags.skating).toBe(AgentFlags.skating);
  });
});
