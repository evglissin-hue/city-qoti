// V2B: the dab kit (`dabs.ts`): brush dabs over soft blobs, deterministic by seed, thinned in a fixed
// order, written through the caller's builder with surface leaf.
import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { brushDabs, dabTint, type DabBlob, type DabOptions } from './dabs';
import { ShapeBuilder } from './geometry';
import { kitById } from './kits';
import { SURFACE } from './surface';

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

function lay(opts: Partial<DabOptions> = {}, blobs: readonly DabBlob[] = BLOBS): ShapeBuilder {
  const b = new ShapeBuilder();
  brushDabs(b, blobs, { ...OPTS, ...opts });
  return b;
}

/** Each triangle as a string of its rounded corners, for set comparisons. */
function triangles(b: ShapeBuilder): Set<string> {
  const pos = b.build(false).getAttribute('position');
  const out = new Set<string>();
  for (let t = 0; t < pos.count / 3; t++) {
    const corners: string[] = [];
    for (let k = 0; k < 3; k++) {
      const v = t * 3 + k;
      corners.push([pos.getX(v), pos.getY(v), pos.getZ(v)].map((x) => x.toFixed(5)).join(','));
    }
    out.add(corners.sort().join('|'));
  }
  return out;
}

describe('dab kit (V2B)', () => {
  it('takes a builder, blobs and options and returns the triangles it wrote', () => {
    expect(brushDabs.length).toBe(3);
    const b = new ShapeBuilder();
    b.box(0, 0, 0, 1, 1, 1, 0xffffff);
    const before = b.triangles;
    const n = brushDabs(b, BLOBS, OPTS);
    expect(n).toBe(b.triangles - before);
  });

  it('stays within the count and covers the blobs with most of it', () => {
    for (const count of [60, 180, 320]) {
      const n = lay({ count, gaps: 0 }).triangles;
      expect(n, `count ${count}`).toBeLessThanOrEqual(count);
      expect(n, `count ${count}`).toBeGreaterThan(count * 0.6);
    }
  });

  it('gives the same geometry for the same seed, and other geometry for another', () => {
    const a = lay().build(false);
    const b = lay().build(false);
    const c = lay({ seed: 8 }).build(false);
    for (const name of ['position', 'normal', 'color', 'surface']) {
      expect(Array.from(a.getAttribute(name).array), name).toEqual(Array.from(b.getAttribute(name).array));
    }
    expect(Array.from(a.getAttribute('position').array)).not.toEqual(
      Array.from(c.getAttribute('position').array),
    );
  });

  it('only removes dabs as it thins, in a fixed order, down to none at 0', () => {
    const steps = [1, 0.75, 0.5, 0.25, 0].map((thin) => triangles(lay({ thin })));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.size, `step ${i}`).toBeLessThan(steps[i - 1]!.size);
      for (const t of steps[i]!) expect(steps[i - 1]!.has(t), `step ${i}`).toBe(true);
    }
    expect(steps[4]!.size).toBe(0);
    // About a quarter goes with each step.
    expect(steps[2]!.size / steps[0]!.size).toBeGreaterThan(0.3);
    expect(steps[2]!.size / steps[0]!.size).toBeLessThan(0.7);
  });

  it('only removes dabs for gaps too', () => {
    const full = triangles(lay({ gaps: 0 }));
    const open = triangles(lay({ gaps: 0.3 }));
    expect(open.size).toBeLessThan(full.size);
    for (const t of open) expect(full.has(t)).toBe(true);
  });

  it('writes leaf faces and restores the surface id it found', () => {
    const b = new ShapeBuilder();
    b.surface(SURFACE.thatch);
    brushDabs(b, BLOBS, OPTS);
    expect(b.surfaceId).toBe(SURFACE.thatch);
    const surf = b.build(false).getAttribute('surface');
    for (let i = 0; i < surf.count; i++) expect(surf.getX(i)).toBe(SURFACE.leaf);
  });

  it('writes nothing into a silent builder (a near-only part at the far level)', () => {
    const b = new ShapeBuilder('low');
    let n = -1;
    b.nearOnly(() => (n = brushDabs(b, BLOBS, OPTS)));
    expect(n).toBe(0);
    expect(b.triangles).toBe(0);
  });

  it('shades each dab by its soft normal: one normal on all three corners, pointing out', () => {
    const g = lay({ gaps: 0 }).build(false);
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    let outward = 0;
    for (let t = 0; t < pos.count / 3; t++) {
      const v = t * 3;
      for (let k = 1; k < 3; k++) {
        expect(nor.getX(v + k)).toBeCloseTo(nor.getX(v), 6);
        expect(nor.getY(v + k)).toBeCloseTo(nor.getY(v), 6);
      }
      // From the first blob's middle (both blobs share it as their normal point here, near enough).
      const d = (pos.getX(v) - 0) * nor.getX(v) + (pos.getY(v) - 2) * nor.getY(v) + pos.getZ(v) * nor.getZ(v);
      if (d > 0) outward++;
    }
    expect(outward / (pos.count / 3)).toBeGreaterThan(0.95);
  });

  it('lightens toward the sky', () => {
    const l = (hex: number) => {
      const c = new Color(hex);
      return c.r + c.g + c.b;
    };
    expect(l(dabTint(0x5c8a3a, 1, 0.7))).toBeGreaterThan(l(dabTint(0x5c8a3a, 0, 0.7)));
    expect(l(dabTint(0x5c8a3a, 0, 0.7))).toBeGreaterThan(l(dabTint(0x5c8a3a, -1, 0.7)));
    expect(dabTint(0x5c8a3a, 1, 0)).toBe(0x5c8a3a);
  });

  it('keeps both levels of a dabbed kit on the same attributes', () => {
    for (const id of ['oak', 'birch', 'pine', 'hedgerow']) {
      const kit = kitById.get(id)!;
      const high = Object.keys(kit.build({ seed: 48 }).attributes).sort();
      const low = Object.keys(kit.build({ seed: 48, lod: 'low' }).attributes).sort();
      expect(low, id).toEqual(high);
    }
  });
});
