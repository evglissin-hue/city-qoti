// Resting (docs/spec/11-residents.md, jobs, [R1]; 13-ledger.md, Labor): a business with nothing to
// do rests by itself and its hands go where work is. The hourly status refresh sets
// `BuildingStatus.resting` from `restsFor`; hiring and the job audit read the bit. A specialized
// building (no trade) never rests by this rule: it keeps the old STUCK ranking.
import { content } from '@qoti/content';
import { BuildingStatus } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { familyIndex, familyOf, methodOf } from '../../state/zones';
import { townStock } from '../../view/hamlet';
import { outOfSeason } from './season';

/**
 * True when the business has nothing to do, given the status bits just worked out for it: out of
 * season; a farm with no fields or nothing standing in them; a craft short of a raw good that the
 * town has none of and the carrier may not bring; or a full output buffer.
 */
export function restsFor(state: WorldState, b: Building, bits: number): boolean {
  if (!b.trade || b.stage !== 'built') return false;
  const m = methodOf(b);
  if (!m) return false;
  if (outOfSeason(state, b)) return true;
  if (m.kind === 'farm' && bits & (BuildingStatus.noFields | BuildingStatus.fallow)) return true;
  if (bits & BuildingStatus.outputFull) return true;
  if (m.kind === 'craft' && bits & BuildingStatus.missingInput) return rawGoodUnreachable(state, b);
  return false;
}

/** True when a craft's missing raw good is nowhere in town and the carrier may not bring it. */
function rawGoodUnreachable(state: WorldState, b: Building): boolean {
  const m = methodOf(b);
  const rt = b.rt;
  if (!m || !rt) return false;
  const stock = townStock(state);
  for (const [id, qty] of m.inputs) {
    const g = content.goodIndex.get(id);
    if (g === undefined || rt.input[g]! >= qty) continue;
    if (stock[g]! > 0) return false;
    // The rule that counts is the one for the family of the good the business makes.
    const out = content.goodIndex.get(m.outputs[0]?.[0] ?? '');
    const family = out === undefined ? familyOf(g) : familyOf(out);
    if (state.carrier.families[familyIndex(family)]!.rule !== 'never') return false;
  }
  return true;
}

/** True when the building's last status refresh left it resting. */
export function isResting(b: Building): boolean {
  return !!b.rt && (b.rt.status & BuildingStatus.resting) !== 0;
}
