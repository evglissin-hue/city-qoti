// C4E: the village cart (content `cart`, art.kit 'cart'): a two-wheeled farm cart with plank sides,
// a driver's board and shafts for a pony, built as parts the renderer animates: the body (shafts,
// bed and the carter's bench), a wheel that turns about its axle, and the load on the bed, one
// geometry per good. Faces +z with the axle at the origin on the ground; the pony walks between the
// shafts at PONY_OFFSET. The `cart` kit assembles everything standing still.
import { Float32BufferAttribute, type BufferGeometry } from 'three';
import { seeded, ShapeBuilder, vary } from '../geometry';
import { palette } from '../palette';
import { beam, cylX } from '../shapes';
import { standingAnimal } from './animals';
import { crateOf, pileOf } from './goods';
import type { Kit } from './types';

/** Where the pony's origin sits relative to the cart's axle (it walks ahead, between the shafts). */
export const PONY_OFFSET: [number, number, number] = [0, 0, 0.72];
/** The wheels: axle height (= radius) and their x either side. */
export const WHEEL_RADIUS = 0.17;
export const WHEEL_X = 0.27;
/** Where the carter sits on the front board, and the bed top the load stands on. */
export const CARTER_SEAT: [number, number, number] = [0, 0.3, 0.2];
export const BED_Y = 0.24;

const PAINTS = [0x3f7f7a, 0xa8473b, 0x34506b, 0x6e8a5a, 0xd6a73e];

/** The cart's body in one of its paints (variant), without wheels or load. */
export function cartBodyGeometry(variant = 0): BufferGeometry {
  const rnd = seeded(variant * 17 + 5);
  const s = new ShapeBuilder();
  const wood = vary(palette.wood, rnd, 0.5);
  const paint = PAINTS[variant % PAINTS.length]!;
  // The bed: a floor, plank sides with a painted top rail, a tail board.
  s.box(-0.22, 0.2, -0.36, 0.22, BED_Y, 0.3, vary(palette.darkWood, rnd, 0.4));
  for (const x of [-0.22, 0.2]) {
    s.box(x, BED_Y, -0.36, x + 0.02, BED_Y + 0.11, 0.3, wood);
    s.box(x - 0.004, BED_Y + 0.1, -0.37, x + 0.024, BED_Y + 0.13, 0.31, paint);
    // Side stakes.
    for (const z of [-0.3, -0.05, 0.22])
      s.box(x - 0.008, BED_Y - 0.02, z - 0.015, x + 0.028, BED_Y + 0.13, z + 0.015, palette.timber);
  }
  s.box(-0.22, BED_Y, -0.37, 0.22, BED_Y + 0.1, -0.35, wood);
  s.box(-0.22, BED_Y, 0.29, 0.22, BED_Y + 0.16, 0.31, wood);
  s.box(-0.23, BED_Y + 0.15, 0.28, 0.23, BED_Y + 0.18, 0.32, paint);
  // The axle beam and the shafts running forward to the pony, with a little prop leg at the tail.
  s.box(
    -WHEEL_X + 0.03,
    WHEEL_RADIUS - 0.02,
    -0.03,
    WHEEL_X - 0.03,
    WHEEL_RADIUS + 0.02,
    0.03,
    palette.timber,
  );
  for (const x of [-0.14, 0.14]) {
    beam(s, [x, 0.21, -0.2], [x, 0.21, 0.32], 0.018, palette.timber);
    beam(s, [x, 0.21, 0.32], [x * 0.9, 0.3, 1.02], 0.014, palette.timber);
  }
  beam(s, [0, 0.2, -0.36], [0, 0.04, -0.46], 0.012, palette.timber);
  // A lantern on a hook at the front, lit at night.
  beam(s, [0.2, BED_Y + 0.18, 0.31], [0.2, BED_Y + 0.28, 0.34], 0.006, palette.metal);
  s.glow(2);
  s.box(0.18, BED_Y + 0.15, 0.32, 0.22, BED_Y + 0.21, 0.36, palette.lantern);
  s.glow(0);
  return s.build();
}

