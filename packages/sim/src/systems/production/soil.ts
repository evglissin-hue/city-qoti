// Playtest round six: buildings tagged 'soil' (plots, gardens, pastures, orchards, farmsteads) grow
// anywhere but yield by the soil under them, from 60% on bare ground to a full crop from 80 up,
// in place of a minimum fertility to place them. Registered in the yield hook (./modifiers).
import { footprintSize } from '../../rules/footprint';
import { MAP_SIZE } from '../../constants';
import type { YieldModifier } from './modifiers';

/** Permille for an average fertility of 0 to 100: 600 on bare ground, 1000 from 80 up. */
export function soilPermille(fertility: number): number {
  return Math.min(1000, 600 + 5 * Math.max(0, fertility));
}

export const soilYield: YieldModifier = (state, b, def) => {
  if (!def.tags?.includes('soil')) return 1000;
  const [w, d] = footprintSize(def, b.rot);
  let sum = 0;
  for (let z = b.z; z < b.z + d; z++)
    for (let x = b.x; x < b.x + w; x++) sum += state.map.fertility[z * MAP_SIZE + x]!;
  return soilPermille(Math.floor(sum / (w * d)));
};
