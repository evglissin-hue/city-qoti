import { expect, test } from '@playwright/test';
import { waitLive } from './helpers';

// R1C: the Balances book against the live village fixture: open it, open a family, set the
// carrier's rule, reserve, selling switch and purse, see the book follow the sim, and undo each.

test('the Balances book sets the carrier terms and undoes them', async ({ page }) => {
  test.setTimeout(180_000);
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/?debug&quality=low&noguide&fixture=village');
  await waitLive(page);

  await page.getByTestId('lens-ledger').click();
  await page.keyboard.press('m');
  await expect(page.getByTestId('balances')).toBeVisible();
  for (const f of ['food', 'fuel', 'materials', 'wares', 'treats']) {
    await expect(page.getByTestId(`balance-row-${f}`)).toBeVisible();
  }
  await page.getByTestId('balance-row-food').getByRole('button').first().click();
  await expect(page.getByTestId('balance-detail-food')).toBeVisible();

  const never = page.getByTestId('rule-food-never');
  const was = await page
    .getByTestId('rule-food')
    .locator('[aria-checked="true"]')
    .getAttribute('data-testid');
  await never.click();
  await expect(never).toHaveAttribute('aria-checked', 'true');

  const sell = page.getByTestId('sell-food');
  const sold = await sell.getAttribute('aria-checked');
  await sell.click();
  await expect(sell).not.toHaveAttribute('aria-checked', sold!);

  const reserve = page.getByTestId('reserve-food').locator('.step-value');
  const days = await reserve.textContent();
  await page.getByTestId('reserve-food-more').click();
  await expect(reserve).not.toHaveText(days!);

  const budget = page.getByTestId('budget').locator('.step-value');
  const coins = await budget.textContent();
  await page.getByTestId('budget-more').click();
  await expect(budget).not.toHaveText(coins!);

  // Undo, last first: the purse, the reserve, the switch, the rule.
  await page.locator('body').click({ position: { x: 900, y: 500 } });
  await page.keyboard.press('Control+z');
  await expect(budget).toHaveText(coins!);
  await page.keyboard.press('Control+z');
  await expect(reserve).toHaveText(days!);
  await page.keyboard.press('Control+z');
  await expect(sell).toHaveAttribute('aria-checked', sold!);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId(was!)).toHaveAttribute('aria-checked', 'true');

  // The Neighbors tab keeps what the Trade book showed.
  await page.getByTestId('balances-neighbors').click();
  await expect(page.getByTestId('neighbor-millhaven')).toContainText('Millhaven');
});
