import { expect, test } from '@playwright/test';
import { waitLive } from './helpers';

// R1C: the Purse and Businesses books, and a trade pinned from the book and the inspector.

const VILLAGE_QUERY = '?debug&quality=low&noguide&fixture=village';

test('the Purse and Businesses books open, and a trade can be pinned and let go', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(`/${VILLAGE_QUERY}`);
  await waitLive(page);
  await page.getByTestId('lens-ledger').click();

  // The Purse: tax and wages take, on the Taxes and wages tab.
  await page.keyboard.press('p');
  await expect(page.getByTestId('purse')).toBeVisible();
  await page.getByTestId('purse-taxes').click();
  await page.getByTestId('tax-15').click();
  await expect(page.getByTestId('tax-15')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('wage-90').click();
  await expect(page.getByTestId('wage-90')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('purse')).toHaveCount(0);

  // Businesses: the fixture's bakery is listed, a click selects it, and the pin toggles.
  await page.keyboard.press('l');
  await expect(page.getByTestId('businesses')).toBeVisible();
  const row = page.getByTestId('businesses').locator('.business-row', { hasText: 'Baker' }).first();
  await expect(row).toContainText('hands');
  const pin = row.locator('button.pin');
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await row.locator('.business-main').click();
  await expect(page.getByTestId('building-inspector')).toBeVisible();
  const inspectorPin = page.getByTestId('business-lines').locator('button.pin');
  await expect(inspectorPin).toHaveAttribute('aria-pressed', 'true');
  await inspectorPin.click();
  await expect(inspectorPin).toHaveAttribute('aria-pressed', 'false');
});
