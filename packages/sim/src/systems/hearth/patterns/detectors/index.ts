// Pattern detector registry: content's PatternDef.detector names one of these. One line per
// detector, alphabetical.
import type { Detector } from '../shared';
import { bridgeCrossing } from './bridgeCrossing';
import { childrensCorner } from './childrensCorner';
import { cornerCafe } from './cornerCafe';
import { hedgerowLane } from './hedgerowLane';
import { kitchenGarden } from './kitchenGarden';
import { lanternWalk } from './lanternWalk';
import { marketCross } from './marketCross';
import { orchardPath } from './orchardPath';
import { pocketPark } from './pocketPark';
import { pondGarden } from './pondGarden';
import { promenade } from './promenade';
import { readingNook } from './readingNook';
import { sittingWall } from './sittingWall';
import { smallSquare } from './smallSquare';
import { treePlace } from './treePlace';
import { villageGreen } from './villageGreen';
import { wellGathering } from './wellGathering';
import { windowGardens } from './windowGardens';

// prettier-ignore
export const detectors: ReadonlyMap<string, Detector> = new Map<string, Detector>([
  ['bridgeCrossing', bridgeCrossing],
  ['childrensCorner', childrensCorner],
  ['cornerCafe', cornerCafe],
  ['hedgerowLane', hedgerowLane],
  ['kitchenGarden', kitchenGarden],
  ['lanternWalk', lanternWalk],
  ['marketCross', marketCross],
  ['orchardPath', orchardPath],
  ['pocketPark', pocketPark],
  ['pondGarden', pondGarden],
  ['promenade', promenade],
  ['readingNook', readingNook],
  ['sittingWall', sittingWall],
  ['smallSquare', smallSquare],
  ['treePlace', treePlace],
  ['villageGreen', villageGreen],
  ['wellGathering', wellGathering],
  ['windowGardens', windowGardens],
]);
