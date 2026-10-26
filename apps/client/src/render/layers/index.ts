// Render layer registry: one line per layer, in alphabetical order. Draw order comes from
// materials and renderOrder, not from this list.
import { buildingsLayer } from './buildings';
import { decorLayer } from './decor';
import { effectsLayer } from './effects';
import { ghostsLayer } from './ghosts';
import { lightsLayer } from './lights';
import { natureLayer } from './nature';
import { notesLayer } from './notes';
import { presenceLayer } from './presence';
import { roadsLayer } from './roads';
import { skyLayer } from './sky';
import { terrainLayer } from './terrain';
import { treesLayer } from './trees';
import type { LayerFactory } from './types';
import { waterLayer } from './water';

// prettier-ignore
export const layerFactories: readonly LayerFactory[] = [
  buildingsLayer,
  decorLayer,
  effectsLayer,
  ghostsLayer,
  lightsLayer,
  natureLayer,
  notesLayer,
  presenceLayer,
  roadsLayer,
  skyLayer,
  terrainLayer,
  treesLayer,
  waterLayer,
];

export type { EffectsLayer } from './effects';
export type { GhostLayer } from './ghosts';
export type { PresenceLayer } from './presence';
export type { LayerContext, LayerFactory, RenderLayer } from './types';
