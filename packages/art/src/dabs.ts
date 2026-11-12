// V2.0: the dab kit's interface (`docs/spec/17-presentation.md`, A painted green world). One helper
// that V2B builds and that near tree crowns, hedges, reeds and ivy all use: small brush-dab
// triangles laid over a set of soft blobs, each dab tinted a little apart, shaded by its blob's soft
// normal (lighter toward the sky), with a few gaps to the boughs, and thinned by the season. The
// dabs are written through the caller's `ShapeBuilder` with surface leaf, so they join the kit's one
// geometry (opaque, no alpha test, no transparency) and keep its attributes.
//
// The stub writes nothing and no kit calls it yet: V2B fills it in and wires the kits. The signature
// is the contract; add options at the end, never rename or reorder.
import type { ShapeBuilder, V3 } from './geometry';

/** One soft blob of foliage, in the kit's local space (tiles; y up). */
export interface DabBlob {
  /** The blob's middle. */
  center: V3;
  /** Its radii along x, y and z (an ellipsoid). */
  radii: V3;
  /**
   * Where the soft normal points from: a dab's normal is the direction from this point to the dab,
   * so blobs that share a point (a crown's heart, a hedge's spine) shade as one soft mass. Defaults
   * to `center`.
   */
  normalFrom?: V3;
  /** The blob's base color (sRGB hex, a palette 2.0 foliage swatch). */
  color: number;
}

/** How the dabs are laid. Every value is a plain number, so a kit's key stays a string of them. */
export interface DabOptions {
  /** Dabs over all the blobs together, before gaps and thinning (a near crown: 180 to 320). */
  count: number;
  /** A dab's size in tiles (the side of its triangle). */
  size: number;
  /** How far apart each dab's tint wanders from its blob's color, 0 (none) to 1. */
  tintSpread: number;
  /** How much lighter dabs get toward the sky (normal up), 0 to 1. */
  skyLighten: number;
  /** The share of the blobs' surface left open to show the boughs, 0 to 1. */
  gaps: number;
  /**
   * The season's thinning: 1 is a full crown, 0 bare (dabs thin from Autumn day 4 and are gone in
   * winter). Dabs drop in a fixed order, so a crown thins without reshuffling.
   */
  thin: number;
  /** The random stream's seed (the kit's `opts.seed`), so the same tree gets the same dabs. */
  seed: number;
}

/**
 * Lays brush dabs over `blobs` into `b` with surface leaf and returns how many triangles it wrote.
 * The caller sets `b`'s level and any `glow` beforehand; the helper restores the builder's surface
 * id as it found it. V2.0 stub: writes nothing and returns 0.
 */
export function brushDabs(b: ShapeBuilder, blobs: readonly DabBlob[], opts: DabOptions): number {
  void b;
  void blobs;
  void opts;
  return 0;
}
