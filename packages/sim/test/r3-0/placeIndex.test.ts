// R3.0: the place index over an autoplayed year. The golden year (packages/sim/test/golden/r1-year.json,
// tools/bench/src/goldenYear.ts) is replayed with the verifier on, reading the index after every turn
// (the verifier throws if a place input changed behind the change counter), and every 4 in-game hours
// the memoized index is compared with a full rebuild from a save of the same world: what a seat
// joining at that moment would see. R3 puts the skating spots, lamps and rests into the inputs, so
// this is the check that no writer of them forgets to bump.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/constants';
import type { Place, Turn, ValleySettings, WorldState } from '../../src/contracts';
import { createWorld } from '../../src/state/create';
import { deserialize, serialize } from '../../src/state/serialize';
import { placeIndex } from '../../src/systems/places';
import { setPlaceVerify } from '../../src/systems/places/inputs';
import { applyTurn, createTickCtx } from '../../src/turn';
import yearScript from '../golden/r1-year.json';

interface GoldenScript {
  seed: string;
  settings: ValleySettings;
  lastTurn: number;
  turns: Turn[];
}

/** The parts of a place a seat could see differ in; the draw and its parts are derived the same way. */
function shape(p: Place): unknown {
  return {
    id: p.id,
    tile: p.tile,
    tiles: p.tiles,
    members: p.members,
    seats: p.seats,
    childSeats: p.childSeats,
    standing: p.standing,
    kinds: p.kinds,
    warm: p.warm,
    draw: p.draw,
    parts: p.parts,
  };
}

function compare(world: WorldState): void {
  const live = placeIndex(world).places.map(shape);
  const rebuilt = placeIndex(deserialize(serialize(world))).places.map(shape);
  expect(rebuilt, `places at tick ${world.tick}`).toEqual(live);
}

describe('the place index over the golden year', () => {
  it(
    'never changes behind the counter, and matches a full rebuild every 4 hours',
    { timeout: 600_000 },
    () => {
      setPlaceVerify(true);
      const golden = yearScript as unknown as GoldenScript;
      const world = createWorld(golden.seed, golden.settings);
      const ctx = createTickCtx(world);
      const byTurn = new Map<number, Turn>(golden.turns.map((t) => [t.t, t]));
      const every = 4 * TICKS_PER_HOUR;
      let nextCheck = every;
      let compared = 0;
      let reads = 0;
      while (world.lastTurn < golden.lastTurn) {
        const t = world.lastTurn + 1;
        applyTurn(world, byTurn.get(t) ?? { t, cmds: [] }, ctx);
        placeIndex(world);
        reads++;
        if (world.tick >= nextCheck) {
          compare(world);
          compared++;
          nextCheck = world.tick + every;
        }
      }
      compare(world);
      expect(placeIndex(world).places.length).toBeGreaterThan(0);
      expect(compared).toBeGreaterThan(100);
      expect(reads).toBe(golden.lastTurn);
    },
  );
});
