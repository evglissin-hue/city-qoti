// Scratch probe (R3H, not committed): per-day verdicts of specialized buildings with levels.
import { content } from '@qoti/content';
import { autoplay } from './autoplay';
import { levels } from '../../../packages/sim/src/systems/levels/index';
import { servedToday, specializedDay } from '../../../packages/sim/src/systems/levels/specialized';
import { servedIds, capacityOf } from '../../../packages/sim/src/systems/specialized/api';
import { TICKS_PER_DAY } from '../../../packages/sim/src/constants';

const seed = process.argv[2] ?? 'willow';
const days = Number(process.argv[3] ?? 70);
const orig = levels.tick.bind(levels);
const log = new Map<string, string[]>();
const climbs: string[] = [];
levels.tick = (state, ctx) => {
  const day = Math.floor(state.tick / TICKS_PER_DAY) + 1;
  const before = new Map<number, number>();
  for (const b of state.buildings) {
    const def = content.buildingById.get(b.def);
    if (!def?.levels || b.stage !== 'built' || !b.rt) continue;
    const v = specializedDay(state, b);
    const c = b.counters;
    const key = `${b.def}#${b.id}`;
    const s = `${day}:${v[0]}${b.level ?? 1}` +
      (def.levels.good === 'carried' ? `(${c?.madeToday ?? 0}/${c?.soldToday ?? 0})` : '') +
      (def.levels.good === 'customers' ? `(${c?.customersToday ?? 0})` : '') +
      (def.levels.good === 'full' ? `(${b.rt.store.reduce((a, n) => a + n, 0)}w${b.rt.workers.length})` : '') +
      (def.levels.good === 'served' ? `(${servedIds(state, b).length}c${capacityOf(state, b)}s${servedToday(state, b).filter((x) => x.counters?.shortToday).length})` : '');
    (log.get(key) ?? log.set(key, []).get(key)!).push(s);
    before.set(b.id, b.level ?? 1);
  }
  orig(state, ctx);
  for (const b of state.buildings) {
    const l0 = before.get(b.id);
    if (l0 !== undefined && (b.level ?? 1) !== l0) climbs.push(`day ${day} ${b.def}#${b.id} ${l0}->${b.level}`);
  }
};
const r = autoplay(seed, days, { village: true, threat: 'standard' });
for (const [k, v] of log) console.log(k, v.join(' '));
console.log('CHANGES', climbs.join('; '));
console.log('village day', r.days.find((d) => d.rank !== 'hamlet')?.day);
