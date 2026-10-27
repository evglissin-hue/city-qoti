// Tier-aware need weights (docs/build/i2-wave-notes.md, Services). Settlers weigh their needs as
// in I1 (NEED_WEIGHTS), so a Hamlet plays exactly as before. Craftsfolk also care about the tavern
// (social) and the herbalist (health); their children care about the herbalist and the school
// (education) instead of the tavern. A need a resident does not have weighs nothing and stays at
// 100. A leaf module: the residents' mood code and the inspector read it.
import { NEED_IDS, NEED_WEIGHTS, TIERS } from '../../constants';
import type { LifeStage, Resident, TierId } from '../../contracts';

/** NEED_IDS indexes of the service needs. */
export const SERVICE_NEED = { social: 6, health: 7, education: 8 } as const;
export type ServiceKind = keyof typeof SERVICE_NEED;
export const SERVICE_KINDS: readonly ServiceKind[] = ['social', 'health', 'education'];

/** Mood weight of a service need for the residents who have it (tune). */
export const SERVICE_WEIGHT = 10;

export interface WeightRow {
  w: readonly number[];
  total: number;
}

const rows = new Map<string, WeightRow>();

/** True when residents of this tier and life stage have the service need. */
export function hasServiceNeed(tier: TierId, stage: LifeStage, kind: ServiceKind): boolean {
  if (TIERS.indexOf(tier) < 1) return false;
  if (kind === 'education') return stage === 'child';
  if (kind === 'social') return stage !== 'child';
  return true;
}

const GOODS = NEED_IDS.indexOf('goods');

/**
 * The weights a resident's mood uses, by tier and stage (cached rows). C4X: the `goods` need (the
 * basket, C4A) weighs only once the market is open at Village rank, so a Hamlet's moods stay I1's.
 */
export function weightRow(tier: TierId, stage: LifeStage, market = false): WeightRow {
  const key = `${tier}:${stage}:${market ? 1 : 0}`;
  let row = rows.get(key);
  if (!row) {
    const w = NEED_IDS.map((_, i) => (i === GOODS && !market ? 0 : (NEED_WEIGHTS[i] ?? 0)));
    for (const kind of SERVICE_KINDS) {
      w[SERVICE_NEED[kind]] = hasServiceNeed(tier, stage, kind) ? SERVICE_WEIGHT : 0;
    }
    row = { w, total: w.reduce((a, b) => a + b, 0) };
    rows.set(key, row);
  }
  return row;
}

export function weightsOf(r: Pick<Resident, 'tier' | 'stage'>, market = false): WeightRow {
  return weightRow(r.tier, r.stage, market);
}

/** Inspector words for the service needs, by NEED_IDS index (the I1 needs keep their own). */
const SERVICE_WORDS: readonly (readonly [min: number, text: string])[][] = [
  [],
  [],
  [],
  [],
  [],
  [],
  [
    [85, 'A tavern down the road'],
    [55, 'A tavern, if a dry one'],
    [0, 'Nowhere to meet of an evening'],
  ],
  [
    [85, 'The herbalist is close'],
    [55, 'Remedies run a little thin'],
    [0, 'No herbalist within reach'],
  ],
  [
    [85, 'Learning their letters'],
    [45, 'Lessons at the kitchen table'],
    [0, 'No school within reach'],
  ],
];

export function serviceNeedWords(i: number): readonly (readonly [min: number, text: string])[] {
  return SERVICE_WORDS[i] ?? [];
}
