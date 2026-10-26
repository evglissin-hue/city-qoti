import type { BufferGeometry } from 'three';

export interface KitBuildOptions {
  /** Building footprint at rotation 0, in tiles. */
  size?: [number, number];
  /** Building entrance tile at rotation 0. */
  entrance?: [number, number];
  params?: Record<string, number | string | boolean>;
}

/**
 * A procedural piece. Geometry is in tile units (1 tile = 1 world unit, 1 height level = 0.5)
 * with vertex colors. Buildings span [0, w] x [0, d] with the entrance facing +z; decor and
 * trees are centered on the origin with their base at y = 0 and linear decor runs along +x.
 */
export interface Kit {
  id: string;
  kind: 'building' | 'decor' | 'tree';
  build(opts?: KitBuildOptions): BufferGeometry;
}
