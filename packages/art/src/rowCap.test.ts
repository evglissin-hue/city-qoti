// V3X: every row kit, at every storeys value, corner and style, stays within the homes' far cap.
import { describe, expect, it } from 'vitest';
import { kitById } from './kits';
import type { KitBuildOptions } from './kits/types';

const KITS = ['cottage', 'house', 'townhouse', 'shop'] as const;
/** '' is the hamlet's own look; the rest are district styles. */
const STYLES = ['', 'brick', 'timber', 'stone', 'plaster'];
const STOREYS = [undefined, 1, 1.5, 2, 2.5, 3, 3.5, 4];
const CORNERS = [undefined, 'L', 'R'] as const;
/** Homes: at most this many triangles at the far level (docs/build/cycle-v1b-buildings-detail.md). */
const HOME_LOW = 150;

describe('far level cap across the row matrix (V3X)', () => {
  it('keeps every row kit at 150 triangles or fewer, far', { timeout: 120000 }, () => {
    let worst = 0;
    let worstAt = '';
    const over: string[] = [];
    for (const id of KITS)
      for (const style of STYLES)
        for (const storeys of STOREYS)
          for (const corner of CORNERS)
            for (const level of [1, 3])
              for (const seed of [1, 2, 3, 4, 5, 6]) {
                const params: Record<string, string | number | boolean> = {};
                if (style) params.style = style;
                if (style) params.level = level;
                else if (level === 3) continue;
                if (storeys) params.storeys = storeys;
                if (corner) {
                  params.corner = corner;
                  params[`street${corner}`] = true;
                }
                const o: KitBuildOptions = {
                  size: id === 'cottage' || id === 'townhouse' ? [2, 2] : [2, 3],
                  entrance: [1, id === 'house' || id === 'shop' ? 2 : 1],
                  seed,
                  lod: 'low',
                  params,
                };
                const n = kitById.get(id)!.build(o).getAttribute('position').count / 3;
                const label = `${id} ${style || 'hamlet'} storeys ${storeys ?? 'native'} corner ${corner ?? '-'} level ${level} seed ${seed}: ${n}`;
                if (n > worst) {
                  worst = n;
                  worstAt = label;
                }
                if (n > HOME_LOW) over.push(label);
              }
    console.info(`[rowCap] worst far: ${worst} at ${worstAt}; ${over.length} over`);
    expect(over.slice(0, 20)).toEqual([]);
  });
});
