// The economy dial (docs/spec/14-challenge.md, Difficulty dials; 13-ledger.md, Budget).
// Construction, road and field prices stay as listed in content in every setting, so the
// toolbar always shows the true price; the dial bends running costs and how forgiving lean
// times are.
import type { ValleySettings, WorldState } from '../../contracts';

export interface EconomyDial {
  /** Building upkeep in percent of the listed coins per day. */
  upkeepPercent: number;
  /** Condition points a building loses for each day its upkeep goes unpaid. */
  leanDecay: number;
  /** Condition points a builder restores per hour of repair work. */
  repairPerHour: number;
}

const GENTLE: EconomyDial = { upkeepPercent: 70, leanDecay: 1, repairPerHour: 15 };
const STANDARD: EconomyDial = { upkeepPercent: 100, leanDecay: 2, repairPerHour: 10 };
const THOUGHTFUL: EconomyDial = { upkeepPercent: 125, leanDecay: 3, repairPerHour: 8 };

export function economyDial(settings: ValleySettings['economy']): EconomyDial {
  return settings === 'thoughtful' ? THOUGHTFUL : settings === 'standard' ? STANDARD : GENTLE;
}

/** Upkeep of one building per day in pennies, after the dial. */
export function upkeepPennies(state: WorldState, coinsPerDay: number): number {
  return Math.round(coinsPerDay * economyDial(state.settings.economy).upkeepPercent);
}
