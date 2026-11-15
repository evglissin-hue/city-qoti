import { describe, expect, it } from 'vitest';
import { overlays } from '../ui/lenses';
import { toolIcon } from '../ui/icons';
import { bubblesFor, overlayKindFor } from './bubbles';

describe('the Moods overlay (V2C)', () => {
  it('has one registry line on the hearth lens with an icon that exists', () => {
    const lines = overlays.filter((o) => o.id === 'bubbles');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.lens).toBe('hearth');
    expect(toolIcon(lines[0]!.id, lines[0]!.icon)).not.toBeNull();
  });

  it('turns bubbles on for bubbles only and keeps the overlays layer quiet for it', () => {
    expect(bubblesFor('bubbles')).toBe(true);
    expect(bubblesFor('charm')).toBe(false);
    expect(bubblesFor(null)).toBe(false);
    expect(overlayKindFor('bubbles')).toBeNull();
    expect(overlayKindFor('charm')).toBe('charm');
    expect(overlayKindFor(null)).toBeNull();
  });
});
