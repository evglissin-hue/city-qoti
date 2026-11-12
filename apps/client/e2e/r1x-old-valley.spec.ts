import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// R1X: an online room whose stored valley was saved before version 6 answers the hello with
// OLD_VALLEY. The title screen grays the valley (Remove only), and the server keeps its bytes.
const relayPort = Number(process.env.QOTI_RELAY_PORT ?? 8787);
const dataDir = join(tmpdir(), `qoti-e2e-devdata-${relayPort}`);
const VALLEY_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const TOKEN = 'old-valley-token';

test('an online valley saved before version 6 is refused and listed grayed', async ({ page }) => {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, `${VALLEY_ID}.json`);
  const data = gzipSync(Buffer.from(JSON.stringify({ saveVersion: 5, seed: 'old' }))).toString('base64');
  const dump = {
    meta: {
      valley: {
        id: VALLEY_ID,
        seed: 'old',
        settings: {
          mode: 'sandbox',
          economy: 'gentle',
          threat: 'peaceful',
          togetherOnly: false,
          townName: 'Qoti',
          valleyName: 'Fernhollow',
        },
        createdAt: 1,
      },
      tokenHashes: [createHash('sha256').update(TOKEN).digest('hex'), ''],
      nextTurn: 11,
      simVersion: 'old',
    },
    turns: [],
    snapshots: [{ t: 10, simVersion: 'old', label: null, created: 1, data }],
  };
  writeFileSync(file, JSON.stringify(dump));
  const before = readFileSync(file, 'utf8');

  await page.goto('/');
  await page.evaluate(
    ([id, token]) => {
      localStorage.setItem(
        'qoti.recent',
        JSON.stringify([
          { valleyId: id, seat: 0, token, mode: 'online', name: 'Fernhollow', lastPlayed: Date.now() },
        ]),
      );
    },
    [VALLEY_ID, TOKEN],
  );
  await page.reload();
  await page.getByTestId(`continue-${VALLEY_ID}`).click();

  // The room refuses the hello; the session marks the valley old and returns to the title screen.
  const row = page.getByTestId(`old-${VALLEY_ID}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText('Founded under the old rules. It cannot be opened in this version.');
  await expect(page.getByTestId(`continue-${VALLEY_ID}`)).toHaveCount(0);
  await expect(page.getByTestId(`old-save-${VALLEY_ID}`)).toHaveCount(0);

  // It stays grayed after a reload, from the recent list alone.
  await page.reload();
  await expect(page.getByTestId(`old-${VALLEY_ID}`)).toBeVisible();

  // Remove only forgets it on this device; the relay still has every byte.
  await page.getByTestId(`old-remove-${VALLEY_ID}`).click();
  await page.getByTestId(`forget-yes-${VALLEY_ID}`).click();
  await expect(page.getByTestId(`old-${VALLEY_ID}`)).toHaveCount(0);
  expect(existsSync(file)).toBe(true);
  expect(readFileSync(file, 'utf8')).toBe(before);
});
