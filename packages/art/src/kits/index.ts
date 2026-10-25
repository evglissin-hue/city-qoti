// Art kit registry: one line per kit, in alphabetical order by id. Content defs name their kit
// in `art.kit`; the client test checks that every one of them exists here.
import * as B from './buildings';
import * as D from './decor';
import * as T from './trees';
import type { Kit } from './types';

// prettier-ignore
export const kits: readonly Kit[] = [
  D.appleTree,
  D.barrels,
  D.bench,
  T.birch,
  D.cherryTree,
  B.cottage,
  D.crates,
  D.fence,
  D.flowerBed,
  D.hedge,
  B.house2,
  D.lantern,
  D.lowWall,
  T.oak,
  T.pine,
  D.planter,
  B.shed,
  D.signpost,
  B.townHall,
  B.well,
  B.windmill,
];

export const kitById: ReadonlyMap<string, Kit> = new Map(kits.map((k) => [k.id, k]));

export type { Kit, KitAnchors, KitBuildOptions, KitPart } from './types';
