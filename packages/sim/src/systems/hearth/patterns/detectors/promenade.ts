// Promenade by the Water: 8+ consecutive path or lane tiles each within SHORE steps of water, with 2+ benches and 2+ lanterns along it. Anchored on the smallest
// tile of the stretch.
import { MAP_SIZE } from '../../../../constants';
import type { WorldState } from '../../../../contracts';
import {
  components,
  type Detector,
  param,
  roadTiles,
  type SiteCandidate,
  spanLength,
  taggedAlong,
} from '../shared';

const S = MAP_SIZE;
/** Steps from the water a path tile may be and still count as the shore. */
const SHORE = 2;

/** Connected stretches of path within SHORE steps of the water, smallest tile first. */
export function shoreStretches(state: WorldState): number[][] {
  const water = state.map.water;
  const shore: number[] = [];
  for (const i of roadTiles(state)) {
    const x = i % S;
    const z = (i - x) / S;
    let wet = false;
    // Playtest round six: a path a tile back from the water (on the sand) still runs beside it.
    for (let dz = -SHORE; dz <= SHORE && !wet; dz++) {
      for (let dx = -SHORE; dx <= SHORE && !wet; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < S && nz < S && water[nz * S + nx]) wet = true;
      }
    }
    if (wet) shore.push(i);
  }
  return components(shore);
}

export const promenade: Detector = (state, def) => {
  const minRun = param(def, 'minRun', 8);
  const needBenches = param(def, 'benches', 2);
  const needLanterns = param(def, 'lanterns', 2);
  const out: SiteCandidate[] = [];
  for (const comp of shoreStretches(state)) {
    if (comp.length < minRun || spanLength(comp) < minRun) continue;
    const benches = taggedAlong(state, comp, 'bench');
    if (benches.length < needBenches) continue;
    const lanterns = taggedAlong(state, comp, 'lantern');
    if (lanterns.length < needLanterns) continue;
    out.push({ anchor: comp[0]!, members: [...benches, ...lanterns], tiles: comp });
  }
  return out;
};
