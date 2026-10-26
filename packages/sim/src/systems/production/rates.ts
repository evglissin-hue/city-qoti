// What a building makes and uses in a work day with its full crew (the building inspector's
// numbers). A work day is the 9 hours from WORK_HOURS; condition and height bonus apply, mood
// does not (it varies by who turns up).
import type { BuildingDef } from '@qoti/content';
import { content } from '@qoti/content';
import { TICKS_PER_HOUR, WORK_HOURS } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import {
  CROP_GROWTH,
  CROP_RIPE,
  CROP_STEP_TICKS,
  CROP_YIELD,
  FIELD_TILES_PER_WORKER,
  ownedFields,
} from './fields';
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
  const scale = (conditionPercent(rt) * heightPercent(state, b, def, method)) / 10000;
  if (method.kind === 'farm') {
    const tiles = Math.min(ownedFields(state, b, def), FIELD_TILES_PER_WORKER * Math.max(1, method.workers));
    const stepsPerDay = (WORK_DAY_HOURS * TICKS_PER_HOUR) / CROP_STEP_TICKS;
    const perTile = (CROP_YIELD * stepsPerDay * CROP_GROWTH) / (CROP_RIPE + 1);
    return { inputs: [], outputs: method.outputs.map(([g]) => [g, tenth(tiles * perTile * scale)]) };
  }
  const cycles =
    (WORK_DAY_HOURS / method.hours) * (method.perWorker ? Math.max(1, method.workers) : 1) * scale;
  return {
    inputs: method.inputs.map(([g, q]) => [g, tenth(q * cycles)]),
    outputs: method.outputs.filter(([g]) => content.goodIndex.has(g)).map(([g, q]) => [g, tenth(q * cycles)]),
  };
}
