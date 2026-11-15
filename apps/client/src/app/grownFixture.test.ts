// V2.0: the grown village scene (?debug&fixture=grown) is a snapshot of a run of the bench's
// autoplayer. When the sim stops reading it (R1's fresh start refuses older valleys), regrow it
// with `npm run fixture:grown -w @qoti/client` rather than loosening this test.
import { readFileSync } from 'node:fs';
import { base64ToBytes, deserialize } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { readValleyFile } from './valleyFile';

describe('the grown village fixture', () => {
  it('opens as a valley file: a Village of about 150 with its high street and decor', () => {
    const bytes = readFileSync(new URL('./fixtures/grown.qoti', import.meta.url));
    const file = readValleyFile(new Uint8Array(bytes));
    const state = deserialize(base64ToBytes(file.snapshot.data));
    expect(state.charter.rank).toBe('village');
    expect(state.residents.length).toBeGreaterThanOrEqual(130);
    expect(state.residents.length).toBeLessThanOrEqual(180);
    expect(state.lots.length).toBeGreaterThan(0);
    expect(state.buildings.some((b) => b.def === 'corner-shop')).toBe(true);
    expect(state.decor.length).toBeGreaterThan(500);
    expect(state.festival.history.length).toBeGreaterThan(0);
    expect(state.time.connected).toEqual([]);
  });
});
