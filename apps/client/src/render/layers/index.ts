// Render layer registry: one line per layer, in alphabetical order. Draw order comes from
// materials and renderOrder, not from this list.
import { buildingsLayer } from './buildings';
import { decorLayer } from './decor';
import { ghostsLayer } from './ghosts';
import { notesLayer } from './notes';
import { presenceLayer } from './presence';
import { roadsLayer } from './roads';
import { terrainLayer } from './terrain';
import { treesLayer } from './trees';
import type { LayerFactory } from './types';
import { waterLayer } from './water';

// prettier-ignore
export const layerFactories: readonly LayerFactory[] = [
  buildingsLayer,
  decorLayer,
  ghostsLayer,
  notesLayer,
  presenceLayer,
  roadsLayer,
  terrainLayer,
  treesLayer,
  waterLayer,
];

export type { GhostLayer } from './ghosts';
export type { PresenceLayer } from './presence';
export type { LayerContext, LayerFactory, RenderLayer } from './types';
