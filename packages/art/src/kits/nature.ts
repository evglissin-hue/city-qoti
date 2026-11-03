// C3D-1: small nature props the renderer scatters between things: bushes, grass tufts, wildflowers,
// reeds, rocks, ferns, mushrooms and fallen logs. Never placed by players and never sim state; the
// renderer picks spots from the map with a seeded hash. Centered on the origin, base at y = 0,
// about the size they would be next to a 0.3 tile resident. `opts.seed` picks a variant;
// `opts.lod` 'low' is a cheaper version where one makes sense.
import { mixHex, seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import type { Kit } from './types';

const LEAF_DARK = 0x4f7a34;
const GRASS_BLADE = 0x7fa24c;
const GRASS_TIP = 0xb3c766;
const REED = 0x8b9a52;
const CATTAIL = 0x6b4a2f;
const MOSS = 0x7d8f4e;
const FERN = 0x5e8c3e;
const CAP_RED = 0xc4533f;
const CAP_BROWN = 0xa8774a;
const STEM = 0xf1e6cf;

export const bush: Kit = {
  id: 'bush',
  kind: 'nature',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 3);
    const leaf = vary(mixHex(LEAF_DARK, palette.oakLeaf, 0.5), rnd, 1.5);
    const top = mixHex(leaf, 0xc8e070, 0.16);
    const s = new ShapeBuilder();
    if (opts?.lod === 'low') {
      s.blob(0, 0.18, 0, 0.24, 0.16, 0.22, leaf, 0, rnd, 0.1, top);
      return s.build();
    }
    s.blob(0, 0.18, 0, 0.2, 0.15, 0.19, leaf, 1, rnd, 0.14, top);
    s.blob(0.13, 0.13, 0.06, 0.13, 0.11, 0.13, vary(leaf, rnd), 1, rnd, 0.14, top);
    if (rnd() < 0.6) {
      // Some bushes flower: a few berries or blossoms dotted on the outside.
      const dot = rnd() < 0.5 ? 0xf1e6f0 : 0xd8556b;
      for (let i = 0; i < 4; i++) {
        const a = rnd() * Math.PI * 2;
        s.blob(Math.cos(a) * 0.19, 0.15 + rnd() * 0.1, Math.sin(a) * 0.17, 0.025, 0.025, 0.025, dot, 0);
      }
    } else {
      s.blob(-0.12, 0.12, -0.05, 0.12, 0.1, 0.12, vary(leaf, rnd), 1, rnd, 0.14, top);
    }
    return s.build();
  },
};

export const grassTuft: Kit = {
  id: 'grass-tuft',
  kind: 'nature',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 5);
    const s = new ShapeBuilder();
    const n = opts?.lod === 'low' ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.8;
      const r = rnd() * 0.04;
      const c = vary(mixHex(GRASS_BLADE, GRASS_TIP, rnd() * 0.6), rnd, 1.5);
      s.blade(Math.cos(a) * r, Math.sin(a) * r, 0.08 + rnd() * 0.07, 0.025, 0.03 + rnd() * 0.04, a, c, c);
    }
    return s.build(false);
  },
};

export const wildflowers: Kit = {
  id: 'wildflowers',
  kind: 'nature',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 9);
    const s = new ShapeBuilder();
    const colors = [0xf2a1b4, 0xf3d35b, 0xa996e6, 0xf7f4ec, 0xe9707a];
    const head = colors[Math.floor(rnd() * colors.length)]!;
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.02 + rnd() * 0.05;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = 0.07 + rnd() * 0.06;
      const lean = 0.01 + rnd() * 0.015;
      s.blade(x, z, h, 0.012, lean, a, GRASS_BLADE, GRASS_BLADE);
      const c = rnd() < 0.8 ? head : colors[Math.floor(rnd() * colors.length)]!;
      s.blob(x + Math.cos(a) * lean, h, z + Math.sin(a) * lean, 0.022, 0.014, 0.022, c, 0);
    }
    return s.build(false);
  },
};

export const reeds: Kit = {
  id: 'reeds',
  kind: 'nature',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 4);
    const s = new ShapeBuilder();
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 0.07;
      const c = vary(REED, rnd, 1.5);
      s.blade(Math.cos(a) * r, Math.sin(a) * r, 0.16 + rnd() * 0.12, 0.022, 0.02 + rnd() * 0.05, a, c, c);
    }
    // Two cattails standing above the blades.
    for (let i = 0; i < 2; i++) {
      const x = (rnd() - 0.5) * 0.08;
      const z = (rnd() - 0.5) * 0.08;
      const h = 0.25 + rnd() * 0.08;
      s.cylinder(x, z, 0.004, 0.004, 0, h, REED, 3);
      s.cylinder(x, z, 0.014, 0.012, h, h + 0.06, CATTAIL, 4);
    }
    return s.build(false);
  },
};

export const rock: Kit = {
  id: 'rock',
  kind: 'nature',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 8);
    const stone = vary(mixHex(palette.rock, palette.stone, rnd()), rnd, 1.6);
    const s = new ShapeBuilder();
    const detail = opts?.lod === 'low' ? 0 : 1;
    // A squat boulder with a mossy top and, sometimes, a pebble beside it.
    // The renderer sinks rocks a little into the ground.
    const ry = 0.09 + rnd() * 0.04;
    s.blob(
      0,
      ry * 1.25,
      0,
      0.13 + rnd() * 0.05,
      ry,
      0.11 + rnd() * 0.04,
      stone,
      detail,
      rnd,
      0.22,
      mixHex(stone, MOSS, 0.55),
    );
    if (detail && rnd() < 0.6) s.blob(0.15, 0.045, 0.06, 0.05, 0.035, 0.045, vary(stone, rnd), 0, rnd, 0.2);
    return s.build();
  },
};

