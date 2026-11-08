// Nature API (C5.0 contract; C5C owns habitats and wildlife). docs/spec/12-hearth.md, Nature and
// the Field Guide. Production reads pollinators and pests through the yield hook (C5C registers it).
import { CHUNK_SIZE, CHUNKS_PER_SIDE, HABITAT_IDS } from '../../constants';
import type { HabitatId, WorldState } from '../../contracts';
import { pollinatorFactorOf } from '../nature/effects';

/** Habitat score 0 to 255 of the chunk holding tile (x, z). */
export function habitatAt(state: WorldState, x: number, z: number, habitat: HabitatId): number {
  const h = HABITAT_IDS.indexOf(habitat);
  if (h < 0) return 0;
  const c = Math.floor(z / CHUNK_SIZE) * CHUNKS_PER_SIDE + Math.floor(x / CHUNK_SIZE);
  return state.nature.habitats[h * CHUNKS_PER_SIDE * CHUNKS_PER_SIDE + c] ?? 0;
}

/** C5C: bees on an orchard or farm (or an apiary's honey), permille (1000 = no effect). */
export function pollinatorFactor(state: WorldState, buildingId: number): number {
  return pollinatorFactorOf(state, buildingId);
}

/** Summer pests eating a farm's yield, permille lost. */
export function pestLoss(state: WorldState, buildingId: number): number {
  return state.nature.pests.find(([id]) => id === buildingId)?.[1] ?? 0;
}

/** The species is in the Field Guide. */
export function hasSpecies(state: WorldState, species: string): boolean {
  return state.nature.guide.some((e) => e.species === species);
}
