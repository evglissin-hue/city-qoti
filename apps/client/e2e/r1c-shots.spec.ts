import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { waitLive } from './helpers';

// R1C: the calmer top bar, the Build picker's shelves, the Ledger's books and the season card's
// questions at 1440 x 900, by day and by lamplight (the debug hour pins the paper's light too).
const SHOTS = fileURLToPath(new URL('../../../docs/build/screenshots', import.meta.url));
const QUERY = '?debug&clean&quality=low&noguide&fixture=village&mock';

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/r1c-${name}.png`, animations: 'disabled' });
}

test('the Ledger reads its town from the top bar, the picker and the books', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${QUERY}`);
  await waitLive(page);
  await page.getByTestId('lens-ledger').click();

  // The top bar: four demand bars and five balance chips, everything else behind one menu.
  const strip = page.getByTestId('ledger-strip');
  await expect(strip).toBeVisible();
  for (const kind of ['homes', 'shops', 'workshops', 'farmland'])
    await expect(page.getByTestId(`demand-${kind}`)).toBeVisible();
  for (const family of ['food', 'fuel', 'materials', 'wares', 'treats'])
    await expect(page.getByTestId(`balance-${family}`)).toBeVisible();
  await expect(page.getByTestId('settings-open')).toBeHidden();

  for (const [light, hour] of [
    ['day', 13],
    ['lamplight', 22],
  ] as const) {
    await page.evaluate((h) => window.__qoti.setHour(h), hour);
    await expect(page.locator('.game-ui')).toHaveClass(light === 'day' ? /^(?!.*lamplight)/ : /lamplight/);
    await shot(page, `topbar-${light}`);

    // The Build picker: Zones, Specialized and Services.
    await page.getByTestId('tool-building').click();
    await expect(page.getByTestId('building-picker')).toBeVisible();
    for (const shelf of ['zones', 'specialized', 'services']) {
      await page.getByTestId(`group-${shelf}`).click();
      await shot(page, `picker-${shelf}-${light}`);
    }
    await page.keyboard.press('Escape');

    // The books: Balances (M), Purse (P), Businesses (L).
    for (const [key, id] of [
      ['m', 'balances'],
      ['p', 'purse'],
      ['l', 'businesses'],
    ] as const) {
      await page.keyboard.press(key);
      await expect(page.locator(`[data-panel="${id}"]`)).toBeVisible();
      await shot(page, `book-${id}-${light}`);
      await page.keyboard.press(key);
    }
  }

  // The season card asks the Ledger its questions; a second card waits its turn in the stack.
  await page.evaluate(() => window.__qoti.setHour(13));
  if (await page.evaluate(() => window.__qoti.showSeasonCard())) {
    await expect(page.getByTestId('card-plan-questions')).toBeVisible();
    await page.evaluate(() => {
      window.__qoti.ui()!['rankUp']!.value = { rank: 'village' };
    });
    await expect(page.getByTestId('card-stack')).toHaveText(/1 more waiting/);
    await expect(page.getByTestId('season-card')).toBeVisible();
    await shot(page, 'season-card');
  }
});
