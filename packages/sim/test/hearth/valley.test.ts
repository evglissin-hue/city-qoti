// The Hearth systems on a real generated standard valley: a full charm map on the first tick,
// the founding, hints, and a couple of quiet days without surprises.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import { createValley, defaultSettings } from '../../src/state/create';
import { advanceTo, createTickCtx } from '../../src/turn';
import { S } from './helpers';

describe('a generated standard valley', () => {
  it('computes charm everywhere, writes the founding and shows three hints', () => {
    const w = createValley('hearth-valley', { ...defaultSettings(), mode: 'standard' });
    w.seats = [{ seat: 0, name: 'Ada', color: 0xd9822b, lens: 'hearth', lastSeenTick: 0 }];
    w.time.connected = [0];
    const ctx = createTickCtx(w);
    advanceTo(w, 1, ctx);
    expect(w.hearth.dirtyChunks).toEqual([]);
    let charmed = 0;
    for (let i = 0; i < S * S; i++) if (w.map.charm[i]) charmed++;
    // Forests, the river and the starting town all give the valley some charm.
    expect(charmed).toBeGreaterThan(S * 8);
    expect(w.chronicle[0]!.kind).toBe('founding');
    expect(w.chronicle[0]!.text).toMatch(/Ada/);
    const patches = ctx.dirty.collectPatches(w.map).filter((p) => p.layer === 'charm');
    expect(patches.length).toBeGreaterThan(0);

    ctx.events.length = 0;
    advanceTo(w, 2 * TICKS_PER_DAY, ctx);
    expect(w.hearth.hints).toHaveLength(3);
    expect(w.hearth.hints[0]).toBe('well-gathering-place');
    expect(w.wishes.length).toBeLessThanOrEqual(2);
  }, 60_000);
});
