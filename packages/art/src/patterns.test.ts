import { describe, expect, it } from 'vitest';
import { createPatternArray, lastPatternMs, PATTERN_ONE } from './patterns';
import { NOISE_LAYER, PATTERN_LAYERS, ROOM_LAYER, ROOM_LAYERS, SURFACE } from './surface';

const SIZE = 256;
const layerOf = (data: Uint8Array, layer: number): Uint8Array =>
  data.subarray(layer * SIZE * SIZE * 4, (layer + 1) * SIZE * SIZE * 4);

/** FNV-1a over the bytes, to pin the generators' output. */
function checksum(data: Uint8Array): number {
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i]!, 16777619) >>> 0;
  return h;
}

describe('pattern generators (V1A)', () => {
  const tex = createPatternArray();
  const data = tex.image.data as Uint8Array;

  it('generates quickly enough to run at load', () => {
    // The budget on the weaker laptop is 150 ms; a test machine under load gets some slack.
    console.info(`pattern generation: ${lastPatternMs().toFixed(1)} ms`);
    expect(lastPatternMs()).toBeLessThan(600);
  });

  it('is seeded: the same texels every time', () => {
    const again = createPatternArray().image.data as Uint8Array;
    expect(checksum(again)).toBe(checksum(data));
  });

  it('V2.0: holds every layer, the room layers last', () => {
    expect(tex.image.depth).toBe(PATTERN_LAYERS);
    expect(data.length).toBe(SIZE * SIZE * 4 * PATTERN_LAYERS);
    expect(ROOM_LAYER + ROOM_LAYERS).toBe(PATTERN_LAYERS);
  });

  it('leaves plain, glass and water flat (V2C paints the V2 surfaces, V2A the rooms)', () => {
    for (const id of [SURFACE.plain, SURFACE.glass, SURFACE.water]) {
      const l = layerOf(data, id);
      for (let i = 0; i < l.length; i += 4) {
        if (l[i] !== PATTERN_ONE || l[i + 1] !== 0 || l[i + 3] !== 0)
          throw new Error(`layer ${id} is not flat`);
      }
    }
  });

  it('averages close to neutral, so a pattern never darkens or lightens a surface overall', () => {
    for (let id = 1; id < PATTERN_LAYERS; id++) {
      if (id === SURFACE.flowers || id === NOISE_LAYER) continue;
      if (id >= ROOM_LAYER) continue; // V2.0: V2A's rooms are pictures, not neutral grain
      const l = layerOf(data, id);
      let sum = 0;
      for (let i = 0; i < l.length; i += 4) sum += l[i]!;
      const mean = sum / (l.length / 4) / PATTERN_ONE;
      expect(mean, `layer ${id}`).toBeGreaterThan(0.8);
      expect(mean, `layer ${id}`).toBeLessThan(1.12);
    }
  });

  it('V2C: gives the five V2 surfaces patterns, wear on painted wood and bloom on terracotta', () => {
    const v2 = [
      SURFACE.woodGrain,
      SURFACE.paintedWood,
      SURFACE.wroughtIron,
      SURFACE.terracotta,
      SURFACE.cloth,
    ];
    for (const id of v2) {
      const l = layerOf(data, id);
      let lo = 255;
      let hi = 0;
      for (let i = 0; i < l.length; i += 4) {
        lo = Math.min(lo, l[i]!);
        hi = Math.max(hi, l[i]!);
        expect(l[i + 3], `layer ${id} keeps A empty`).toBe(0);
      }
      // A visible pattern, never a texture pack: some spread, nothing near black or white.
      expect(hi - lo, `layer ${id}`).toBeGreaterThan(15);
      expect(lo, `layer ${id}`).toBeGreaterThan(50);
      expect(hi, `layer ${id}`).toBeLessThan(220);
    }
    const share = (id: number): number => {
      const l = layerOf(data, id);
      let on = 0;
      for (let i = 0; i < l.length; i += 4) if (l[i + 1]! > 127) on++;
      return on / (l.length / 4);
    };
    expect(share(SURFACE.paintedWood)).toBeGreaterThan(0.03);
    expect(share(SURFACE.paintedWood)).toBeLessThan(0.15);
    expect(share(SURFACE.terracotta)).toBeGreaterThan(0.02);
    expect(share(SURFACE.terracotta)).toBeLessThan(0.2);
    for (const id of [SURFACE.woodGrain, SURFACE.wroughtIron, SURFACE.cloth])
      expect(share(id), `${id}`).toBe(0);
  });

  it('marks mortar on brick, stripes on awnings and flowers on grass in G', () => {
    const share = (id: number): number => {
      const l = layerOf(data, id);
      let on = 0;
      for (let i = 0; i < l.length; i += 4) if (l[i + 1]! > 127) on++;
      return on / (l.length / 4);
    };
    expect(share(SURFACE.brick)).toBeGreaterThan(0.1);
    expect(share(SURFACE.brick)).toBeLessThan(0.3);
    expect(share(SURFACE.awning)).toBeCloseTo(0.5, 1);
    expect(share(SURFACE.grass)).toBeGreaterThan(0.005);
    expect(share(SURFACE.grass)).toBeLessThan(0.03);
  });

  it('tiles: the step across the wrap is no bigger than steps inside a layer', () => {
    for (const id of [
      SURFACE.plaster,
      SURFACE.timber,
      SURFACE.thatch,
      SURFACE.leaf,
      NOISE_LAYER,
      // V2C: the two built from noise alone (iron's spots, terracotta's grit and cloth's threads
      // are cells, which step anywhere, like brick and dirt).
      SURFACE.woodGrain,
      SURFACE.paintedWood,
    ]) {
      const l = layerOf(data, id);
      const at = (x: number, y: number): number => l[(y * SIZE + x) * 4]!;
      let wrap = 0;
      let inner = 0;
      for (let y = 0; y < SIZE; y++) {
        wrap = Math.max(wrap, Math.abs(at(SIZE - 1, y) - at(0, y)));
        inner = Math.max(inner, Math.abs(at(SIZE / 2, y) - at(SIZE / 2 - 1, y)));
      }
      for (let x = 0; x < SIZE; x++) {
        wrap = Math.max(wrap, Math.abs(at(x, SIZE - 1) - at(x, 0)));
        inner = Math.max(inner, Math.abs(at(x, SIZE / 2) - at(x, SIZE / 2 - 1)));
      }
      expect(wrap, `layer ${id}`).toBeLessThanOrEqual(inner + 3);
    }
  });
});
