// Bench scenario for the Village systems (C4C): the shared village fixture (60 residents) dressed
// with the Village's specialized buildings, a business of each trade (R1.0: in place of the I2
// chains), the services and a cart shed, run for a day at 1x against the hamlet's 0.5 ms tick
// budget, plus the services, tiers and patterns passes on their own.
import { content } from '@qoti/content';
import {
  applyTurn,
  createTickCtx,
  insertBuilding,
  TICKS_PER_DAY,
  type Building,
  type WorldState,
} from '@qoti/sim';
import { villageFixture } from '../../../packages/sim/test/fixtures/village';
import { updateServices } from '../../../packages/sim/src/systems/services';
import { updateTiers } from '../../../packages/sim/src/systems/tiers';
import { runPatterns } from '../../../packages/sim/src/systems/hearth/patterns/engine';

export const VILLAGE_TICK_BUDGET_MS = 0.5;
/** Hourly and daily passes (tune). */
export const VILLAGE_PASS_BUDGET_MS = 3;

/**
 * R1: the Village's specialized buildings, a business of each workshop trade and of the farm trades
 * that feed them (as [def, x, z, trade], built directly as growth would on a lot), and the services.
 */
export const CHAIN: readonly (readonly [def: string, x: number, z: number, trade?: string])[] = [
  ['brickworks', 40, 38],
  ['workshop', 44, 38, 'baker'],
  ['workshop', 48, 38, 'weaver'],
  ['farmstead', 52, 37, 'sheep-run'],
  ['workshop', 56, 38, 'chandler'],
  ['farmstead', 60, 37, 'dairy'],
  ['farmstead', 64, 37, 'orchard'],
  ['workshop', 68, 38, 'cider-maker'],
  ['farmstead', 72, 37, 'hives'],
  ['workshop', 76, 38, 'carpenter'],
  ['sawmill', 80, 38],
  ['market-square', 84, 38],
  ['tavern', 40, 58],
  ['herbalist', 45, 58],
  ['school', 49, 57],
  ['trading-post', 70, 30],
  ['cart-shed', 88, 47],
];

function time(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

export function villageBench(): { lines: string[]; failures: string[]; report: Record<string, unknown> } {
  const lines: string[] = [];
  const failures: string[] = [];
  const { state } = villageFixture();
  const placed: Building[] = [];
  for (const [def, x, z, trade] of CHAIN) {
    const b = insertBuilding(state, null, content.buildingById.get(def)!, x, z, 0, 0, { site: false, trade });
    placed.push(b);
  }
  // Unemployed grown-ups take the new jobs over the day (the residents system hires hourly).
  const ctx = createTickCtx(state);
  const run = (w: WorldState, n: number) => {
    for (let i = 0; i < n; i++) {
      applyTurn(w, { t: w.lastTurn + 1, cmds: [] }, ctx);
      ctx.events.length = 0;
      ctx.dirty.clear();
    }
  };
  run(state, 400);
  const ms = time(() => run(state, TICKS_PER_DAY));
  const perTick = ms / TICKS_PER_DAY;
  if (perTick > VILLAGE_TICK_BUDGET_MS) failures.push(`village tick ${perTick.toFixed(4)} ms`);
  const services = time(() => updateServices(state));
  const tiers = time(() => updateTiers(state, ctx));
  const patterns = time(() => runPatterns(state, ctx));
  for (const [name, v] of [
    ['services', services],
    ['tiers', tiers],
    ['patterns', patterns],
  ] as const)
    if (v > VILLAGE_PASS_BUDGET_MS) failures.push(`village ${name} pass ${v.toFixed(2)} ms`);
  lines.push(
    `village         ${state.residents.length} residents, ${state.buildings.length} buildings, ${state.carts.length} cart: ` +
      `${perTick.toFixed(4)} ms/tick (budget ${VILLAGE_TICK_BUDGET_MS} ms)  ${perTick <= VILLAGE_TICK_BUDGET_MS ? 'ok' : 'OVER BUDGET'}`,
    `village passes  services ${services.toFixed(2)} ms, tiers ${tiers.toFixed(2)} ms, patterns ${patterns.toFixed(2)} ms ` +
      `(budget ${VILLAGE_PASS_BUDGET_MS} ms each)`,
  );
  return {
    lines,
    failures,
    report: {
      residents: state.residents.length,
      buildings: state.buildings.length,
      msPerTick: perTick,
      services,
      tiers,
      patterns,
      placed: placed.length,
    },
  };
}
