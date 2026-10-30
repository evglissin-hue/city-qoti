// The yield hook (C5.0): one registry of output modifiers that production applies to farm, gather
// and craft work, so no I3 track edits production itself. Each source returns permille (1000 = no
// change); they multiply. C5A registers weather, drought, early frost, the frozen river and the
// Seed Drill; C5C pollinators and pests. Playtest round six: the soil under 'soil' buildings.
// Felling and planting are never modified.
import type { BuildingDef, ProductionMethod } from '@qoti/content';
import type { Building, WorldState } from '../../contracts';
import { soilYield } from './soil';

export type YieldModifier = (
  state: WorldState,
  b: Building,
  def: BuildingDef,
  method: ProductionMethod,
) => number;

// Registry: one line per source, alphabetical by id.
// prettier-ignore
export const yieldModifiers: readonly [id: string, modifier: YieldModifier][] = [
  ['soil', soilYield],
];

let extra: readonly [string, YieldModifier][] = [];

/** Tests only: runs `fn` with extra modifiers registered after the real ones. */
export function withYieldModifiers<T>(list: readonly [string, YieldModifier][], fn: () => T): T {
  const before = extra;
  extra = [...before, ...list];
  try {
    return fn();
  } finally {
    extra = before;
  }
}

/** The product of every registered modifier for this building and method, permille. */
export function yieldPermille(
  state: WorldState,
  b: Building,
  def: BuildingDef,
  method: ProductionMethod,
): number {
  if (method.kind === 'fell' || method.kind === 'plant') return 1000;
  let p = 1000;
  for (const [, f] of yieldModifiers) p = Math.floor((p * f(state, b, def, method)) / 1000);
  for (const [, f] of extra) p = Math.floor((p * f(state, b, def, method)) / 1000);
  return Math.max(0, p);
}
