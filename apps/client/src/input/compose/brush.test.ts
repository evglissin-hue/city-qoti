import { content } from '@qoti/content';
import { canPlaceDecor, decorRadius, decorTooClose, TILE_FP } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { reader, rejection, run } from '../../../../../packages/sim/test/helpers';
import { standardWorld } from '../../../../../packages/sim/test/hearth/helpers';
import { BRUSH_MAX_PIECES, brushPieces, brushSeed, isBrushFlower, strokeTiles } from './brush';

const c = (t: number) => t * TILE_FP + TILE_FP / 2;
const flowers = content.decor.filter((d) => isBrushFlower(d) && !d.locked);
const stroke = strokeTiles(Array.from({ length: 9 }, (_, i) => [c(40 + i), c(50)] as [number, number]));

describe('the flower brush', () => {
  it('has flowers to paint with', () => {
    expect(flowers.length).toBeGreaterThan(0);
  });

  it('paints the same drift for the same seed and another for another', () => {
    const w = standardWorld();
    const seed = brushSeed(40, 50);
    const a = brushPieces(reader(w), flowers, stroke, seed);
    const b = brushPieces(reader(w), flowers, stroke, seed);
    expect(a.length).toBeGreaterThan(3);
    expect(a).toEqual(b);
    expect(brushPieces(reader(w), flowers, stroke, brushSeed(41, 50))).not.toEqual(a);
  });

  it('keeps every piece placeable, apart from the others, and within a tile of the stroke', () => {
    const w = standardWorld();
    const pieces = brushPieces(reader(w), flowers, stroke, brushSeed(7, 9));
    expect(pieces.length).toBeLessThanOrEqual(BRUSH_MAX_PIECES);
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      expect(canPlaceDecor(reader(w), content.decorById.get(p.def)!, p.fx, p.fz, p.rot).ok).toBe(true);
      expect(Math.abs(p.fz - c(50))).toBeLessThanOrEqual(TILE_FP);
      for (let j = 0; j < i; j++) {
        const q = pieces[j]!;
        expect(decorTooClose(q.fx - p.fx, q.fz - p.fz, decorRadius(q.def), decorRadius(p.def))).toBe(false);
      }
    }
  });

  it('what it paints, the sim accepts as one command', () => {
    const w = standardWorld();
    const pieces = brushPieces(reader(w), flowers, stroke, brushSeed(40, 50));
    const ctx = run(w, {
      t: 'decor.placeRun',
      def: pieces[0]!.def,
      from: stroke[0]!,
      to: stroke[stroke.length - 1]!,
      pieces,
    });
    expect(rejection(ctx)).toBeUndefined();
    expect(w.decor).toHaveLength(pieces.length);
  });

  it('paints nothing where nothing can stand, or with nothing to paint', () => {
    const w = standardWorld();
    const size = reader(w).size;
    for (let z = 57; z <= 63; z++) for (let x = 57; x <= 63; x++) w.map.occupant[z * size + x] = 1;
    expect(brushPieces(reader(w), flowers, strokeTiles([[c(60), c(60)]]), 1)).toEqual([]);
    expect(brushPieces(reader(w), [], stroke, 1)).toEqual([]);
  });
});
