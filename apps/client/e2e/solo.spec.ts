import { expect, test } from '@playwright/test';
import { clickTile, counts, DEBUG_QUERY, waitLive } from './helpers';

// Acceptance: a solo valley works with the relay out of reach and survives a reload.
test('a solo valley works offline and survives a reload', async ({ page }) => {
  // Act as if the dev server were stopped: nothing under /api answers.
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(`/${DEBUG_QUERY}`);
  await page.getByTestId('new-solo').click();
  await waitLive(page);
  await expect(page.getByTestId('connection')).toHaveText('Solo');

  await page.getByTestId('tool-building').click();
  await page.getByTestId('variant-house').click();
  const spot = await page.evaluate(() => window.__qoti.findBuildingSpot('house', 0));
  expect(spot).not.toBeNull();
  await clickTile(page, spot!.tile);
  await expect.poll(async () => (await counts(page)).buildings).toBe(1);
  const turn = await page.evaluate(() => window.__qoti.lastTurn());
  expect(turn).toBeGreaterThan(0);

  await page.reload();
  await waitLive(page);
  expect((await counts(page)).buildings).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__qoti.lastTurn())).toBeGreaterThan(turn);
});
