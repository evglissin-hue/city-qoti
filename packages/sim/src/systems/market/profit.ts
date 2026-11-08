// Profit per building (docs/spec/13-ledger.md, Market and prices): output at market price minus
// wages, upkeep and inputs at market price, per work day with the full crew. All buildings belong
// to the town, so profit is a signal (what earns its keep, what is a public good), not a cash flow.
import { content, type BuildingDef } from '@qoti/content';
import { TIERS } from '../../constants';
import type { Building, ProfitLine, WorldState } from '../../contracts';
import { wagesAt } from '../../view/village';
import { upkeepPennies } from '../economy/dial';
import { dailyRates } from '../production/rates';
import { priceOf } from './api';

export interface Profit {
  perDay: number;
  lines: { label: string; pennies: number }[];
}

/** A building's profit per work day, or null for buildings with neither jobs nor methods. */
export function buildingProfit(state: WorldState, b: Building, def: BuildingDef): Profit | null {
  if (!b.rt) return null;
  const rates = dailyRates(state, b, def);
  if (!rates && !def.jobs) return null;
  const lines: { label: string; pennies: number }[] = [];
  let made = 0;
  for (const [g, n] of rates?.outputs ?? [])
    made += Math.round(priceOf(state, content.goodIndex.get(g)!) * n);
  let used = 0;
  for (const [g, n] of rates?.inputs ?? []) used += Math.round(priceOf(state, content.goodIndex.get(g)!) * n);
  const tier = Math.max(0, TIERS.indexOf(def.jobs?.tier ?? 'settler'));
  const wages = (def.jobs?.count ?? 0) * (wagesAt(state.levers.wageLevel)[tier] ?? 0);
  const upkeep = def.upkeep ? upkeepPennies(state, def.upkeep) : 0;
  if (made) lines.push({ label: 'Goods made', pennies: made });
  if (used) lines.push({ label: 'Goods used', pennies: -used });
  if (wages) lines.push({ label: 'Wages', pennies: -wages });
  if (upkeep) lines.push({ label: 'Upkeep', pennies: -upkeep });
  return { perDay: made - used - wages - upkeep, lines };
}

/** Every built workplace's profit per work day, most profitable first (ties by id). */
export function profitReport(state: WorldState): ProfitLine[] {
  const out: ProfitLine[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    const def = content.buildingById.get(b.def);
    if (!def || def.housing) continue;
    const p = buildingProfit(state, b, def);
    if (p) out.push({ id: b.id, def: b.def, perDay: p.perDay });
  }
  return out.sort((a, b) => b.perDay - a.perDay || a.id - b.id);
}
