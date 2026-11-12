import { content } from '@qoti/content';
import { autoplay } from './autoplay';
const from = Number(process.argv[4] ?? 0);
autoplay(process.argv[2] ?? 'hazel', Number(process.argv[3] ?? 24), {
  village: true,
  onDay: (w, line) => {
    if (line.day < from) return;
    const b = w.carrier.bought.at(-1) ?? [];
    const s = w.carrier.sold.at(-1) ?? [];
    const f = (a: number[]) => a.map((v, i) => (v ? `${content.goods[i]!.id}:${v}` : '')).filter(Boolean).join(' ');
    console.log(`d${line.day} coins ${line.coins} budget ${w.carrier.budget / 100} spent ${w.carrier.spentToday / 100} | bought ${f(b)} | sold ${f(s)}`);
  },
});
