// R1X: the r1-year golden file is the autoplayer's own year, so its replay hash is the hash of the
// autoplayer's end state, and the golden-hash script prints it.
import { advanceTo, applyTurns, createTickCtx, createWorld, hashState } from '@qoti/sim';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { playYear, type GoldenScript } from './goldenYear';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const file = `${root}/packages/sim/test/golden/r1-year.json`;

test('r1-year replays to the hash of the autoplayer end state, and the script prints it', () => {
  const played = playYear();
  const golden = JSON.parse(readFileSync(file, 'utf8')) as GoldenScript;
  // The file on disk is today's recording (regenerate with `npm run golden:year -w @qoti/bench`).
  expect(golden).toEqual(JSON.parse(JSON.stringify(played.script)));

  const world = createWorld(golden.seed, golden.settings);
  const ctx = createTickCtx(world);
  applyTurns(world, golden.turns, ctx);
  advanceTo(world, golden.lastTurn, ctx);
  expect(hashState(world)).toBe(played.hash);

  const printed = execFileSync('npx', ['tsx', 'packages/sim/scripts/golden-hash.ts', 'r1-year'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  expect(printed).toMatch(/^[0-9a-f]{16}$/);
  expect(printed).toBe(played.hash);
}, 300_000);
