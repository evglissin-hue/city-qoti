// Resident APIs other tracks call (C3.0 contract; C3A owns them). C3B grants wish rewards through
// addMoodModifier and addBond; C3C reads the mood tax factor and productivity.
import { MOOD_PRODUCTIVITY, MOOD_TAX } from '../../constants';
import type { EntityId, MoodModifier, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { moodBand } from '../../view/hamlet';
import { traitSum } from './traits';

export interface MoodModifierInput {
  kind: string;
  value: number;
  /** Duration in ticks; 0 holds it until removeMoodModifier. */
  ticks: number;
}

/** Adds a modifier; one of the same kind is replaced (refreshed), never stacked. */
export function addMoodModifier(state: WorldState, residentId: EntityId, mod: MoodModifierInput): void {
  const r = findById(state.residents, residentId);
  if (!r) return;
  const m: MoodModifier = {
    kind: mod.kind,
    value: mod.value,
    from: state.tick,
    until: mod.ticks > 0 ? state.tick + mod.ticks : 0,
  };
  const i = r.modifiers.findIndex((x) => x.kind === mod.kind);
  if (i >= 0) r.modifiers[i] = m;
  else r.modifiers.push(m);
}

export function removeMoodModifier(state: WorldState, residentId: EntityId, kind: string): void {
  const r = findById(state.residents, residentId);
  if (!r) return;
  const i = r.modifiers.findIndex((x) => x.kind === kind);
  if (i >= 0) r.modifiers.splice(i, 1);
}

/** Current value of a modifier with linear decay (integer math). */
export function modifierValue(m: MoodModifier, tick: number): number {
  if (m.until === 0) return m.value;
  if (tick >= m.until) return 0;
  const span = m.until - m.from;
  return span > 0 ? Math.trunc((m.value * (m.until - tick)) / span) : 0;
}

/** Hearts that granted wishes can raise a bond to; more comes from festivals, story steps and years. */
export const WISH_BOND_CAP = 3;

/**
 * Changes bond hearts by n, clamped 0 to 5. Gains from wishes (the default source) stop at 3 hearts
 * (docs/spec/11-residents.md, Bond with the town); other sources may fill all 5.
 */
export function addBond(
  state: WorldState,
  residentId: EntityId,
  n: number,
  source: 'wish' | 'other' = 'wish',
): void {
  const r = findById(state.residents, residentId);
  if (!r) return;
  if (n > 0 && source === 'wish') {
    if (r.bond < WISH_BOND_CAP) r.bond = Math.min(WISH_BOND_CAP, r.bond + n);
    return;
  }
  r.bond = Math.max(0, Math.min(5, r.bond + n));
}

/** Town tax factor in percent from residents' mood bands (13-ledger.md, Budget). */
export function moodTaxPercent(state: WorldState, residentId: EntityId): number {
  const r = findById(state.residents, residentId);
  return r ? MOOD_TAX[moodBand(r.mood)]! : 0;
}

/** Work output in percent: the mood band's productivity plus Practical's +5. 0 when gone. */
export function productivityPercent(state: WorldState, residentId: EntityId): number {
  const r = findById(state.residents, residentId);
  return r ? MOOD_PRODUCTIVITY[moodBand(r.mood)]! + traitSum(r, 'productivity') : 0;
}
