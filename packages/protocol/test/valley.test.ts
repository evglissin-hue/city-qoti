import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage';
import { createValley, normalizeSettings } from '../src/valley';

// P1 (playtest item 13): the protocol may only import sim types, so a valley with no typed name
// stays unnamed here and the sim names it from its seed (packages/sim/test/p1/valley-name.test.ts).
describe('valley names', () => {
  it('leaves an untyped name empty for the sim to fill, and keeps a typed one', () => {
    expect(normalizeSettings({}).valleyName).toBe('');
    expect(normalizeSettings({ valleyName: '   ' }).valleyName).toBe('');
    expect(normalizeSettings({ valleyName: ' Home ' }).valleyName).toBe('Home');
  });

  it('stores the seed it was given, or twelve random hex characters', async () => {
    const typed = new MemoryStorage();
    const a = await createValley(typed, 'a', { seed: 'abc' }, 0);
    expect(a.seed).toBe('abc');
    expect((await typed.getMeta())!.valley.settings.valleyName).toBe('');
    const random = await createValley(new MemoryStorage(), 'b', {}, 0);
    expect(random.seed).toMatch(/^[0-9a-f]{12}$/);
  });
});
