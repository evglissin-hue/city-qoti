// Render layer registry: one line per layer, in alphabetical order. Draw order comes from
// materials and renderOrder, not from this list.
import { agentsLayer } from './agents';
import { buildingsLayer } from './buildings';
import { decorLayer } from './decor';
import { effectsLayer } from './effects';
import { fieldsLayer } from './fields';
import { ghostsLayer } from './ghosts';
import { lightsLayer } from './lights';
import { natureLayer } from './nature';
import { notesLayer } from './notes';
import { overlaysLayer } from './overlays';
import { presenceLayer } from './presence';
import { roadsLayer } from './roads';
import { signsLayer } from './signs';
import { skyLayer } from './sky';
import { terrainLayer } from './terrain';
import { treesLayer } from './trees';
import type { LayerFactory } from './types';
import { waterLayer } from './water';

// prettier-ignore
export const layerFactories: readonly LayerFactory[] = [
  agentsLayer,
  buildingsLayer,
  decorLayer,
  effectsLayer,
  fieldsLayer,
  ghostsLayer,
  lightsLayer,
  natureLayer,
  notesLayer,
  overlaysLayer,
  presenceLayer,
  roadsLayer,
  signsLayer,
  skyLayer,
  terrainLayer,
  treesLayer,
  waterLayer,
];

export type { AgentsLayer } from './agents';
export type { EffectsLayer } from './effects';
export type { GhostLayer } from './ghosts';
export type { HighlightArea, OverlaysLayer } from './overlays';
export type { PresenceLayer } from './presence';
export type { LayerContext, LayerFactory, RenderLayer } from './types';
