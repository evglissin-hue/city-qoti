import { describe, expect, it } from 'vitest';
import { ShapeBuilder } from './geometry';
import { kitById, kits } from './kits';
import { cartBodyGeometry, cartWheelGeometry, mergeFlat } from './kits/vehicles';
import { standingAnimal } from './kits/animals';
import { palette2 } from './palette';
import { createPatternArray, PATTERN_ONE } from './patterns';
import { NOISE_LAYER, PATTERN_LAYERS, SURFACE, surfaceDef, SURFACES } from './surface';

const OPTS = { size: [2, 2] as [number, number], entrance: [1, 1] as [number, number] };

describe('surface ids (V1.0)', () => {
  it('keep the concept viewer numbers, append-only', () => {
    // Changing this list breaks every kit and screenshot: add new surfaces at the end only.
    expect(Object.entries(SURFACE)).toEqual([
      ['plain', 0],
      ['plaster', 1],
      ['brick', 2],
      ['stone', 3],
      ['timber', 4],
      ['tile', 5],
      ['slate', 6],
      ['thatch', 7],
      ['cobble', 8],
      ['glass', 9],
      ['grass', 10],
      ['dirt', 11],
      ['water', 12],
      ['leaf', 13],
      ['zinc', 14],
      ['awning', 15],
      ['field', 16],
      ['flags', 17],
      ['flowers', 18],
    ]);
    expect(NOISE_LAYER).toBe(19);
    expect(PATTERN_LAYERS).toBe(20);
  });

  it('have one table row each, indexed by id, with sane values', () => {
    expect(SURFACES.length).toBe(Object.keys(SURFACE).length);
    SURFACES.forEach((s, i) => {
      expect(s.id, s.name).toBe(i);
      expect(SURFACE[s.name]).toBe(i);
      expect(s.scale, s.name).toBeGreaterThan(0);
      expect(s.strength, s.name).toBeGreaterThanOrEqual(0);
      expect(s.strength, s.name).toBeLessThanOrEqual(1);
      if (s.accent) expect(typeof palette2[s.accent.token], s.name).toBe('number');
    });
    expect(surfaceDef(SURFACE.slate).mapping).toBe('roof');
    expect(surfaceDef(SURFACE.brick).accent?.token).toBe('mortar');
    expect(surfaceDef(SURFACE.awning).accent?.token).toBe('stripe');
    expect(surfaceDef(250).name).toBe('plain');
  });
});

describe('ShapeBuilder surfaces (V1.0)', () => {
  it('writes the id set before each face, plain before any', () => {
    const b = new ShapeBuilder();
    b.box(0, 0, 0, 1, 1, 1, 0xffffff); // 12 triangles, plain
    b.surface(SURFACE.brick).box(0, 1, 0, 1, 2, 1, 0xffffff);
    b.surface(SURFACE.slate).gable(0, 0, 1, 1, 2, 2.5, 0xffffff, true);
    const g = b.build();
    const surface = g.getAttribute('surface');
    expect(surface.count).toBe(g.getAttribute('position').count);
    expect(surface.array).toBeInstanceOf(Uint8Array);
    const ids = Array.from(surface.array);
    expect(ids.slice(0, 36).every((v) => v === 0)).toBe(true);
    expect(ids.slice(36, 72).every((v) => v === SURFACE.brick)).toBe(true);
    expect(ids.slice(72).every((v) => v === SURFACE.slate)).toBe(true);
  });

  it('reads 0 on every kit that sets none (all of them, until V1B and V1C)', () => {
    for (const kit of kits) {
      const g = kit.build(kit.kind === 'building' ? OPTS : undefined);
      const surface = g.getAttribute('surface');
      expect(surface, kit.id).toBeDefined();
      expect(surface.count, kit.id).toBe(g.getAttribute('position').count);
      expect(
        Array.from(surface.array).every((v) => v === 0),
        kit.id,
      ).toBe(true);
    }
  });

  it('survive merging, and rigged pieces are plain', () => {
    const brick = new ShapeBuilder().surface(SURFACE.brick).box(0, 0, 0, 1, 1, 1, 0xffffff).build();
    const parts = [cartBodyGeometry(0), brick, standingAnimal('pony', 0), cartWheelGeometry()];
    const merged = mergeFlat(parts);
    const ids = Array.from(merged.getAttribute('surface').array);
    expect(ids.length).toBe(merged.getAttribute('position').count);
    const start = parts[0]!.getAttribute('position').count;
    expect(ids.slice(start, start + 36).every((v) => v === SURFACE.brick)).toBe(true);
    expect(ids.filter((v) => v !== 0).length).toBe(36);
    const pony = standingAnimal('pony', 0).getAttribute('surface');
    expect(Array.from(pony.array).every((v) => v === 0)).toBe(true);
    // Buildings swap between levels in one batch: both carry the same attributes.
    const cottage = kitById.get('cottage')!;
    const high = Object.keys(cottage.build({ ...OPTS, lod: 'high' }).attributes).sort();
    const low = Object.keys(cottage.build({ ...OPTS, lod: 'low' }).attributes).sort();
    expect(low).toEqual(high);
  });
});

describe('pattern array (V1.0)', () => {
  it('has a layer per surface plus the noise layer, and fills flat on request', () => {
    const tex = createPatternArray(256, 'flat');
    expect(tex.image.width).toBe(256);
    expect(tex.image.height).toBe(256);
    expect(tex.image.depth).toBe(20);
    expect(tex.generateMipmaps).toBe(true);
    const data = tex.image.data as Uint8Array;
    expect(data.length).toBe(256 * 256 * 20 * 4);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== PATTERN_ONE || data[i + 1] !== 0 || data[i + 2] !== 0 || data[i + 3] !== 0) {
        throw new Error(`texel ${i / 4} is not flat`);
      }
    }
    expect(createPatternArray(64, 'flat').image.width).toBe(64);
  });
});

describe('palette 2.0 (V1.0)', () => {
  it('holds 24-bit colors only', () => {
    for (const [name, v] of Object.entries(palette2)) {
      const list = typeof v === 'number' ? [v] : [...v];
      expect(list.length, name).toBeGreaterThan(0);
      for (const c of list) {
        expect(Number.isInteger(c), name).toBe(true);
        expect(c, name).toBeGreaterThanOrEqual(0);
        expect(c, name).toBeLessThanOrEqual(0xffffff);
      }
    }
  });
});
