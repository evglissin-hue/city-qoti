// R3A: a seat joining mid-walk. The lamplighter's walk is derived from saved state and the tick, so a
// seat that loads a snapshot at 17:35 matches its partner hour by hour (and at every reach) to 22:00.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { placeIndex } from '../../src/systems/places';
import { bumpPlaceInputs } from '../../src/systems/places/inputs';
import { decorLit, decorLitTonight, pieceRests, supplyOf } from '../../src/systems/supplies/api';
import { lamplighterPose } from '../../src/systems/supplies/lamplighter';
import { advanceTo, createTickCtx, type SimCtx } from '../../src/turn';
import { pieceTile } from '../../src/systems/supplies/pieces';
import { suppliesView } from '../../src/view/supplies';
import { villageFixture } from '../fixtures/village';
import { decor } from '../hearth/helpers';

const S = content.supplies;
const tickAt = (day: number, hour: number, minute = 0): number =>
  day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR + Math.floor((minute * TICKS_PER_HOUR) / 60);
const CANDLES = content.goodIndex.get('candles')!;

/** Everything a seat can read of the lamps, the pieces, the walker and the places, as plain data. */
function readout(s: WorldState): unknown {
  const walkers = s.supplies.lamplighters.map((id) => {
    const r = findById(s.residents, id)!;
    return { id, tile: r.tile, move: r.move ? true : false, pose: lamplighterPose(s, r) };
  });
  return {
    hash: hashState(s),
    lamps: s.supplies.lamps.map((l) => ({ ...l })),
    walkers,
    pieces: s.decor
      .filter((d) => supplyOf(d))
      .map((d) => [d.id, decorLit(s, d), decorLitTonight(s, d), pieceRests(s, d)]),
    places: placeIndex(s).places.map((p) => ({ id: p.id, draw: p.draw, parts: p.parts })),
    view: suppliesView(s),
  };
}

function advanceTicks(s: WorldState, ctx: SimCtx, to: number): void {
  while (s.tick < to) advanceTo(s, s.lastTurn + 1, ctx);
}

describe('a seat joining mid-walk', () => {
  it('matches its partner hour by hour and at every reach to 22:00', { timeout: 240_000 }, () => {
    const s = villageFixture().state;
    s.charter.rank = 'village';
    for (const r of s.residents) if (r.activity.kind === 'arrive') r.activity = { kind: 'home' };
    for (const fam of s.carrier.families) fam.reserve = 0;
    s.seasonPlan.reserve = 0;
    s.seasonPlan.food = null;
    s.seasonPlan.fuel = null;
    const store = s.buildings.find((b) => b.def === 'storehouse')!;
    store.rt!.store.fill(0);
    store.rt!.store[CANDLES] = 40;
    decor(s, 'lantern', 50, 40);
    bumpPlaceInputs(s);
    const ctx = createTickCtx(s);

    // Mid-walk: a little after the settling, some lamp is his with its reach still ahead.
    const settle = tickAt(0, S.settleHour, S.settleMinute);
    const lit = tickAt(0, S.litHour);
    // The lamplighter is hired by the hour; a minute before the settling the town's lanterns go up
    // around where he stands, so his round is short enough to be walked before 18:00.
    advanceTicks(s, ctx, settle - 3);
    const walker = findById(s.residents, s.supplies.lamplighters[0]!)!;
    const wx = walker.tile % MAP_SIZE;
    const wz = Math.floor(walker.tile / MAP_SIZE);
    decor(s, 'bench', wx + 1, wz + 1);
    for (let k = 0; k < 12; k++) decor(s, 'lantern', wx - 6 + k, wz);
    bumpPlaceInputs(s);
    advanceTicks(s, ctx, settle + 4);
    expect(s.supplies.lamplighters.length, 'a lamplighter is hired by 17:30').toBeGreaterThan(0);
    expect(s.supplies.lamps.length).toBeGreaterThan(0);
    expect(
      s.supplies.lamps.some((l) => l.by !== undefined && l.reach > s.tick && l.reach < lit),
      'a reach still ahead',
    ).toBe(true);
    for (const l of s.supplies.lamps) {
      expect(l.reach).toBeGreaterThanOrEqual(settle);
      expect(l.reach).toBeLessThanOrEqual(lit);
    }

    const joined = deserialize(serialize(s));
    const cj = createTickCtx(joined);
    expect(readout(joined)).toEqual(readout(s));

    const reaches = new Set(s.supplies.lamps.map((l) => l.reach));
    const end = tickAt(0, 22);
    let posed = false;
    for (let t = s.tick + 1; t <= end; t++) {
      advanceTo(s, s.lastTurn + 1, ctx);
      advanceTo(joined, joined.lastTurn + 1, cj);
      expect(joined.tick).toBe(s.tick);
      const check = s.tick % TICKS_PER_HOUR === 0 || reaches.has(s.tick) || reaches.has(s.tick - 1);
      if (s.tick < lit) {
        for (const id of s.supplies.lamplighters) {
          const r = findById(s.residents, id)!;
          if (lamplighterPose(s, r) !== 2) continue;
          const onLamp = s.supplies.lamps.some((l) => {
            const d = s.decor.find((x) => x.id === l.id)!;
            return l.by === id && pieceTile(d) === r.tile;
          });
          expect(onLamp, `pose 2 on a lamp's tile at tick ${s.tick}`).toBe(true);
          posed = true;
        }
      }
      if (check || s.tick < lit) {
        // The cheap per-tick part: hash, then the full readout at the hours and the reaches.
        expect(hashState(joined), `tick ${s.tick}`).toBe(hashState(s));
      }
      if (check) expect(readout(joined), `tick ${s.tick}`).toEqual(readout(s));
    }
    expect(posed, 'he stood at a lamp (pose 2) before 18:00').toBe(true);
  });
});
