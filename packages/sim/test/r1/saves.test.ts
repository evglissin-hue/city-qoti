// R1.0 saves (docs/spec/21-networking-and-saves.md, The fresh start): a current valley round-trips
// to an equal hash; the same bytes under a version before 6 are refused as an old valley. P2: the
// current version is 7, and a version 6 valley migrates (the day's growth starts, none yet).
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createWorld, defaultSettings } from '../../src/state/create';
import { hashState } from '../../src/state/hash';
import { deserialize, peekSaveVersion, serialize } from '../../src/state/serialize';
import { OldValleyError, SAVE_VERSION } from '../../src/state/version';
import { villageFixture } from '../fixtures/village';

/** The save's bytes with `saveVersion` rewritten. */
function withVersion(bytes: Uint8Array, version: number): Uint8Array {
  const save = JSON.parse(strFromU8(gunzipSync(bytes))) as { saveVersion: number };
  save.saveVersion = version;
  return gzipSync(strToU8(JSON.stringify(save)), { level: 6, mtime: 0 });
}

describe('R1 saves', () => {
  it('peeks a save version from the header without building a world', () => {
    const bytes = serialize(createWorld('willow', { ...defaultSettings(), mode: 'standard' }));
    expect(peekSaveVersion(bytes)).toBe(7);
    expect(peekSaveVersion(withVersion(bytes, 5))).toBe(5);
    expect(peekSaveVersion(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('is version 7', () => {
    expect(SAVE_VERSION).toBe(7);
  });

  it('opens a version 6 valley by migrating it: the growth starts are added, the rest is kept', () => {
    const state = createWorld('willow', { ...defaultSettings(), mode: 'standard' });
    const save = JSON.parse(strFromU8(gunzipSync(serialize(state)))) as {
      saveVersion: number;
      demand: Record<string, unknown>;
    };
    save.saveVersion = 6;
    delete save.demand.starts;
    const old = gzipSync(strToU8(JSON.stringify(save)), { level: 6, mtime: 0 });
    expect(peekSaveVersion(old)).toBe(6);
    const back = deserialize(old);
    expect(back.saveVersion).toBe(7);
    expect(back.demand.starts).toEqual({ day: -1, n: 0 });
    expect(hashState(back)).toBe(hashState(state));
  });

  it('round-trips a version 7 standard valley to an equal hash', () => {
    const state = createWorld('willow', { ...defaultSettings(), mode: 'standard' });
    expect(state.saveVersion).toBe(7);
    const back = deserialize(serialize(state));
    expect(hashState(back)).toBe(hashState(state));
    expect(back.carrier).toEqual(state.carrier);
    expect(back.seasonPlan).toEqual(state.seasonPlan);
    expect(back.demand).toEqual(state.demand);
  });

  it('round-trips a village with businesses (trade, level, keeper, counters)', () => {
    const { state, b } = villageFixture();
    const back = deserialize(serialize(state));
    expect(hashState(back)).toBe(hashState(state));
    const bakery = back.buildings.find((x) => x.id === b.bakery)!;
    expect(bakery.trade).toBe('baker');
    expect(bakery.level).toBe(2);
    // R1B: the fixture's bakery is kept by its first hand.
    expect(bakery.keeperId).toBeGreaterThan(0);
    expect(bakery.keeperId).toBe(state.buildings.find((x) => x.id === b.bakery)!.keeperId);
    expect(bakery.counters).toBeDefined();
  });

  it('refuses the same bytes as version 5 with OLD_VALLEY', () => {
    const bytes = withVersion(serialize(createWorld('hazel', { ...defaultSettings(), mode: 'standard' })), 5);
    let caught: unknown = null;
    try {
      deserialize(bytes);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(OldValleyError);
    expect((caught as OldValleyError).code).toBe('OLD_VALLEY');
  });
});
