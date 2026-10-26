import { autoplay } from './autoplay';
const run = autoplay(process.argv[3] ?? 'hazel', Number(process.argv[2] ?? 50), { village: true });
const counts = new Map<string, number>();
for (const a of run.actions) {
  const k = a.replace(/^\d+:/, '');
  counts.set(k, (counts.get(k) ?? 0) + 1);
}
console.log(
  [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 45)
    .map(([k, v]) => `${v} ${k}`)
    .join('\n'),
);
