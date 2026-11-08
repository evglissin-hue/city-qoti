import { gunzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { WorldState } from '../src/contracts';
import { base64ToBytes, bytesToBase64, bytesToWords, wordsToBytes } from '../src/state/base64';
import { createWorld, defaultSettings } from '../src/state/create';
import { fnv64Hex, hashState } from '../src/state/hash';
import { deserialize, serialize } from '../src/state/serialize';
import { migrateSave, SAVE_VERSION, type Migration, type SaveObject } from '../src/state/version';
import { worldIndex } from '../src/state/worldIndex';
import { flatWorld, run } from './helpers';

const fp = (t: number) => t * 256 + 128;

function busyWorld(): WorldState {
  const w = flatWorld();
  run(w, {
    t: 'road.paint',
    kind: 'path',
    tiles: [
      [50, 50],
      [51, 50],
      [52, 50],
    ],
  });
  run(w, { t: 'build.place', def: 'house', x: 55, z: 55, rot: 2 }, 1);
  run(w, { t: 'decor.place', def: 'lantern', fx: fp(48), fz: fp(48), rot: 5 });
  run(w, { t: 'note.pin', x: 3, z: 4, text: 'Hello, valley' });
  run(w, { t: 'tree.plant', species: 'pine', x: 70, z: 70 });
  return w;
}

describe('base64 and byte order', () => {
  it('round trips bytes of every length', () => {
    for (let n = 0; n < 10; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
    expect(bytesToBase64(new Uint8Array([77, 97, 110]))).toBe('TWFu');
  });

  it('writes 32-bit words little-endian', () => {
    const words = new Int32Array([1, -1, 0x01020304]);
    const bytes = wordsToBytes(words);
    expect(Array.from(bytes.slice(8))).toEqual([4, 3, 2, 1]);
    expect(bytesToWords(bytes, new Int32Array(3))).toEqual(words);
  });
});

describe('hashState', () => {
  it('matches the FNV-1a 64 reference vectors', () => {
    expect(fnv64Hex(new Uint8Array())).toBe('cbf29ce484222325');
    expect(fnv64Hex(new Uint8Array([97]))).toBe('af63dc4c8601ec8c');
    expect(fnv64Hex(new Uint8Array([102, 111, 111, 98, 97, 114]))).toBe('85944171f73967e8');
  });

  it('changes with any state change and ignores derived indexes', () => {
    const w = busyWorld();
    const h = hashState(w);
    worldIndex(w);
    expect(hashState(w)).toBe(h);
    w.map.height[5] = (w.map.height[5]! + 1) % 16;
    expect(hashState(w)).not.toBe(h);
    const w2 = busyWorld();
    w2.notes[0]!.text = 'Hello, valley!';
    expect(hashState(w2)).not.toBe(h);
  });
});

describe('serialize', () => {
  it('round trips to an identical state', () => {
    const w = busyWorld();
    const back = deserialize(serialize(w));
    expect(hashState(back)).toBe(hashState(w));
    expect(back).toEqual(w);
    // Derived indexes are rebuilt on load.
    expect(worldIndex(back).decorGrid.near(fp(48), fp(48), 10)).toHaveLength(1);
  });

  it('produces gzip JSON with base64 layers and stable bytes', () => {
    const w = busyWorld();
    const bytes = serialize(w);
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);
    const json = JSON.parse(strFromU8(gunzipSync(bytes)));
    expect(json.saveVersion).toBe(SAVE_VERSION);
    expect(typeof json.map.height).toBe('string');
    expect(serialize(w)).toEqual(bytes);
  });

  it('round trips a generated valley', () => {
    const w = createWorld('serialize-me', defaultSettings());
    const back = deserialize(serialize(w));
    expect(hashState(back)).toBe(hashState(w));
  });

  it('refuses saves from the future and broken layers', () => {
    expect(() => migrateSave({ saveVersion: SAVE_VERSION + 1 })).toThrow(/newer/);
    expect(() => migrateSave({} as SaveObject)).toThrow(/saveVersion/);
  });
});

describe('migrations', () => {
  it('leaves current saves alone', () => {
    const save = { saveVersion: SAVE_VERSION, x: 1 };
    expect(migrateSave(save)).toBe(save);
  });

  it('runs registered steps in order and insists on each version bump', () => {
    const registry = new Map<number, Migration>([
      [SAVE_VERSION - 1, (s) => ({ ...s, saveVersion: s.saveVersion + 1, added: true })],
    ]);
    expect(migrateSave({ saveVersion: SAVE_VERSION - 1 }, registry)).toEqual({
      saveVersion: SAVE_VERSION,
      added: true,
    });
    expect(() => migrateSave({ saveVersion: SAVE_VERSION - 2 }, registry)).toThrow(/No migration/);
    const bad = new Map<number, Migration>([[SAVE_VERSION - 1, (s) => s]]);
    expect(() => migrateSave({ saveVersion: SAVE_VERSION - 1 }, bad)).toThrow(/must produce/);
  });
});
