// R1E: farm trades by level (kits/business.ts has the rules every level follows). Each draw fits
// its trade's look into the farmstead's 3x3 lot in its district style: grain and a barn, a market
// garden's rows, an orchard's trees, a dairy's byre and cows, a sheep run's fold and the hives.
import type { BusinessDraw } from './business';

/** Farmstead draws by the look kit id a trade names (content `TradeDef.look`). */
export const FARM_LOOKS: Readonly<Record<string, BusinessDraw>> = {};
