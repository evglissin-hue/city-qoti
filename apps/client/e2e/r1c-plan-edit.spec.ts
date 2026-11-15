import { expect, test } from '@playwright/test';
import { clickTile, DEBUG_QUERY, waitLive } from './helpers';

const SHOTS = '/tmp/claude-0/-home-user-city-qoti/b1f93f80-85dc-5dd0-b969-6d447cec667f/scratchpad/shots';

// R1C: an open plan gets Edit: its items come back as ghosts, one more joins, Save changes sends plan.edit.
test('a plan can be edited in place', async ({ page }) => {
  await page.goto(`/${DEBUG_QUERY}`);
  await page.getByTestId('new-solo').click();
  await waitLive(page);
  await page.getByTestId('tool-plan').click();
  await page.getByTestId('sketch-start').click();
  await page.getByTestId('tool-decor').click();
  await page.getByTestId('variant-bench').click();
  const spot = await page.evaluate(() => window.__qoti.findDecorSpot('bench'));
  expect(spot).not.toBeNull();
  await clickTile(page, spot!.tile);
  await page.getByTestId('sketch-review').click();
  await page.getByTestId('sketch-name').fill('A bench for two');
  await page.getByTestId('sketch-propose').click();
  const plan = page.locator('li.plan', { hasText: 'A bench for two' });
  await expect(plan).toContainText('a bench');

  await plan.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('edit-card')).toContainText('Editing A bench for two');
  await page.screenshot({ path: `${SHOTS}/plan-edit-start.png` });
  await clickTile(page, [spot!.tile[0] + 2, spot!.tile[1]]);
  await expect(page.getByTestId('edit-card').locator('li')).toHaveCount(2);
  await page.screenshot({ path: `${SHOTS}/plan-edit-added.png` });
  await page.getByTestId('tool-plan').click();
  await page.getByTestId('edit-save').click();
  await expect(plan).toContainText('2 benches');
  await page.screenshot({ path: `${SHOTS}/plan-edit-saved.png` });
});
