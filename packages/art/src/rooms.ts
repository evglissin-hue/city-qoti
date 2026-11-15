// V2A: the little rooms behind lit windows (docs/spec/17-presentation.md, Night as the signature).
// Eight rooms painted in code (P46: no image assets) into the pattern array's room layers
// (`ROOM_LAYER` to `ROOM_LAYER + ROOM_LAYERS - 1`, surface.ts). The kit shader's glass looks into a
// box room by parallax (materials.ts, `qKitRoom`) and reads every face from one layer with one fetch:
//
//   v 0.9 to 1     the ceiling, as seen from below (beams run into the room)
//   v 0.1 to 0.9   the back wall's picture: wall, skirting, furniture, the figure (in A)
//   v 0 to 0.1     the floor, as seen from above (boards run into the room)
//   u under 0.06   and over 0.94: the side walls, plain
//
// RGB is the color (sRGB), A marks the figure: a folk silhouette on the back wall that the shader
// shows in some rooms and not others, by seed. Only +, -, *, / and floor, so every machine paints
// the same bytes (the pattern array's checksum test).
import { ROOM_LAYER, ROOM_LAYERS } from './surface';

/** The layout the shader reads (materials.ts keeps the same numbers). */
export const ROOM_UV = { side: 0.06, floor: 0.1, ceiling: 0.9 } as const;

type Rgb = readonly [number, number, number];
const rgb = (hex: number): Rgb => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const shade = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/** One room layer to paint on, in layer coordinates (u right, v up, both 0 to 1). */
class Room {
  constructor(
    private readonly out: Uint8Array | Uint8ClampedArray,
    private readonly off: number,
    private readonly size: number,
  ) {}

  private px(u: number): number {
    return Math.max(0, Math.min(this.size, Math.floor(u * this.size + 0.5)));
  }

  /** Fills a rectangle. */
  rect(u0: number, v0: number, u1: number, v1: number, c: Rgb): void {
    const x0 = this.px(u0);
    const x1 = this.px(u1);
    const y0 = this.px(v0);
    const y1 = this.px(v1);
    for (let y = y0; y < y1; y++) {
      let o = this.off + (y * this.size + x0) * 4;
      for (let x = x0; x < x1; x++, o += 4) {
        this.out[o] = c[0];
        this.out[o + 1] = c[1];
        this.out[o + 2] = c[2];
        this.out[o + 3] = 0;
      }
    }
  }

  /**
   * Fills an ellipse about (cu, cv) with radii ru, rv (in layer units); with `c` null it only marks
   * the figure mask (A), leaving the room under it.
   */
  ellipse(cu: number, cv: number, ru: number, rv: number, c: Rgb | null): void {
    const x0 = this.px(cu - ru);
    const x1 = this.px(cu + ru);
    const y0 = this.px(cv - rv);
    const y1 = this.px(cv + rv);
    for (let y = y0; y < y1; y++) {
      const dv = ((y + 0.5) / this.size - cv) / rv;
      for (let x = x0; x < x1; x++) {
        const du = ((x + 0.5) / this.size - cu) / ru;
        if (du * du + dv * dv > 1) continue;
        const o = this.off + (y * this.size + x) * 4;
        if (!c) {
          this.out[o + 3] = 255;
          continue;
        }
        this.out[o] = c[0];
        this.out[o + 1] = c[1];
        this.out[o + 2] = c[2];
        this.out[o + 3] = 0;
      }
    }
  }

  /** Runs `fn` over a rectangle's texels, writing the color it returns (null leaves one as it is). */
  each(u0: number, v0: number, u1: number, v1: number, fn: (u: number, v: number) => Rgb | null): void {
    const x0 = this.px(u0);
    const x1 = this.px(u1);
    const y0 = this.px(v0);
    const y1 = this.px(v1);
    for (let y = y0; y < y1; y++) {
      const v = (y + 0.5) / this.size;
      for (let x = x0; x < x1; x++) {
        const c = fn((x + 0.5) / this.size, v);
        if (!c) continue;
        const o = this.off + (y * this.size + x) * 4;
        this.out[o] = c[0];
        this.out[o + 1] = c[1];
        this.out[o + 2] = c[2];
        this.out[o + 3] = 0;
      }
    }
  }
}

/** The back wall's picture: wall u 0.06 to 0.94 is the room's 0 to 1 across, v 0.1 to 0.9 its 0 to 1 up. */
const U = (x: number): number => ROOM_UV.side + (1 - 2 * ROOM_UV.side) * x;
const V = (y: number): number => ROOM_UV.floor + (ROOM_UV.ceiling - ROOM_UV.floor) * y;

