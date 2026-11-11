import { expect, test, type Page } from '@playwright/test';
import { waitLive } from './helpers';

const qualityOf = (page: Page): Promise<string> =>
  page.evaluate(
    () => (window.__qoti as unknown as { renderer(): { qualityLevel: string } }).renderer().qualityLevel,
  );

// V1.0 acceptance: Ultra from the URL and from the settings menu, and GPU time (or n/a) with the
// frame mode and the preset in the ?debug overlay. V1D: with the camera at rest the lean renderer
// draws from the still-frame cache (still, then idle) and counts shadow and still renders; Low has
// no cache, so every frame there is a moving one.
test('Ultra from ?quality and the settings menu, and GPU ms in the debug overlay', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/?debug&quality=ultra&creative');
  await page.getByTestId('new-solo').click();
  await waitLive(page);
  expect(await qualityOf(page)).toBe('ultra');
  const overlay = page.locator('.debug-overlay');
  await expect(overlay).toContainText(/gpu (\d+\.\d ms|n\/a)\s+(moving|still|idle)\s+ultra\s+lean/);
  await expect(overlay).toContainText(/(still|idle)\s+ultra\s+lean/, { timeout: 60_000 });
  await expect(overlay).toContainText(/shadows [1-9]\d*\s+stills [1-9]\d*/);

  await page.getByTestId('menu-open').click();
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('quality-ultra')).toHaveClass(/active/);
  await page.getByTestId('quality-low').click();
  await expect.poll(() => qualityOf(page)).toBe('low');
  await expect(page.locator('.debug-overlay')).toContainText(/moving\s+low\s/);
  await page.getByTestId('quality-ultra').click();
  await expect.poll(() => qualityOf(page)).toBe('ultra');
});
