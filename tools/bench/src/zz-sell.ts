import { balancesView } from '@qoti/sim';
import { autoplay } from './autoplay';
const from = Number(process.argv[4] ?? 20);
autoplay(process.argv[2] ?? 'hazel', Number(process.argv[3] ?? 32), {
  village: true,
  onDay: (w, l) => {
    if (l.day < from) return;
    const v = balancesView(w);
    console.log(`d${l.day} ${v.lines.map((x) => `${x.family}: stock ${x.stock} use ${x.use} cover ${x.cover} res ${x.reserve} mark ${x.mark} rule ${x.rule} sell ${x.sell} out ${x.carriedOut}/${x.carriedOutYesterday} in ${x.carriedIn}`).join(' | ')}`);
  },
});
