import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import {
  ANCHOR_NAMES,
  anchorsFor,
  clearAnchorCache,
  deriveAnchors,
  plotBody,
  type GroundBox,
} from './anchors';
import { artKitId, kits } from './kits';
import type { AnchorRect, Kit } from './kits/types';

const EPS = 1e-6;

function footprintOf(kit: Kit): { size: [number, number]; entrance: [number, number] } {
  const def = content.buildings.find((b) => artKitId(b.art) === kit.id);
  return {
    size: def?.size ?? kit.footprint?.size ?? [2, 2],
    entrance: def?.entrance ?? kit.footprint?.entrance ?? [1, 1],
  };
}

function boxOf(r: AnchorRect): GroundBox {
  const [across, along] = r.size;
  const [hx, hz] = r.facing[0] === 0 ? [across / 2, along / 2] : [along / 2, across / 2];
  return [r.center[0] - hx, r.center[2] - hz, r.center[0] + hx, r.center[2] + hz];
}

function inside(b: GroundBox, outer: GroundBox): boolean {
  return b[0] >= outer[0] - EPS && b[1] >= outer[1] - EPS && b[2] <= outer[2] + EPS && b[3] <= outer[3] + EPS;
}

function overlaps(a: GroundBox, b: GroundBox): boolean {
  return a[0] < b[2] - EPS && b[0] < a[2] - EPS && a[1] < b[3] - EPS && b[1] < a[3] - EPS;
}

const buildingKits = kits.filter((k) => k.kind === 'building');

describe('anchors (V3.0)', () => {
  it('every building kit is in the list', () => {
    expect(buildingKits.length).toBeGreaterThan(20);
  });

  describe.each(buildingKits.map((k) => [k.id, k] as const))('%s', (_id, kit) => {
    const { size, entrance } = footprintOf(kit);
    const [w, d] = size;
    const plot: GroundBox = [0, 0, w, d];
    const a = anchorsFor(kit, { size, entrance });

    it('has every plot anchor', () => {
      for (const name of ANCHOR_NAMES) expect(a[name], name).toBeDefined();
    });

    it('has a door on the plot edge, facing out across it', () => {
      const [x, , z] = a.door!.at;
      const [fx, fz] = a.door!.facing;
      expect(Math.hypot(fx, fz)).toBeCloseTo(1, 6);
      expect(x).toBeGreaterThanOrEqual(-EPS);
      expect(x).toBeLessThanOrEqual(w + EPS);
      expect(z).toBeGreaterThanOrEqual(-EPS);
      expect(z).toBeLessThanOrEqual(d + EPS);
      // On (within a third of a tile of) the edge it faces across.
      const edge = fz > 0.5 ? d - z : fz < -0.5 ? z : fx > 0.5 ? w - x : x;
      expect(edge).toBeLessThanOrEqual(0.34);
    });

    it('has a yard inside the plot and off the house', () => {
      const yard = boxOf(a.yard!);
      expect(inside(yard, plot), JSON.stringify(yard)).toBe(true);
      expect(overlaps(yard, plotBody(size))).toBe(false);
      expect(a.yard!.size[0] * a.yard!.size[1]).toBeGreaterThan(0);
    });

    it("leaves the kit's own anchors alone", () => {
      const own = kit.anchors?.({ size, entrance }) ?? {};
      expect(a.lights ?? []).toEqual(own.lights ?? []);
      expect(a.smoke ?? []).toEqual(own.smoke ?? []);
      expect(a.sign).toEqual(own.sign);
      expect(a.animals).toEqual(own.animals);
    });
  });

  it('caches per kit and options, and keys on the lot', () => {
    const kit = buildingKits.find((k) => k.id === 'cottage')!;
    const a = anchorsFor(kit, { size: [2, 2], entrance: [1, 1] });
    expect(anchorsFor(kit, { size: [2, 2], entrance: [1, 1] })).toBe(a);
    expect(anchorsFor(kit, { size: [2, 2], entrance: [1, 1], lot: [0, -2, 3, 2] })).not.toBe(a);
    clearAnchorCache();
    expect(anchorsFor(kit, { size: [2, 2], entrance: [1, 1] })).not.toBe(a);
  });

  it("keeps a kit's own plot anchor over the derived one", () => {
    const door = { at: [0.5, 0, 2] as [number, number, number], facing: [0, 1] as [number, number] };
    const kit: Kit = {
      id: 'test-own-door',
      kind: 'building',
      build: () => {
        throw new Error('not built');
      },
      anchors: () => ({ door }),
    };
    const a = anchorsFor(kit, { size: [2, 2], entrance: [1, 1] });
    expect(a.door).toBe(door);
    expect(a.yard).toBeDefined();
  });

  it('gives decor kits only their own anchors', () => {
    const decor = kits.find((k) => k.kind === 'decor' && k.anchors)!;
    const a = anchorsFor(decor);
    for (const name of ANCHOR_NAMES) expect(a[name]).toBeUndefined();
  });

  it('puts the yard in a side garden and the garden behind when the lot is larger', () => {
    // A 2 x 2 house on a 3 x 4 lot: a tile of side garden on the right, two tiles of back garden.
    const lot: GroundBox = [0, -2, 3, 2];
    const a = deriveAnchors([2, 2], [1, 1], [], lot);
    const yard = boxOf(a.yard);
    expect(yard[0]).toBeCloseTo(2 - 0.22, 6);
    expect(yard[2]).toBeCloseTo(3, 6);
    const garden = boxOf(a.garden);
    [0, -2, 3, 0.3].forEach((v, i) => expect(garden[i]).toBeCloseTo(v, 6));
    expect(a.walls.map((r) => r.facing)).toEqual([
      [-1, 0],
      [0, -1],
      [1, 0],
    ]);
    expect(a.walls[1]!.start).toEqual([0, 0, -2]);
    expect(a.walls[1]!.end).toEqual([3, 0, -2]);
  });

  it('puts sills under lit ground-floor windows on the street face only', () => {
    const a = deriveAnchors(
      [3, 2],
      [1, 1],
      [
        [0.6, 0.52, 1.74],
        [2.4, 0.52, 1.74],
        [1.5, 1.12, 1.74],
        [0.22, 0.52, 1],
      ],
    );
    expect(a.sills.map((s) => s.at[0])).toEqual([0.6, 2.4]);
    for (const s of a.sills) expect(s.at[1]).toBeCloseTo(0.4, 6);
  });

  it('is deterministic', () => {
    expect(deriveAnchors([3, 3], [1, 2])).toEqual(deriveAnchors([3, 3], [1, 2]));
  });
});
