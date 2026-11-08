// P1 save version 5: additions only (a town's calling, a building's custom.windowFlowers), so a v4 save
// loads unchanged, and a town that was already a Village before callings existed is offered its two
// when it loads, from its own map, as it would have been at the claim.
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../src/contracts';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { SAVE_VERSION } from '../../src/state/version';
import { hamletFixture } from '../fixtures/hamlet';
import { villageFixture } from '../fixtures/village';

/** The state as a v4 save would have held it: no calling slice, version 4. */
function asV4(state: WorldState): Uint8Array {
  const raw = JSON.parse(strFromU8(gunzipSync(serialize(state)))) as Record<string, unknown>;
  delete raw.calling;
  raw.saveVersion = 4;
  return gzipSync(strToU8(JSON.stringify(raw)));
}

describe('save version 5', () => {
  it('loads a v4 hamlet unchanged but for its version', () => {
    const f = hamletFixture();
    const s = deserialize(asV4(f.state));
    expect(SAVE_VERSION).toBe(5);
    expect(s.saveVersion).toBe(5);
    expect(s.calling).toBeUndefined();
    expect(hashState(s)).toBe(hashState(f.state));
  });

  it('offers a v4 Village its two callings when it loads, the same two every time', () => {
    const f = villageFixture();
    delete f.state.calling;
    const a = deserialize(asV4(f.state));
    const b = deserialize(asV4(f.state));
    expect(a.calling?.offered).toHaveLength(2);
    expect(a.calling?.chosen).toBeNull();
    expect(b.calling).toEqual(a.calling);
  });

  it('never offers anything on loading a v5 save', () => {
    const f = villageFixture();
    delete f.state.calling;
    const s = deserialize(serialize(f.state));
    expect(s.calling).toBeUndefined();
  });
});
