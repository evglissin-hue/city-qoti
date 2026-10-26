// Tree Place: a mature or ornamental big tree with 2+ benches within 1.5 tiles, and path tiles
// leading off in 2+ directions within 2 tiles. Anchored on the tree's tile.
import { MAP_SIZE, TILE_FP } from '../../../../constants';
import type { EntityId } from '../../../../contracts';
import { TREE_MATURE, treeStage } from '../../../../map/layers';
import {
  type Detector,
  dist2,
  param,
  type SiteCandidate,
  tagged,
  taggedIn,
  tileOf,
  treeTiles,
} from '../shared';

const S = MAP_SIZE;
const HALF = TILE_FP / 2;

export const treePlace: Detector = (state, def) => {
  const needBenches = param(def, 'benches', 2);
  const benchReach = param(def, 'benchReach', 384) / TILE_FP;
  const needDirs = param(def, 'paths', 2);
  const pathReach = param(def, 'pathReach', 2);

  // Every big tree: mature map trees and ornamental trees, as fixed-point centers.
  const trees: [tile: number, fx: number, fz: number, decor: EntityId][] = [];
  const m = state.map;
  for (const i of treeTiles(state)) {
    if (treeStage(m.tree[i]!) < TREE_MATURE) continue;
    trees.push([i, (i % S) * TILE_FP + HALF, Math.floor(i / S) * TILE_FP + HALF, 0]);
  }
  for (const d of tagged(state, 'tree')) trees.push([tileOf(d), d.fx, d.fz, d.id]);

  const out: SiteCandidate[] = [];
  const reach = Math.ceil(benchReach);
  for (const [tile, fx, fz, decor] of trees) {
    const tx = tile % S;
    const tz = (tile - tx) / S;
    const benches: EntityId[] = [];
    for (const d of taggedIn(state, [tx - reach, tz - reach, tx + reach, tz + reach], 'bench')) {
      if (dist2(d.fx, d.fz, fx, fz) <= benchReach * benchReach) benches.push(d.id);
    }
    if (benches.length < needBenches) continue;

    // Path tiles around the tree, by the direction they lead off in (east, west, south, north).
    let dirs = 0;
    const paths: number[] = [];
    const limit = (pathReach + 0.5) * (pathReach + 0.5);
    for (let dz = -pathReach; dz <= pathReach; dz++) {
      for (let dx = -pathReach; dx <= pathReach; dx++) {
        const x = tx + dx;
        const z = tz + dz;
        if (x < 0 || z < 0 || x >= S || z >= S || !m.road[z * S + x]) continue;
        const ox = (x * TILE_FP + HALF - fx) / TILE_FP;
        const oz = (z * TILE_FP + HALF - fz) / TILE_FP;
        if (ox * ox + oz * oz > limit) continue;
        const ax = Math.abs(ox);
        const az = Math.abs(oz);
        if (ax < 0.5 && az < 0.5) continue;
        dirs |= ax >= az ? (ox > 0 ? 1 : 2) : oz > 0 ? 4 : 8;
        paths.push(z * S + x);
      }
    }
    let n = 0;
    for (let b = dirs; b; b &= b - 1) n++;
    if (n < needDirs) continue;

    const members = decor ? [decor, ...benches] : benches;
    out.push({ anchor: tile, members, tiles: decor ? paths : [tile, ...paths] });
  }
  return out;
};