const frac = (x: number): number => x - Math.floor(x);

interface RoomLook {
  wall: number;
  floor: number;
  ceiling: number;
  /** Skirting, beams and trim. */
  trim: number;
  /** The wall's own texture over the back wall (optional). */
  wallPaint?: (x: number, y: number, wall: Rgb) => Rgb | null;
  /** Floor boards (planks) or flags (a grid). */
  flags?: boolean;
  /** Paints the furniture, in room units (x 0 to 1 across, y 0 to 1 up). */
  furnish: (r: RoomPainter) => void;
  /** Where the figure stands (x), when the shader shows it. */
  figureAt: number;
}

/** Room-unit drawing on top of `Room`. */
interface RoomPainter {
  box(x0: number, y0: number, x1: number, y1: number, c: number | Rgb): void;
  oval(cx: number, cy: number, rx: number, ry: number, c: number | Rgb): void;
  each(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => Rgb | null): void;
}

const col = (c: number | Rgb): Rgb => (typeof c === 'number' ? rgb(c) : c);

/** A shelf with things on it: a board and a row of jars, pots or books (seeded by index). */
function shelf(
  r: RoomPainter,
  x0: number,
  x1: number,
  y: number,
  things: readonly number[],
  tall = 0.07,
): void {
  r.box(x0, y - 0.018, x1, y, 0x6b4a30);
  const n = Math.max(2, Math.floor((x1 - x0) / 0.075));
  for (let i = 0; i < n; i++) {
    const cx = x0 + ((i + 0.5) * (x1 - x0)) / n;
    const c = things[i % things.length]!;
    const h = tall * (0.65 + 0.35 * frac(i * 0.618 + x0 * 3.1));
    if (i % 3 === 1) r.oval(cx, y + h * 0.5, 0.025, h * 0.5, c);
    else r.box(cx - 0.022, y, cx + 0.022, y + h, c);
  }
}

/** A table: a top and two legs, a cloth if given. */
function table(r: RoomPainter, x0: number, x1: number, top: number, wood: number, cloth?: number): void {
  r.box(x0 + 0.02, 0, x0 + 0.045, top, shade(rgb(wood), 0.75));
  r.box(x1 - 0.045, 0, x1 - 0.02, top, shade(rgb(wood), 0.75));
  r.box(x0, top - 0.03, x1, top, wood);
  if (cloth !== undefined)
    r.each(x0 - 0.01, top - 0.09, x1 + 0.01, top, (x, y) =>
      (Math.floor(x * 40) + Math.floor(y * 40)) % 2 === 0 ? rgb(cloth) : shade(rgb(cloth), 0.8),
    );
}

/** A candle with its flame, bright enough to read as a little light of its own. */
function candle(r: RoomPainter, x: number, y: number): void {
  r.box(x - 0.008, y, x + 0.008, y + 0.05, 0xf1e6cc);
  r.oval(x, y + 0.068, 0.012, 0.02, 0xffe7a0);
}

/** A framed picture: a frame and a little landscape. */
function picture(r: RoomPainter, x0: number, y0: number, x1: number, y1: number): void {
  r.box(x0, y0, x1, y1, 0xb08a3e);
  r.each(x0 + 0.012, y0 + 0.016, x1 - 0.012, y1 - 0.016, (x, y) => {
    const t = (y - y0) / (y1 - y0);
    const hill = 0.35 + 0.15 * frac(x * 7.3) * frac(x * 3.1);
    return t < hill ? rgb(0x6f8b55) : t < hill + 0.05 ? rgb(0x8fa868) : rgb(0xb9cfd8);
  });
}

const BOOKS = [0x8c4a3f, 0x45607a, 0x6f8b68, 0xd1a24a, 0x7a5468, 0x4e7c78, 0xb5654b];
const JARS = [0xd8c8a0, 0x9fb7b8, 0xc98b5a, 0xe9e2d0, 0x8a6a48];
const PLATES = [0xe9eef0, 0x9fb7d0, 0xe9eef0, 0xd9c49a];

