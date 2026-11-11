// R1E: workshop trades by level (kits/business.ts has the rules every level follows). Each draw
// fits its trade's look into the workshop's 3x3 lot in its district style: the baker's oven, the
// weaver's long windows and tenter frame, the carpenter's open shop and timber, the chandler's
// dipping rack and the cider maker's mill and press.
import type { BusinessDraw } from './business';

/** Workshop draws by the look kit id a trade names (content `TradeDef.look`). */
export const WORKSHOP_LOOKS: Readonly<Record<string, BusinessDraw>> = {};
