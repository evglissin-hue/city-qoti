// R3H: a joining seat loads the saved valley fresh and reads the same levels. Nothing new is saved
// (Building.level and Building.counters already are), so the readers must agree with the host's from
// those two fields alone: crew, room, reach, storage, the climb view, and the day's verdict.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { findById } from '../../src/state/entities';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { jobsOf, storageOf } from '../../src/state/zones';
import { levels } from '../../src/systems/levels';
import { specializedClimb, specializedDay } from '../../src/systems/levels/specialized';
import { doorTile } from '../../src/systems/movement/api';
import { capacityOf, specializedReach, withinReach } from '../../src/systems/specialized/api';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { good, spot, today } from './helpers';

const S = MAP_SIZE;

/** A town with a leveled building of every good and a lane for the Stall. */
function leveledTown(): WorldState {
  const { state } = hamletFixture();
  spot(state, 'foresters-lodge', 120, 80, 3);
  spot(state, 'quarry', 120, 90, 2);
  const stall = spot(state, 'market-stall', 120, 100, 2);
  const g = spot(state, 'granary', 130, 100, 3);
  g.rt!.store[good('grain')] = 1100;
  spot(state, 'storehouse', 130, 90, 2);
  spot(state, 'windmill', 140, 100, 3);
  spot(state, 'sawmill', 140, 110, 2);
  today(stall, { customersToday: 9 });
  stall.counters!.levelDays = 2;
  const door = doorTile(stall);
  for (let x = door % S; x < (door % S) + 30; x++) state.map.road[Math.floor(door / S) * S + x] = Road.lane;
  return state;
}

describe('a joining seat', () => {
  it('reads the same levels as the host: crew, room, reach, storage, climb and the day', () => {
    const host = leveledTown();
    const join = deserialize(serialize(host));
    expect(hashState(join)).toBe(hashState(host));
    let seen = 0;
    for (const hb of host.buildings) {
      const def = content.buildingById.get(hb.def);
      if (!def?.levels) continue;
      const jb = findById(join.buildings, hb.id)!;
      expect(jb.level, `${hb.def} #${hb.id}`).toBe(hb.level);
      expect(jb.counters, `${hb.def} counters`).toEqual(hb.counters);
      expect(jobsOf(jb)).toBe(jobsOf(hb));
      expect(storageOf(jb)).toBe(storageOf(hb));
      expect(specializedReach(jb)).toBe(specializedReach(hb));
      expect(capacityOf(join, jb)).toBe(capacityOf(host, hb));
      expect(specializedClimb(join, jb)).toEqual(specializedClimb(host, hb));
      expect(specializedDay(join, jb)).toBe(specializedDay(host, hb));
      const door = doorTile(hb);
      for (const d of [0, 10, 16, 20, 24]) {
        const tile = door + d;
        expect(withinReach(join, jb, tile), `${hb.def} reach ${d}`).toBe(withinReach(host, hb, tile));
      }
      seen++;
    }
    expect(seen).toBeGreaterThanOrEqual(7);
  });

  it('the reach is walked for the saved level, not level 1', () => {
    const host = leveledTown();
    const join = deserialize(serialize(host));
    const stall = join.buildings.find((b) => b.def === 'market-stall' && b.x === 120 && b.z === 100)!;
    const door = doorTile(stall);
    expect(stall.level).toBe(2);
    expect(withinReach(join, stall, door + 16)).toBe(true);
    stall.level = 1;
    expect(withinReach(join, stall, door + 16)).toBe(false);
  });

  it('both seats climb the same way through the next day end and hash the same after it', () => {
    const host = leveledTown();
    const join = deserialize(serialize(host));
    for (const s of [host, join]) {
      const stall = s.buildings.find((b) => b.def === 'market-stall' && b.x === 120 && b.z === 100)!;
      stall.counters!.customersToday = 12;
      levels.tick(s, createTickCtx(s));
      expect(stall.level).toBe(3);
    }
    expect(hashState(join)).toBe(hashState(host));
  });
});
