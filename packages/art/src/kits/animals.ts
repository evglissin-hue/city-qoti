// C4E: sheep, cows and ponies, as parts the renderer animates with instance matrices: a body, a
// head that swings about the neck (grazing, looking up), and one leg geometry used four times, each
// swinging about its hip. Facing +z, standing on y 0, in tile units: a sheep is about 0.4 long, a cow
// 0.7, a pony 0.6. Three coats each. The `sheep`, `cow` and `pony` kits assemble them standing still
// for the gallery and picker portraits.
import { Color, type BufferGeometry } from 'three';
import { seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { beam } from '../shapes';
import type { AnimalKind, Kit } from './types';

export interface AnimalArt {
  body: BufferGeometry;
  head: BufferGeometry;
  leg: BufferGeometry;
  /** Hip (or shoulder) pivots, front left, front right, back left, back right. */
  hips: V3[];
  /** The neck pivot the head swings about. */
  neck: V3;
  /** Ground covered by one full walk cycle, in tiles. */
  stride: number;
  /** Walking pace in tiles per second. */
  pace: number;
  /** Radius for a soft ground shadow. */
  shadow: number;
}

/** Leg: a tapered post from the pivot at y 0 down to -len, with a darker hoof. */
function legGeometry(len: number, r: number, hex: number, hoof: number): BufferGeometry {
  const s = new ShapeBuilder();
  s.cylinder(0, 0, r * 0.75, r, -len, 0, hex, 6);
  s.cylinder(0, 0, r * 0.8, r * 0.75, -len, -len + len * 0.16, hoof, 6);
  return s.build(false);
}

const SHEEP_COATS: [wool: number, face: number][] = [
  [0xf1ebdc, 0x3b3229],
  [0xe6dccb, 0x2e2722],
  [0x6b5e50, 0x2a2420],
];
const COW_COATS: [base: number, patch: number, nose: number][] = [
  [0xf3ecdc, 0x8a4f2e, 0xe0a49a],
  [0xf3ecdc, 0x2e2a28, 0xd8a8a0],
  [0xc28a54, 0xa06a3c, 0xe8c8b0],
];
const PONY_COATS: [coat: number, mane: number][] = [
  [0x8a5a3a, 0x3b2a20],
  [0xd9c8a8, 0x8a7a64],
  [0x5a4636, 0x2a2420],
];

function sheep(variant: number): AnimalArt {
  const [wool, face] = SHEEP_COATS[variant % SHEEP_COATS.length]!;
  const rnd = seeded(variant * 31 + 7);
  const body = new ShapeBuilder();
  const top = vary(wool, rnd, 0.6);
  body.blob(0, 0.2, 0, 0.14, 0.115, 0.19, wool, 1, rnd, 0.08, top);
  for (const [x, y, z, r] of [
    [0.07, 0.26, 0.07, 0.08],
    [-0.07, 0.26, -0.05, 0.08],
    [0.02, 0.29, -0.1, 0.07],
    [-0.03, 0.26, 0.13, 0.07],
    [0.08, 0.2, -0.12, 0.065],
  ] as const)
    body.blob(x, y, z, r, r * 0.85, r, vary(wool, rnd, 0.5), 0, rnd, 0.1);
  body.blob(0, 0.22, -0.19, 0.035, 0.035, 0.035, vary(wool, rnd, 0.5), 0);
  const head = new ShapeBuilder();
  head.blob(0, 0.23, 0.23, 0.05, 0.055, 0.07, face, 1);
  head.blob(0, 0.275, 0.2, 0.055, 0.035, 0.055, wool, 0, rnd, 0.1);
  for (const sx of [-1, 1]) head.blob(sx * 0.06, 0.255, 0.2, 0.035, 0.014, 0.017, face, 0);
  for (const sx of [-1, 1]) head.blob(sx * 0.025, 0.255, 0.285, 0.008, 0.008, 0.006, 0xf7f4ec, 0);
  return {
    body: body.build(),
    head: head.build(false),
    leg: legGeometry(0.1, 0.02, face, 0x1e1a17),
    hips: [
      [0.06, 0.1, 0.1],
      [-0.06, 0.1, 0.1],
      [0.06, 0.1, -0.1],
      [-0.06, 0.1, -0.1],
    ],
    neck: [0, 0.22, 0.16],
    stride: 0.22,
    pace: 0.2,
    shadow: 0.22,
  };
}

function cow(variant: number): AnimalArt {
  const [base, patch, nose] = COW_COATS[variant % COW_COATS.length]!;
  const rnd = seeded(variant * 43 + 11);
  const body = new ShapeBuilder();
  body.blob(0, 0.32, 0, 0.15, 0.125, 0.27, base, 1, rnd, 0.04);
  body.blob(0, 0.34, 0.15, 0.135, 0.115, 0.12, base, 1);
  body.blob(0, 0.34, -0.16, 0.14, 0.115, 0.12, base, 1);
  // Patches sitting on the flanks and back.
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const z = -0.2 + rnd() * 0.36;
    const y = 0.28 + rnd() * 0.08;
    body.blob(side * 0.13, y, z, 0.035, 0.06 + rnd() * 0.03, 0.07 + rnd() * 0.04, patch, 1);
  }
  body.blob(0.02, 0.44, -0.04, 0.08, 0.025, 0.1, patch, 1);
  // Udder and a tail with a tuft.
  body.blob(0, 0.2, -0.1, 0.055, 0.04, 0.055, nose, 0);
  body.cylinder(0, -0.28, 0.012, 0.01, 0.17, 0.38, base, 4);
  body.blob(0, 0.16, -0.285, 0.022, 0.045, 0.022, patch, 0);
  const head = new ShapeBuilder();
  head.blob(0, 0.37, 0.33, 0.07, 0.075, 0.09, base, 1);
  head.blob(0, 0.33, 0.41, 0.065, 0.05, 0.05, nose, 1);
  head.blob(0, 0.42, 0.32, 0.05, 0.02, 0.05, patch, 0);
  for (const sx of [-1, 1]) {
    head.blob(sx * 0.085, 0.39, 0.3, 0.04, 0.016, 0.022, base, 0);
    head.cylinder(sx * 0.045, 0.31, 0.012, 0.0, 0.42, 0.48, 0xe8dcc0, 4);
    head.blob(sx * 0.04, 0.39, 0.39, 0.009, 0.01, 0.006, 0x1e1a17, 0);
  }
  return {
    body: body.build(),
    head: head.build(false),
    leg: legGeometry(0.2, 0.03, base, 0x3b3229),
    hips: [
      [0.085, 0.2, 0.17],
      [-0.085, 0.2, 0.17],
      [0.085, 0.2, -0.18],
      [-0.085, 0.2, -0.18],
    ],
    neck: [0, 0.37, 0.24],
    stride: 0.32,
    pace: 0.16,
    shadow: 0.34,
  };
}

