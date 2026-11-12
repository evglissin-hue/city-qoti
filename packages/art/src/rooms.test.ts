import { describe, expect, it } from 'vitest';
import { createPatternArray, PATTERN_SIZE } from './patterns';
import { fillRooms, ROOM_UV, roomFor } from './rooms';
import { PATTERN_LAYERS, ROOM_LAYER, ROOM_LAYERS } from './surface';

const SIZE = PATTERN_SIZE;
const data = createPatternArray(SIZE).image.data as Uint8Array;
const texel = (layer: number, u: number, v: number): [number, number, number, number] => {
  const o = (layer * SIZE * SIZE + Math.floor(v * SIZE) * SIZE + Math.floor(u * SIZE)) * 4;
  return [data[o]!, data[o + 1]!, data[o + 2]!, data[o + 3]!];
};

describe('the rooms behind lit windows (V2A)', () => {
  it('paints eight different rooms into the room layers, and nothing else', () => {
    const before = new Uint8Array(SIZE * SIZE * 4 * PATTERN_LAYERS);
    fillRooms(before, SIZE);
    // Only the room layers are written.
    for (let i = 0; i < ROOM_LAYER * SIZE * SIZE * 4; i++) if (before[i] !== 0) throw new Error(`byte ${i}`);
    const sums = new Set<number>();
    for (let r = 0; r < ROOM_LAYERS; r++) {
      let sum = 0;
      for (let v = 0.12; v < 0.9; v += 0.05)
        for (let u = 0.08; u < 0.92; u += 0.05) sum += texel(ROOM_LAYER + r, u, v)[0];
      sums.add(sum);
    }
    expect(sums.size).toBe(ROOM_LAYERS);
  });

  it('lays out floor, ceiling and side walls where the shader reads them', () => {
    for (let r = 0; r < ROOM_LAYERS; r++) {
      const layer = ROOM_LAYER + r;
      const side = texel(layer, ROOM_UV.side / 2, 0.5);
      const otherSide = texel(layer, 1 - ROOM_UV.side / 2, 0.5);
      // Both side walls are the same plain wall.
      expect(side).toEqual(otherSide);
      expect(side[3]).toBe(0);
      // Floor and ceiling strips differ from the wall.
      const floor = texel(layer, 0.5 + 1 / 32, ROOM_UV.floor / 2);
      const ceiling = texel(layer, 0.55, (ROOM_UV.ceiling + 1) / 2);
      expect(floor.slice(0, 3)).not.toEqual(side.slice(0, 3));
      expect(ceiling.slice(0, 3)).not.toEqual(side.slice(0, 3));
    }
  });

  it('marks a figure in A on the back wall only, over the room painted under it', () => {
    for (let r = 0; r < ROOM_LAYERS; r++) {
      let marked = 0;
      for (let i = (ROOM_LAYER + r) * SIZE * SIZE; i < (ROOM_LAYER + r + 1) * SIZE * SIZE; i++) {
        if (data[i * 4 + 3] !== 255) continue;
        marked++;
        const v = (Math.floor((i % (SIZE * SIZE)) / SIZE) + 0.5) / SIZE;
        expect(v).toBeGreaterThan(ROOM_UV.floor);
        expect(v).toBeLessThan(ROOM_UV.ceiling);
      }
      expect(marked).toBeGreaterThan(200);
    }
  });

  it('picks the room and the figure by the building’s seed and the cell, every room in use', () => {
    const rooms = new Set<number>();
    let figures = 0;
    let n = 0;
    for (let x = 0; x < 192; x += 7)
      for (let z = 0; z < 192; z += 5)
        for (let cu = -1; cu <= 2; cu++)
          for (let cv = 0; cv <= 1; cv++) {
            const a = roomFor(x + 0.3, z + 0.6, cu, cv);
            expect(roomFor(x + 0.3, z + 0.6, cu, cv)).toEqual(a);
            expect(a.room).toBeGreaterThanOrEqual(0);
            expect(a.room).toBeLessThan(ROOM_LAYERS);
            rooms.add(a.room);
            if (a.figure) figures++;
            n++;
          }
    expect(rooms.size).toBe(ROOM_LAYERS);
    // Someone is home in about two rooms in five.
    expect(figures / n).toBeGreaterThan(0.3);
    expect(figures / n).toBeLessThan(0.5);
    // Neighboring cells on one facade show different rooms.
    expect(roomFor(40, 60, 0, 0).room).not.toBe(roomFor(40, 60, 1, 0).room);
  });
});
