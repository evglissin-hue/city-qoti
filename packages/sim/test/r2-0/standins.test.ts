// R2.0 stand-ins and cross-track API stubs (docs/build/r2-wave-notes.md, Cross-track APIs): the
// places and gaps systems do nothing yet, and the helpers R2A, R2B and R2C call behave as fixed.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import {
  AgentAnim,
  AGENT_STRIDE,
  MAX_PLACE_NAME_CHARS,
  PLACE_EVENINGS,
  TICKS_PER_DAY,
} from '../../src/constants';
import type { Resident } from '../../src/contracts';
import { createWorld, defaultSettings } from '../../src/state/create';
import {
  byPlaceId,
  cleanName,
  newPlaceState,
  seatsPlaceId,
  startPlaceEvening,
} from '../../src/state/evenings';
import { closeGap, findGap, openGap } from '../../src/systems/gaps/api';
import { placeById, placesNear, recordSale, recordVisit } from '../../src/systems/places/api';
import { placeIndex } from '../../src/systems/places';
import { eveningScore } from '../../src/systems/residents/evening';
import { advanceTo, createTickCtx } from '../../src/turn';
import { agentPose, readAgentRow } from '../../src/view/agents';
import { flatWorld } from '../helpers';

describe('the stand-in systems', () => {
  it('find no places and open no gaps in a fresh valley after 2 days', { timeout: 60_000 }, () => {
    const s = createWorld('willow', { ...defaultSettings(), mode: 'standard' });
    s.time.connected = [0, 1];
    const ctx = createTickCtx(s);
    const target = 2 * TICKS_PER_DAY;
    while (s.tick < target) advanceTo(s, s.lastTurn + 1, ctx);
    expect(placeIndex(s).places).toEqual([]);
    expect(placeIndex(s).byId.size).toBe(0);
    expect(placesNear(s, 50 * 256 + 50, 1000)).toEqual([]);
    expect(placeById(s, seatsPlaceId(1))).toBeUndefined();
    expect(s.places).toEqual([]);
    expect(s.streets).toEqual([]);
    expect(s.gaps.open).toEqual([]);
    expect(s.evenings.tonight.day).toBe(-1);
  });
});

describe('place bookkeeping', () => {
  it('recordVisit counts on the last evening and ignores an unknown id', () => {
    const s = flatWorld();
    const row = newPlaceState('seats:10', 'The Bench', 0);
    row.visitors = [2, 3];
    s.places.push(row);
    const r = {} as Resident;
    recordVisit(s, 'seats:10', r, 0);
    expect(row.visitors).toEqual([2, 4]);
    recordVisit(s, 'seats:99', r, 0);
    expect(s.places.length).toBe(1);
    expect(row.visitors).toEqual([2, 4]);
  });

  it('recordSale counts a stop sale on the place and the tally, and passing trade on the tally alone', () => {
    const s = flatWorld();
    const row = newPlaceState('seats:10', 'The Bench', 0);
    s.places.push(row);
    recordSale(s, 'seats:10', 5, 0, 3, 60);
    expect(row.sold).toEqual([3]);
    expect(row.takings).toEqual([60]);
    expect(s.evenings.tonight.treatsAtStops).toBe(3);
    expect(s.evenings.tonight.takings).toBe(60);
    recordSale(s, null, 5, 0, 2, 40);
    expect(s.evenings.tonight.treatsPassing).toBe(2);
    expect(s.evenings.tonight.treatsAtStops).toBe(3);
    expect(s.evenings.tonight.takings).toBe(100);
    expect(row.sold).toEqual([3]);
    // An unknown place still counts on the tally.
    recordSale(s, 'seats:77', 5, 0, 1, 10);
    expect(s.evenings.tonight.treatsAtStops).toBe(4);
  });

  it('startPlaceEvening keeps at most PLACE_EVENINGS evenings', () => {
    const row = newPlaceState('seats:10', 'The Bench', 0);
    for (let i = 0; i < PLACE_EVENINGS + 4; i++) {
      row.visitors[row.visitors.length - 1] = i + 1;
      startPlaceEvening(row);
    }
    for (const a of [row.visitors, row.takings, row.sold, row.served]) {
      expect(a.length).toBe(PLACE_EVENINGS);
      expect(a[a.length - 1]).toBe(0);
    }
    expect(row.visitors[PLACE_EVENINGS - 2]).toBe(PLACE_EVENINGS + 4);
  });

  it('sorts place ids with <, so seats:10 comes before seats:9', () => {
    const rows = [{ id: 'seats:9' }, { id: 'porch:3' }, { id: 'seats:10' }];
    rows.sort(byPlaceId);
    expect(rows.map((r) => r.id)).toEqual(['porch:3', 'seats:10', 'seats:9']);
  });
});

