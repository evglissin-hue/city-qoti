import { valleyNameFor } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage';
import { createValley, normalizeSettings } from '../src/valley';

describe('valley names (p1 chapter)', () => {
  it('an empty name takes the name the seed gives', () => {
    expect(normalizeSettings({ valleyName: '  ' }, 'willow-1').valleyName).toBe(valleyNameFor('willow-1'));
    expect(normalizeSettings({}, 'willow-1').valleyName).toBe(valleyNameFor('willow-1'));
  });

  it('a typed name wins over the seed', () => {
    expect(normalizeSettings({ valleyName: 'Home' }, 'willow-1').valleyName).toBe('Home');
  });

  it('createValley names a typed seed, and a random seed, after the seed it stores', async () => {
    const storage = new MemoryStorage();
    const a = await createValley(storage, 'a', { seed: 'abc' }, 0);
    expect(a.seed).toBe('abc');
    expect((await storage.getMeta())!.valley.settings.valleyName).toBe(valleyNameFor('abc'));
    const other = new MemoryStorage();
    const b = await createValley(other, 'b', {}, 0);
    expect(b.seed).toMatch(/^[0-9a-f]{12}$/);
    expect((await other.getMeta())!.valley.settings.valleyName).toBe(valleyNameFor(b.seed));
  });

  it('different seeds give different names often enough to matter', () => {
    const names = new Set(Array.from({ length: 20 }, (_, i) => valleyNameFor(`seed-${i}`)));
    expect(names.size).toBeGreaterThan(10);
  });
});