/** The eight rooms, in layer order. */
const ROOMS: readonly RoomLook[] = [
  // 0: a cottage kitchen. Cream plaster, flags, a dresser of plates, a checked cloth, a pot.
  {
    wall: 0xe8dbbd,
    floor: 0x9d8b74,
    ceiling: 0xd9c9a6,
    trim: 0x6b4a30,
    flags: true,
    furnish: (r) => {
      r.box(0.04, 0, 0.36, 0.42, 0x7a5638);
      r.box(0.06, 0.42, 0.34, 0.86, 0x8a6442);
      shelf(r, 0.07, 0.33, 0.56, PLATES, 0.06);
      shelf(r, 0.07, 0.33, 0.72, JARS, 0.07);
      table(r, 0.46, 0.8, 0.32, 0x8a6442, 0xb2564a);
      candle(r, 0.63, 0.32);
      r.oval(0.86, 0.72, 0.035, 0.03, 0x3b3229);
      r.box(0.855, 0.75, 0.865, 0.86, 0x3b3229);
    },
    figureAt: 0.56,
  },
  // 1: a parlour. Rose wallpaper in stripes, a picture, an armchair, a lamp on a side table.
  {
    wall: 0xe0b6a4,
    floor: 0x8a6442,
    ceiling: 0xeadbcc,
    trim: 0xf4ecdd,
    wallPaint: (x, _y, w) => (frac(x * 18) < 0.3 ? shade(w, 0.92) : null),
    furnish: (r) => {
      picture(r, 0.34, 0.55, 0.62, 0.8);
      r.box(0.66, 0, 0.9, 0.3, 0x4e7c78);
      r.box(0.64, 0.2, 0.92, 0.46, 0x45706c);
      r.box(0.62, 0, 0.68, 0.34, 0x41675f);
      r.box(0.88, 0, 0.94, 0.34, 0x41675f);
      table(r, 0.08, 0.26, 0.3, 0x6b4a30);
      r.box(0.15, 0.3, 0.19, 0.38, 0xd1a24a);
      r.oval(0.17, 0.43, 0.06, 0.05, 0xf6d98a);
    },
    figureAt: 0.44,
  },
  // 2: a bedroom. Sage walls, a patchwork quilt on a wooden bed, a shelf of books.
  {
    wall: 0xc4cea6,
    floor: 0x957050,
    ceiling: 0xe6e0c8,
    trim: 0x6b4a30,
    furnish: (r) => {
      r.box(0.3, 0, 0.34, 0.5, 0x7a5638);
      r.box(0.3, 0.38, 0.92, 0.5, 0x7a5638);
      r.each(0.34, 0.12, 0.92, 0.36, (x, y) => {
        const c = [0xd9a0a0, 0x9fb7d0, 0xefe3cc, 0xd1a24a][(Math.floor(x * 9) + Math.floor(y * 9) * 3) % 4]!;
        return rgb(c);
      });
      r.box(0.36, 0.3, 0.52, 0.4, 0xf4ecdd);
      shelf(r, 0.06, 0.24, 0.66, BOOKS, 0.09);
      candle(r, 0.15, 0.38);
      r.box(0.06, 0, 0.24, 0.38, 0x8a6442);
    },
    figureAt: 0.66,
  },
  // 3: a study. Blue-green walls, a wall of books, a desk with a lamp.
  {
    wall: 0x8eaaa6,
    floor: 0x7a5638,
    ceiling: 0xd9d4c4,
    trim: 0x4a3324,
    furnish: (r) => {
      r.box(0.04, 0, 0.46, 0.9, 0x5f4433);
      for (let s = 0; s < 4; s++) shelf(r, 0.06, 0.44, 0.12 + s * 0.2, BOOKS, 0.15);
      table(r, 0.58, 0.92, 0.34, 0x6b4a30);
      r.box(0.82, 0.34, 0.85, 0.46, 0x3b3229);
      r.oval(0.835, 0.48, 0.05, 0.035, 0xf2cf7a);
      picture(r, 0.6, 0.6, 0.78, 0.78);
    },
    figureAt: 0.68,
  },
  // 4: a workshop. Plank walls, a rack of tools, a bench with a vice and shavings.
  {
    wall: 0xa47b52,
    floor: 0x8f7a5a,
    ceiling: 0x8a6a48,
    trim: 0x5a4434,
    wallPaint: (x, _y, w) =>
      frac(x * 14) < 0.07 ? shade(w, 0.7) : frac(x * 14) < 0.5 ? shade(w, 1.04) : null,
    furnish: (r) => {
      r.box(0.08, 0.5, 0.58, 0.53, 0x5a4434);
      for (let i = 0; i < 8; i++) {
        const x = 0.11 + i * 0.06;
        r.box(x, 0.36 + (i % 3) * 0.03, x + 0.012, 0.52, 0x4b4f55);
        if (i % 2 === 0) r.box(x - 0.012, 0.34 + (i % 3) * 0.03, x + 0.024, 0.38 + (i % 3) * 0.03, 0x6b4a30);
      }
      table(r, 0.1, 0.62, 0.3, 0x7a5638);
      r.box(0.5, 0.3, 0.56, 0.36, 0x4b4f55);
      r.box(0.7, 0, 0.92, 0.22, 0x9a6b43);
      r.box(0.72, 0.22, 0.9, 0.26, 0xc4a67e);
      shelf(r, 0.68, 0.94, 0.66, JARS, 0.06);
    },
    figureAt: 0.4,
  },
  // 5: the hearth room. Stone around a fire, a mantel with candlesticks, a rug.
  {
    wall: 0xd6c6a6,
    floor: 0x8a6442,
    ceiling: 0xc9b896,
    trim: 0x5a4434,
    furnish: (r) => {
      r.each(0.3, 0, 0.7, 0.62, (x, y) => {
        const row = Math.floor(y * 22);
        const b = frac(x * 9 + (row % 2) * 0.5);
        const joint = b < 0.08 || frac(y * 22) < 0.12;
        return joint
          ? rgb(0x8f877a)
          : shade(rgb(0xb9b1a3), 0.9 + 0.2 * frac(row * 0.37 + Math.floor(x * 9) * 0.61));
      });
      r.box(0.38, 0, 0.62, 0.36, 0x2d2420);
      r.oval(0.5, 0.08, 0.09, 0.08, 0xff9a3c);
      r.oval(0.5, 0.11, 0.05, 0.08, 0xffd27a);
      r.box(0.26, 0.6, 0.74, 0.65, 0x6b4a30);
      candle(r, 0.32, 0.65);
      candle(r, 0.68, 0.65);
      r.box(0.47, 0.65, 0.53, 0.72, 0xb08a3e);
      r.box(0.8, 0, 0.94, 0.28, 0x7a5468);
      r.box(0.78, 0.22, 0.96, 0.42, 0x6e4a5c);
    },
    figureAt: 0.84,
  },
  // 6: a sewing room. Butter walls hung with bunting, a spinning wheel, bolts of cloth.
  {
    wall: 0xecd99a,
    floor: 0x957050,
    ceiling: 0xf1e6cc,
    trim: 0xf4ecdd,
    furnish: (r) => {
      const flags = [0xb2564a, 0x4e7c78, 0xd1a24a, 0x7a5468, 0x6f8b68];
      for (let i = 0; i < 10; i++) {
        const x = 0.04 + i * 0.095;
        r.each(x, 0.78, x + 0.07, 0.86, (u, v) =>
          Math.abs(u - (x + 0.035)) < (v - 0.78) * 0.45 ? rgb(flags[i % flags.length]!) : null,
        );
      }
      r.each(0.12, 0.04, 0.42, 0.44, (x, y) => {
        const dx = x - 0.27;
        const dy = y - 0.3;
        const d = dx * dx + dy * dy;
        return d < 0.0144 && d > 0.0106 ? rgb(0x7a5638) : null;
      });
      r.box(0.265, 0, 0.275, 0.3, 0x7a5638);
      r.box(0.18, 0, 0.36, 0.06, 0x7a5638);
      table(r, 0.56, 0.92, 0.3, 0x8a6442);
      r.box(0.6, 0.3, 0.68, 0.38, 0xb2564a);
      r.box(0.7, 0.3, 0.8, 0.36, 0x45607a);
      r.box(0.82, 0.3, 0.88, 0.42, 0xefe3cc);
    },
    figureAt: 0.5,
  },
  // 7: a pantry and back shop. Shelves floor to ceiling with jars and crates, a counter.
  {
    wall: 0xd9c9a6,
    floor: 0x9d8b74,
    ceiling: 0xc9b896,
    trim: 0x6b4a30,
    flags: true,
    furnish: (r) => {
      for (let s = 0; s < 3; s++) shelf(r, 0.04, 0.96, 0.46 + s * 0.16, JARS, 0.09);
      r.box(0.04, 0, 0.6, 0.3, 0x7a5638);
      r.box(0.02, 0.3, 0.62, 0.34, 0x8a6442);
      r.box(0.68, 0, 0.82, 0.14, 0xa07850);
      r.box(0.8, 0, 0.94, 0.12, 0x957050);
      r.box(0.72, 0.14, 0.86, 0.26, 0xa07850);
      candle(r, 0.12, 0.34);
    },
    figureAt: 0.4,
  },
];

