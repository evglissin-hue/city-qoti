import { content } from '@qoti/content';
import type { WorldState } from '@qoti/sim';
import { autoplay } from './autoplay';
import { dayIndex, hourOf } from '../../../packages/sim/src/systems/economy/time';
const seed = process.argv[2] ?? 'hazel';
const GOODS = ['cider', 'honey', 'pies', 'jam'].map((id) => content.goodIndex.get(id)!);
const seen = new Set<string>();
autoplay(seed, Number(process.argv[3] ?? 60), {
  village: true,
  onHour: (w: WorldState) => {
    const h = hourOf(w.tick);
    const d = dayIndex(w.tick);
    if (h !== 12 && h !== 18) return;
    if (d < 50 || d % 5 !== 0 || seen.has(`${d}${h}`)) return;
    seen.add(`${d}${h}`);
    const by = new Map<string, number[]>();
    const add = (k: string, g: number, n: number) => {
      const a = by.get(k) ?? GOODS.map(() => 0);
      a[GOODS.indexOf(g)]! += n;
      by.set(k, a);
    };
    const tav: string[] = [];
    for (const b of w.buildings) {
      if (!b.rt || b.stage !== 'built') continue;
      for (const g of GOODS) {
        add(`${b.def}.store`, g, b.rt.store[g] ?? 0);
        add(`${b.def}.out`, g, b.rt.output[g] ?? 0);
        add(`${b.def}.in`, g, b.rt.input[g] ?? 0);
      }
      if (b.def === 'tavern')
        tav.push(`${b.rt.input[GOODS[0]!] ?? 0}+${b.rt.reservedIn[GOODS[0]!] ?? 0}w${b.rt.workers.length}`);
    }
    const row = [...by]
      .filter(([, a]) => a.some((x) => x > 0))
      .map(([k, a]) => `${k} ${a.join('/')}`)
      .join('; ');
    console.log(`d${d} ${h}:00 [cider/honey/pies/jam] ${row} | taverns in+resv wN: ${tav.join(' ')}`);
  },
});
