// V3X: timber braces stay clear of windows, doors and shopfronts, at every storeys value (the
// braces on added floors used to run behind windows). The probe reports every brace drawn and every
// opening a held kit noted; no brace may cross an opening on the same face.
import { describe, expect, it } from 'vitest';
import { kitById } from './kits';
import { braceCrosses, probeFrames } from './kits/parts';
import type { KitBuildOptions } from './kits/types';

const KITS = ['cottage', 'house', 'townhouse', 'shop'] as const;
/** '' is the hamlet's own kit (timber on some seeds); the others are district looks. */
const STYLES = ['', 'timber', 'plaster', 'brick', 'stone'];
const STOREYS = [undefined, 1, 1.5, 2, 2.5, 3, 3.5, 4];
const CORNERS = [undefined, 'L', 'R'] as const;
const SEEDS = [1, 2, 3, 4, 5, 6];

function opts(
  id: string,
  style: string,
  storeys: number | undefined,
  corner: 'L' | 'R' | undefined,
  seed: number,
): KitBuildOptions {
  const params: Record<string, string | number | boolean> = {};
  if (style) {
    params.style = style;
    params.level = 2;
  }
  if (storeys) params.storeys = storeys;
  if (corner) {
    params.corner = corner;
    params[`street${corner}`] = true;
  }
  return {
    size: id === 'cottage' || id === 'townhouse' ? [2, 2] : [2, 3],
    entrance: [1, id === 'house' || id === 'shop' ? 2 : 1],
    seed,
    params,
  };
}

describe('timber braces clear of openings (V3X)', () => {
  it('never cross a window, door or shopfront, and still frame the walls', { timeout: 120000 }, () => {
    const crossing: string[] = [];
    let drawn = 0;
    let tall = 0;
    for (const id of KITS)
      for (const style of STYLES)
        for (const storeys of STOREYS)
          for (const corner of CORNERS)
            for (const seed of SEEDS) {
              const p = probeFrames(true)!;
              kitById.get(id)!.build(opts(id, style, storeys, corner, seed));
              probeFrames(false);
              drawn += p.braces.length;
              if ((storeys ?? 2) >= 3) tall += p.braces.length;
              for (const b of p.braces)
                for (const o of p.openings)
                  if (braceCrosses(b, o))
                    crossing.push(
                      `${id} ${style || 'hamlet'} storeys ${storeys ?? 'native'} corner ${corner ?? '-'} seed ${seed} ${b.f.dir}`,
                    );
            }
    expect(crossing.slice(0, 10)).toEqual([]);
    // The check is not vacuous: braces are drawn, on added floors too.
    expect(drawn).toBeGreaterThan(500);
    expect(tall).toBeGreaterThan(100);
  });
});
