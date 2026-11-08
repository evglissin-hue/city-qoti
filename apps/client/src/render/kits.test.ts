import { kitById } from '@qoti/art';
import { content } from '@qoti/content';
import { normalizeSettings } from '@qoti/protocol';
import { defaultSettings } from '@qoti/sim';
import { describe, expect, it } from 'vitest';

describe('content and art', () => {
  it('names only art kits that exist in packages/art', () => {
    const defs = [...content.buildings, ...content.decor, ...content.trees];
    for (const def of defs) expect(kitById.has(def.art.kit), `${def.id} -> ${def.art.kit}`).toBe(true);
  });

  it('uses building kits for buildings, decor kits for decor and tree kits for trees', () => {
    for (const b of content.buildings) expect(kitById.get(b.art.kit)?.kind).toBe('building');
    for (const d of content.decor) expect(kitById.get(d.art.kit)?.kind).toBe('decor');
    for (const t of content.trees) expect(kitById.get(t.art.kit)?.kind).toBe('tree');
  });
});

describe('valley settings defaults', () => {
  it('match between the sim and the protocol', () => {
    // The one difference: no typed valley name stays empty in the protocol, and the sim names the
    // valley from its seed (createWorld; see packages/sim/test/p1/valley-name.test.ts).
    expect(normalizeSettings({})).toEqual({ ...defaultSettings(), valleyName: '' });
  });
});
