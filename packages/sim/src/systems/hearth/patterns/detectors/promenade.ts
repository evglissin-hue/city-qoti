// Promenade by the Water: 8+ consecutive path or lane tiles each next to water (one of the eight
// neighbors is river or pond), with 2+ benches and 2+ lanterns along it. Anchored on the smallest
// tile of the stretch.
import { MAP_SIZE } from '../../../../constants';
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

export const promenade: Detector = (state, def) => {
  const minRun = param(def, 'minRun', 8);
  const needBenches = param(def, 'benches', 2);
  const needLanterns = param(def, 'lanterns', 2);
  const water = state.map.water;
  const shore: number[] = [];
  for (const i of roadTiles(state)) {
    const x = i % S;
    const z = (i - x) / S;
    let wet = false;
    for (let dz = -1; dz <= 1 && !wet; dz++) {
      for (let dx = -1; dx <= 1 && !wet; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < S && nz < S && water[nz * S + nx]) wet = true;
      }
    }
    if (wet) shore.push(i);
  }
  const out: SiteCandidate[] = [];
  for (const comp of components(shore)) {
    if (comp.length < minRun || spanLength(comp) < minRun) continue;
    const benches = taggedAlong(state, comp, 'bench');
    if (benches.length < needBenches) continue;
    const lanterns = taggedAlong(state, comp, 'lantern');
    if (lanterns.length < needLanterns) continue;
    out.push({ anchor: comp[0]!, members: [...benches, ...lanterns], tiles: comp });
  }
  return out;
};
