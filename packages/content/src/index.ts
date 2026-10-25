// Content registry. Add one line per entry, kept in alphabetical order, so parallel
// branches adding different entries merge cleanly.
import * as B from './buildings';
import * as D from './decor';
import * as R from './roads';
import * as T from './trees';
export { valleyNamePrefixes, valleyNameSuffixes } from './names';
import type { BuildingDef, Content, DecorDef, RoadDef, TreeDef } from './types';

export * from './types';

// prettier-ignore
export const buildings: readonly BuildingDef[] = [
  B.cottage,
  B.house,
  B.shed,
  B.townHall,
  B.well,
  B.windmill,
];

// prettier-ignore
export const decor: readonly DecorDef[] = [
  D.appleTree,
  D.barrels,
  D.bench,
  D.cherryTree,
  D.crates,
  D.fence,
  D.flowerBed,
  D.hedge,
  D.lantern,
  D.lowWall,
  D.planter,
  D.signpost,
];

// prettier-ignore
export const roads: readonly RoadDef[] = [
  R.lane,
  R.path,
];

// prettier-ignore
export const trees: readonly TreeDef[] = [
  T.birch,
  T.oak,
  T.pine,
];

function byId<T extends { id: string }>(list: readonly T[]): ReadonlyMap<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

export const content: Content = {
  buildings,
  decor,
  roads,
  trees,
  buildingById: byId(buildings),
  decorById: byId(decor),
  roadById: byId(roads),
  treeById: byId(trees),
};