/**
 * A folk silhouette (round ears, a round head, a body), its feet at y 0, in the A mask only: the
 * shader draws it, in some rooms and not others, over the room painted under it.
 */
function figure(room: Room, x: number): void {
  room.ellipse(U(x), V(0.17), 0.05, V(0.17) - V(0), null);
  room.ellipse(U(x), V(0.39), 0.034, V(0.39) - V(0.33), null);
  room.ellipse(U(x - 0.035), V(0.46), 0.012, V(0.46) - V(0.42), null);
  room.ellipse(U(x + 0.035), V(0.46), 0.012, V(0.46) - V(0.42), null);
}

/** Paints one room into its layer. */
function paintRoom(room: Room, look: RoomLook): void {
  const wall = rgb(look.wall);
  const floor = rgb(look.floor);
  const ceiling = rgb(look.ceiling);
  const trim = rgb(look.trim);
  const { side, floor: fl, ceiling: ce } = ROOM_UV;
  // The side walls a little darker than the back, the back wall with its own texture.
  room.rect(0, fl, side, ce, shade(wall, 0.94));
  room.rect(1 - side, fl, 1, ce, shade(wall, 0.94));
  room.each(side, fl, 1 - side, ce, (u, v) => {
    const x = (u - side) / (1 - 2 * side);
    const y = (v - fl) / (ce - fl);
    return look.wallPaint?.(x, y, wall) ?? wall;
  });
  // The floor: boards or flags running into the room.
  room.each(0, 0, 1, fl, (u, v) => {
    if (look.flags) {
      const row = Math.floor(v * 40);
      const joint = frac(u * 9 + (row % 2) * 0.5) < 0.06 || frac(v * 40) < 0.1;
      return joint
        ? shade(floor, 0.72)
        : shade(floor, 0.94 + 0.12 * frac(row * 0.37 + Math.floor(u * 9) * 0.53));
    }
    return frac(u * 16) < 0.08
      ? shade(floor, 0.72)
      : shade(floor, 0.95 + 0.1 * frac(Math.floor(u * 16) * 0.618));
  });
  // The ceiling: beams running into the room.
  room.each(0, ce, 1, 1, (u) => (frac(u * 4 + 0.5) < 0.16 ? trim : ceiling));
  // A skirting board along the foot of the back wall.
  room.rect(side, fl, 1 - side, V(0.035), trim);
  const painter: RoomPainter = {
    box: (x0, y0, x1, y1, c) => room.rect(U(x0), V(y0), U(x1), V(y1), col(c)),
    oval: (cx, cy, rx, ry, c) => room.ellipse(U(cx), V(cy), rx * (1 - 2 * side), ry * (ce - fl), col(c)),
    each: (x0, y0, x1, y1, fn) =>
      room.each(U(x0), V(y0), U(x1), V(y1), (u, v) => fn((u - side) / (1 - 2 * side), (v - fl) / (ce - fl))),
  };
  look.furnish(painter);
  figure(room, look.figureAt);
}

