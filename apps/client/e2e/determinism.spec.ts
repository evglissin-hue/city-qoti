import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEBUG_QUERY } from './helpers';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const golden = JSON.parse(readFileSync(`${root}/packages/sim/test/golden/i0-basic.json`, 'utf8')) as unknown;

// Acceptance: the golden script gives the same hash in a browser worker as in Node.
test('the golden script hashes the same in a browser worker and in Node', async ({ page }) => {
  const nodeHash = execFileSync('npx', ['tsx', 'packages/sim/scripts/golden-hash.ts'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  expect(nodeHash).toMatch(/^[0-9a-f]{16}$/);

  await page.goto(`/${DEBUG_QUERY}`);
  await page.waitForFunction(() => typeof window.__qoti?.runGolden === 'function');
  const browserHash = await page.evaluate((script) => window.__qoti.runGolden(script), golden);
  console.log(`golden i0-basic: node ${nodeHash}, browser ${browserHash}`);
  expect(browserHash).toBe(nodeHash);
});

// C3A: a standard valley with residents walking about, two and a half days at 3x.
test('the golden hamlet script hashes the same in a browser worker and in Node', async ({ page }) => {
  const hamlet = JSON.parse(
    readFileSync(`${root}/packages/sim/test/golden/i1-hamlet.json`, 'utf8'),
  ) as unknown;
  const nodeHash = execFileSync('npx', ['tsx', 'packages/sim/scripts/golden-hash.ts', 'i1-hamlet'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  expect(nodeHash).toMatch(/^[0-9a-f]{16}$/);

  await page.goto(`/${DEBUG_QUERY}`);
  await page.waitForFunction(() => typeof window.__qoti?.runGolden === 'function');
  const browserHash = await page.evaluate((script) => window.__qoti.runGolden(script), hamlet);
  console.log(`golden i1-hamlet: node ${nodeHash}, browser ${browserHash}`);
  expect(browserHash).toBe(nodeHash);
});