/** One wheel, centered on its axle at the origin, turning about x: rim, spokes and hub. */
export function cartWheelGeometry(): BufferGeometry {
  const s = new ShapeBuilder();
  const r = WHEEL_RADIUS;
  const seg = 12;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a: number, rr: number, x: number): [number, number, number] => [
      x,
      Math.cos(a) * rr,
      Math.sin(a) * rr,
    ];
    const am = (a0 + a1) / 2;
    // Iron tyre outside, wooden felloe inside.
    s.quad(p(a0, r, -0.022), p(a1, r, -0.022), p(a1, r, 0.022), p(a0, r, 0.022), palette.metal, [
      0,
      Math.cos(am),
      Math.sin(am),
    ]);
    for (const x of [-0.022, 0.022])
      s.quad(p(a0, r, x), p(a1, r, x), p(a1, r - 0.035, x), p(a0, r - 0.035, x), palette.darkWood, [x, 0, 0]);
    s.quad(
      p(a0, r - 0.035, -0.022),
      p(a1, r - 0.035, -0.022),
      p(a1, r - 0.035, 0.022),
      p(a0, r - 0.035, 0.022),
      palette.darkWood,
      [0, -Math.cos(am), -Math.sin(am)],
    );
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    beam(s, [0, 0, 0], [0, Math.cos(a) * (r - 0.03), Math.sin(a) * (r - 0.03)], 0.009, palette.wood);
  }
  cylX(s, -0.035, 0.035, 0, 0, 0.032, palette.timber, 8);
  return s.build(false);
}

/** The load on the bed for a good (the bed top at BED_Y), or an empty geometry for none. */
export function cartLoadGeometry(good: string): BufferGeometry {
  const rnd = seeded(good.length * 977 + good.charCodeAt(0));
  const s = new ShapeBuilder();
  if (good) {
    // Goods with their own pile kit sit lengthwise; anything else travels as crates.
    const crated = ['bread', 'vegetables', 'fish', 'apples', 'tools', 'herbs', 'cheese', 'yarn', ''];
    if (crated.includes(good)) {
      for (const [dx, dy, dz] of [
        [-0.1, 0, -0.18],
        [0.1, 0, -0.18],
        [-0.1, 0, 0.08],
        [0.1, 0, 0.08],
        [0, 0.12, -0.05],
      ] as const)
        crateOf(s, good, dx, BED_Y + dy, dz, rnd);
    } else {
      pileOf(s, good, 3, 0, 0, 0, rnd);
      const g = s.build();
      g.rotateY(Math.PI / 2);
      g.scale(0.72, 0.72, 0.9);
      g.translate(0, BED_Y, -0.04);
      return g;
    }
  }
  return s.build();
}

/** The cart, its pony and a load of logs, standing still (gallery and portraits). */
export const cart: Kit = {
  id: 'cart',
  kind: 'vehicle',
  build: (opts) => {
    const variant = Math.floor(opts?.seed ?? 0);
    const good = typeof opts?.params?.load === 'string' ? opts.params.load : 'logs';
    const parts: BufferGeometry[] = [cartBodyGeometry(variant), cartLoadGeometry(good)];
    for (const x of [-WHEEL_X, WHEEL_X]) parts.push(cartWheelGeometry().translate(x, WHEEL_RADIUS, 0));
    parts.push(standingAnimal('pony', variant).translate(PONY_OFFSET[0], PONY_OFFSET[1], PONY_OFFSET[2]));
    return mergeFlat(parts);
  },
};

/** Concatenates non-indexed kit geometries that share the kit attributes. */
export function mergeFlat(parts: BufferGeometry[]): BufferGeometry {
  const first = parts[0]!;
  const out = first.clone();
  for (const name of ['position', 'normal', 'color', 'glow'] as const) {
    const arrays = parts.map((p) => p.getAttribute(name)?.array as Float32Array | undefined);
    const size = first.getAttribute(name).itemSize;
    const total = parts.reduce((t, p) => t + p.getAttribute('position').count * size, 0);
    const data = new Float32Array(total);
    let o = 0;
    parts.forEach((p, i) => {
      const a = arrays[i];
      const n = p.getAttribute('position').count * size;
      if (a) data.set(a.subarray(0, n), o);
      o += n;
    });
    out.setAttribute(name, new Float32BufferAttribute(data, size));
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}
