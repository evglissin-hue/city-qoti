// V1.0: what each face of a kit is made of. `ShapeBuilder.surface(id)` writes the id per vertex into
// a `surface` attribute; the kit material (V1A) reads it to pick a layer of the pattern texture
// array (patterns.ts) and the way to lay it on the face. Ids follow the V0 concept viewer
// (docs/concepts/v0-look/index.html, `M`) and are append-only: they show up in every kit, the
// gallery's screenshots and tests, so never renumber, reuse or remove one. A geometry without the
// attribute, or a face never given an id, reads as plain (0). V1A tunes the table's values.
import type { Palette2Single } from './palette';

export const SURFACE = {
  plain: 0,
  plaster: 1,
  brick: 2,
  stone: 3,
  timber: 4,
  tile: 5,
  slate: 6,
  thatch: 7,
  cobble: 8,
  glass: 9,
  grass: 10,
  dirt: 11,
  water: 12,
  leaf: 13,
  zinc: 14,
  awning: 15,
  field: 16,
  flags: 17,
  flowers: 18,
  // V2.0: appended for V2C (props, carts and residents). 19 is the noise layer's index in the
  // pattern array (a layer, not a surface), so these start at 20: a surface id is its layer.
  woodGrain: 20,
  paintedWood: 21,
  wroughtIron: 22,
  terracotta: 23,
  cloth: 24,
} as const;

export type SurfaceName = keyof typeof SURFACE;
export type SurfaceId = (typeof SURFACE)[SurfaceName];

/** The pattern array's low-frequency noise layer (meadow patches, weathering): a layer, not a surface. */
export const NOISE_LAYER = 19;
/** World size of one tile of the noise layer. */
export const NOISE_SCALE = 64;
/**
 * V2.0: the layers a surface id indexes, the noise layer's slot included (ids 0 to 18, the noise
 * layer 19, ids 20 to 24). The surface table's uniforms in the kit material have this many rows.
 */
export const SURFACE_LAYERS = 25;
/**
 * V2.0: the first of the room layers behind lit windows (V2A, `17-presentation.md`, Rooms behind
 * the windows): eight little rooms a pane shows by parallax, picked by the building's seed. They
 * follow the surface layers, so no shader index that reads a layer by number moves.
 */
export const ROOM_LAYER = SURFACE_LAYERS;
export const ROOM_LAYERS = 8;
/**
 * Layers in the pattern array: one per surface id, the noise layer at 19, then the room layers.
 * Append-only, like the ids: a new layer goes after the last one.
 */
export const PATTERN_LAYERS = ROOM_LAYER + ROOM_LAYERS;

/**
 * How a surface's pattern is laid on a face:
 * - `facade`: wall coordinates from the world position, u along the face's horizontal tangent and v
 *   up, so courses run level round a building; faces that point up (tops of walls, sills, steps)
 *   use `top` instead.
 * - `top`: world x and z, for the ground and anything flat.
 * - `roof`: the facade coordinates always, even on a steep pitch, so tile and slate courses run
 *   level along the eaves.
 */
export type SurfaceMapping = 'facade' | 'top' | 'roof';

export interface SurfaceDef {
  id: SurfaceId;
  name: SurfaceName;
  mapping: SurfaceMapping;
  /** World size of one tile of the pattern, in tiles (1 tile is 1 world unit). */
  scale: number;
  /** How strongly the pattern's luminance shows, 0 (a flat color) to 1. */
  strength: number;
  /**
   * The color the pattern's accent mask (G) mixes toward, as a palette 2.0 token (mortar between
   * bricks, the cream of awning stripes), and how far, 0 to 1.
   */
  accent?: { token: Palette2Single; mix: number };
}

const row = (
  name: SurfaceName,
  mapping: SurfaceMapping,
  scale: number,
  strength: number,
  accent?: SurfaceDef['accent'],
): SurfaceDef => ({ id: SURFACE[name], name, mapping, scale, strength, ...(accent ? { accent } : {}) });

/**
 * The surface table, indexed by id. Values from the concept viewer (`MATP`); glass and water carry
 * no pattern (the material gives them a sky fresnel and a sun glint), and flowers take their color
 * from the layer itself (its alpha is the mask). V2.0: index 19 is the noise layer's slot and holds
 * no row (`undefined`); the V2 surfaces follow it (V2C's values).
 */
export const SURFACES: readonly (SurfaceDef | undefined)[] = [
  row('plain', 'facade', 1, 0),
  row('plaster', 'facade', 2, 1),
  row('brick', 'facade', 1.2, 1, { token: 'mortar', mix: 0.75 }),
  row('stone', 'facade', 1.28, 1),
  row('timber', 'facade', 1, 1),
  row('tile', 'roof', 1.12, 1),
  row('slate', 'roof', 0.8, 1),
  row('thatch', 'roof', 1.28, 1),
  row('cobble', 'top', 1.04, 1),
  row('glass', 'facade', 1, 0),
  row('grass', 'top', 4, 1),
  row('dirt', 'top', 2, 1),
  row('water', 'top', 1, 0),
  row('leaf', 'facade', 1, 1),
  row('zinc', 'roof', 1.12, 1),
  row('awning', 'facade', 0.4, 0, { token: 'stripe', mix: 1 }),
  row('field', 'top', 1.6, 1),
  row('flags', 'top', 1.68, 1),
  row('flowers', 'top', 0.5, 0),
  undefined,
  // V2C: props, carts and residents. Small pieces, so small pattern tiles, and strengths low
  // enough that a cart still reads as a painted toy.
  row('woodGrain', 'facade', 0.6, 0.6),
  row('paintedWood', 'facade', 0.8, 0.5, { token: 'wood', mix: 0.75 }),
  row('wroughtIron', 'facade', 0.5, 0.5),
  row('terracotta', 'facade', 0.6, 0.55, { token: 'stripe', mix: 0.35 }),
  row('cloth', 'facade', 0.5, 0.5),
];

/** The table row for an id; unknown ids read as plain, like a missing attribute. */
export function surfaceDef(id: number): SurfaceDef {
  return SURFACES[id] ?? SURFACES[0]!;
}
