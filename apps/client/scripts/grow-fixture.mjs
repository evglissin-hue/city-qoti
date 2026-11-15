// `npm run fixture:grown -w @qoti/client`: regrows the grown village scene (V2.0), the valley that
// `?debug&fixture=grown` opens. The bench's autoplayer plays the standard start for DAYS in-game
// days on SEED (`tools/bench/src/tune.ts`, through its TUNE_SAVE output), and the valley it ends
// with is saved as apps/client/src/app/fixtures/grown.qoti, then summed up here.
//
// Why a script and not just a file: R1 starts every valley fresh (docs/spec/21-networking-and-saves.md,
// The fresh start), so once R1X merges this snapshot is refused like any older valley. R1X regrows
// it with this one command, and so must keep `TUNE_SAVE` working in tune.ts (and may need a new
// seed or day count to land near 150 residents at Village rank again). The run is deterministic:
// the same sim, seed and days write the same bytes.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const SEED = 'rowan';
const DAYS = 60;

const root = fileURLToPath(new URL('../../../', import.meta.url));
const file = fileURLToPath(new URL('../src/app/fixtures/grown.qoti', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log(`Growing ${SEED} for ${DAYS} days (about a minute)...`);
const run = spawnSync(npm, ['run', 'tune', '-w', '@qoti/bench', String(DAYS), SEED], {
  cwd: root,
  env: { ...process.env, TUNE_SAVE: file },
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (run.status !== 0) {
  console.error(run.stdout, run.stderr);
  console.error(`The tune run failed (exit ${run.status}).`);
  process.exit(1);
}
// The tune's own lines worth keeping: the timing, the last day, what grew and where the street is.
const lines = run.stdout.split('\n');
const yearView = lines.indexOf('Year view');
const dayLines = lines
  .slice(0, yearView < 0 ? lines.length : yearView)
  .filter((l) => /^\s*\d+\s+\d+\s/.test(l));
for (const l of lines) if (l.startsWith('Autoplay ')) console.log(l);
if (dayLines.length) console.log(`last day: ${dayLines[dayLines.length - 1].trim()}`);
for (const l of lines) if (l.startsWith('grown: ') || l.startsWith('high street around')) console.log(l);

const bytes = readFileSync(file);
const save = JSON.parse(gunzipSync(bytes).toString('utf8'));
const byDef = (list) => {
  const m = new Map();
  for (const x of list) m.set(x.def, (m.get(x.def) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
};
const top = (list, n) =>
  byDef(list)
    .slice(0, n)
    .map(([k, c]) => `${k} ${c}`)
    .join(', ');
console.log(`\n${file}`);
console.log(
  `  ${bytes.length} bytes, sha256 ${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`,
);
console.log(`  save version ${save.saveVersion}, turn ${save.lastTurn}, tick ${save.tick}`);
console.log(`  rank ${save.charter?.rank}, renown level ${save.renown?.level ?? '-'}`);
console.log(`  residents ${save.residents.length}, households ${save.households.length}`);
console.log(
  `  buildings ${save.buildings.length} (${save.buildings.filter((b) => b.lot).length} grown on lots): ${top(save.buildings, 8)}`,
);
console.log(`  decor ${save.decor.length}: ${top(save.decor, 8)}`);
// The history keeps the last eight festivals only, so it says "at least" once full.
const held = save.festival?.history ?? [];
console.log(
  `  festivals held ${held.length >= 8 ? 'at least ' : ''}${held.length}, stars ${held.map((f) => f.stars).join(' ')}`,
);
