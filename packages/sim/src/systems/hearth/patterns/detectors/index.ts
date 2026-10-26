// Pattern detector registry: content's PatternDef.detector names one of these. One line per
// detector, alphabetical.
import type { Detector } from '../shared';
import { bridgeCrossing } from './bridgeCrossing';
import { cornerCafe } from './cornerCafe';
import { hedgerowLane } from './hedgerowLane';
import { kitchenGarden } from './kitchenGarden';
import { lanternWalk } from './lanternWalk';
import { marketCross } from './marketCross';
import { pocketPark } from './pocketPark';
import { promenade } from './promenade';
import { sittingWall } from './sittingWall';
import { smallSquare } from './smallSquare';
import { treePlace } from './treePlace';
import { villageGreen } from './villageGreen';
import { wellGathering } from './wellGathering';
import { windowGardens } from './windowGardens';

// prettier-ignore
export const detectors: ReadonlyMap<string, Detector> = new Map<string, Detector>([
  ['bridgeCrossing', bridgeCrossing],
  ['cornerCafe', cornerCafe],
  ['hedgerowLane', hedgerowLane],
  ['kitchenGarden', kitchenGarden],
  ['lanternWalk', lanternWalk],
  ['marketCross', marketCross],
  ['pocketPark', pocketPark],
  ['promenade', promenade],
  ['sittingWall', sittingWall],
  ['smallSquare', smallSquare],
  ['treePlace', treePlace],
  ['villageGreen', villageGreen],
  ['wellGathering', wellGathering],
  ['windowGardens', windowGardens],
]);
