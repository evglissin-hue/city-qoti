// Customization for building kits: swatch names (docs/spec/17-presentation.md, Palette) to colors,
// and the custom fields a building passes in `opts.params` (BuildingView.custom, plus runtime
// details such as stock levels). Swatches also accept an index, for the gallery's sliders.
import { seeded, type ShapeBuilder } from '../geometry';
import { ACCENTS, palette, PLASTERS, ROOFS } from '../palette';
import { ROOF_MATERIAL_COLORS, type RoofMaterial } from './roofs';
import type { KitBuildOptions } from './types';

export const WALL_SWATCHES: Readonly<Record<string, number>> = {
  brick: palette.brick,
  stone: palette.stone,
  cream: palette.plasterCream,
  rose: palette.plasterRose,
  sage: palette.plasterSage,
  sky: palette.plasterSky,
  butter: palette.plasterButter,
};

export const ROOF_SWATCHES: Readonly<Record<string, number>> = {
  terracotta: palette.roofTerracotta,
  slate: palette.roofSlate,
  thatch: palette.roofThatch,
  moss: palette.roofMoss,
  plum: palette.roofPlum,
};

export const ACCENT_SWATCHES: Readonly<Record<string, number>> = {
  teal: palette.teal,
  red: palette.accentRed,
  mustard: palette.mustard,
  navy: palette.navy,
  white: palette.white,
};

/** Window box flower colors by swatch id; `mixed` (or none) keeps each box's seeded blooms. */
export const FLOWER_SWATCHES: Readonly<Record<string, number>> = {
  geranium: palette.flowerGeranium,
  rose: palette.blossom,
  cream: palette.flowerD,
  cornflower: palette.flowerCornflower,
  buttercup: palette.flowerB,
};

export const ROOF_MATERIALS: readonly RoofMaterial[] = ['tile', 'slate', 'thatch', 'shingle'];

function swatch(map: Readonly<Record<string, number>>, list: readonly number[], v: unknown): number | null {
  if (typeof v === 'string') return map[v] ?? null;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return list[Math.floor(v) % list.length] ?? null;
  return null;
}

function flag(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

/** What the player chose (null where they left the default). */
export interface Custom {
  wall: number | null;
  roof: number | null;
  roofMaterial: RoofMaterial | null;
  accent: number | null;
  windowBoxes: boolean | null;
  /** Window box bloom color; null for the seeded mix. */
  windowFlowers: number | null;
  shutters: boolean | null;
  chimney: boolean | null;
  sign: string | null;
}

export function customOf(opts: KitBuildOptions | undefined): Custom {
  const p = opts?.params ?? {};
  const rm = p.roofMaterial;
  return {
    wall: swatch(WALL_SWATCHES, PLASTERS, p.wall),
    roof: swatch(ROOF_SWATCHES, ROOFS, p.roof),
    roofMaterial:
      typeof rm === 'string' && (ROOF_MATERIALS as readonly string[]).includes(rm)
        ? (rm as RoofMaterial)
        : typeof rm === 'number'
          ? ROOF_MATERIALS[Math.floor(rm) % ROOF_MATERIALS.length]!
          : null,
    accent: swatch(ACCENT_SWATCHES, ACCENTS, p.accent),
    windowBoxes: flag(p.windowBoxes),
    windowFlowers: swatch(FLOWER_SWATCHES, FLOWERS, p.windowFlowers),
    shutters: flag(p.shutters),
    chimney: flag(p.chimney),
    sign: typeof p.sign === 'string' && p.sign.length > 0 ? p.sign : null,
  };
}

/** A runtime level from params ('stock:logs', 'out:planks', 'growth'), 0 when absent. */
export function level(opts: KitBuildOptions | undefined, key: string): number {
  const v = opts?.params?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Roof color for a material: the chosen swatch (thatch keeps most of its straw), else the material's. */
export function roofColor(c: Custom, material: RoofMaterial, fallback?: number): number {
  const base = ROOF_MATERIAL_COLORS[material];
  if (c.roof === null) return fallback ?? base;
  if (material === 'thatch') {
    const a = base;
    const b = c.roof;
    const mix = (sh: number): number => Math.round(((a >> sh) & 255) * 0.75 + ((b >> sh) & 255) * 0.25);
    return (mix(16) << 16) | (mix(8) << 8) | mix(0);
  }
  return c.roof;
}

/** Weighted pick from a seeded stream (for per-building variety that customization can override). */
export function pickWeighted<T>(rnd: () => number, options: readonly [T, number][]): T {
  const total = options.reduce((t, [, w]) => t + w, 0);
  let r = rnd() * total;
  for (const [v, w] of options) {
    r -= w;
    if (r <= 0) return v;
  }
  return options[options.length - 1]![0];
}

/** Two streams per building: `look` for choices (stable across tweaks), `rnd` for jitter. */
export function streams(
  opts: KitBuildOptions | undefined,
  salt: number,
): { rnd: () => number; look: () => number } {
  const seed = opts?.seed ?? 1;
  return { rnd: seeded(seed * 7 + salt), look: seeded(seed * 131 + salt * 17 + 3) };
}

export const FLOWERS = [palette.flowerA, palette.flowerB, palette.flowerC, palette.flowerD, palette.blossom];

export type { ShapeBuilder };