describe('gap bookkeeping', () => {
  it('opens a gap with the next id and dedupes by kind and subject', () => {
    const s = flatWorld();
    const first = s.nextId;
    const a = openGap(s, null, 'nobodyPasses', 'stall:1', 100, 4);
    expect(a.id).toBe(first);
    expect(s.nextId).toBe(first + 1);
    const again = openGap(s, null, 'nobodyPasses', 'stall:1', 100, 9);
    expect(again).toBe(a);
    expect(again.id).toBe(first);
    expect(again.n).toBe(9);
    expect(s.gaps.open.length).toBe(1);
    expect(s.nextId).toBe(first + 1);
    const other = openGap(s, null, 'nothingToSell', 'stall:1', 100, 1);
    expect(other.id).toBe(first + 1);
    expect(findGap(s, 'nothingToSell', 'stall:1')).toBe(other);
    expect(findGap(s, 'nowhereToGo', 'stall:1')).toBeUndefined();
  });

  it('credits the closers once a season', () => {
    const s = flatWorld();
    const a = openGap(s, null, 'nobodyPasses', 'stall:1', 100, 4);
    closeGap(s, null, a, [1]);
    expect(s.gaps.open).toEqual([]);
    expect(s.gaps.closed).toEqual([a]);
    expect(a.closers).toEqual([1]);
    expect(a.closedDay).toBe(0);
    expect(s.gaps.closedBySeat).toEqual([0, 1, 0, 0]);
    expect(s.gaps.closedCount).toBe(1);
    expect(s.gaps.credited).toEqual(['nobodyPasses:stall:1']);
    // Pulled down and put back: the same kind and subject closes again with no credit.
    const b = openGap(s, null, 'nobodyPasses', 'stall:1', 100, 5);
    closeGap(s, null, b, [1]);
    expect(b.closers).toEqual([]);
    expect(s.gaps.closedBySeat).toEqual([0, 1, 0, 0]);
    expect(s.gaps.closedCount).toBe(2);
    expect(s.gaps.credited).toEqual(['nobodyPasses:stall:1']);
    // A different subject still credits, both seats sorted.
    const c = openGap(s, null, 'nowhereToGo', 'north', 100, 2);
    closeGap(s, null, c, [1, 0]);
    expect(c.closers).toEqual([0, 1]);
    expect(s.gaps.closedBySeat).toEqual([1, 2, 0, 0]);
    // Closing a gap that is not open does nothing.
    closeGap(s, null, c, [0]);
    expect(s.gaps.closedCount).toBe(3);
  });

  it('drops closed gaps older than PLACE_EVENINGS days', () => {
    const s = flatWorld();
    const a = openGap(s, null, 'nobodyPasses', 'a', 1, 1);
    closeGap(s, null, a, [0]);
    s.tick = PLACE_EVENINGS * TICKS_PER_DAY;
    const b = openGap(s, null, 'nobodyPasses', 'b', 1, 1);
    closeGap(s, null, b, [0]);
    expect(s.gaps.closed).toEqual([a, b]);
    s.tick = (PLACE_EVENINGS + 1) * TICKS_PER_DAY;
    const c = openGap(s, null, 'nobodyPasses', 'c', 1, 1);
    closeGap(s, null, c, [0]);
    expect(s.gaps.closed).toEqual([b, c]);
  });
});

describe('evening helpers', () => {
  it('scores every evening at the stay-in floor on the stand-in', () => {
    const s = flatWorld();
    expect(eveningScore(s, {} as Resident)).toBe(content.places.stayInScore);
  });

  it('cleans names', () => {
    expect(cleanName('  The   Old \t Bench ')).toBe('The Old Bench');
    expect(cleanName('Bell\u0000\u0007 Lane\n')).toBe('Bell Lane');
    expect(cleanName('   ')).toBe('');
    expect(cleanName('\u0001\u0002')).toBe('');
    expect(cleanName('x'.repeat(MAX_PLACE_NAME_CHARS))).toBe('x'.repeat(MAX_PLACE_NAME_CHARS));
    expect(cleanName('x'.repeat(MAX_PLACE_NAME_CHARS + 1))).toBeNull();
    // Spaces collapse before the length is measured.
    expect(cleanName(`${'x'.repeat(MAX_PLACE_NAME_CHARS)}    `)).toBe('x'.repeat(MAX_PLACE_NAME_CHARS));
  });
});

describe('agent poses', () => {
  it('decodes sit, carry and stand', () => {
    expect(agentPose(AgentAnim.sit, 0)).toBe('sit');
    expect(agentPose(AgentAnim.sit, 3)).toBe('sit');
    expect(agentPose(AgentAnim.walk, 3)).toBe('carry');
    expect(agentPose(AgentAnim.idle, 0)).toBe('stand');
    const frame = new Float32Array(AGENT_STRIDE * 2);
    frame.set([7, 1.5, 2.5, 0.25, 0.5, AgentAnim.sit, 0, 4], AGENT_STRIDE);
    const sit = readAgentRow(frame, AGENT_STRIDE);
    expect(sit).toMatchObject({
      id: 7,
      x: 1.5,
      z: 2.5,
      y: 0.25,
      heading: 0.5,
      anim: AgentAnim.sit,
      carry: -1,
      flags: 4,
      pose: 'sit',
    });
    frame.set([8, 0, 0, 0, 0, AgentAnim.walk, 3, 0], 0);
    const carry = readAgentRow(frame, 0);
    expect(carry.pose).toBe('carry');
    expect(carry.carry).toBe(2);
    frame.set([9, 0, 0, 0, 0, AgentAnim.idle, 0, 0], 0);
    expect(readAgentRow(frame, 0).pose).toBe('stand');
  });
});