export const fern: Kit = {
  id: 'fern',
  kind: 'nature',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 6);
    const s = new ShapeBuilder();
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
      const c = vary(FERN, rnd, 1.6);
      // Fronds arch outwards and low.
      s.blade(0, 0, 0.09 + rnd() * 0.04, 0.05, 0.12 + rnd() * 0.05, a, c, mixHex(c, GRASS_TIP, 0.3));
    }
    return s.build(false);
  },
};

export const mushrooms: Kit = {
  id: 'mushrooms',
  kind: 'nature',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 12);
    const s = new ShapeBuilder();
    const red = rnd() < 0.5;
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const x = (rnd() - 0.5) * 0.12;
      const z = (rnd() - 0.5) * 0.12;
      const h = 0.035 + rnd() * 0.035;
      const r = 0.022 + rnd() * 0.018;
      s.cylinder(x, z, r * 0.4, r * 0.35, 0, h, STEM, 4);
      s.cylinder(x, z, r, 0, h - 0.008, h + r * 0.9, red ? CAP_RED : vary(CAP_BROWN, rnd), 6);
      if (red) s.blob(x + r * 0.3, h + r * 0.45, z, 0.006, 0.004, 0.006, 0xfff8ee, 0);
    }
    return s.build(false);
  },
};

export const fallenLog: Kit = {
  id: 'fallen-log',
  kind: 'nature',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 10);
    const s = new ShapeBuilder();
    const bark = vary(palette.bark, rnd);
    const wood = mixHex(palette.wood, 0xd9b98a, 0.4);
    const len = 0.5 + rnd() * 0.25;
    const r = 0.055 + rnd() * 0.02;
    const sides = 6;
    // A six-sided log lying along x, with pale cut ends and a little moss on top.
    const ring = (x: number, k: number): V3[] =>
      Array.from({ length: sides }, (_, i) => {
        const a = (i / sides) * Math.PI * 2;
        return [x, r * k + Math.sin(a) * r * k, Math.cos(a) * r * k] as V3;
      });
    const a = ring(-len / 2, 1);
    const b = ring(len / 2, 0.85);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const mid = ((i + 0.5) / sides) * Math.PI * 2;
      const up = Math.sin(mid);
      s.quad(a[i]!, a[j]!, b[j]!, b[i]!, up > 0.6 ? mixHex(bark, MOSS, 0.6) : bark, [0, up, Math.cos(mid)]);
    }
    for (let i = 1; i < sides - 1; i++) {
      s.tri(a[0]!, a[i]!, a[i + 1]!, wood, [-1, 0, 0]);
      s.tri(b[0]!, b[i]!, b[i + 1]!, wood, [1, 0, 0]);
    }
    // A broken branch stub.
    s.cylinder(0.05, 0, 0.018, 0.012, r * 1.6, r * 1.6 + 0.08, bark, 3);
    return s.build();
  },
};

const PAD = 0x5f8a45;
const PAD_LIGHT = 0x86a95a;

/**
 * V1C: lily pads on still water: a few flat round leaves, each with its notch, and now and then a
 * pale flower. Lies flat at y 0 (the renderer sets it on the water line). Low: the pads alone.
 */
export const lilyPads: Kit = {
  id: 'lily-pads',
  kind: 'nature',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 23);
    const s = new ShapeBuilder();
    const low = opts?.lod === 'low';
    const pads = 3 + Math.floor(rnd() * 3);
    const flower = rnd() < 0.6;
    const seg = low ? 5 : 8;
    for (let i = 0; i < pads; i++) {
      const a = rnd() * Math.PI * 2;
      const d = i === 0 ? 0 : 0.05 + rnd() * 0.1;
      const cx = Math.cos(a) * d;
      const cz = Math.sin(a) * d;
      const r = 0.035 + rnd() * 0.03;
      const turn = rnd() * Math.PI * 2;
      const c = vary(mixHex(PAD, PAD_LIGHT, rnd() * 0.5), rnd, 0.8);
      const mid: V3 = [cx, 0.006, cz];
      // A fan round the middle, one wedge left out for the notch.
      for (let k = 1; k < seg; k++) {
        const a0 = turn + (k / seg) * Math.PI * 2;
        const a1 = turn + ((k + 1) / seg) * Math.PI * 2;
        s.tri(
          mid,
          [cx + Math.cos(a0) * r, 0.002, cz + Math.sin(a0) * r],
          [cx + Math.cos(a1) * r, 0.002, cz + Math.sin(a1) * r],
          c,
          [0, 1, 0],
        );
      }
    }
    if (flower && !low) {
      const a = rnd() * Math.PI * 2;
      const hex = rnd() < 0.5 ? 0xf3e9ee : 0xe9a9bf;
      // Petals: a small star of blades around a golden heart.
      for (let k = 0; k < 6; k++) s.blade(0, 0, 0.022, 0.014, 0.018, a + (k / 6) * Math.PI * 2, hex, hex);
      s.blob(0, 0.016, 0, 0.007, 0.006, 0.007, 0xe8c24a, 0);
    }
    return s.build(false);
  },
};
