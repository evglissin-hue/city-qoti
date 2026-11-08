import type { BufferGeometry } from 'three';

export interface KitBuildOptions {
  /** Building footprint at rotation 0, in tiles. */
  size?: [number, number];
  /** Building entrance tile at rotation 0. */
  entrance?: [number, number];
  params?: Record<string, number | string | boolean>;
  /** C2 addition: tree growth stage, 0 (sapling) to 3 (mature). Trees only; absent means mature. */
  stage?: number;
  /** C2 addition: level of detail; 'low' is a cheap version for distance or the Low preset. */
  lod?: 'high' | 'low';
  /** C2 addition: deterministic variation seed (for example an entity id), so both laptops match. */
  seed?: number;
}

/** C2 addition: points of interest in kit-local coordinates (the same space as `build`). */
export interface KitAnchors {
  /** Chimney tops that puff smoke. */
  smoke?: [number, number, number][];
  /** Lantern flames and lit windows, for ground glow and night lights. */
  lights?: [number, number, number][];
  /**
   * C3D addition: the painted board where custom sign text goes (center just off the board, the
   * direction it faces, and its size), so the renderer can letter it with a canvas texture.
   */
  sign?: {
    center: [number, number, number];
    normal: [number, number, number];
    width: number;
    height: number;
  };
  /**
   * C4E addition: animals that live in pens on the plot (sheep in a pasture, cows by the dairy,
   * hens in a yard). Pens are kit-local rects [x0, z0, x1, z1] at ground level; the renderer keeps
   * `count` animals of `kind` wandering and grazing inside each.
   */
  animals?: { kind: AnimalKind; pen: [number, number, number, number]; count: number }[];
}

/** C4E: animals the renderer can keep in a pen. */
export type AnimalKind = 'sheep' | 'cow' | 'hen' | 'pony';

/** C2 addition: a separately animated piece, such as windmill sails. */
export interface KitPart {
  geometry: BufferGeometry;
  /** Pivot in kit-local coordinates. */
  pivot: [number, number, number];
  /** Spin axis (unit vector, kit-local) and speed in radians per second. */
  spinAxis?: [number, number, number];
  spinSpeed?: number;
}

/**
 * A procedural piece. Geometry is in tile units (1 tile = 1 world unit, 1 height level = 0.5)
 * with vertex colors. Buildings span [0, w] x [0, d] with the entrance facing +z; decor and
 * trees are centered on the origin with their base at y = 0 and linear decor runs along +x.
 *
 * C2 addition: geometry may carry a `glow` vertex attribute (itemSize 1): 1 on window panes (lit
 * in a seeded share of homes each evening), 2 on lantern flames and fires (lit every night), 0
 * elsewhere. Renderers treat a missing attribute as all 0.
 */
export interface Kit {
  id: string;
  /**
   * C3D-1 addition: 'nature' props (bushes, rocks, reeds...) that the renderer scatters. C4E:
   * 'vehicle' (carts) and 'animal' (sheep, cows, ponies), drawn by the renderer's own layers.
   */
  kind: 'building' | 'decor' | 'tree' | 'nature' | 'vehicle' | 'animal';
  /** C4E addition: the footprint (and entrance) the kit is drawn for when no def says otherwise. */
  footprint?: { size: [number, number]; entrance: [number, number] };
  build(opts?: KitBuildOptions): BufferGeometry;
  /** C2 addition: anchors for effects (smoke, lights). Optional. */
  anchors?(opts?: KitBuildOptions): KitAnchors;
  /** C2 addition: animated parts drawn in addition to `build`. Optional. */
  parts?(opts?: KitBuildOptions): KitPart[];
}
