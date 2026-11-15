import { describe, expect, it } from 'vitest';
import { kitById } from './kits';

const kit = kitById.get('wildflowers')!;
const attr = (name: string, hue?: number) =>
  Array.from(
    kit.build({ seed: 101, ...(hue === undefined ? {} : { params: { hue } }) }).getAttribute(name)!.array,
  );

describe('wildflowers hue', () => {
  it('moves only colors, never the shape', () => {
    for (let hue = 0; hue < 5; hue++) expect(attr('position', hue)).toEqual(attr('position'));
  });

  it('gives each hue its own head color', () => {
    const seen = new Set<string>();
    for (let hue = 0; hue < 5; hue++) seen.add(attr('color', hue).join(','));
    expect(seen.size).toBe(5);
  });
});
