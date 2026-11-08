import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { DEBUG_QUERY, waitLive } from './helpers';

// Resolved from this file, so the shots land in docs/ whichever folder Playwright runs from.
const SHOTS = fileURLToPath(new URL('../../../docs/build/screenshots', import.meta.url));

test('title, create, invite, lenses and settings look right', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/${DEBUG_QUERY}`);
  await expect(page.getByTestId('new-online')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/c2d-title.png`, animations: 'disabled' });

  await page.getByTestId('new-online').click();
  await expect(page.getByTestId('invite')).toBeVisible({ timeout: 60_000 });
  await waitLive(page);
  await expect(page.getByTestId('invite-link')).toHaveValue(/#/);
  await page.screenshot({ path: `${SHOTS}/c2d-invite.png`, animations: 'disabled' });
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByTestId('lens-hearth').click();
  await page.screenshot({ path: `${SHOTS}/c2d-lens-hearth.png`, animations: 'disabled' });
  await page.getByTestId('lens-ledger').click();
  await expect(page.getByTestId('lens-ledger')).toHaveClass(/active/);
  await page.screenshot({ path: `${SHOTS}/c2d-lens-ledger.png`, animations: 'disabled' });

  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/c2d-settings.png`, animations: 'disabled' });
});
