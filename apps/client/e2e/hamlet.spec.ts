import { expect, test } from '@playwright/test';
import { clickTile, HAMLET_QUERY, waitLive } from './helpers';

// C3E smoke: the new valley flow makes a standard valley, every hamlet panel opens against a live
// valley, and Ctrl+Z undoes this seat's own last change.

test('New valley makes a standard valley; the books, reports and inspectors open; Ctrl+Z undoes', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(`/${HAMLET_QUERY}`);
  await expect(page.getByTestId('creative')).not.toBeChecked();
  await page.getByTestId('new-solo').click();
  await waitLive(page);
  expect(await page.evaluate(() => window.__qoti.mode())).toBe('standard');
  await expect(page.getByTestId('treasury')).toContainText('500');
  await expect(page.getByTestId('population')).toBeVisible();

  // Hearth books.
  for (const [book, panel] of [
    ['wishes', 'wishes'],
    ['patterns', 'patterns'],
    ['chronicle', 'chronicle'],
    ['achievements', 'achievements'],
  ] as const) {
    await page.getByTestId(`book-${book}`).click();
    await expect(page.getByTestId(panel)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(panel)).toHaveCount(0);
  }
  await expect(page.getByTestId('patterns')).toHaveCount(0);
  await page.keyboard.press('b');
  await expect(page.getByTestId('patterns')).toContainText('Pattern Book');
  await page.getByTestId('patterns-close').click();

  // Ledger reports.
  await page.getByTestId('lens-ledger').click();
  await page.getByTestId('book-reports').click();
  for (const tab of ['stocks', 'workforce', 'budget', 'buildings']) {
    await page.getByTestId(`report-${tab}`).click();
    await expect(page.getByTestId(`report-${tab}`)).toHaveAttribute('aria-selected', 'true');
  }
  await expect(page.getByTestId('budget')).toHaveCount(0);
  await page.getByTestId('report-budget').click();
  await expect(page.getByTestId('budget')).toContainText('500 coins');
  await page.keyboard.press('Escape');

  // The town hall's inspector, and its customization.
  const hall = await page.evaluate(() => window.__qoti.buildingsOf('town-hall')[0]!);
  await page.evaluate((id) => window.__qoti.select({ kind: 'building', id }), hall);
  await expect(page.getByTestId('building-inspector')).toContainText('Town hall');
  await page.getByTestId('customize-open').click();
  await expect(page.getByTestId('customize')).toBeVisible();
  await page.getByTestId('swatch-wall-rose').click();
  await page.getByTestId('customize-close').click();

  // Build a cottage with the Build picker, then undo it.
  await page.getByTestId('lens-hearth').click();
  await page.getByTestId('tool-building').click();
  await expect(page.getByTestId('building-picker')).toContainText('Cottage');
  await page.getByTestId('variant-cottage').click();
  const before = (await page.evaluate(() => window.__qoti.counts()))!.buildings;
  const spot = await page.evaluate(() => window.__qoti.findBuildingSpot('cottage', 0));
  expect(spot).not.toBeNull();
  await clickTile(page, spot!.tile);
  await expect
    .poll(async () => (await page.evaluate(() => window.__qoti.counts()))!.buildings)
    .toBe(before + 1);
  await expect.poll(() => page.evaluate(() => window.__qoti.undoSize())).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await page.evaluate(() => window.__qoti.counts()))!.buildings).toBe(before);
  await expect(page.getByTestId('toast').last()).toContainText('Undid the cottage');
});

test('the hamlet fixture: residents and buildings inspected live from the sim worker', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(`/${HAMLET_QUERY}&fixture=hamlet`);
  await waitLive(page);
  await expect.poll(() => page.evaluate(() => window.__qoti.residentIds().length)).toBe(9);
  await expect(page.getByTestId('population')).toContainText('9');

  await page.evaluate(() => window.__qoti.select({ kind: 'resident', id: 12 }));
  const resident = page.getByTestId('resident-inspector');
  await expect(resident).toContainText('Clover Thistledown');
  await expect(resident).toContainText('Rabbit, adult');
  await expect(resident.locator('.mood-lines li')).toHaveCount(5);
  await page.getByTestId('resident-story-tab').click();
  await expect(resident).toContainText('Hazel Thistledown');

  await page.evaluate(() => window.__qoti.select({ kind: 'building', id: 6 }));
  const bakery = page.getByTestId('building-inspector');
  await expect(bakery).toContainText('Bakery');
  await expect(bakery).toContainText('Hazel Thistledown');
  await expect(bakery).toContainText('4 flour');

  await page.getByTestId('book-patterns').click();
  await expect(page.getByTestId('patterns')).toContainText('Hints in the margin');
});

test('a creative valley stays the quiet sandbox: no coins, no books, the house on offer', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(`/${HAMLET_QUERY}`);
  await page.getByTestId('creative').check();
  await page.getByTestId('new-solo').click();
  await waitLive(page);
  expect(await page.evaluate(() => window.__qoti.mode())).toBe('sandbox');
  await expect(page.getByTestId('treasury')).toHaveCount(0);
  await expect(page.getByTestId('book-wishes')).toHaveCount(0);
  await page.getByTestId('tool-building').click();
  await expect(page.getByTestId('variant-house')).toBeVisible();
});
