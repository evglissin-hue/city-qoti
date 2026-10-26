// Pattern detector registry: content's PatternDef.detector names one of these. One line per
// detector, alphabetical.
import type { Detector } from '../shared';
import { hedgerowLane } from './hedgerowLane';
import { kitchenGarden } from './kitchenGarden';
import { lanternWalk } from './lanternWalk';
import { pocketPark } from './pocketPark';
import { promenade } from './promenade';
import { sittingWall } from './sittingWall';
import { treePlace } from './treePlace';
import { wellGathering } from './wellGathering';

// prettier-ignore
export const detectors: ReadonlyMap<string, Detector> = new Map<string, Detector>([
  ['hedgerowLane', hedgerowLane],
  ['kitchenGarden', kitchenGarden],
  ['lanternWalk', lanternWalk],
  ['pocketPark', pocketPark],
  ['promenade', promenade],
  ['sittingWall', sittingWall],
  ['treePlace', treePlace],
  ['wellGathering', wellGathering],
]);
