import { describe, expect, it } from 'vitest';
import { brushDabs, type DabBlob, type DabOptions } from './dabs';
import { ShapeBuilder } from './geometry';

const BLOBS: DabBlob[] = [
  { center: [0, 2, 0], radii: [1, 0.8, 1], color: 0x6a8f3a },
  { center: [0.6, 2.6, 0.2], radii: [0.7, 0.6, 0.7], normalFrom: [0, 2, 0], color: 0x7da347 },
];
const OPTS: DabOptions = {
  count: 240,
  size: 0.22,
  tintSpread: 0.3,
  skyLighten: 0.25,
  gaps: 0.1,
  thin: 1,
  seed: 7,
};

describe('dab kit interface (V2.0)', () => {
  it('takes a builder, blobs and options and returns the triangles it wrote', () => {
    expect(brushDabs.length).toBe(3);
    const b = new ShapeBuilder();
    const n: number = brushDabs(b, BLOBS, OPTS);
    expect(n).toBe(b.triangles);
  });

  it('is a stub until V2B: writes nothing', () => {
    const b = new ShapeBuilder();
    b.box(0, 0, 0, 1, 1, 1, 0xffffff);
    const before = b.triangles;
    expect(brushDabs(b, BLOBS, OPTS)).toBe(0);
    expect(b.triangles).toBe(before);
  });
});
