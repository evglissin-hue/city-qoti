import { autoplay } from './autoplay';
let day = 0;
(globalThis as any).__dbgGrowth = (s: string) => console.log(`d${day} ${s}`);
autoplay(process.argv[2] ?? 'hazel', Number(process.argv[3] ?? 30), { village: true, onDay: (_w, l) => { day = l.day + 1; } });
