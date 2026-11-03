// C5C: helpers for the nature tests. The village fixture in early summer (year 1, summer day 2, 10:00)
// and an empty corner east of the river (chunk 7, 7: tiles 112 to 127) to build habitats in.
import { CHUNK_SIZE, CHUNKS_PER_SIDE, HABITAT_IDS } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { CHUNKS } from '../../src/systems/nature/habitats';
import { tickAt } from './seasonsPlace';
import { villageFixture, type VillageFixture } from './village';

export const EMPTY_CX = 7;
export const EMPTY_CZ = 7;
export const EMPTY_CHUNK = EMPTY_CZ * CHUNKS_PER_SIDE + EMPTY_CX;
/** The empty chunk's north-west tile. */
export const EX = EMPTY_CX * CHUNK_SIZE;
export const EZ = EMPTY_CZ * CHUNK_SIZE;

export function natureFixture(): VillageFixture {
  const f = villageFixture();
  f.state.tick = tickAt(0, 1, 2, 10);
  return f;
}

/** Sets a chunk's six scores directly (for wildlife tests that start from habitat). */
export function setHabitats(state: WorldState, c: number, scores: Partial<Record<string, number>>): void {
  HABITAT_IDS.forEach((h, i) => {
    state.nature.habitats[i * CHUNKS + c] = scores[h] ?? 0;
  });
}