function pony(variant: number): AnimalArt {
  const [coat, mane] = PONY_COATS[variant % PONY_COATS.length]!;
  const body = new ShapeBuilder();
  body.rbox(-0.1, 0.22, -0.22, 0.1, 0.4, 0.22, coat, 0.07);
  body.blob(0, 0.31, 0.2, 0.1, 0.1, 0.06, coat, 1);
  body.blob(0, 0.31, -0.2, 0.1, 0.1, 0.06, coat, 1);
  // A harness collar, a saddle pad and a flowing tail.
  // The collar rings the base of the neck, leaning forward with it; brass hames on top.
  const ring = 10;
  for (let i = 0; i < ring; i++) {
    const a0 = (i / ring) * Math.PI * 2;
    const a1 = ((i + 1) / ring) * Math.PI * 2;
    const p = (a: number): V3 => [Math.cos(a) * 0.075, 0.43 + Math.sin(a) * 0.085, 0.25 - Math.sin(a) * 0.04];
    beam(body, p(a0), p(a1), 0.024, 0x6b4a30);
  }
  body.blob(0, 0.52, 0.21, 0.02, 0.025, 0.02, 0xd6a73e, 0);
  body.rbox(-0.105, 0.39, -0.06, 0.105, 0.42, 0.06, 0xa8473b, 0.01);
  body.blob(0, 0.3, -0.27, 0.035, 0.1, 0.04, mane, 0);
  const head = new ShapeBuilder();
  // Neck rising forward, then the head angled down, with a mane, ears and a blaze.
  head.rbox(-0.055, 0.34, 0.2, 0.055, 0.56, 0.32, coat, 0.05);
  head.rbox(-0.05, 0.47, 0.3, 0.05, 0.57, 0.48, coat, 0.04);
  head.rbox(
    -0.045,
    0.44,
    0.42,
    0.045,
    0.52,
    0.5,
    vary(coat, () => 0.2, 2),
    0.03,
  );
  head.box(-0.015, 0.36, 0.17, 0.015, 0.6, 0.31, mane);
  for (const sx of [-1, 1]) head.cylinder(sx * 0.03, 0.34, 0.016, 0.0, 0.57, 0.64, coat, 4);
  head.box(-0.012, 0.52, 0.42, 0.012, 0.575, 0.47, 0xf7f4ec);
  return {
    body: body.build(),
    head: head.build(false),
    leg: legGeometry(0.22, 0.024, coat, 0x2a2420),
    hips: [
      [0.065, 0.22, 0.15],
      [-0.065, 0.22, 0.15],
      [0.065, 0.22, -0.16],
      [-0.065, 0.22, -0.16],
    ],
    neck: [0, 0.38, 0.22],
    stride: 0.42,
    pace: 0.6,
    shadow: 0.3,
  };
}

