// Lantern Walk: a continuous path or lane of 10+ tiles where every run of 3 consecutive tiles has
// a lantern within 1 tile. A road tile is lit when a lantern stands on it or one of its eight
// neighbors; it is covered when it, or a road neighbor, is lit (so the dark gaps are 2 tiles at
// most). Each connected stretch of covered road whose longest walk reaches 10 tiles is a walk,
// anchored on its smallest tile.
import { MAP_SIZE } from '../../../../constants';
import type { WorldState } from '../../../../contracts';
import {
  components,
  type Detector,
  param,
  roadTiles,
  type SiteCandidate,
  spanLength,
  tagged,
  taggedAlong,
  tileOf,
} from '../shared';

const S = MAP_SIZE;
const lit = new Uint8Array(S * S);

/** Connected stretches of covered road (see the header), smallest tile first. */
export function litStretches(state: WorldState, reach: number): number[][] {
  const lanterns = tagged(state, 'lantern');
  if (lanterns.length === 0) return [];
  const marked: number[] = [];
  for (const d of lanterns) {
    const t = tileOf(d);
    const x = t % S;
    const z = (t - x) / S;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
        const i = nz * S + nx;
        if (!lit[i]) {
          lit[i] = 1;
          marked.push(i);
        }
      }
    }
  }
  const road = state.map.road;
  const covered: number[] = [];
  for (const i of roadTiles(state)) {
    const x = i % S;
    let ok = lit[i] === 1;
    if (!ok && x > 0 && road[i - 1] && lit[i - 1]) ok = true;
    if (!ok && x < S - 1 && road[i + 1] && lit[i + 1]) ok = true;
    if (!ok && i >= S && road[i - S] && lit[i - S]) ok = true;
    if (!ok && i < S * S - S && road[i + S] && lit[i + S]) ok = true;
    if (ok) covered.push(i);
  }
  for (const i of marked) lit[i] = 0;
  return components(covered);
}

export const lanternWalk: Detector = (state, def) => {
  const minRun = param(def, 'minRun', 10);
  const needLanterns = param(def, 'lanterns', 3);
  const out: SiteCandidate[] = [];
  for (const comp of litStretches(state, param(def, 'reach', 1))) {
    if (comp.length < minRun || spanLength(comp) < minRun) continue;
    const members = taggedAlong(state, comp, 'lantern');
    if (members.length < needLanterns) continue;
    out.push({ anchor: comp[0]!, members, tiles: comp });
  }
  return out;
};
