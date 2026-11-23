// The fourth gap's two rules, as gapChecks.ts registers them (R3A). A leaf with no imports of its
// own, so it is always evaluated before either side reads or writes it, whatever cycle the place
// pass's imports run through: supplies/api.ts reads it, gapChecks.ts fills it as it loads.
import type { Gap, WorldState } from '../../contracts';

export interface SupplyGapRules {
  achievable(state: WorldState): boolean;
  closable(state: WorldState, gap: Gap): boolean;
}

/** The registered rules; null until gapChecks.ts loads (the supplies and gaps systems import it). */
export const gapHook: { rules: SupplyGapRules | null } = { rules: null };