const cache = new Map<string, AnimalArt>();
const tmp = new Color();

/** The parts of an animal in one of its coats (variant 0 to 2), cached. */
export function animalArt(kind: AnimalKind, variant = 0): AnimalArt {
  const key = `${kind}:${variant % 3}`;
  let a = cache.get(key);
  if (!a) {
    a = kind === 'cow' ? cow(variant % 3) : kind === 'pony' ? pony(variant % 3) : sheep(variant % 3);
    cache.set(key, a);
  }
  return a;
}

/** All parts merged standing still, with the head pitched by `graze` radians (down when positive). */
export function standingAnimal(kind: AnimalKind, variant: number, graze = 0): BufferGeometry {
  const a = animalArt(kind, variant);
  const s = new ShapeBuilder();
  const copy = (g: BufferGeometry, place: (p: V3) => V3): void => {
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    for (let i = 0; i < pos.count; i += 3) {
      const tri: V3[] = [0, 1, 2].map((k) => place([pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)]));
      const hex = tmp.setRGB(col.getX(i), col.getY(i), col.getZ(i)).getHex();
      s.tri(tri[0]!, tri[1]!, tri[2]!, hex);
    }
  };
  copy(a.body, (p) => p);
  const [, ny, nz] = a.neck;
  const c = Math.cos(graze);
  const sn = Math.sin(graze);
  copy(a.head, ([x, y, z]) => {
    const dy = y - ny;
    const dz = z - nz;
    return [x, ny + dy * c - dz * sn, nz + dy * sn + dz * c];
  });
  for (const [hx, hy, hz] of a.hips) copy(a.leg, ([x, y, z]) => [hx + x, hy + y, hz + z]);
  return s.build(false);
}

function animalKit(id: AnimalKind): Kit {
  return {
    id,
    kind: 'animal',
    build: (opts) => standingAnimal(id, Math.floor(opts?.seed ?? 0), id === 'sheep' ? 0.5 : 0),
  };
}

export const cowKit = animalKit('cow');
export const ponyKit = animalKit('pony');
export const sheepKit = animalKit('sheep');
