// Bench scenarios for the I1 economy (C3C): the 40-resident hamlet's ms per tick against the
// 0.5 ms budget (docs/build/cycle-03c-ledger-v1.md), and the standard start's first three days.
import { content } from '@qoti/content';
import { TICKS_PER_DAY, TICKS_PER_HOUR, townStock, type WorldState } from '@qoti/sim';
import { build, fortyResidentHamlet, runTicks, startingTown } from './hamlet';

export const HAMLET_TICK_BUDGET_MS = 0.5;

export interface EconomyBench {
  lines: string[];
  failures: string[];
  report: Record<string, unknown>;
}

function foodIn(world: WorldState): number {
  const stock = townStock(world);
  let n = 0;
  for (let g = 0; g < content.goods.length; g++) {
    if (!content.goods[g]!.food) continue;
    n += stock[g]!;
    for (const h of world.households) n += h.pantry[g]!;
  }
  return n;
}

export function benchEconomy(): EconomyBench {
  const lines: string[] = [];
  const failures: string[] = [];

  // The 40-resident hamlet: three days at 1x, timing the sim only (not the stand-in).
  const hamlet = fortyResidentHamlet('hazel');
  runTicks(hamlet, 2 * TICKS_PER_HOUR);
  const ms = runTicks(hamlet, 3 * TICKS_PER_DAY);
  const perTick = ms / (3 * TICKS_PER_DAY);
  if (perTick > HAMLET_TICK_BUDGET_MS) failures.push(`hamlet economy tick ${perTick.toFixed(4)} ms`);
  lines.push(
    `hamlet economy  ${hamlet.world.residents.length} residents, ${hamlet.world.buildings.length} buildings: ` +
      `${perTick.toFixed(4)} ms/tick (budget ${HAMLET_TICK_BUDGET_MS} ms)  ${perTick <= HAMLET_TICK_BUDGET_MS ? 'ok' : 'OVER BUDGET'}`,
  );

  // The standard start: the player adds food and timber on day 1; three days of books.
  const start = startingTown('hazel');
  runTicks(start, 2 * TICKS_PER_HOUR);
  for (const id of ['vegetable-plot', 'fishers-hut', 'market-stall', 'woodcutter']) build(start, id);
  const days: { treasury: number; food: number; produced: number; eaten: number }[] = [];
  for (let d = 0; d < 3; d++) {
    runTicks(start, TICKS_PER_DAY);
    const e = start.world.economy;
    let produced = 0;
    let eaten = 0;
    for (let g = 0; g < content.goods.length; g++) {
      if (!content.goods[g]!.food) continue;
      produced += e.yesterday.produced[g]!;
      eaten += e.yesterday.consumed[g]!;
    }
    days.push({ treasury: e.treasury / 100, food: foodIn(start.world), produced, eaten });
  }
  lines.push(
    `standard start  3 days: treasury ${days.map((d) => d.treasury).join(' / ')} coins, food in town ` +
      `${days.map((d) => d.food).join(' / ')}, food made ${days.map((d) => d.produced).join(' / ')}, ` +
      `eaten ${days.map((d) => d.eaten).join(' / ')}, hungry ${start.stats.hungry}`,
  );

  return {
    lines,
    failures,
    report: {
      hamlet: {
        residents: hamlet.world.residents.length,
        buildings: hamlet.world.buildings.length,
        msPerTick: perTick,
        budgetMs: HAMLET_TICK_BUDGET_MS,
      },
      standardStart: { days, hungry: start.stats.hungry, meals: start.stats.meals },
    },
  };
}
