import { LEDGER_CATEGORIES, PENNIES_PER_COIN } from '@qoti/sim';
import { autoplay } from './autoplay';
const seed = process.argv[2] ?? 'willow';
const days = Number(process.argv[3] ?? 10);
autoplay(seed, days, {
  village: true,
  onDay: (w, line) => {
    if (line.day < Number(process.env.FROM ?? 0)) return;
    const y = w.economy.yesterday.money;
    const parts = LEDGER_CATEGORIES.map((c, i) => [c.id, Math.round(y[i]! / PENNIES_PER_COIN)] as const).filter(([, v]) => v !== 0);
    console.log(`d${line.day} ${line.rank} pop ${line.residents} coins ${line.coins} sav ${line.savings} owed ${line.owed} tab ${Math.round(w.carrier.tab / 100)} | ${parts.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  },
});
