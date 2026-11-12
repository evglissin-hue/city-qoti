import { autoplay } from './autoplay';
const run = autoplay(process.argv[2] ?? 'willow', Number(process.argv[3] ?? 48), { village: true });
const re = new RegExp(process.argv[4] ?? 'lay |no room|zone ');
console.log(run.actions.filter((a) => re.test(a)).join('\n'));