/**
 * Paints the eight rooms into their layers of the pattern array's bytes (`size` x `size` a layer,
 * RGBA), in place of the flat stand-in (patterns.ts `generatePatterns` calls it).
 */
export function fillRooms(data: Uint8Array | Uint8ClampedArray, size: number): void {
  for (let r = 0; r < ROOM_LAYERS; r++) {
    const room = new Room(data, (ROOM_LAYER + r) * size * size * 4, size);
    paintRoom(room, ROOMS[r]!);
  }
}

/**
 * Which room a window looks into, and whether someone is in it: picked by the building's seed (its
 * origin, as the kit shader sees it: the instance's or batch's translation, in whole tiles) and the
 * room cell the pane falls in (along the facade and by storey). The GLSL twin is in materials.ts
 * (`qRoomPick`); integers well under 2^24, so float and integer agree.
 */
export function roomFor(
  originX: number,
  originZ: number,
  cellU: number,
  cellV: number,
): { room: number; figure: boolean } {
  const ix = Math.floor(originX);
  const iz = Math.floor(originZ);
  const v = ix * 73 + iz * 151 + cellU * 37 + cellV * 91 + ix * iz * 7;
  const m = ((v % 40) + 40) % 40;
  return { room: m % ROOM_LAYERS, figure: Math.floor(m / ROOM_LAYERS) < 2 };
}
