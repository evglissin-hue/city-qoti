// R2D: the Town overlay's data, "one map, two inks" (docs/spec/17-presentation.md). Pure and free of
// three.js, so it tests in node and V3D's endpaper map can read it later: `townInk` turns what the
// Mirror holds into per-tile numbers and lists, and nothing here knows how they are drawn
// (`overlayTownDraw.ts` drapes them on the ground). No stroke finer than a tile: footfall is a
// per-tile wash with a soft falloff, so it reads on a small map too.
//   - Goods routes in ochre (the flows overlay as built); evening footfall in sage.
//   - A glint where an outlet sells to the round (`PlaceView.serves`), a soft pulse and no more.
//   - Evening streets, open gaps and places draw on it too.
//   - The lens only decides which ink is stronger (Hearth: sage; Ledger: ochre).
import { footprintSize, MAP_SIZE, type Lens } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { drawDef } from './defs';

const N = MAP_SIZE;

/** The two inks and the marks laid over them (sRGB hex). Checked for contrast and colorblind-safety in tests. */
export const TOWN_COLORS = {
  /** Goods routes: a dark, warm ochre. */
  ochre: 0xb8761a,
  /** Evening footfall: a light, bluish sage, so lightness as well as hue parts it from the ochre. */
  sage: 0x8fd1b0,
  /** Evening streets: the sage, deeper. */
  street: 0x3f9a74,
  /** A gap: dark umber, the darkest thing on the map. */
  gap: 0x6b3a12,
  /** The glint where an outlet sells: pale lamplight. */
  glint: 0xfff1b8,
} as const;

/** How strong each ink draws in a lens, 0 to 1. */
export interface InkStrength {
  sage: number;
  ochre: number;
}

export function inkStrength(lens: Lens): InkStrength {
  return lens === 'hearth' ? { sage: 1, ochre: 0.4 } : { sage: 0.45, ochre: 1 };
}

/** The overlay kind the toolbar sends: `town:hearth` or `town:ledger`; null for any other. */
export function townLens(kind: string | null): Lens | null {
  if (kind === 'town:hearth') return 'hearth';
  if (kind === 'town:ledger') return 'ledger';
  return null;
}

export interface TownInk {
  /** Evening footfall per tile, 0 to 1, soft: a 3 by 3 blur of the share of the busiest tile. Index z * MAP_SIZE + x. */
  eve: Float32Array;
  /** Goods routes as the flows overlay has them: [from building, to building, units]. */
  routes: [from: number, to: number, units: number][];
  /** Where an outlet sells to the round: tile-space centers [x, z] of the serving outlets, no repeats. */
  glints: [x: number, z: number][];
  /** Evening street tiles (tile indexes, ascending). */
  evening: number[];
  /** Open gaps' tiles (tile indexes, in the gaps' order). */
  gaps: number[];
  /** Every tile any place covers (tile indexes, ascending, no repeats). */
  places: number[];
}

/** A quiet town does not glow: the wash scales to at least this many passes. */
const MIN_PEAK = 4;

/** The soft footfall wash: the share of the busiest tile, blurred 3 by 3 so it has no hard edge. */
export function footfallWash(eve: Uint16Array | null | undefined): Float32Array {
  const out = new Float32Array(N * N);
  if (!eve) return out;
  const blur = new Float32Array(N * N);
  let peak = 0;
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      let sum = 0;
      for (let dz = -1; dz <= 1; dz++) {
        const zz = z + dz;
        if (zz < 0 || zz >= N) continue;
        const wz = dz === 0 ? 2 : 1;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= N) continue;
          sum += (eve[zz * N + xx] ?? 0) * wz * (dx === 0 ? 2 : 1);
        }
      }
      const v = sum / 16;
      blur[z * N + x] = v;
      if (v > peak) peak = v;
    }
  }
  const scale = Math.max(peak, MIN_PEAK);
  for (let i = 0; i < blur.length; i++) out[i] = Math.min(1, Math.sqrt(blur[i]! / scale));
  return out;
}

/** The tile-space center of a building, or null when the Mirror does not have it. */
function centerOf(mirror: Mirror, id: number): [number, number] | null {
  const b = mirror.buildings.get(id);
  if (!b) return null;
  const def = drawDef(b.def);
  const [w, d] = def ? footprintSize(def, b.rot) : [1, 1];
  return [b.x + w / 2, b.z + d / 2];
}

/**
 * Everything the Town overlay (and the endpaper map) draws, from the Mirror. `routes` is the goods
 * flow list (the flows overlay's `flowsOf`), passed in so this stays free of the render layers.
 */
export function townInk(mirror: Mirror, routes: readonly [number, number, number][] = []): TownInk {
  const evening: number[] = [];
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) if (mirror.eveningStreet(x, z)) evening.push(z * N + x);
  const seen = new Set<number>();
  const places = new Set<number>();
  const glints: [number, number][] = [];
  const sorted = [...mirror.places.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const p of sorted) {
    for (const t of p.tiles) places.add(t);
    for (const id of p.serves) {
      if (seen.has(id)) continue;
      seen.add(id);
      const c = centerOf(mirror, id);
      if (c) glints.push(c);
    }
  }
  return {
    eve: footfallWash(mirror.footfall.value?.eve),
    routes: routes.filter(([from, to]) => from !== to).map(([a, b, u]) => [a, b, u]),
    glints,
    evening,
    gaps: (mirror.gaps.value?.open ?? []).map((g) => g.tile),
    places: [...places].sort((a, b) => a - b),
  };
}

// --- Colors: contrast and colorblind-distinctness ----------------------------------------------------

export type Rgb = [number, number, number];

export function hexToRgb(hex: number): Rgb {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number): number => {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
};

/** Machado, Oliveira and Fernandes (2009), full severity, applied in linear RGB (as `e2e/colorblind.py`). */
export const CVD_MATRICES = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
} as const;

/** How a color looks to someone with the given deficiency (sRGB, 0 to 1). */
export function simulate(rgb: Rgb, kind: keyof typeof CVD_MATRICES): Rgb {
  const lin = rgb.map(toLinear);
  const m = CVD_MATRICES[kind];
  return m.map((row) => toSrgb(row[0] * lin[0]! + row[1] * lin[1]! + row[2] * lin[2]!)) as Rgb;
}

/** WCAG relative luminance of an sRGB color (0 to 1). */
export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
