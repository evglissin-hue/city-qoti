import { createWorld, defaultSettings, deserialize, serialize, SIM_VERSION } from '@qoti/sim';
import { base64ToBytes } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { readValleyFile, valleyFileName } from './valleyFile';

describe('.qoti valley files', () => {
  it('reads a saved valley, clears who is connected and re-serializes it for this game', () => {
    const w = createWorld('meadow', { ...defaultSettings(), mode: 'standard', townName: 'Fernhollow' });
    w.time.connected = [0, 1];
    w.lastTurn = 420;
    const file = readValleyFile(serialize(w));
    expect(file.snapshot.t).toBe(420);
    expect(file.snapshot.simVersion).toBe(SIM_VERSION);
    expect(file.summary.townName).toBe('Fernhollow');
    // The starting town's buildings, however many R1's start lays out (a Granary joined in R1.0).
    expect(file.summary.buildings).toBe(w.buildings.length);
    expect(w.buildings.length).toBeGreaterThanOrEqual(5);
    const back = deserialize(base64ToBytes(file.snapshot.data));
    expect(back.time.connected).toEqual([]);
    expect(back.buildings).toHaveLength(w.buildings.length);
  });

  it('refuses files that are not valleys', () => {
    expect(() => readValleyFile(new Uint8Array([1, 2, 3]))).toThrow('not a City Qoti valley');
  });

  it('names files after the town, valley and season', () => {
    const name = valleyFileName(
      { ...defaultSettings(), townName: 'Mill End', valleyName: 'Willowmere' },
      2,
      'Autumn',
    );
    expect(name).toBe('mill-end-willowmere-year-2-autumn.qoti');
  });
});
