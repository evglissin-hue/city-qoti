// R3F: the supplied pieces' resting looks and lamplight in the kits (docs/spec/19-evenings.md,
// Supplies). Every rest a piece can take is built at both levels and checked as P3C's stand-in check
// checks a kit (every attribute, on its anchor, no large pale face without a surface), and reads as
// its rest: nothing glows on a cold fire or an unlit lamp, and the parts a rest leaves alone keep
// their colors, so a piece never changes tint when it rests.
import { content } from '@qoti/content';
import type { BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { artKitId, kitById } from './kits';
import {
  clothOf,
  faded,
  lampFlameGeometry,
  LAMP_LIT_GLOW,
  lampGlassColor,
  restOf,
  type PieceRest,
} from './kits/lamplight';
import { extraGeometry, POLE_CARRY, POLE_REACH, POLE_TIP } from './kits/residents';
import type { KitBuildOptions } from './kits/types';
import { palette } from './palette';

/** Every supplied decor def with its kit's params and its rest. */
const SUPPLIED = content.decor
  .filter((d) => d.supply)
  .map((d) => ({
    id: d.id,
    kit: kitById.get(artKitId(d.art))!,
    params: d.art.params ?? {},
    rest: d.supply!.rests,
  }));

const build = (s: (typeof SUPPLIED)[number], extra: Record<string, string>, lod?: 'low'): BufferGeometry =>
  s.kit.build({ params: { ...s.params, ...extra }, ...(lod ? { lod } : {}) } as KitBuildOptions);

const glowMax = (g: BufferGeometry): number => {
  const a = g.getAttribute('glow');
  let m = 0;
  for (let i = 0; i < a.count; i++) m = Math.max(m, a.getX(i));
  return m;
};

/** P3C's stand-in check in short: attributes, unit normals, no pale plain face over 0.1, base at 0. */
function standIn(g: BufferGeometry, far: boolean): string[] {
  const out: string[] = [];
  const pos = g.getAttribute('position');
  for (const name of ['normal', 'color', 'glow', 'surface']) {
    const a = g.getAttribute(name);
    if (!a || a.count !== pos.count) out.push(`no ${name}`);
  }
  if (out.length) return out;
  const nor = g.getAttribute('normal');
  const col = g.getAttribute('color');
  const surf = g.getAttribute('surface');
  let minY = Infinity;
  for (let v = 0; v < pos.count; v++) {
    minY = Math.min(minY, pos.getY(v));
    const n = Math.hypot(nor.getX(v), nor.getY(v), nor.getZ(v));
    if (!(Math.abs(n - 1) < 0.05)) out.push(`normal ${v}`);
  }
  for (let t = 0; t + 2 < pos.count; t += 3) {
    if (surf.getX(t) !== 0) continue;
    const luma = 0.2126 * col.getX(t) + 0.7152 * col.getY(t) + 0.0722 * col.getZ(t);
    if (luma <= 0.45) continue;
    const ax = pos.getX(t + 1) - pos.getX(t);
    const ay = pos.getY(t + 1) - pos.getY(t);
    const az = pos.getZ(t + 1) - pos.getZ(t);
    const bx = pos.getX(t + 2) - pos.getX(t);
    const by = pos.getY(t + 2) - pos.getY(t);
    const bz = pos.getZ(t + 2) - pos.getZ(t);
    const area = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
    if (!far && area > 0.1) out.push(`pale plain face ${area.toFixed(2)}`);
  }
  if (!far && minY < -0.001) out.push(`sunk ${minY.toFixed(3)}`);
  if (!far && minY > 0.03) out.push(`floats ${minY.toFixed(3)}`);
  return out;
}

describe('resting pieces (R3F)', () => {
  it('covers every supplied piece in content, each with a kit', () => {
    expect(SUPPLIED.map((s) => s.id).sort()).toEqual(
      [
        'birdbath',
        'bonfire',
        'brazier',
        'bunting',
        'cafe-table',
        'festival-stage',
        'festival-table',
        'flower-arch',
        'fountain',
        'hanging-lantern',
        'lamp-post',
        'lantern',
        'maypole',
      ].sort(),
    );
    for (const s of SUPPLIED) expect(s.kit, s.id).toBeDefined();
    // The brazier is drawn by a kit of its own now, not the lantern's.
    expect(SUPPLIED.find((s) => s.id === 'brazier')!.kit.id).toBe('brazier');
  });

  it('builds every rest at both levels as a sound piece (the stand-in check)', () => {
    const bad: string[] = [];
    for (const s of SUPPLIED)
      for (const extra of [{}, { rest: s.rest }, ...(s.rest === 'unlit' ? [{ flame: 'off' }] : [])] as Record<
        string,
        string
      >[])
        for (const lod of [undefined, 'low'] as const)
          for (const f of standIn(build(s, extra, lod), lod === 'low'))
            bad.push(`${s.id} ${JSON.stringify(extra)} ${lod ?? 'high'}: ${f}`);
    expect(bad).toEqual([]);
  });

  it('changes how each piece looks when it rests', () => {
    for (const s of SUPPLIED) {
      const a = build(s, {});
      const b = build(s, { rest: s.rest });
      const same =
        a.getAttribute('position').count === b.getAttribute('position').count &&
        (a.getAttribute('color').array as Float32Array).every(
          (v, i) => v === (b.getAttribute('color').array as Float32Array)[i],
        );
      expect(same, s.id).toBe(false);
    }
  });

  it('lets nothing glow on a cold fire or an unlit lamp, and a lamp the client lights glows none of its own', () => {
    for (const s of SUPPLIED) {
      if (s.rest === 'cold' || s.rest === 'unlit') {
        expect(glowMax(build(s, {})), s.id).toBe(2);
        expect(glowMax(build(s, { rest: s.rest })), s.id).toBe(0);
        expect(glowMax(build(s, { rest: s.rest }, 'low')), s.id).toBe(0);
      }
      if (s.rest === 'unlit') expect(glowMax(build(s, { flame: 'off' })), s.id).toBe(0);
    }
  });

  it('keeps the colors of what a rest leaves alone (no tint change when a fountain runs dry)', () => {
    const fountain = SUPPLIED.find((s) => s.id === 'fountain')!;
    const wet = build(fountain, {}).getAttribute('color').array as Float32Array;
    const dry = build(fountain, { rest: 'dry' }).getAttribute('color').array as Float32Array;
    // The basin's wall is drawn first, in both.
    expect([...dry.slice(0, 60)]).toEqual([...wet.slice(0, 60)]);
  });

  it('reads its rest only from params, and washes faded cloth toward the paper', () => {
    expect(restOf({ params: { rest: 'faded' } })).toBe('faded');
    expect(restOf({ params: { rest: 'gone' } })).toBeNull();
    expect(restOf()).toBeNull();
    const red = 0xe9707a;
    const lum = (h: number) => ((h >> 16) & 255) * 0.3 + ((h >> 8) & 255) * 0.55 + (h & 255) * 0.15;
    const sat = (h: number) =>
      Math.max((h >> 16) & 255, (h >> 8) & 255, h & 255) - Math.min((h >> 16) & 255, (h >> 8) & 255, h & 255);
    expect(sat(faded(red))).toBeLessThan(sat(red) * 0.5);
    expect(lum(faded(red))).toBeGreaterThan(lum(red));
    expect(clothOf(red, { params: { rest: 'faded' } })).toBe(faded(red));
    expect(clothOf(red)).toBe(red);
    const rests: PieceRest[] = ['bare', 'cold', 'dry', 'unlit'];
    for (const rest of rests) expect(clothOf(red, { params: { rest } })).toBe(red);
  });
});

describe('lamplight (R3F)', () => {
  it('gives each town lamp its glass as flame boxes, matching the glass it draws', () => {
    for (const id of ['lantern', 'hanging-lantern', 'lamp-post']) {
      const s = SUPPLIED.find((p) => p.id === id)!;
      const flames = s.kit.anchors?.({ params: s.params }).flames ?? [];
      expect(flames.length, id).toBe(id === 'lamp-post' ? 2 : 1);
      // Every glowing vertex of today's build lies in one of the boxes.
      const g = build(s, {});
      const pos = g.getAttribute('position');
      const glow = g.getAttribute('glow');
      for (let v = 0; v < pos.count; v++) {
        if (glow.getX(v) < 1.5) continue;
        const inside = flames.some((f) =>
          [0, 1, 2].every(
            (k) => Math.abs([pos.getX(v), pos.getY(v), pos.getZ(v)][k]! - f.center[k]!) <= f.half[k]! + 1e-4,
          ),
        );
        expect(inside, id).toBe(true);
      }
    }
  });

  it('draws a lamp waiting for the lamplighter in clean glass, and one with no candle in sooty glass', () => {
    expect(lampGlassColor()).toBe(palette.lantern);
    expect(lampGlassColor({ params: { flame: 'off' } })).toBe(palette.lanternGlass);
    expect(lampGlassColor({ params: { rest: 'unlit' } })).toBe(palette.lanternDark);
  });

  it('lights a lamp with a unit box of glow 3', () => {
    const g = lampFlameGeometry();
    g.computeBoundingBox();
    expect(g.boundingBox!.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
    expect(g.boundingBox!.max.toArray()).toEqual([0.5, 0.5, 0.5]);
    const glow = g.getAttribute('glow');
    for (let i = 0; i < glow.count; i++) expect(glow.getX(i)).toBe(LAMP_LIT_GLOW);
  });

  it('gives the lamplighter a pole whose light rises toward upright as he reaches', () => {
    const g = extraGeometry('pole');
    expect(g.getAttribute('position').count).toBeGreaterThan(0);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeGreaterThan(POLE_TIP[1]);
    expect(POLE_REACH).toBeLessThan(POLE_CARRY);
  });
});
