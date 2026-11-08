// What a building makes and uses in a work day with its full crew (the building inspector's
// numbers). A work day is the 9 hours from WORK_HOURS; condition and height bonus apply, mood
// does not (it varies by who turns up).
import type { BuildingDef } from '@qoti/content';
import { content } from '@qoti/content';
import { DAYS_PER_YEAR, WORK_HOURS } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { hasInnovation } from '../../state/village';
import { DRILL_STEP, FIELD_TILES_PER_WORKER, HARVEST_STEP, ownedFields, tileHarvest } from './fields';
import { yieldPermille } from './modifiers';
import { conditionPercent, heightPercent } from './produce';

const WORK_DAY_HOURS = WORK_HOURS[1] - WORK_HOURS[0];

export interface DailyRates {
  inputs: [good: string, perDay: number][];
  outputs: [good: string, perDay: number][];
}

/** One decimal place, for display. */
function tenth(n: number): number {
  return Math.round(n * 10) / 10;
}

export function dailyRates(state: WorldState, b: Building, def: BuildingDef): DailyRates | null {
  const rt = b.rt;
  const method = def.methods?.[rt?.method ?? 0];
  if (!rt || !method) return null;
  const scale =
    ((conditionPercent(rt) * heightPercent(state, b, def, method)) / 10000) *
    (yieldPermille(state, b, def, method) / 1000);
  if (method.kind === 'farm') {
    // I3 (C5A): one harvest a year, shown as the year's wheat spread over its days (rain and
    // drought change how far the wheat gets by the harvest, not this).
    const tiles = Math.min(ownedFields(state, b, def), FIELD_TILES_PER_WORKER * Math.max(1, method.workers));
    const bite = hasInnovation(state, 'seed-drill') ? DRILL_STEP : HARVEST_STEP;
    const perTile = tileHarvest(bite) / DAYS_PER_YEAR;
    const cond = (conditionPercent(rt) * heightPercent(state, b, def, method)) / 10000;
    return { inputs: [], outputs: method.outputs.map(([g]) => [g, tenth(tiles * perTile * cond)]) };
  }
  const cycles =
    (WORK_DAY_HOURS / method.hours) * (method.perWorker ? Math.max(1, method.workers) : 1) * scale;
  return {
    inputs: method.inputs.map(([g, q]) => [g, tenth(q * cycles)]),
    outputs: method.outputs.filter(([g]) => content.goodIndex.has(g)).map(([g, q]) => [g, tenth(q * cycles)]),
  };
}
